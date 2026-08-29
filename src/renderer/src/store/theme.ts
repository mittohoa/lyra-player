import { create } from 'zustand'
import type { Track } from '@shared/types'

/**
 * Mau nen doi theo anh bia bai dang phat.
 *
 * Mau duoc tinh o main process (CDN anh khong tra header CORS nen renderer
 * khong doc duoc diem anh). O day chi nhan ket qua roi do vao bien CSS -
 * moi hieu ung mau trong giao dien deu doc tu hai bien nay.
 */

const NEUTRAL = '#6b6b78'

interface ThemeState {
  /** Mau chu dao cua bai dang phat, dang '#rrggbb'. */
  accent: string
  trackId: string | null
}

interface ThemeActions {
  applyFor: (track: Track | null) => Promise<void>
}

let token = 0

/** Doi '#rrggbb' sang '<r> <g> <b>' de dung trong rgb(var(--x) / <alpha>). */
function toRgbChannels(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

function paint(hex: string): void {
  const root = document.documentElement
  root.style.setProperty('--art', hex)
  root.style.setProperty('--art-rgb', toRgbChannels(hex))
}

export const useTheme = create<ThemeState & ThemeActions>((set, get) => ({
  accent: NEUTRAL,
  trackId: null,

  applyFor: async (track) => {
    if (!track) {
      token++
      set({ accent: NEUTRAL, trackId: null })
      paint(NEUTRAL)
      return
    }
    if (get().trackId === track.id) return

    const mine = ++token
    set({ trackId: track.id })

    if (!track.artwork) {
      set({ accent: NEUTRAL })
      paint(NEUTRAL)
      return
    }

    const hex = await window.api.artwork.color(track.artwork).catch(() => null)
    // Bai da doi trong luc cho - bo ket qua cu di
    if (mine !== token) return

    const next = hex ?? NEUTRAL
    set({ accent: next })
    paint(next)
  }
}))
