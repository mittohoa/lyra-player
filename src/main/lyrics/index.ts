import { promises as fs } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { app } from 'electron'
import type { Lyrics, LyricsQuery } from '@shared/types'
import { getSettings, lyricsOffsetStore, manualLyricsStore } from '../store'
import { emptyLyrics, toLyrics } from './lrc'
import { fetchBest } from './lrclib'
import { log } from '../logger'

export * from './lrc'

const cacheDir = join(app.getPath('userData'), 'lyrics-cache')

/** Ten file cache an toan cho moi he file. */
function cacheKey(query: LyricsQuery): string {
  const raw = `${query.artist}__${query.title}__${Math.round(query.duration ?? 0)}`
  return raw.toLowerCase().replace(/[^a-z0-9À-ỹ]+/gi, '_').slice(0, 120)
}

async function readCache(query: LyricsQuery): Promise<string | null> {
  try {
    return await fs.readFile(join(cacheDir, `${cacheKey(query)}.lrc`), 'utf8')
  } catch {
    return null
  }
}

async function writeCache(query: LyricsQuery, content: string): Promise<void> {
  try {
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(join(cacheDir, `${cacheKey(query)}.lrc`), content, 'utf8')
  } catch (err) {
    log.warn('lyric', 'Khong ghi duoc bo nho dem lyric', err)
  }
}

/** Tim file .lrc / .txt nam canh file nhac. */
async function readSidecar(filePath: string): Promise<string | null> {
  const stem = filePath.slice(0, filePath.length - extname(filePath).length)
  for (const ext of ['.lrc', '.LRC', '.txt']) {
    try {
      const content = await fs.readFile(stem + ext, 'utf8')
      if (content.trim()) return content
    } catch {
      // khong co file nay, thu duoi tiep theo
    }
  }
  // Mot so bo suu tap de lyric trong thu muc con `lyrics/`
  try {
    const base = filePath.slice(dirname(filePath).length + 1)
    const stemName = base.slice(0, base.length - extname(base).length)
    const content = await fs.readFile(join(dirname(filePath), 'lyrics', `${stemName}.lrc`), 'utf8')
    if (content.trim()) return content
  } catch {
    // khong co
  }
  return null
}

export function getManualOffset(trackId: string): number {
  return lyricsOffsetStore.get()[trackId] ?? 0
}

export function setManualOffset(trackId: string, offset: number): void {
  const next = { ...lyricsOffsetStore.get() }
  if (offset === 0) delete next[trackId]
  else next[trackId] = offset
  lyricsOffsetStore.set(next)
}

export function setManualLyrics(trackId: string, content: string): void {
  const next = { ...manualLyricsStore.get() }
  if (!content.trim()) delete next[trackId]
  else next[trackId] = content
  manualLyricsStore.set(next)
}

/**
 * Ghi lyric ra file .lrc cung ten, nam canh file nhac.
 * Nho vay ban sua cua nguoi dung di theo file nhac sang may khac / app khac,
 * va lan sau chinh app nay cung nhat lai duoc qua nhanh "sidecar".
 */
export async function writeLrcSidecar(filePath: string, content: string): Promise<void> {
  const target = filePath.slice(0, filePath.length - extname(filePath).length) + '.lrc'
  try {
    if (content.trim()) await fs.writeFile(target, content, 'utf8')
    else await fs.rm(target, { force: true })
  } catch (err) {
    log.warn('lyric', 'Khong ghi duoc file .lrc canh file nhac', err)
  }
}

export function getManualLyrics(trackId: string): string | null {
  return manualLyricsStore.get()[trackId] ?? null
}

/**
 * Chuoi uu tien tim lyric:
 *   1. Lyric nguoi dung tu dan/chinh (luon thang)
 *   2. File .lrc nam canh file nhac
 *   3. Lyric nhung trong tag
 *   4. Cache LRCLIB da tai truoc do
 *   5. LRCLIB tren mang (neu bat autoFetchLyrics)
 */
export async function resolveLyrics(
  query: LyricsQuery,
  embedded?: string,
  opts: { forceRefetch?: boolean } = {}
): Promise<Lyrics> {
  const offset = getManualOffset(query.trackId)

  if (!opts.forceRefetch) {
    const manual = getManualLyrics(query.trackId)
    if (manual) return toLyrics(manual, 'manual', offset)

    if (query.filePath) {
      const sidecar = await readSidecar(query.filePath)
      if (sidecar) return toLyrics(sidecar, 'sidecar', offset)
    }

    if (embedded?.trim()) return toLyrics(embedded, 'embedded', offset)

    const cached = await readCache(query)
    if (cached) return toLyrics(cached, 'lrclib', offset)
  }

  if (!getSettings().autoFetchLyrics && !opts.forceRefetch) return emptyLyrics()

  const remote = await fetchBest(query)
  if (remote) {
    await writeCache(query, remote.content)
    return toLyrics(remote.content, 'lrclib', offset)
  }

  return emptyLyrics()
}
