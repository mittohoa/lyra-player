import { basename } from 'node:path'
import type { ResolvedStream, Track } from '@shared/types'
import { httpGet, type MusicSource } from './types'

/** Duoi file coi la stream lien tuc (radio) - khong seek duoc. */
const LIVE_HINTS = [/\.m3u8(\?|$)/i, /\.pls(\?|$)/i, /\/stream\b/i, /icecast/i, /shoutcast/i]

function looksLive(url: string): boolean {
  return LIVE_HINTS.some((re) => re.test(url))
}

function titleFromUrl(url: string): { title: string; artist: string } {
  try {
    const u = new URL(url)
    const name = decodeURIComponent(basename(u.pathname)) || u.hostname
    const stem = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_+]/g, ' ').trim()
    return { title: stem || u.hostname, artist: u.hostname }
  } catch {
    return { title: url, artist: 'Stream' }
  }
}

/**
 * Doc metadata Icecast/Shoutcast tu header cua request HEAD.
 * Nhieu dai radio dat ten dai o `icy-name`.
 */
async function probe(url: string): Promise<{ name?: string; live: boolean }> {
  try {
    const res = await httpGet(url, { method: 'HEAD', timeoutMs: 6000 })
    const icyName = res.headers.get('icy-name') ?? undefined
    const type = res.headers.get('content-type') ?? ''
    const acceptsRange = res.headers.get('accept-ranges') === 'bytes'
    const hasLength = !!res.headers.get('content-length')
    return {
      name: icyName?.trim() || undefined,
      live: /mpegurl|ogg;\s*codecs|application\/vnd\.apple/i.test(type) || !(acceptsRange && hasLength)
    }
  } catch {
    return { live: looksLive(url) }
  }
}

/** Tao Track tu mot URL nguoi dung dan vao. */
export async function trackFromUrl(url: string): Promise<Track> {
  const guess = titleFromUrl(url)
  const info = await probe(url)
  return {
    id: `direct:${url}`,
    source: 'direct',
    sourceId: url,
    title: info.name || guess.title,
    artist: guess.artist,
    album: 'Stream truc tiep',
    duration: 0,
    isLive: info.live || looksLive(url),
    addedAt: Date.now()
  }
}

export const directSource: MusicSource = {
  id: 'direct',
  label: 'URL / Radio',
  searchable: false,
  playable: true,
  async unavailableReason() {
    return null
  },
  async resolve(track: Track): Promise<ResolvedStream> {
    return { url: track.sourceId }
  }
}
