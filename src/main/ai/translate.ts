import type { LanguageCode } from '@shared/language'
import { getSettings } from '../store'
import {
  dichCacDong,
  duongDi,
  daCoTrenMay,
  uocLuongMB,
  NGON_NGU_DOC,
  type BoMay
} from './local-translate'

/**
 * Dịch lời bài hát sang ngôn ngữ khác, giữ đúng số dòng để khung lời nổi ghép
 * được từng dòng gốc với từng dòng dịch.
 *
 * Trước đây phần này gọi API Anthropic — chất lượng cao nhưng cần khoá riêng và
 * có tính phí. Nay nó chạy **hoàn toàn trên máy**: không khoá, không tài khoản,
 * không tiền, không lời bài hát nào rời khỏi máy, và dùng được khi mất mạng.
 * Cùng lựa chọn với bản Android.
 *
 * Toàn bộ phần nặng nằm ở `local-translate.ts`; file này chỉ là chỗ đọc cài đặt
 * và giữ nguyên hình dạng lời gọi cho phần còn lại của app.
 */

/** Ngôn ngữ chọn được, kèm tên hiện trên màn hình. */
export const LANGUAGES: Record<string, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  zh: '中文'
}

export interface TranslateProgress {
  done: number
  total: number
}

function boMayDangChon(): BoMay {
  return getSettings().translateEngine === 'nhanh' ? 'nhanh' : 'tot'
}

/**
 * Dịch toàn bộ lời. Trả về mảng cùng độ dài với đầu vào.
 *
 * Dòng nào không dịch được thì để rỗng — giao diện hiện dòng gốc. Không dịch
 * còn hơn hiện một dòng vô nghĩa mà người đọc tưởng là nghĩa của bài hát.
 *
 * `onLine` được gọi ngay khi từng dòng xong, để màn hình hiện dần thay vì đứng
 * im chờ cả bài. Với bộ máy chất lượng cao thì một bài mất vài phút, nên chờ
 * xong hết mới hiện là bắt người ta nhìn một khung trống rất lâu.
 */
export async function translateLyrics(
  lines: string[],
  targetLang: string,
  onProgress?: (p: TranslateProgress) => void,
  onLine?: (index: number, text: string) => void,
  huy?: () => boolean
): Promise<string[]> {
  if (!lines.length) return []

  const ket = await dichCacDong(lines, targetLang as LanguageCode, boMayDangChon(), {
    onTienDo: (xong, tong) => onProgress?.({ done: xong, total: tong }),
    onDong: onLine,
    huy
  })

  return ket?.ket ?? lines.map(() => '')
}

export interface TinhTrangGoi {
  /** Đã có sẵn trên máy chưa. */
  sanSang: boolean
  /** Phải tải bao nhiêu MB nếu chưa có. */
  canTaiMB: number
  /** Không có mô hình cho cặp ngôn ngữ này. */
  khongHoTro: boolean
}

/**
 * Gói ngôn ngữ cho một lần dịch đã có sẵn chưa, và nếu chưa thì nặng bao nhiêu.
 *
 * Dùng để hỏi người dùng TRƯỚC khi tải: gói chất lượng cao nặng 875 MB, và tải
 * ngần ấy mà không hỏi là chuyện không được phép làm.
 */
export async function tinhTrangGoi(
  tu: LanguageCode,
  toi: LanguageCode
): Promise<TinhTrangGoi> {
  const duong = duongDi(tu, toi, boMayDangChon())
  if (!duong.length && tu !== toi) {
    return { sanSang: false, canTaiMB: 0, khongHoTro: true }
  }
  const co = await daCoTrenMay(duong)
  return { sanSang: co, canTaiMB: co ? 0 : uocLuongMB(duong), khongHoTro: false }
}

export { NGON_NGU_DOC }
