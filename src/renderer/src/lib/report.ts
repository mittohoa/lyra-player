import { describe } from '@shared/errors'
import { logToMain } from './log'
import { useApp } from '@/store/app'

/**
 * Bao loi tu phia giao dien.
 *
 * Ba viec luon phai di cung nhau, nen gop vao mot lan goi de khong the quen
 * viec nao:
 *
 *   1. Doi loi ky thuat thanh cau tieng Viet (`describe`)
 *   2. Gui ve tien trinh chinh de ghi vao file nhat ky - loi o giao dien ma chi
 *      nam trong DevTools thi luc nguoi dung bao "app hong" ta khong con gi de
 *      xem
 *   3. Hien mot toast cho nguoi dung biet
 */

export { logToMain }

/**
 * Ghi loi, hien toast, tra ve cau da dien giai.
 * @param silent chi ghi nhat ky, khong lam phien nguoi dung
 */
export function report(
  scope: string,
  err: unknown,
  options: { fallback?: string; silent?: boolean } = {}
): string {
  const friendly = describe(err, options.fallback)
  logToMain('error', scope, friendly, err)
  if (!options.silent) useApp.getState().toast(friendly, 'error')
  return friendly
}

/**
 * Boc mot viec co the that bai: hong thi bao loi va tra ve `fallback`.
 * Dung cho viec khong quan trong den muc phai dung ca luong lai.
 */
export async function attempt<T>(
  scope: string,
  work: () => Promise<T>,
  fallback: T,
  options: { fallback?: string; silent?: boolean } = {}
): Promise<T> {
  try {
    return await work()
  } catch (err) {
    report(scope, err, options)
    return fallback
  }
}

/**
 * Cai luoi bat loi toan cuc cho tien trinh giao dien.
 *
 * Khong co no thi mot loi trong ham xu ly su kien chi hien o DevTools roi thoi:
 * nguoi dung bam nut, khong thay gi xay ra, va khong hieu tai sao.
 */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    // Loi tai tai nguyen (anh bia hong, font khong ve toi) khong phai loi code,
    // va xay ra kha thuong xuyen - ghi nhe thoi, khong lam phien nguoi dung
    if (event.target && event.target !== window) {
      const el = event.target as HTMLElement
      logToMain('warn', 'tai nguyen', `Khong tai duoc ${el.tagName.toLowerCase()}`, {
        src: (el as HTMLImageElement).src ?? ''
      })
      return
    }
    report('giao dien', event.error ?? event.message, {
      fallback: 'Giao diện gặp lỗi. Nếu lặp lại, xin khởi động lại Lyra.'
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    report('giao dien', event.reason, { fallback: 'Một tác vụ nền thất bại.' })
  })

  // Canh bao chu dong tu tien trinh chinh (loi xay ra ngoai luc nguoi dung bam)
  window.api.log.onNotice((notice) => {
    const kind = notice.level === 'success' ? 'success' : notice.level
    useApp.getState().toast(notice.message, kind)
  })
}
