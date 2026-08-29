import { createWriteStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import NodeID3 from 'node-id3'
import { IPC, type DownloadProgress } from '@shared/ipc'
import type { Track } from '@shared/types'
import { getSource, sourceLyrics } from './sources'
import { httpGet, type DownloadTarget } from './sources/types'
import { runYtDlpWithProgress } from './sources/ytdlp'
import { addFiles } from './library'
import { getSettings } from './store'
import { broadcast } from './windows'
import { log, reportError } from './logger'

/**
 * Tai bai hat ve may kem lyric.
 *
 * Diem quan trong: file .lrc duoc dat NGAY CANH file nhac, cung ten. Nho vay bai
 * vua tai roi thang vao chuoi uu tien lyric cua app ("sidecar" dung sau ban tu nhap),
 * va cac trinh nghe nhac khac cung doc duoc.
 */

/**
 * Bo cac ky tu Windows khong cho dat trong ten file.
 * Co y GIU dau cach va gach ngang - chung la mot phan cua ten bai.
 */
function safeName(text: string): string {
  return text
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/, '') // Windows khong cho ten file ket thuc bang cham hoac cach
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function defaultDownloadFolder(): string {
  return join(app.getPath('music'), 'Lyra')
}

function targetFolder(): string {
  return getSettings().downloadFolder.trim() || defaultDownloadFolder()
}

/** Duong dan file dich, tu them hau to neu da co file trung ten. */
async function uniquePath(folder: string, base: string, ext: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const name = i === 0 ? `${base}.${ext}` : `${base} (${i}).${ext}`
    const full = join(folder, name)
    try {
      await fs.access(full)
    } catch {
      return full // khong ton tai - dung duoc
    }
  }
  return join(folder, `${base} ${Date.now()}.${ext}`)
}

/** Tai qua yt-dlp cho YouTube; cac nguon khac tai thang bang HTTP. */
async function fetchToFile(
  track: Track,
  target: DownloadTarget,
  filePath: string,
  onProgress: (received: number, total: number) => void
): Promise<void> {
  if (track.source === 'youtube') {
    // yt-dlp khong cho biet tong so byte truoc, nen bao theo phan tram cua no
    await runYtDlpWithProgress(
      [
        `https://www.youtube.com/watch?v=${track.sourceId}`,
        '-f',
        'bestaudio[ext=m4a]/bestaudio',
        '-o',
        filePath
      ],
      (percent) => onProgress(percent, 100)
    )
    return
  }

  const res = await httpGet(target.url, { headers: target.headers, timeoutMs: 60_000 })
  if (!res.ok || !res.body) throw new Error(`Tai that bai (HTTP ${res.status})`)

  const total = Number(res.headers.get('content-length') ?? 0)
  let received = 0

  const body = Readable.fromWeb(res.body as never)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    onProgress(received, total)
  })

  await pipeline(body, createWriteStream(filePath))
}

/** Ghi tag ID3 va anh bia. Chi lam duoc voi mp3 - dinh dang khac thi bo qua. */
async function writeTags(filePath: string, track: Track): Promise<void> {
  if (!filePath.toLowerCase().endsWith('.mp3')) return

  const tags: NodeID3.Tags = {
    title: track.title,
    artist: track.artist,
    album: track.album
  }

  if (track.artwork) {
    try {
      const res = await httpGet(track.artwork, { timeoutMs: 15_000 })
      if (res.ok) {
        tags.image = {
          mime: res.headers.get('content-type') ?? 'image/jpeg',
          type: { id: 3, name: 'front cover' },
          description: '',
          imageBuffer: Buffer.from(await res.arrayBuffer())
        }
      }
    } catch {
      // Khong tai duoc anh bia thi van giu cac tag con lai
    }
  }

  try {
    NodeID3.write(tags, filePath)
  } catch (err) {
    log.warn('tai ve', 'Khong ghi duoc tag vao file, nhung file da tai xong', err)
  }
}

/**
 * Tai mot bai ve may: file nhac + tag + file .lrc di kem, roi them vao thu vien.
 * Tra ve duong dan file nhac.
 */
export async function downloadTrack(track: Track): Promise<string> {
  const source = getSource(track.source)
  if (!source?.downloadUrl && track.source !== 'youtube') {
    throw new Error(`Nguon "${track.source}" khong ho tro tai ve`)
  }

  const report = (patch: Partial<DownloadProgress>): void => {
    broadcast(IPC.downloadProgress, {
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      phase: 'downloading',
      received: 0,
      total: 0,
      ...patch
    } as DownloadProgress)
  }

  report({ phase: 'resolving' })

  const target: DownloadTarget = source?.downloadUrl
    ? await source.downloadUrl(track)
    : { url: '', ext: 'm4a', quality: 'bestaudio' }

  const folder = targetFolder()
  await fs.mkdir(folder, { recursive: true })

  const base = safeName(`${track.artist} - ${track.title}`) || safeName(track.title) || 'Bai hat'
  const filePath = await uniquePath(folder, base, target.ext)

  try {
    report({ phase: 'downloading', quality: target.quality })
    await fetchToFile(track, target, filePath, (received, total) =>
      report({ phase: 'downloading', received, total, quality: target.quality })
    )

    report({ phase: 'tagging' })
    await writeTags(filePath, track)

    // Lyric di kem - cung ten, nam canh file nhac
    report({ phase: 'lyrics' })
    const lrc = await sourceLyrics(track)
    if (lrc?.trim()) {
      const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')
      await fs.writeFile(lrcPath, lrc, 'utf8')
    }

    // Vao thang thu vien de nghe offline duoc ngay
    await addFiles([filePath])

    report({ phase: 'done', filePath })
    return filePath
  } catch (err) {
    // Don file dang do, khong de lai rac trong thu muc nhac
    await fs.rm(filePath, { force: true })
    report({
      phase: 'error',
      error: reportError('tai ve', err, `Không tải được "${track.title}".`)
    })
    throw err
  }
}
