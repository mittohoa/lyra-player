import type { ResolvedStream, Track } from '@shared/types'
import { httpGet, SourceError, type DownloadTarget, type MusicSource } from './types'
import { log } from '../logger'

/**
 * NhacCuaTui khong co API cong khai. Ho da viet lai web thanh SPA (Nuxt) va goi
 * mot API REST noi bo o `graph.nhaccuatui.com` - doan nay goi thang API do.
 * Vi vay no CO THE HONG bat cu luc nao khi ho doi phia server; loi hien ra UI
 * thanh mot dong canh bao thay vi lam sap app.
 */
const API = 'https://graph.nhaccuatui.com'
const WEB = 'https://www.nhaccuatui.com'

/** File .lrc cua NCT duoc ma hoa RC4; khoa di kem trong chinh ban tin lyric. */
function rc4(key: Buffer, data: Buffer): Buffer {
  const s = new Uint8Array(256)
  for (let i = 0; i < 256; i++) s[i] = i

  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255
    ;[s[i], s[j]] = [s[j], s[i]]
  }

  const out = Buffer.alloc(data.length)
  let i = 0
  j = 0
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255
    j = (j + s[i]) & 255
    ;[s[i], s[j]] = [s[j], s[i]]
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255]
  }
  return out
}

interface NctResponse<T> {
  code: number
  success: boolean
  msg?: string
  data: T
}

interface NctStream {
  stream?: string
  download?: string
  /** '128' | '320' */
  type?: string
  onlyVIP?: boolean
  status?: number
}

interface NctSong {
  key: string
  name: string
  artistName?: string
  image?: string
  duration?: number
  genreName?: string
  streamURL?: NctStream[]
}

async function call<T>(
  path: string,
  init: { method?: 'GET' | 'POST' } = {}
): Promise<T> {
  const res = await httpGet(API + path, {
    method: init.method ?? 'GET',
    headers: {
      Origin: WEB,
      Referer: `${WEB}/`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  })
  if (!res.ok) throw new SourceError('nct', `NhacCuaTui tra ve HTTP ${res.status}`)

  const body = (await res.json()) as NctResponse<T>
  if (!body.success || body.code !== 0) {
    throw new SourceError('nct', body.msg || `NhacCuaTui bao loi ma ${body.code}`)
  }
  return body.data
}

function toTrack(song: NctSong): Track {
  return {
    id: `nct:${song.key}`,
    source: 'nct',
    sourceId: song.key,
    title: song.name,
    artist: song.artistName || 'Không rõ nghệ sĩ',
    album: song.genreName || 'NhacCuaTui',
    duration: Math.round(song.duration ?? 0),
    artwork: song.image,
    addedAt: Date.now()
  }
}

/** Chon ban chat luong cao nhat ma tai khoan thuong nghe duoc. */
function pickStream(streams: NctStream[] | undefined): NctStream | null {
  const usable = (streams ?? []).filter((s) => s.stream && !s.onlyVIP && s.status !== 0)
  if (!usable.length) return null
  return usable.sort((a, b) => Number(b.type ?? 0) - Number(a.type ?? 0))[0]
}

/** Link stream mang san han dung o tham so `e=<unix>`. */
function expiryOf(url: string): number | undefined {
  try {
    const e = Number(new URL(url).searchParams.get('e'))
    // Tru 5 phut cho chac, tranh dung ngay luc het han giua bai
    return Number.isFinite(e) && e > 0 ? e * 1000 - 5 * 60 * 1000 : undefined
  } catch {
    return undefined
  }
}

export const nctSource: MusicSource = {
  id: 'nct',
  label: 'NhacCuaTui',
  searchable: true,
  playable: true,

  async unavailableReason() {
    return null
  },

  async search(query: string, limit: number): Promise<Track[]> {
    const path =
      `/api/v1/search/song?keyword=${encodeURIComponent(query)}` +
      `&pageindex=1&pagesize=${Math.min(limit, 50)}&correct=false`
    const data = await call<{ songs?: NctSong[] }>(path, { method: 'POST' })
    return (data.songs ?? []).map(toTrack)
  },

  async resolve(track: Track): Promise<ResolvedStream> {
    // Link trong ket qua tim kiem het han nhanh, nen luon hoi lai ban moi
    const song = await call<NctSong>(`/api/v1/song/detail/${track.sourceId}`)
    const picked = pickStream(song.streamURL)
    if (!picked?.stream) {
      throw new SourceError('nct', 'Bài này chỉ dành cho tài khoản VIP hoặc đã bị gỡ')
    }
    return {
      url: picked.stream,
      headers: { Referer: `${WEB}/` },
      expiresAt: expiryOf(picked.stream)
    }
  },

  async downloadUrl(track: Track): Promise<DownloadTarget> {
    const song = await call<NctSong>(`/api/v1/song/detail/${track.sourceId}`)
    const picked = pickStream(song.streamURL)
    if (!picked) throw new SourceError('nct', 'Bài này không tải được (VIP hoặc đã bị gỡ)')
    // Truong `download` la link tai rieng; khong co thi dung tam link stream
    return {
      url: picked.download ?? picked.stream!,
      headers: { Referer: `${WEB}/` },
      ext: 'mp3',
      quality: `${picked.type ?? '128'} kbps`
    }
  },

  async lyrics(track: Track): Promise<string | null> {
    try {
      const data = await call<{
        content?: string
        timedLyric?: string
        keyDecryptLyric?: string
      }>(`/api/v1/song/lyric/detail?songKey=${encodeURIComponent(track.sourceId)}`)

      // Ban co timestamp nam trong file .lrc ma hoa RC4
      if (data.timedLyric && data.keyDecryptLyric) {
        const res = await httpGet(data.timedLyric, { headers: { Referer: `${WEB}/` } })
        if (res.ok) {
          const hex = (await res.text()).trim()
          if (/^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0) {
            const plain = rc4(
              Buffer.from(data.keyDecryptLyric, 'utf8'),
              Buffer.from(hex, 'hex')
            ).toString('utf8')
            if (plain.trim()) return plain
          }
        }
      }

      // Khong co ban dong bo thi tra ve loi thuan
      return data.content?.trim() || null
    } catch (err) {
      log.debug('nguồn nhạc', 'NhacCuaTui không trả về lời bài hát', err)
      return null
    }
  }
}
