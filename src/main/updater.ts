import { app } from 'electron'
import { log, pushNotice } from './logger'

/**
 * Tự cập nhật, lấy nguồn từ trang phát hành trên GitHub.
 *
 * Kiểm một lần lúc khởi động rồi mỗi sáu tiếng — không kiểm dày hơn: bản mới ra
 * vài tuần một lần, và mỗi lần kiểm là một lần gọi mạng người dùng không yêu cầu.
 *
 * Tải **ngầm** ở nền và chỉ cài lúc thoát app. Không bao giờ tự khởi động lại
 * giữa chừng: người ta đang nghe nhạc, và cắt ngang bài hát để cài bản mới là
 * cách nhanh nhất khiến họ tắt tính năng này đi.
 */

/** Sáu tiếng. Bản mới ra vài tuần một lần nên kiểm dày hơn là vô ích. */
const NHIP_KIEM = 6 * 60 * 60 * 1000

/** Chờ chừng này rồi mới kiểm lần đầu, để không giành mạng lúc app đang mở. */
const CHO_LUC_MO = 30 * 1000

let daBaoCoBanMoi = false

/**
 * Bản đang chạy có tự cập nhật được không.
 *
 * Bản chạy thẳng (portable) thì **không**: nó là một file đơn người dùng để đâu
 * tuỳ ý, không có thư mục cài đặt để ghi đè. Cố cập nhật kiểu đó chỉ sinh ra lỗi
 * khó hiểu. Chế độ phát triển cũng bỏ qua — ở đó không có bản cài nào cả.
 */
function tuCapNhatDuoc(): boolean {
  if (!app.isPackaged) return false
  // electron-builder đặt biến này cho bản portable
  return !process.env.PORTABLE_EXECUTABLE_DIR
}

export async function batTuCapNhat(): Promise<void> {
  if (!tuCapNhatDuoc()) {
    log.info('cập nhật', 'Bản này không tự cập nhật được — bỏ qua')
    return
  }

  // `electron-updater` là module CommonJS và bày `autoUpdater` ra bằng một
  // GETTER trên `module.exports`. Node dò tên export của module CJS bằng cách
  // đọc tĩnh mã nguồn, và nó KHÔNG thấy getter — nên
  // `const { autoUpdater } = await import('electron-updater')` trả về
  // `undefined`, rồi dòng kế tiếp ném `TypeError: Cannot set properties of
  // undefined`. Lỗi này chỉ lộ ra trong BẢN ĐÓNG GÓI ĐÃ CÀI: bản portable và
  // bản chạy dev đều thoát sớm ở `tuCapNhatDuoc()` nên không bao giờ chạy tới
  // đây. Nghĩa là tự cập nhật hỏng từ đầu mà không ai thấy.
  //
  // Đo được: Node thấy AppUpdater, NsisUpdater, MacUpdater… nhưng không thấy
  // autoUpdater. Lấy qua `.default` thì được — đó chính là `module.exports`.
  const nap = await import('electron-updater')
  const autoUpdater =
    nap.autoUpdater ?? (nap as unknown as { default: typeof nap }).default?.autoUpdater

  if (!autoUpdater) {
    // Nói thẳng ra thay vì để một TypeError trần trụi rơi vào lưới bắt lỗi
    // chung — ở đó nó hiện thành "Một tác vụ nền thất bại", câu chẳng giúp ai
    // lần ra nguyên nhân.
    log.warn(
      'cập nhật',
      'Không lấy được autoUpdater từ electron-updater — bỏ qua phần tự cập nhật'
    )
    return
  }

  // Tải ngầm thì được, nhưng cài thì phải đợi lúc thoát
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('update-available', (info) => {
    log.info('cập nhật', `Có bản ${info.version} — đang tải ngầm`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    if (daBaoCoBanMoi) return
    daBaoCoBanMoi = true
    log.info('cập nhật', `Đã tải xong bản ${info.version}`)
    pushNotice({
      level: 'success',
      scope: 'cập nhật',
      message: `Đã tải xong AURA ${info.version}. Bản mới sẽ được cài khi bạn đóng app.`
    })
  })

  autoUpdater.on('error', (err) => {
    // Không kiểm được bản mới là chuyện thường: mất mạng, GitHub chặn tần suất,
    // máy công ty chặn cổng. Ghi nhật ký thôi, không làm phiền người đang nghe
    // nhạc bằng một thông báo lỗi họ không làm gì được.
    log.warn('cập nhật', 'Không kiểm được bản mới', err)
  })

  const kiem = (): void => {
    autoUpdater.checkForUpdates().catch(() => {
      // Đã có `on('error')` lo; bắt ở đây chỉ để lời hứa không bị bỏ rơi
    })
  }

  setTimeout(kiem, CHO_LUC_MO)
  setInterval(kiem, NHIP_KIEM)

  // Mot dong noi ro la da bat duoc. Truoc day phan nay chi ghi nhat ky khi CO
  // ban moi hoac khi LOI, nen luc no hong hoan toan thi nhat ky trong tron -
  // giong het luc chay tot. Loi `autoUpdater undefined` song duoc nhieu thang
  // la nho cho im lang do.
  log.info('cập nhật', `Đã bật tự cập nhật — kiểm sau ${CHO_LUC_MO / 1000}s rồi mỗi ${NHIP_KIEM / 3600000} tiếng`)
}
