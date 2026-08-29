import type { Track } from '@shared/types'
import { getSettings } from '../store'
import { httpGet, SourceError, type MusicSource } from './types'

/**
 * Spotify chi dung de tra cuu metadata (ten bai, nghe si, anh bia, do dai)
 * roi tu do tim lyric tren LRCLIB va tim ban phat tren nguon khac.
 * API chinh thuc KHONG cho stream audio ngoai SDK Premium, nen source nay khong playable.
 */
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'

let token: { value: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  const { clientId, clientSecret } = getSettings().spotify
  if (!clientId || !clientSecret) {
    throw new SourceError('spotify', 'Chua nhap Client ID / Client Secret trong Cai dat > Spotify')
  }
  if (token && Date.now() < token.expiresAt - 30_000) return token.value

  const res = await httpGet(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })
  if (!res.ok) {
    throw new SourceError('spotify', `Xac thuc that bai (HTTP ${res.status}) - kiem tra lai key`)
  }
  const body = (await res.json()) as { access_token: string; expires_in: number }
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
  return token.value
}

interface SpotifyTrack {
  id: string
  name: string
  duration_ms: number
  artists: { name: string }[]
  album: { name: string; images: { url: string; width: number }[] }
}

export const spotifySource: MusicSource = {
  id: 'spotify',
  label: 'Spotify (metadata)',
  searchable: true,
  playable: false,

  async unavailableReason() {
    const { clientId, clientSecret } = getSettings().spotify
    return clientId && clientSecret
      ? null
      : 'Chua co API key. Tao app tai developer.spotify.com roi dan Client ID/Secret vao Cai dat.'
  },

  async search(query: string, limit: number): Promise<Track[]> {
    const url = new URL(`${API}/search`)
    url.searchParams.set('q', query)
    url.searchParams.set('type', 'track')
    url.searchParams.set('limit', String(Math.min(limit, 50)))

    const res = await httpGet(url, { headers: { Authorization: `Bearer ${await getToken()}` } })
    if (!res.ok) throw new SourceError('spotify', `Spotify tra ve HTTP ${res.status}`)

    const body = (await res.json()) as { tracks: { items: SpotifyTrack[] } }
    return body.tracks.items.map((t) => ({
      id: `spotify:${t.id}`,
      source: 'spotify' as const,
      sourceId: t.id,
      title: t.name,
      artist: t.artists.map((a) => a.name).join(', '),
      album: t.album.name,
      duration: Math.round(t.duration_ms / 1000),
      artwork: [...t.album.images].sort((a, b) => b.width - a.width)[0]?.url,
      addedAt: Date.now()
    }))
  }
}
