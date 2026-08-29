import { join } from 'node:path'
import { app, BrowserWindow, dialog, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import { IPC } from '@shared/ipc'
import { registerIpc } from './ipc'
import {
  handleMediaProtocol,
  installRequestHeaderInterceptor,
  registerMediaScheme
} from './protocol'
import { registerGlobalShortcuts, sendMediaKey } from './shortcuts'
import { applyLaunchAtStartup, startedHidden } from './startup'
import { startSmtcWatch, stopSmtcWatch } from './smtc'
import {
  closeLog,
  describe,
  log,
  logFolder,
  notify,
  pushNotice,
  setLogBroadcaster
} from './logger'
import { flushAllStores, getSettings, patchSettings } from './store'
import {
  broadcast,
  createMainWindow,
  createOverlayWindow,
  getMainWindow,
  setOverlayVisible
} from './windows'

// Phai dang ky scheme truoc khi app san sang
registerMediaScheme()

// Nhat ky phai san sang truoc moi thu khac: neu buoc khoi dong nem loi thi day
// la cho duy nhat con ghi lai duoc
setLogBroadcaster(broadcast)

/**
 * Luoi cuoi cung cho loi khong ai bat.
 *
 * Mac dinh cua Electron voi mot loi kieu nay la dong sap app khong mot loi giai
 * thich. Bat lai thi app song tiep, nguoi dung thay mot canh bao noi ro chuyen
 * gi, va trong file nhat ky co du stack de lan ra nguyen nhan.
 */
process.on('uncaughtException', (err) => {
  notify('he thong', err, { fallback: 'Lyra gặp lỗi ngoài dự tính nhưng vẫn chạy tiếp.' })
})

process.on('unhandledRejection', (reason) => {
  notify('he thong', reason, { fallback: 'Một tác vụ nền thất bại.' })
})

// Canh bao truoc khi het bo nho, luc van con kip lam gi do
process.on('warning', (warn) => {
  log.warn('he thong', warn.message, warn.stack)
})

let tray: Tray | null = null
let quitting = false

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../resources/icon.png')
}

function showMainWindow(): void {
  const win = getMainWindow() ?? createMainWindow()
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

function createTray(): void {
  const image = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.setToolTip('Lyra')

  const rebuildMenu = (): void => {
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Mo cua so', click: showMainWindow },
        { type: 'separator' },
        { label: 'Phat / Tam dung', click: () => sendMediaKey('play-pause') },
        { label: 'Bai truoc', click: () => sendMediaKey('prev') },
        { label: 'Bai sau', click: () => sendMediaKey('next') },
        { type: 'separator' },
        {
          label: 'Lyric noi tren man hinh',
          type: 'checkbox',
          checked: getSettings().overlay.enabled,
          click: (item) => {
            setOverlayVisible(item.checked)
            // Ghi vao settings de lan mo app sau con nho, roi bao cho cua so chinh
            const next = patchSettings({
              overlay: { ...getSettings().overlay, enabled: item.checked }
            })
            getMainWindow()?.webContents.send(IPC.overlaySettings, next.overlay)
            rebuildMenu()
          }
        },
        { type: 'separator' },
        {
          label: 'Thoat',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
  }

  rebuildMenu()
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
}

/** Chi cho phep mot ban chay; ban thu hai chi dua cua so cu len. */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)

  /**
   * Tien trinh giao dien chet han (het bo nho, hoac Chromium sap).
   * Man hinh luc nay la mot o trang - phai dung day lai, khong thi nguoi dung
   * chi thay cua so trong roc va khong hieu gi.
   */
  app.on('render-process-gone', (_e, contents, details) => {
    log.error('giao dien', `Tien trinh giao dien dung: ${details.reason}`, details)
    if (details.reason === 'clean-exit') return

    const win = BrowserWindow.fromWebContents(contents)
    if (win && !win.isDestroyed()) {
      win.reload()
      pushNotice({
        level: 'warning',
        scope: 'giao dien',
        message: 'Giao diện gặp sự cố và đã được tải lại. Nhạc đang phát có thể bị dừng.'
      })
    }
  })

  app.on('child-process-gone', (_e, details) => {
    log.error('tien trinh con', `${details.type} dung: ${details.reason}`, details)
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.mittohoa.lyra_player')
    log.info('khoi dong', `Lyra ${app.getVersion()} tren ${process.platform} ${process.arch}`)

    // Hai buoc BAT BUOC: khong co giao thuc media va khong co IPC thi cua so mo
    // ra cung chi la mot o trang - tha bao loi ro rang roi thoat con hon
    try {
      handleMediaProtocol()
      installRequestHeaderInterceptor()
      registerIpc()
    } catch (err) {
      log.error('khoi dong', 'Khong dung duoc nen tang cua app', err)
      dialog.showErrorBox(
        'Lyra không khởi động được',
        `${describe(err)}\n\nNhật ký: ${logFolder()}`
      )
      app.exit(1)
      return
    }

    // Bat cung Windows thi thu thang xuong khay, khong chan man hinh luc dang nhap
    const hidden = startedHidden() || getSettings().startMinimized
    createMainWindow({ show: !hidden })

    // Cac buoc con lai deu la tien ich: hong buoc nao thi mat rieng buoc do,
    // nhac van phat duoc. Nen bat rieng tung buoc thay vi mot khoi chung.
    const optional: [string, () => void][] = [
      ['khay he thong', createTray],
      ['phim tat toan cuc', registerGlobalShortcuts],
      ['bat cung Windows', () => applyLaunchAtStartup(getSettings())],
      ['theo doi nhac app khac', () => getSettings().followSystemMedia && startSmtcWatch()],
      ['khung lyric noi', () => getSettings().overlay.enabled && createOverlayWindow()]
    ]
    for (const [what, step] of optional) {
      try {
        step()
      } catch (err) {
        log.error('khoi dong', `Khong bat duoc ${what}`, err)
        pushNotice({
          level: 'warning',
          scope: 'khởi động',
          message: `Không bật được ${what}. Các phần khác vẫn chạy bình thường.`
        })
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('before-quit', () => {
    quitting = true
  })

  app.on('window-all-closed', () => {
    // Con tray thi giu app song; nguoi dung thoat han qua menu tray
    if (quitting || !getSettings().minimizeToTray) app.quit()
  })

  app.on('will-quit', () => {
    // Moi buoc don dep tu bat loi rieng: mot buoc hong khong duoc chan cac buoc
    // sau, vi `flushAllStores` ma khong chay thi mat het cai dat vua doi
    for (const [what, step] of [
      ['smtc', stopSmtcWatch],
      ['phim tat', () => globalShortcut.unregisterAll()],
      ['luu cai dat', flushAllStores],
      ['khay he thong', () => tray?.destroy()]
    ] as const) {
      try {
        step()
      } catch (err) {
        log.error('thoat', `Khong don duoc ${what}`, err)
      }
    }
    closeLog()
  })
}
