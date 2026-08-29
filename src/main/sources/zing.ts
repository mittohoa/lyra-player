import { createHash, createHmac } from 'node:crypto'
import type { ResolvedStream, Track } from '@shared/types'
import { httpGet, SourceError, type DownloadTarget, type MusicSource } from './types'
import { log } from '../logger'

/**
 * Zing MP3 khong co API cong khai. Doan nay dung API noi bo cua web zingmp3.vn
 * (cach ky chu ky la kien thuc pho bien trong cong dong). Vi vay no CO THE HONG
 * bat cu luc nao khi ho doi phia server - loi se hien ra UI thay vi lam sap app.
 */
const HOST = 'https://zingmp3.vn'
const VERSION = '1.13.16'
const API_KEY = '88265e23d4284f25963e6eedac8fbfa3'
const SECRET_KEY = '2aa2d1c561e809b267f3638c4a307aab'

let cookie = ''
let cookieAt = 0
const COOKIE_TTL = 30 * 60 * 1000

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function hmac512(input: string, key: string): string {
  return createHmac('sha512', key).update(input).digest('hex')
}

/**
 * Chu ky Zing: hmac512(path + sha256(cac tham so ky, sap theo alphabet), SECRET_KEY).
 *
 * Luu y: CHI mot so tham so tham gia ky - vd. `/search/multi` chi ky ctime+version,
 * con `q` thi khong. Nem ca `q` vao se bi tra ve "Incorect signature".
 */
function sign(
  path: string,
  signedParams: Record<string, string>
): { ctime: string; sig: string } {
  const ctime = String(Math.floor(Date.now() / 1000))
  const payload: Record<string, string> = { ...signedParams, ctime, version: VERSION }
  const canonical = Object.keys(payload)
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join('')
  return { ctime, sig: hmac512(path + sha256(canonical), SECRET_KEY) }
}

async function ensureCookie(): Promise<string> {
  if (cookie && Date.now() - cookieAt < COOKIE_TTL) return cookie
  try {
    const res = await httpGet(HOST, { timeoutMs: 8000 })
    const raw = res.headers.getSetCookie?.() ?? []
    cookie = raw.map((c) => c.split(';')[0]).join('; ')
    cookieAt = Date.now()
  } catch (err) {
    log.warn('nguon nhac', 'Khong lay duoc cookie cua Zing MP3', err)
    cookie = ''
  }
  return cookie
}

interface ZingResponse<T> {
  err: number
  msg: string
  data: T
}

/**
 * @param params    tham so gui len query string
 * @param signedKey ten cac tham so tham gia tinh chu ky (ngoai ctime/version)
 */
async function call<T>(
  path: string,
  params: Record<string, string>,
  signedKeys: string[] = []
): Promise<T> {
  const signed = Object.fromEntries(
    signedKeys.filter((k) => k in params).map((k) => [k, params[k]])
  )
  const { ctime, sig } = sign(path, signed)

  const url = new URL(HOST + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('ctime', ctime)
  url.searchParams.set('version', VERSION)
  url.searchParams.set('sig', sig)
  url.searchParams.set('apiKey', API_KEY)

  const res = await httpGet(url, {
    headers: { Cookie: await ensureCookie(), Referer: `${HOST}/` }
  })
  if (!res.ok) throw new SourceError('zing', `Zing MP3 tra ve HTTP ${res.status}`)

  const body = (await res.json()) as ZingResponse<T>
  if (body.err !== 0) {
    throw new SourceError('zing', body.msg || `Zing MP3 bao loi ma ${body.err}`)
  }
  return body.data
}

interface ZingSong {
  encodeId: string
  title: string
  artistsNames?: string
  thumbnailM?: string
  thumbnail?: string
  duration?: number
  album?: { title?: string }
  streamingStatus?: number
}

function toTrack(song: ZingSong): Track {
  return {
    id: `zing:${song.encodeId}`,
    source: 'zing',
    sourceId: song.encodeId,
    title: song.title,
    artist: song.artistsNames || 'Khong ro nghe si',
    album: song.album?.title || 'Zing MP3',
    duration: Math.round(song.duration ?? 0),
    artwork: (song.thumbnailM || song.thumbnail)?.replace('w240', 'w600'),
    addedAt: Date.now()
  }
}

export const zingSource: MusicSource = {
  id: 'zing',
  label: 'Zing MP3',
  searchable: true,
  playable: true,

  async unavailableReason() {
    return null
  },

  async search(query: string, limit: number): Promise<Track[]> {
    const data = await call<{ songs?: ZingSong[] }>('/api/v2/search/multi', { q: query })
    return (data.songs ?? []).slice(0, limit).map(toTrack)
  },

  async resolve(track: Track): Promise<ResolvedStream> {
    const data = await call<Record<string, string>>(
      '/api/v2/song/get/streaming',
      { id: track.sourceId },
      ['id']
    )
    // Uu tien 320kbps, nhung ban VIP tra ve chuoi 'VIP' thay vi URL
    const url = [data['320'], data['128']].find((u) => u && u.startsWith('http'))
    if (!url) {
      throw new SourceError('zing', 'Bai nay chi danh cho tai khoan VIP hoac da bi go')
    }
    return { url, headers: { Referer: `${HOST}/` } }
  },

  async downloadUrl(track: Track): Promise<DownloadTarget> {
    const data = await call<Record<string, string>>(
      '/api/v2/song/get/streaming',
      { id: track.sourceId },
      ['id']
    )
    // 320 thuong doi VIP; roi ve 128 cho tai khoan thuong
    const best = ['320', '128'].find((k) => data[k]?.startsWith('http'))
    if (!best) throw new SourceError('zing', 'Bai nay chi danh cho tai khoan VIP hoac da bi go')
    return {
      url: data[best],
      headers: { Referer: `${HOST}/` },
      ext: 'mp3',
      quality: `${best} kbps`
    }
  },

  async lyrics(track: Track): Promise<string | null> {
    try {
      const data = await call<{ file?: string }>(
        '/api/v2/lyric/get/lyric',
        { id: track.sourceId },
        ['id']
      )
      if (!data.file) return null
      const res = await httpGet(data.file, { headers: { Referer: `${HOST}/` } })
      if (!res.ok) return null
      const text = await res.text()
      return text.trim() || null
    } catch (err) {
      log.debug('nguon nhac', 'Zing MP3 khong tra ve lyric', err)
      return null
    }
  }
}
