import { globalShortcut } from 'electron'
import { IPC } from '@shared/ipc'
import { getSettings, patchSettings } from './store'
import { getMainWindow, setOverlayVisible } from './windows'
import { log } from './logger'

export type MediaAction = 'play-pause' | 'next' | 'prev' | 'stop'

export function sendMediaKey(action: MediaAction): void {
  getMainWindow()?.webContents.send(IPC.mediaKey, action)
}

const MEDIA_KEYS: [string, MediaAction][] = [
  ['MediaPlayPause', 'play-pause'],
  ['MediaNextTrack', 'next'],
  ['MediaPreviousTrack', 'prev'],
  ['MediaStop', 'stop']
]

/** Dang ky mot phim tat, bo qua trong im lang neu phim da bi app khac chiem. */
function register(accelerator: string, handler: () => void): void {
  if (!accelerator.trim()) return
  try {
    if (!globalShortcut.register(accelerator, handler)) {
      log.warn('phím tắt', `Phím tắt ${accelerator} đã bị app khác chiếm`)
    }
  } catch (err) {
    // Chuoi accelerator khong hop le (nguoi dung tu go) - khong duoc lam sap app
    log.warn('phím tắt', `Phím tắt ${accelerator} không hợp lệ`, err)
  }
}

/**
 * Dang ky lai toan bo phim tat toan cuc theo cai dat hien tai.
 * Goi lai moi khi doi cai dat phim tat.
 */
export function registerGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
  const settings = getSettings()

  if (settings.globalMediaKeys) {
    for (const [accelerator, action] of MEDIA_KEYS) {
      register(accelerator, () => sendMediaKey(action))
    }
  }

  const { toggleOverlay, lyricsEarlier, lyricsLater } = settings.hotkeys

  // Bat/tat khung lyric noi ma khong can mo cua so chinh
  register(toggleOverlay, () => {
    const next = !getSettings().overlay.enabled
    setOverlayVisible(next)
    const saved = patchSettings({ overlay: { ...getSettings().overlay, enabled: next } })
    getMainWindow()?.webContents.send(IPC.overlaySettings, saved.overlay)
  })

  // Chinh lech lyric ngay trong luc dang nghe
  register(lyricsEarlier, () => {
    getMainWindow()?.webContents.send(IPC.overlayCommand, { type: 'nudge-offset', delta: 0.5 })
  })
  register(lyricsLater, () => {
    getMainWindow()?.webContents.send(IPC.overlayCommand, { type: 'nudge-offset', delta: -0.5 })
  })
}
