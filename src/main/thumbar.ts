import { join } from 'node:path'
import { app, nativeImage, type NativeImage } from 'electron'
import { log } from './logger'
import { sendMediaKey } from './shortcuts'
import { getSettings } from './store'
import { getMainWindow, toggleOverlay } from './windows'

/**
 * Thanh điều khiển dưới ô xem trước ở taskbar.
 *
 * Rê chuột lên icon Lyra dưới taskbar là Windows hiện một ô xem trước cửa sổ;
 * thanh này nằm ngay dưới ô đó, đúng kiểu Windows Media Player. Đây là chỗ gần
 * nhất với ô media của hệ điều hành mà Electron với tới được — ô media thật
 * (bấm nút âm lượng ra) thì không vào được, xem ghi chú trong README.
 *
 * Ba điều Windows đòi ở icon: nền trong suốt, nét trắng (Windows KHÔNG tô lại
 * màu), và cỡ 16px ở mức 100%. `resources/thumbar/*.png` xuất ở 32px cho màn
 * hình 200% khỏi rạm — xem `scripts/make-thumbar-icons.mjs`.
 */

/** Đang phát hay không, để đổi giữa nút phát và nút tạm dừng. */
let playing = false

/** Nhớ lại lần vẽ trước, tránh gọi Windows mỗi nhịp tick (4 lần/giây). */
let drawn = ''

const cache = new Map<string, NativeImage>()

function icon(name: string): NativeImage {
  const hit = cache.get(name)
  if (hit) return hit

  const path = app.isPackaged
    ? join(process.resourcesPath, 'thumbar', `${name}.png`)
    : join(__dirname, '../../resources/thumbar', `${name}.png`)

  const image = nativeImage.createFromPath(path)
  cache.set(name, image)
  return image
}

/**
 * Vẽ lại thanh nút.
 *
 * Gọi được nhiều lần; tự bỏ qua khi không có gì đổi. Windows chỉ nhận tối đa
 * 7 nút — ở đây dùng 4.
 */
export function applyThumbar(): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed() || process.platform !== 'win32') return

  const overlayOn = getSettings().overlay.enabled
  const signature = `${playing}|${overlayOn}`
  if (signature === drawn) return

  // Thiếu file icon thì `createFromPath` trả về ảnh rỗng, và Windows dựng ra
  // một thanh nút trống trơn - thà không dựng còn hơn
  if (icon('play').isEmpty()) {
    log.warn('taskbar', 'Không đọc được icon cho thanh dưới ô xem trước')
    return
  }

  const ok = win.setThumbarButtons([
    {
      icon: icon('prev'),
      tooltip: 'Bài trước',
      click: () => sendMediaKey('prev')
    },
    {
      icon: icon(playing ? 'pause' : 'play'),
      tooltip: playing ? 'Tạm dừng' : 'Phát',
      click: () => sendMediaKey('play-pause')
    },
    {
      icon: icon('next'),
      tooltip: 'Bài sau',
      click: () => sendMediaKey('next')
    },
    {
      icon: icon('lyrics'),
      tooltip: overlayOn ? 'Tắt lời nổi' : 'Hiện lời nổi',
      click: () => {
        toggleOverlay()
        applyThumbar()
      }
    }
  ])

  if (!ok) {
    log.warn('taskbar', 'Windows từ chối dựng thanh dưới ô xem trước')
    return
  }
  drawn = signature
}

/** Đổi giữa nút phát và nút tạm dừng theo nhạc đang chạy. */
export function setThumbarPlaying(isPlaying: boolean): void {
  if (isPlaying === playing) return
  playing = isPlaying
  applyThumbar()
}

/**
 * Cửa sổ chính vừa được dựng lại (ví dụ sau khi tiến trình giao diện sập).
 * Thanh nút gắn vào cửa sổ nên phải vẽ lại từ đầu.
 */
export function resetThumbar(): void {
  drawn = ''
  applyThumbar()
}
