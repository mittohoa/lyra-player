import { globalShortcut } from 'electron'
import { IPC } from '@shared/ipc'
import { getSettings } from './store'
import { applyThumbar } from './thumbar'
import { getMainWindow, toggleOverlay as toggleOverlayWindow } from './windows'
import { log, pushNotice } from './logger'

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

/** Cac phim khong dat duoc trong lan dang ky nay, de bao gop mot lan. */
let refused: string[] = []

/** Dang ky mot phim tat. Khong dat duoc thi ghi lai de bao sau, khong nem loi. */
function register(accelerator: string, handler: () => void): void {
  if (!accelerator.trim()) return
  try {
    if (!globalShortcut.register(accelerator, handler)) {
      log.warn('phím tắt', `Phím tắt ${accelerator} đã bị app khác chiếm`)
      refused.push(accelerator)
    }
  } catch (err) {
    // Chuoi accelerator khong hop le (nguoi dung tu go) - khong duoc lam sap app
    log.warn('phím tắt', `Phím tắt ${accelerator} không hợp lệ`, err)
    refused.push(accelerator)
  }
}

/**
 * Dang ky lai toan bo phim tat toan cuc theo cai dat hien tai.
 * Goi lai moi khi doi cai dat phim tat.
 */
export function registerGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
  refused = []
  const settings = getSettings()

  if (settings.globalMediaKeys) {
    for (const [accelerator, action] of MEDIA_KEYS) {
      register(accelerator, () => sendMediaKey(action))
    }
  }

  const { toggleOverlay, lyricsEarlier, lyricsLater } = settings.hotkeys

  // Bat/tat khung loi noi ma khong can mo cua so chinh
  register(toggleOverlay, () => {
    toggleOverlayWindow()
    applyThumbar()
  })

  // Chinh lech lyric ngay trong luc dang nghe
  register(lyricsEarlier, () => {
    getMainWindow()?.webContents.send(IPC.overlayCommand, { type: 'nudge-offset', delta: 0.5 })
  })
  register(lyricsLater, () => {
    getMainWindow()?.webContents.send(IPC.overlayCommand, { type: 'nudge-offset', delta: -0.5 })
  })

  // Một phím tắt lặng lẽ không chạy là thứ rất khó đoán: bấm mãi không thấy gì
  // và không có chỗ nào nói tại sao. `Ctrl+Alt+←/→` chẳng hạn thường đã bị
  // driver màn hình Intel chiếm sẵn. Báo gộp một lần, không phải mỗi phím một
  // lần, để lúc khởi động không dội lên ba cái liền.
  if (refused.length) {
    pushNotice({
      level: 'warning',
      scope: 'phím tắt',
      message:
        `App khác đang giữ ${refused.join(', ')} nên phím tắt này không dùng được. ` +
        'Đổi sang tổ hợp khác trong Cài đặt → Phím tắt.'
    })
  }
}
