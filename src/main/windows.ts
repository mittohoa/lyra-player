import { join } from 'node:path'
import { app, BrowserWindow, screen, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { OverlaySettings } from '@shared/types'
import { suggestOverlay, suggestOverlayFontSize } from '@shared/overlay-size'
import { getSettings, patchSettings } from './store'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

const preload = join(__dirname, '../preload/index.js')

/** Nap file HTML tuong ung, tu dong chon dev server hay file build. */
function loadPage(win: BrowserWindow, page: 'index' | 'overlay'): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}.html`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}.html`))
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export function createMainWindow(opts: { show?: boolean } = {}): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: getSettings().theme === 'light' ? '#f6f6f8' : '#101014',
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    frame: false,
    webPreferences: {
      preload,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Cho phep the <audio> keo stream tu cac mien khac (YouTube/Zing/NCT)
      webSecurity: true
    }
  })

  // opts.show === false: nap san cua so nhung khong hien, de mo tu khay la co ngay
  mainWindow.on('ready-to-show', () => {
    if (opts.show !== false) mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null

    // Khung lời nổi có `skipTaskbar` nên người dùng không thấy nó là một cửa
    // sổ — nhưng Electron thì có đếm. Để nguyên thì `window-all-closed` không
    // bao giờ bắn, app sống tiếp với đúng một khung nổi trôi giữa màn hình,
    // không có trong taskbar, và bật click xuyên qua thì bấm X cũng không
    // được. Đóng cửa sổ chính mà không thu xuống khay nghĩa là thoát, nên dọn
    // luôn khung nổi để sự kiện kia bắn được.
    if (!getSettings().minimizeToTray) destroyOverlayWindow()
  })

  loadPage(mainWindow, 'index')
  return mainWindow
}

/**
 * Vi tri va kich thuoc mac dinh cua overlay: giua ngang, gan day man hinh chinh.
 *
 * Kich thuoc do tu man hinh that chu khong chot cung - xem `@shared/overlay-size`.
 */
function defaultOverlayBounds(): OverlaySettings['bounds'] {
  const { workArea } = screen.getPrimaryDisplay()
  const { width, height } = suggestOverlay(workArea.width, getSettings().overlay.contextLines)
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + workArea.height - height - 90,
    width,
    height
  }
}

/**
 * Chot co chu cho lan dau chay, theo man hinh dang co.
 *
 * `fontSize: 0` trong gia tri mac dinh nghia la CHUA AI CHON - khong phai la
 * co chu bang khong. Dung mot so vo nghia lam dau cho tiet kiem hon la them mot
 * o `fontSizeAuto` rieng, va no chi ton tai trong khoang thoi gian rat ngan:
 * ngay lan mo dau tien ta thay no bang so do duoc, va tu do tro di day la mot
 * lua chon binh thuong cua nguoi dung, sua duoc bang thanh truot nhu moi thu
 * khac.
 *
 * Goi luc app san sang - som hon thi `screen` cua Electron chua dung duoc.
 */
export function resolveOverlayFontSize(): void {
  const overlay = getSettings().overlay
  if (overlay.fontSize > 0) return

  const fontSize = suggestOverlayFontSize(screen.getPrimaryDisplay().workArea.width)
  patchSettings({ overlay: { ...overlay, fontSize } })
}

/** Dam bao overlay nam trong mot man hinh dang co (vd. sau khi rut man hinh phu). */
function clampToDisplay(bounds: NonNullable<OverlaySettings['bounds']>): NonNullable<OverlaySettings['bounds']> {
  const displays = screen.getAllDisplays()
  const visible = displays.some((d) => {
    const a = d.workArea
    return (
      bounds.x < a.x + a.width &&
      bounds.x + bounds.width > a.x &&
      bounds.y < a.y + a.height &&
      bounds.y + bounds.height > a.y
    )
  })
  return visible ? bounds : defaultOverlayBounds()!
}

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  const settings = getSettings()
  const bounds = clampToDisplay(settings.overlay.bounds ?? defaultOverlayBounds()!)

  overlayWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    minWidth: 240,
    minHeight: 80,
    webPreferences: {
      preload,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 'screen-saver' giup overlay noi tren ca game/video toan man hinh
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  overlayWindow.on('ready-to-show', () => {
    overlayWindow?.showInactive() // hien ma khong cuop focus cua app dang dung
    applyClickThrough(getSettings().overlay.clickThrough)
  })

  const persistBounds = (): void => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    const current = getSettings()
    patchSettings({
      overlay: { ...current.overlay, bounds: overlayWindow.getBounds() }
    })
  }
  overlayWindow.on('moved', persistBounds)
  overlayWindow.on('resized', persistBounds)

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  loadPage(overlayWindow, 'overlay')
  return overlayWindow
}

export function destroyOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy()
  overlayWindow = null
}

/**
 * Bat/tat click xuyen qua overlay.
 * `forward: true` van cho renderer nhan su kien di chuot, nho do
 * thanh cong cu cua overlay hien ra khi ro chuot len ma van khong chan click.
 */
export function applyClickThrough(enabled: boolean): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(enabled, { forward: true })
}

export function setOverlayVisible(visible: boolean): void {
  if (visible) {
    const win = createOverlayWindow()
    if (!win.isVisible()) win.showInactive()
  } else {
    destroyOverlayWindow()
  }
}

/**
 * Bật/tắt khung lời nổi cho trọn một lượt: mở hoặc đóng cửa sổ, ghi lại lựa
 * chọn, rồi báo cho cửa sổ chính biết để giao diện Cài đặt khớp theo.
 *
 * Gom về một chỗ vì có tới ba đường gọi tới — khay hệ thống, phím tắt toàn
 * cục, và thanh dưới ô xem trước ở taskbar. Ba bản chép tay thì sớm muộn cũng
 * có một bản quên mất bước báo cho cửa sổ chính.
 *
 * @param next bỏ trống thì đảo trạng thái hiện tại
 */
export function toggleOverlay(next = !getSettings().overlay.enabled): boolean {
  setOverlayVisible(next)
  const saved = patchSettings({ overlay: { ...getSettings().overlay, enabled: next } })
  getMainWindow()?.webContents.send(IPC.overlaySettings, saved.overlay)
  return next
}

/** Day mot ban tin toi ca hai cua so (cua so nao khong ton tai thi bo qua). */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of [mainWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}
