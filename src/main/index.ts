import { join } from 'node:path'
import { app, BrowserWindow, dialog, globalShortcut, Menu, nativeImage, Tray } from 'electron'
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
import { flushAllStores, getSettings } from './store'
import { applyThumbar, resetThumbar } from './thumbar'
import {
  broadcast,
  createMainWindow,
  resolveOverlayFontSize,
  createOverlayWindow,
  destroyOverlayWindow,
  getMainWindow,
  toggleOverlay
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
  notify('hệ thống', err, { fallback: 'Lyra gặp lỗi ngoài dự tính nhưng vẫn chạy tiếp.' })
})

process.on('unhandledRejection', (reason) => {
  notify('hệ thống', reason, { fallback: 'Một tác vụ nền thất bại.' })
})

// Canh bao truoc khi het bo nho, luc van con kip lam gi do
process.on('warning', (warn) => {
  log.warn('hệ thống', warn.message, warn.stack)
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
        { label: 'Mở cửa sổ', click: showMainWindow },
        { type: 'separator' },
        { label: 'Phát / Tạm dừng', click: () => sendMediaKey('play-pause') },
        { label: 'Bài trước', click: () => sendMediaKey('prev') },
        { label: 'Bài sau', click: () => sendMediaKey('next') },
        { type: 'separator' },
        {
          label: 'Lời nổi trên màn hình',
          type: 'checkbox',
          checked: getSettings().overlay.enabled,
          click: (item) => {
            toggleOverlay(item.checked)
            applyThumbar()
            rebuildMenu()
          }
        },
        { type: 'separator' },
        {
          label: 'Thoát',
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
  // Đã có một bản Lyra đang chạy: bản đó sẽ nhận `second-instance` và tự đưa
  // cửa sổ lên, nên bản này rút lui.
  //
  // Phải ghi lại một dòng. Không có nó thì mở app từ dòng lệnh chỉ thấy thoát
  // ngay với mã 0, không một lời giải thích — và nếu bản đang chạy là bản đóng
  // gói cũ nằm ở `release/` thì càng khó ngờ tới.
  log.info('khởi động', 'Đã có một bản Lyra đang chạy — nhường chỗ cho bản đó')
  app.quit()
} else {
  app.on('second-instance', showMainWindow)

  /**
   * Tien trinh giao dien chet han (het bo nho, hoac Chromium sap).
   * Man hinh luc nay la mot o trang - phai dung day lai, khong thi nguoi dung
   * chi thay cua so trong roc va khong hieu gi.
   */
  app.on('render-process-gone', (_e, contents, details) => {
    log.error('giao diện', `Tiến trình giao diện dừng: ${details.reason}`, details)
    if (details.reason === 'clean-exit') return

    const win = BrowserWindow.fromWebContents(contents)
    if (win && !win.isDestroyed()) {
      win.reload()
      win.once('ready-to-show', resetThumbar)
      pushNotice({
        level: 'warning',
        scope: 'giao diện',
        message: 'Giao diện gặp sự cố và đã được tải lại. Nhạc đang phát có thể bị dừng.'
      })
    }
  })

  app.on('child-process-gone', (_e, details) => {
    log.error('tiến trình con', `${details.type} dừng: ${details.reason}`, details)
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.mittohoa.lyra_player')
    log.info('khởi động', `Lyra ${app.getVersion()} trên ${process.platform} ${process.arch}`)

    // Hai buoc BAT BUOC: khong co giao thuc media va khong co IPC thi cua so mo
    // ra cung chi la mot o trang - tha bao loi ro rang roi thoat con hon
    try {
      handleMediaProtocol()
      installRequestHeaderInterceptor()
      registerIpc()
    } catch (err) {
      log.error('khởi động', 'Không dựng được nền tảng của app', err)
      dialog.showErrorBox(
        'Lyra không khởi động được',
        `${describe(err)}\n\nNhật ký: ${logFolder()}`
      )
      app.exit(1)
      return
    }

    // Truoc khi dung bat ky cua so nao: lan dau chay thi co chu khung loi noi
    // van con la 0 (chua ai chon), phai do man hinh roi chot lai. Lam o day de
    // man hinh Cai dat mo ra da thay dung con so, khong phai so 0.
    try {
      resolveOverlayFontSize()
    } catch (err) {
      log.warn('khởi động', 'Không đo được màn hình để chọn cỡ chữ lời nổi', err)
    }

    // Bat cung Windows thi thu thang xuong khay, khong chan man hinh luc dang nhap
    const hidden = startedHidden() || getSettings().startMinimized
    const win = createMainWindow({ show: !hidden })
    // Thanh nut gan vao cua so, nen phai doi cua so co that roi moi dung duoc
    win.once('ready-to-show', resetThumbar)

    // Cac buoc con lai deu la tien ich: hong buoc nao thi mat rieng buoc do,
    // nhac van phat duoc. Nen bat rieng tung buoc thay vi mot khoi chung.
    const optional: [string, () => void][] = [
      ['khay hệ thống', createTray],
      ['phím tắt toàn cục', registerGlobalShortcuts],
      ['bật cùng Windows', () => applyLaunchAtStartup(getSettings())],
      ['theo dõi nhạc ở app khác', () => getSettings().followSystemMedia && startSmtcWatch()],
      ['khung lời nổi', () => getSettings().overlay.enabled && createOverlayWindow()]
    ]
    for (const [what, step] of optional) {
      try {
        step()
      } catch (err) {
        log.error('khởi động', `Không bật được ${what}`, err)
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
      ['khung lời nổi', destroyOverlayWindow],
      ['SMTC', stopSmtcWatch],
      ['phím tắt', () => globalShortcut.unregisterAll()],
      ['lưu cài đặt', flushAllStores],
      ['khay hệ thống', () => tray?.destroy()]
    ] as const) {
      try {
        step()
      } catch (err) {
        log.error('thoát', `Không dọn được ${what}`, err)
      }
    }
    closeLog()
  })
}
