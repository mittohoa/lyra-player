import type { ResolvedStream, SearchResult, SourceId, Track } from '@shared/types'
import { directSource } from './direct'
import { nctSource } from './nct'
import { spotifySource } from './spotify'
import { youtubeSource } from './youtube'
import { zingSource } from './zing'
import type { MusicSource } from './types'
import { log } from '../logger'

export const sources: Record<Exclude<SourceId, 'local'>, MusicSource> = {
  direct: directSource,
  youtube: youtubeSource,
  zing: zingSource,
  nct: nctSource,
  spotify: spotifySource
}

export const searchableSources = Object.values(sources).filter((s) => s.searchable)

/** URL stream da phan giai, giu lai de khong phai goi mang moi lan tua. */
const streamCache = new Map<string, ResolvedStream>()

export function getSource(id: SourceId): MusicSource | null {
  return id === 'local' ? null : (sources[id] ?? null)
}

export async function resolveStream(track: Track, force = false): Promise<ResolvedStream> {
  if (track.source === 'local') {
    if (!track.filePath) throw new Error('Bài hát trong máy thiếu đường dẫn file')
    return { url: `media://local/${encodeURIComponent(track.filePath)}` }
  }

  const cached = streamCache.get(track.id)
  if (!force && cached && (!cached.expiresAt || Date.now() < cached.expiresAt)) return cached

  const source = getSource(track.source)
  if (!source?.resolve) throw new Error(`Nguồn "${track.source}" không phát trực tiếp được`)

  const resolved = await source.resolve(track)
  streamCache.set(track.id, resolved)
  return resolved
}

/** Lyric rieng cua nguon (Zing/NCT co san .lrc chuan). */
export async function sourceLyrics(track: Track): Promise<string | null> {
  const source = getSource(track.source)
  if (!source?.lyrics) return null
  try {
    return await source.lyrics(track)
  } catch (err) {
    log.debug('nguồn nhạc', `Không lấy được lời từ ${track.source}`, err)
    return null
  }
}

/**
 * Tim song song tren nhieu nguon. Nguon loi khong lam hong ket qua cua nguon khac -
 * loi duoc gan vao ket qua cua chinh nguon do de UI hien mot dong canh bao nho.
 */
export async function searchAll(
  query: string,
  sourceIds: SourceId[],
  limit = 25
): Promise<SearchResult[]> {
  const targets = sourceIds
    .map((id) => getSource(id))
    .filter((s): s is MusicSource => !!s?.searchable && !!s.search)

  return Promise.all(
    targets.map(async (source): Promise<SearchResult> => {
      try {
        const blocked = await source.unavailableReason()
        if (blocked) return { source: source.id, tracks: [], error: blocked }
        return { source: source.id, tracks: await source.search!(query, limit) }
      } catch (err) {
        return {
          source: source.id,
          tracks: [],
          error: err instanceof Error ? err.message : String(err)
        }
      }
    })
  )
}

/** Trang thai san sang cua tung nguon, hien trong man hinh Kham pha / Cai dat. */
export async function sourceStatus(): Promise<
  { id: SourceId; label: string; searchable: boolean; playable: boolean; error: string | null }[]
> {
  return Promise.all(
    Object.values(sources).map(async (s) => ({
      id: s.id,
      label: s.label,
      searchable: s.searchable,
      playable: s.playable,
      error: await s.unavailableReason()
    }))
  )
}

export { trackFromUrl } from './direct'
export { parseYouTubeId, trackFromYouTubeId } from './youtube'
