import { create } from 'zustand'
import type { SmtcNowPlaying } from '@shared/ipc'
import type { Lyrics } from '@shared/types'
import { report } from '@/lib/report'

/**
 * Nhac dang phat o app KHAC (Spotify, trinh duyet, Windows Media Player...),
 * doc qua System Media Transport Controls cua Windows.
 *
 * Day la thu bien AURA tu "mot trinh nghe nhac nua" thanh "cong cu lyric cho ca may":
 * khung lyric noi van chay du ban nghe nhac o dau.
 */

const EMPTY: Lyrics = { kind: 'none', lines: [], origin: 'none', offset: 0 }

/** Khoa nhan dang bai, dung de biet khi nao can di tim lyric moi. */
function keyOf(now: SmtcNowPlaying | null): string {
  return now ? `${now.artist}|${now.title}` : ''
}

/** Id on dinh cho bai ngoai, de luu offset / lyric tu nhap rieng cho no. */
export function externalTrackId(now: SmtcNowPlaying): string {
  return `smtc:${now.artist}|${now.title}`.toLowerCase()
}

interface ExternalState {
  now: SmtcNowPlaying | null
  /** Ten bai / nghe si app nhan dien duoc tu chuoi tho, va nguon tim ra lyric. */
  matched: {
    title: string
    artist: string
    from: string
    /** Loi bai hat hay phu de video. */
    type: 'lyrics' | 'subtitles'
    language?: string
  } | null
  /** Epoch ms luc nhan `now` - dung de ngoai suy vi tri giua hai ban tin. */
  receivedAt: number
  lyrics: Lyrics
  loading: boolean
  /** Bai duoc tim lyric gan nhat - tranh tim lai lien tuc theo tung nhip. */
  resolvedKey: string
}

interface ExternalActions {
  subscribe: () => () => void
  setNow: (now: SmtcNowPlaying | null) => void
}

let token = 0

export const useExternal = create<ExternalState & ExternalActions>((set, get) => ({
  now: null,
  matched: null,
  receivedAt: 0,
  lyrics: EMPTY,
  loading: false,
  resolvedKey: '',

  subscribe: () => {
    void window.api.smtc.now().then((now) => get().setNow(now))
    return window.api.smtc.onNow((now) => get().setNow(now))
  },

  setNow: (now) => {
    set({ now, receivedAt: Date.now() })

    const key = keyOf(now)
    if (key === get().resolvedKey) return // cung bai, khong can tim lai

    if (!now || !now.title.trim()) {
      token++
      set({ lyrics: EMPTY, matched: null, loading: false, resolvedKey: key })
      return
    }

    const mine = ++token
    set({ loading: true, lyrics: EMPTY, matched: null, resolvedKey: key })

    // Duong rieng cho bai o app khac: ten den tu Windows la ten tho
    // ("... | OFFICIAL MUSIC VIDEO | ..."), phai nhan dien lai truoc khi tra.
    void window.api.lyrics
      .forExternal({
        title: now.title,
        artist: now.artist || undefined,
        album: now.album || undefined,
        duration: now.duration || undefined
      })
      .then((result) => {
        if (mine !== token) return
        if (!result) {
          set({ lyrics: EMPTY, matched: null, loading: false })
          return
        }
        set({
          lyrics: {
            lines: result.lines,
            kind: result.kind as Lyrics['kind'],
            // Loi tu app khac luon la tim duoc tu ben ngoai, khong phai tu file
            origin: 'lrclib',
            offset: result.offset
          },
          matched: {
            title: result.title,
            artist: result.artist,
            from: result.from,
            type: result.type,
            language: result.language
          },
          loading: false
        })
      })
      .catch((err) => {
        // Chay ngam theo nhac o app khac: nguoi dung khong bam gi ca, nen dung
        // dam toast vao mat ho moi lan doi bai. Ghi lai la du de lan ra sau.
        report('lời ở app khác', err, { silent: true })
        if (mine === token) set({ lyrics: EMPTY, matched: null, loading: false })
      })
  }
}))

/**
 * Vi tri phat hien tai cua bai ngoai.
 * Main process da bu mot lan luc gui, nhung ban tin chi den moi 500ms - bu tiep
 * phan troi qua tu luc nhan de dong ho chay muot theo tung khung hinh.
 */
export function externalPosition(now: SmtcNowPlaying | null, receivedAt: number): number {
  if (!now) return 0
  if (now.status !== 'Playing') return now.position
  const drift = (Date.now() - receivedAt) / 1000
  const position = now.position + drift
  return now.duration ? Math.min(position, now.duration) : position
}
