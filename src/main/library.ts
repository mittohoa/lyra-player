import { promises as fs, type Dirent } from 'node:fs'
import { basename, extname, join, sep } from 'node:path'
import { parseFile, type IAudioMetadata } from 'music-metadata'
import type { ScanProgress, Track } from '@shared/types'
import { libraryStore } from './store'
import { log } from './logger'

const AUDIO_EXT = new Set([
  '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus',
  '.wav', '.wma', '.aiff', '.aif', '.mp4', '.webm'
])

/** Thu muc bo qua khi quet - toan rac hoac file he thong. */
const SKIP_DIRS = new Set(['node_modules', '$RECYCLE.BIN', 'System Volume Information', '.git'])

export function trackIdForFile(filePath: string): string {
  return `local:${filePath.toLowerCase()}`
}

async function* walk(dir: string, depth = 0): AsyncGenerator<string> {
  if (depth > 12) return
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    // Bo qua thay vi lam hong ca lan quet - nhung phai ghi lai, khong thi
    // nguoi dung thay thu muc cua ho ra 0 bai ma khong hieu tai sao
    log.warn('thu vien', `Khong doc duoc thu muc: ${dir}`, err)
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      yield* walk(full, depth + 1)
    } else if (entry.isFile() && AUDIO_EXT.has(extname(entry.name).toLowerCase())) {
      yield full
    }
  }
}

/** Doan ten bai / nghe si tu ten file khi tag trong. */
function guessFromFilename(filePath: string): { title: string; artist: string } {
  const name = basename(filePath, extname(filePath))
  const parts = name.split(/\s+-\s+/)
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() }
  }
  return { artist: 'Khong ro nghe si', title: name.trim() }
}

function pictureToDataUri(meta: IAudioMetadata): string | undefined {
  const pic = meta.common.picture?.[0]
  if (!pic) return undefined
  const b64 = Buffer.from(pic.data).toString('base64')
  return `data:${pic.format};base64,${b64}`
}

/** Lay lyric nhung trong tag - music-metadata tra ve nhieu dang khac nhau. */
function extractEmbeddedLyrics(meta: IAudioMetadata): string | undefined {
  const raw = meta.common.lyrics
  if (!raw?.length) return undefined
  const texts: string[] = []
  for (const item of raw as unknown[]) {
    if (typeof item === 'string') {
      texts.push(item)
    } else if (item && typeof item === 'object') {
      const obj = item as { text?: string; syncText?: { text: string; timestamp?: number }[] }
      if (obj.syncText?.length) {
        // Chuyen sang dinh dang .lrc de dung chung mot bo parser
        texts.push(
          obj.syncText
            .map((s) => {
              const ms = s.timestamp ?? 0
              const total = ms / 1000
              const mm = String(Math.floor(total / 60)).padStart(2, '0')
              const ss = (total % 60).toFixed(2).padStart(5, '0')
              return `[${mm}:${ss}]${s.text}`
            })
            .join('\n')
        )
      } else if (obj.text) {
        texts.push(obj.text)
      }
    }
  }
  const joined = texts.join('\n').trim()
  return joined || undefined
}

export async function readTrackFromFile(filePath: string): Promise<Track | null> {
  try {
    const stat = await fs.stat(filePath)
    const meta = await parseFile(filePath, { duration: true, skipCovers: false })
    const guess = guessFromFilename(filePath)
    return {
      id: trackIdForFile(filePath),
      source: 'local',
      sourceId: filePath,
      title: meta.common.title?.trim() || guess.title,
      artist:
        meta.common.artist?.trim() ||
        meta.common.albumartist?.trim() ||
        guess.artist,
      album: meta.common.album?.trim() || basename(filePath.split(sep).slice(0, -1).join(sep)) || 'Khong ro album',
      duration: Math.round(meta.format.duration ?? 0),
      year: meta.common.year,
      genre: meta.common.genre?.[0],
      trackNo: meta.common.track?.no ?? undefined,
      artwork: pictureToDataUri(meta),
      filePath,
      embeddedLyrics: extractEmbeddedLyrics(meta),
      addedAt: stat.mtimeMs
    }
  } catch (err) {
    log.warn('thu vien', `Khong doc duoc ${filePath}`, err)
    return null
  }
}

export function getLibrary(): Track[] {
  return libraryStore.get()
}

/**
 * Quet lai toan bo thu muc thu vien.
 * Giu lai metadata da doc cua file khong doi (so theo mtime) de lan quet sau nhanh.
 */
export async function scanLibrary(
  folders: string[],
  onProgress: (p: ScanProgress) => void
): Promise<Track[]> {
  const existing = new Map(getLibrary().map((t) => [t.id, t]))

  onProgress({ phase: 'scanning', scanned: 0, total: 0, current: '' })
  const files: string[] = []
  for (const folder of folders) {
    for await (const file of walk(folder)) files.push(file)
  }

  const tracks: Track[] = []
  let scanned = 0
  for (const file of files) {
    scanned++
    if (scanned % 10 === 0 || scanned === files.length) {
      onProgress({ phase: 'reading', scanned, total: files.length, current: basename(file) })
    }

    const cached = existing.get(trackIdForFile(file))
    if (cached) {
      try {
        const stat = await fs.stat(file)
        if (cached.addedAt === stat.mtimeMs) {
          tracks.push(cached)
          continue
        }
      } catch {
        continue // file bien mat giua chung
      }
    }

    const track = await readTrackFromFile(file)
    if (track) tracks.push(track)
  }

  tracks.sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || (a.trackNo ?? 0) - (b.trackNo ?? 0))
  libraryStore.set(tracks)
  onProgress({ phase: 'done', scanned: files.length, total: files.length, current: '' })
  return tracks
}

/** Them le vai file (keo tha hoac chon file) ma khong quet lai ca thu vien. */
export async function addFiles(filePaths: string[]): Promise<Track[]> {
  const current = getLibrary()
  const byId = new Map(current.map((t) => [t.id, t]))
  const added: Track[] = []

  for (const file of filePaths) {
    if (!AUDIO_EXT.has(extname(file).toLowerCase())) continue
    if (byId.has(trackIdForFile(file))) continue
    const track = await readTrackFromFile(file)
    if (track) {
      byId.set(track.id, track)
      added.push(track)
    }
  }

  if (added.length) libraryStore.set([...byId.values()])
  return added
}

export function removeTracks(trackIds: string[]): Track[] {
  const drop = new Set(trackIds)
  const next = getLibrary().filter((t) => !drop.has(t.id))
  libraryStore.set(next)
  return next
}
