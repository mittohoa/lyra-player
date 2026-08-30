import type { ResolvedStream, Track } from '@shared/types'
import { findYtDlp, runYtDlpJson } from './ytdlp'
import type { MusicSource } from './types'

interface FlatEntry {
  id: string
  title?: string
  uploader?: string
  channel?: string
  duration?: number
  thumbnails?: { url: string; width?: number }[]
}

interface FullInfo {
  id: string
  title: string
  uploader?: string
  channel?: string
  artist?: string
  track?: string
  album?: string
  duration?: number
  thumbnail?: string
  is_live?: boolean
  url?: string
  http_headers?: Record<string, string>
  requested_downloads?: { url?: string; http_headers?: Record<string, string> }[]
  formats?: {
    url?: string
    acodec?: string
    vcodec?: string
    abr?: number
    ext?: string
    protocol?: string
    http_headers?: Record<string, string>
  }[]
}

function pickThumb(entry: FlatEntry): string | undefined {
  const thumbs = entry.thumbnails ?? []
  if (!thumbs.length) return `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`
  return [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url
}

/**
 * Tach "Nghe si - Ten bai" tu tieu de video YouTube.
 * Bo cac hau to quang cao thuong gap de tim lyric de trung hon.
 */
function splitTitle(raw: string, uploader?: string): { title: string; artist: string } {
  const cleaned = raw
    .replace(/[([]\s*(official|lyric[s]?|audio|mv|m\/v|video|4k|hd|visualizer|music video)[^)\]]*[)\]]/gi, '')
    .replace(/\s*\|\s*(official|lyric[s]?|audio|mv).*$/gi, '')
    .trim()
  const parts = cleaned.split(/\s+[-–—]\s+/)
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() }
  }
  return { artist: uploader?.replace(/\s*-\s*Topic$/i, '').trim() || 'YouTube', title: cleaned }
}

function toTrack(entry: FlatEntry): Track {
  const raw = entry.title ?? entry.id
  const uploader = entry.uploader ?? entry.channel
  const { title, artist } = splitTitle(raw, uploader)
  return {
    id: `youtube:${entry.id}`,
    source: 'youtube',
    sourceId: entry.id,
    title,
    artist,
    album: 'YouTube',
    duration: Math.round(entry.duration ?? 0),
    artwork: pickThumb(entry),
    addedAt: Date.now()
  }
}

/** Chon URL audio tot nhat trong ket qua yt-dlp. */
function pickAudioUrl(info: FullInfo): { url: string; headers?: Record<string, string> } | null {
  const requested = info.requested_downloads?.find((d) => d.url)
  if (requested?.url) return { url: requested.url, headers: requested.http_headers }

  const audioOnly = (info.formats ?? []).filter(
    (f) => f.url && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
  )
  // Tranh HLS/DASH manifest - the <audio> phat truc tiep progressive on dinh hon
  const progressive = audioOnly.filter((f) => !/m3u8|dash/i.test(f.protocol ?? ''))
  const pool = progressive.length ? progressive : audioOnly
  const best = pool.sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0]
  if (best?.url) return { url: best.url, headers: best.http_headers }

  if (info.url) return { url: info.url, headers: info.http_headers }
  return null
}

export const youtubeSource: MusicSource = {
  id: 'youtube',
  label: 'YouTube',
  searchable: true,
  playable: true,

  async unavailableReason() {
    const bin = await findYtDlp()
    return bin
      ? null
      : 'Chưa có yt-dlp. Mở Cài đặt → YouTube để cài tự động hoặc chọn file yt-dlp.exe.'
  },

  async search(query: string, limit: number): Promise<Track[]> {
    const info = await runYtDlpJson<{ entries?: FlatEntry[] }>([
      `ytsearch${Math.min(limit, 40)}:${query}`,
      '--flat-playlist',
      '--yes-playlist'
    ])
    return (info.entries ?? [])
      .filter((e) => e.id && (e.duration ?? 0) < 60 * 60) // bo podcast/livestream dai
      .map(toTrack)
  },

  async resolve(track: Track): Promise<ResolvedStream> {
    const info = await runYtDlpJson<FullInfo>([
      `https://www.youtube.com/watch?v=${track.sourceId}`,
      '-f',
      'bestaudio[ext=m4a]/bestaudio[acodec!=none]/best'
    ])
    const picked = pickAudioUrl(info)
    if (!picked) throw new Error('Không tìm được luồng âm thanh cho video này')

    // URL googlevideo thuong het han sau ~6 gio; het han thi phan giai lai
    return {
      url: picked.url,
      headers: picked.headers,
      expiresAt: Date.now() + 5 * 60 * 60 * 1000
    }
  }
}

/** Nhan dang link YouTube nguoi dung dan vao o "them URL". */
export function parseYouTubeId(input: string): string | null {
  try {
    const url = new URL(input)
    if (/(^|\.)youtube\.com$/.test(url.hostname)) {
      const v = url.searchParams.get('v')
      if (v) return v
      const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)
      if (m) return m[1]
    }
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1)
      if (/^[\w-]{11}$/.test(id)) return id
    }
  } catch {
    // khong phai URL
  }
  return null
}

/** Lay day du thong tin mot video de them vao hang doi. */
export async function trackFromYouTubeId(videoId: string): Promise<Track> {
  const info = await runYtDlpJson<FullInfo>([
    `https://www.youtube.com/watch?v=${videoId}`,
    '--skip-download'
  ])
  const { title, artist } = info.track
    ? { title: info.track, artist: info.artist ?? info.uploader ?? 'YouTube' }
    : splitTitle(info.title, info.uploader ?? info.channel)
  return {
    id: `youtube:${videoId}`,
    source: 'youtube',
    sourceId: videoId,
    title,
    artist,
    album: info.album ?? 'YouTube',
    duration: Math.round(info.duration ?? 0),
    artwork: info.thumbnail ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    isLive: info.is_live,
    addedAt: Date.now()
  }
}
