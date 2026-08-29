import { create } from 'zustand'
import type { Lyrics, Track } from '@shared/types'
import { report } from '@/lib/report'

const EMPTY: Lyrics = { kind: 'none', lines: [], origin: 'none', offset: 0 }

interface LyricsState {
  trackId: string | null
  lyrics: Lyrics
  loading: boolean
  /** Ban thao dang mo trong hop thoai "Sua lyric". */
  editorOpen: boolean

  /** Ban dich, cung do dai voi lyrics.lines; null = chua dich. */
  translation: string[] | null
  translating: boolean
  /** Dang chay Whisper de can timestamp. */
  aligning: boolean
  /** Phan tram hoan thanh cua buoc phien am (0-100). */
  alignPercent: number
}

interface LyricsActions {
  /** Dung AI can timestamp cho lyric thuan cua bai nay. */
  alignWithAi: (track: Track) => Promise<{ ok: boolean; message: string }>
  /** Dich lyric sang ngon ngu trong cai dat. */
  translate: (track: Track) => Promise<{ ok: boolean; message: string }>
  /** Nap ban dich da luu truoc do (khong goi API). */
  loadCachedTranslation: (trackId: string) => Promise<void>
  clearTranslation: () => void
  setAlignPercent: (percent: number) => void
  loadFor: (track: Track | null) => Promise<void>
  refetch: (track: Track) => Promise<void>
  setOffset: (offset: number) => void
  nudgeOffset: (delta: number) => void
  saveManual: (track: Track, content: string) => Promise<void>
  setEditorOpen: (open: boolean) => void
}

/** Chong race khi doi bai nhanh: chi ket qua cua lan goi moi nhat duoc dung. */
let token = 0

export const useLyrics = create<LyricsState & LyricsActions>((set, get) => ({
  trackId: null,
  lyrics: EMPTY,
  loading: false,
  editorOpen: false,
  translation: null,
  translating: false,
  aligning: false,
  alignPercent: 0,

  setAlignPercent: (alignPercent) => set({ alignPercent }),

  clearTranslation: () => set({ translation: null }),

  loadCachedTranslation: async (trackId) => {
    const translation = await window.api.ai.getTranslation(trackId)
    // Chi nhan neu van dung bai dang mo
    if (get().trackId === trackId) set({ translation })
  },

  alignWithAi: async (track) => {
    set({ aligning: true, alignPercent: 0 })
    try {
      const plain = get().lyrics.lines.map((l) => l.text)
      const result = await window.api.ai.align(track, plain)
      // Doc lai tu dau de an dung chuoi uu tien (file .lrc vua ghi se duoc nhat len)
      set({ trackId: null })
      await get().loadFor(track)
      return {
        ok: true,
        message: `Đã căn ${result.lines.length} dòng (khớp ${Math.round(result.confidence * 100)}% số từ).`
      }
    } catch (err) {
      return { ok: false, message: report('ai', err, { silent: true }) }
    } finally {
      set({ aligning: false, alignPercent: 0 })
    }
  },

  translate: async (track) => {
    const lines = get().lyrics.lines.map((l) => l.text)
    if (!lines.length) return { ok: false, message: 'Bài này chưa có lời để dịch.' }

    set({ translating: true })
    try {
      const translation = await window.api.ai.translate(track.id, lines)
      if (get().trackId === track.id) set({ translation })
      return { ok: true, message: `Đã dịch ${translation.length} dòng.` }
    } catch (err) {
      return { ok: false, message: report('ai', err, { silent: true }) }
    } finally {
      set({ translating: false })
    }
  },

  loadFor: async (track) => {
    if (!track) {
      token++
      set({ trackId: null, lyrics: EMPTY, loading: false })
      return
    }
    if (get().trackId === track.id) return

    const mine = ++token
    set({ trackId: track.id, lyrics: EMPTY, loading: true, translation: null })
    void get().loadCachedTranslation(track.id)

    try {
      const lyrics = await window.api.lyrics.resolve(
        {
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
          filePath: track.filePath
        },
        track.embeddedLyrics,
        track
      )
      if (mine === token) set({ lyrics, loading: false })
    } catch (err) {
      // Khong tim thay loi la chuyen thuong ngay, khong dang bao dong - nhung
      // van phai ghi lai de phan biet "bai nay khong co loi" voi "mat mang"
      report('lyric', err, { silent: true })
      if (mine === token) set({ lyrics: EMPTY, loading: false })
    }
  },

  refetch: async (track) => {
    const mine = ++token
    set({ loading: true })
    try {
      const lyrics = await window.api.lyrics.refetch({
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        filePath: track.filePath
      })
      if (mine === token) set({ lyrics, loading: false })
    } catch (err) {
      // Nguoi dung vua chu dong bam tim lai - im lang thi nut trong nhu hong
      report('lyric', err, { fallback: 'Không tìm lại được lời bài hát.' })
      if (mine === token) set({ loading: false })
    }
  },

  setOffset: (offset) => {
    const { trackId, lyrics } = get()
    const rounded = Math.round(offset * 10) / 10
    set({ lyrics: { ...lyrics, offset: rounded } })
    if (trackId) void window.api.lyrics.setOffset(trackId, rounded)
  },

  nudgeOffset: (delta) => get().setOffset(get().lyrics.offset + delta),

  saveManual: async (track, content) => {
    await window.api.lyrics.setManual(track.id, content)
    // Doc lai tu dau de an dung chuoi uu tien (manual thang moi nguon khac)
    set({ trackId: null })
    await get().loadFor(track)
  },

  setEditorOpen: (editorOpen) => set({ editorOpen })
}))

export { EMPTY as emptyLyrics }
