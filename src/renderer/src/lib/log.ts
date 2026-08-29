import { describe } from '@shared/errors'
import type { LogLevel } from '@shared/ipc'

/**
 * Ghi nhat ky tu phia giao dien, KHONG dinh gi toi kho zustand.
 *
 * Tach rieng khoi `report.ts` vi mot ly do cu the: `report` phai goi toi kho
 * `app` de hien toast, ma chinh kho `app` lai can ghi nhat ky. De chung mot
 * file thi thanh vong phu thuoc. File nay khong nhap gi ngoai kieu, nen ai
 * cung nhap duoc.
 */

/** Gui mot dong nhat ky ve tien trinh chinh. Khong bao gio nem loi. */
export function logToMain(
  level: LogLevel,
  scope: string,
  message: string,
  detail?: unknown
): void {
  try {
    window.api.log.write({
      level,
      scope,
      message,
      detail:
        detail instanceof Error
          ? detail.stack || `${detail.name}: ${detail.message}`
          : detail === undefined
            ? undefined
            : String(detail)
    })
  } catch {
    // Cau noi IPC dut - console la cho cuoi cung con lai
    console.error(`[${scope}] ${message}`, detail)
  }
}

/**
 * Ghi loi va tra ve cau da dien giai, khong hien toast.
 * Dung o nhung cho tu lo phan hien - vi du kho `app`, noi da co san `toast`.
 */
export function logError(scope: string, err: unknown, fallback?: string): string {
  const friendly = describe(err, fallback)
  logToMain('error', scope, friendly, err)
  return friendly
}
