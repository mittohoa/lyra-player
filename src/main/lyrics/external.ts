import type { Lyrics, LyricLine } from '@shared/types'
import { nctSource } from '../sources/nct'
import { zingSource } from '../sources/zing'
import { getSettings } from '../store'
import { fetchYouTubeSubtitles } from '../subtitles/youtube'
import { candidatesFrom, titleSimilarity, type RawNowPlaying } from './identify'
import { fetchBest } from './lrclib'
import { emptyLyrics, toLyrics } from './lrc'
import { log } from '../logger'

/**
 * Tim LOI cho thu dang phat o app khac - co the la lyric bai hat, co the la
 * phu de video.
 *
 * Khac han voi tim lyric cho bai trong thu vien: o day ta khong biet chac ten
 * bai va nghe si, chi co mot chuoi tho tu Windows. Quy trinh:
 *
 *   1. Sinh nhieu phuong an (nghe si, ten bai) tu chuoi tho
 *   2. Voi tung phuong an, hoi lan luot LRCLIB -> Zing -> NCT
 *   3. Chi nhan khi TEN TRA VE DU GIONG - hien nham loi bai khac con te hon
 *      la khong hien gi
 *   4. Uu tien ban co moc thoi gian
 *
 * Neu la video dai thi dao thu tu: thu phu de truoc, vi mot video 20 phut
 * chac chan khong phai bai hat.
 */

/** Duoi nguong nay coi nhu tra nham. */
const MIN_SIMILARITY = 0.6

/** Chi thu vai phuong an dau - moi lan thu la mot lan goi mang. */
const MAX_CANDIDATES = 3

/** Dai hon nguong nay thi coi la video, khong phai bai hat (giay). */
const VIDEO_THRESHOLD = 8 * 60

export interface ExternalMatch {
  lines: LyricLine[]
  kind: Lyrics['kind']
  offset: number
  /** Loi bai hat hay phu de video. */
  type: 'lyrics' | 'subtitles'
  /** Noi tim ra: 'lrclib' | 'zing' | 'nct' | 'youtube' | 'youtube-auto'. */
  from: string
  title: string
  artist: string
  /** Chi co voi phu de. */
  language?: string
}

/** Hoi Zing hoac NCT: tim bai roi lay .lrc cua chinh ho. */
async function fromVietnameseSource(
  source: typeof zingSource | typeof nctSource,
  artist: string,
  title: string,
  duration?: number
): Promise<{ content: string; similarity: number; artist: string; title: string } | null> {
  const query = [artist, title].filter(Boolean).join(' ').trim()
  if (!query) return null

  const tracks = await source.search!(query, 5)
  if (!tracks.length) return null

  const scored = tracks
    .map((t) => {
      let score = titleSimilarity(t.title, title)
      if (artist) score = score * 0.75 + titleSimilarity(t.artist, artist) * 0.25
      if (duration && t.duration) {
        const diff = Math.abs(t.duration - duration)
        if (diff <= 3) score += 0.15
        else if (diff > 25) score -= 0.25
      }
      return { track: t, score }
    })
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best || best.score < MIN_SIMILARITY) return null

  const content = await source.lyrics!(best.track)
  if (!content?.trim()) return null

  return { content, similarity: best.score, artist: best.track.artist, title: best.track.title }
}

/** Tim lyric bai hat qua cac nguon nhac. */
async function findLyrics(
  raw: RawNowPlaying & { duration?: number }
): Promise<ExternalMatch | null> {
  const candidates = candidatesFrom(raw).slice(0, MAX_CANDIDATES)
  let plainFallback: ExternalMatch | null = null

  for (const { artist, title } of candidates) {
    try {
      const hit = await fetchBest({ trackId: '', title, artist, duration: raw.duration })
      if (hit) {
        const lyrics = toLyrics(hit.content, 'lrclib', 0)
        const match: ExternalMatch = {
          lines: lyrics.lines,
          kind: lyrics.kind,
          offset: 0,
          type: 'lyrics',
          from: 'lrclib',
          title,
          artist
        }
        if (hit.synced) return match
        plainFallback ??= match
      }
    } catch (err) {
      log.debug('lời ở app khác', 'LRCLIB không trả lời được', err)
    }

    for (const [name, source] of [
      ['zing', zingSource],
      ['nct', nctSource]
    ] as const) {
      try {
        const hit = await fromVietnameseSource(source, artist, title, raw.duration)
        if (!hit) continue

        const lyrics = toLyrics(hit.content, 'lrclib', 0)
        const match: ExternalMatch = {
          lines: lyrics.lines,
          kind: lyrics.kind,
          offset: 0,
          type: 'lyrics',
          from: name,
          title: hit.title,
          artist: hit.artist
        }
        if (lyrics.kind === 'synced') return match
        plainFallback ??= match
      } catch (err) {
        log.debug('lời ở app khác', `${name} không trả lời được`, err)
      }
    }
  }

  return plainFallback
}

/** Tim phu de cua video dang phat. */
async function findSubtitles(
  raw: RawNowPlaying & { duration?: number }
): Promise<ExternalMatch | null> {
  const settings = getSettings()
  if (!settings.externalSubtitles) return null

  const languages = settings.subtitleLangs
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!languages.length) return null

  // Tim theo chinh chuoi tho: ten video tren YouTube giong het chuoi Windows
  // dua ra, nen tim nguyen ban trung hon la tim theo ten da lam sach
  const query = raw.title.trim()
  if (!query) return null

  try {
    const found = await fetchYouTubeSubtitles(query, languages, raw.duration)
    if (!found?.lines.length) return null

    return {
      lines: found.lines,
      kind: 'synced',
      offset: 0,
      type: 'subtitles',
      from: found.auto ? 'youtube-auto' : 'youtube',
      title: found.videoTitle || raw.title,
      artist: raw.artist ?? '',
      language: found.language
    }
  } catch (err) {
    log.debug('phụ đề', 'Không lấy được phụ đề cho video này', err)
    return null
  }
}

/**
 * Tim loi (lyric hoac phu de) cho thu dang phat o app khac.
 * Thu tu uu tien phu thuoc do dai: video dai thi thu phu de truoc.
 */
export async function resolveExternalLyrics(
  raw: RawNowPlaying & { duration?: number }
): Promise<ExternalMatch | null> {
  const looksLikeVideo = (raw.duration ?? 0) > VIDEO_THRESHOLD

  const first = looksLikeVideo ? findSubtitles : findLyrics
  const second = looksLikeVideo ? findLyrics : findSubtitles

  const hit = await first(raw)
  if (hit?.kind === 'synced') return hit

  const backup = await second(raw)
  if (backup?.kind === 'synced') return backup

  return hit ?? backup
}

export { emptyLyrics }
