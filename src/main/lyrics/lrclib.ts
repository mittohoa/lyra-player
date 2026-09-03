import type { LyricsQuery } from '@shared/types'
import { log } from '../logger'

const BASE = 'https://lrclib.net/api'
const USER_AGENT = 'AURA/0.1.8 (trinh nghe nhac desktop)'

export interface LrclibRecord {
  id: number
  trackName: string
  artistName: string
  albumName: string | null
  duration: number | null
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

async function request<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(BASE + path)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`LRCLIB ${res.status} ${res.statusText}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Tim chinh xac theo bo (ten bai, nghe si, album, do dai). Nhanh va chuan nhat. */
export async function getExact(query: LyricsQuery): Promise<LrclibRecord | null> {
  const params: Record<string, string> = {
    track_name: query.title,
    artist_name: query.artist
  }
  if (query.album) params.album_name = query.album
  if (query.duration && query.duration > 0) params.duration = String(Math.round(query.duration))
  return request<LrclibRecord>('/get', params)
}

/** Tim mo rong khi /get truot. */
export async function search(query: LyricsQuery): Promise<LrclibRecord[]> {
  const results =
    (await request<LrclibRecord[]>('/search', {
      track_name: query.title,
      artist_name: query.artist
    })) ?? []
  if (results.length) return results
  // Lan cuoi: tim tu do, phong khi tag nghe si bi sai
  return (
    (await request<LrclibRecord[]>('/search', {
      q: `${query.artist} ${query.title}`.trim()
    })) ?? []
  )
}

/** Cham diem ket qua: uu tien co timestamp va do dai gan dung. */
function score(record: LrclibRecord, query: LyricsQuery): number {
  let s = 0
  if (record.syncedLyrics) s += 100
  else if (record.plainLyrics) s += 10
  if (query.duration && record.duration) {
    const diff = Math.abs(record.duration - query.duration)
    if (diff <= 2) s += 50
    else if (diff <= 5) s += 25
    else if (diff > 20) s -= 40
  }
  if (record.artistName.toLowerCase() === query.artist.toLowerCase()) s += 20
  if (record.trackName.toLowerCase() === query.title.toLowerCase()) s += 20
  return s
}

/** Tra ve noi dung lyric tot nhat tim duoc, hoac null. */
export async function fetchBest(
  query: LyricsQuery
): Promise<{ content: string; synced: boolean } | null> {
  if (!query.title.trim()) return null

  try {
    const exact = await getExact(query)
    if (exact?.syncedLyrics) return { content: exact.syncedLyrics, synced: true }
    if (exact?.plainLyrics) return { content: exact.plainLyrics, synced: false }
  } catch (err) {
    log.debug('lời bài hát', 'LRCLIB /get thất bại', err)
  }

  try {
    const results = await search(query)
    if (!results.length) return null
    const best = results
      .filter((r) => r.syncedLyrics || r.plainLyrics)
      .sort((a, b) => score(b, query) - score(a, query))[0]
    if (!best) return null
    if (best.syncedLyrics) return { content: best.syncedLyrics, synced: true }
    if (best.plainLyrics) return { content: best.plainLyrics, synced: false }
  } catch (err) {
    log.debug('lời bài hát', 'LRCLIB /search thất bại', err)
  }

  return null
}
