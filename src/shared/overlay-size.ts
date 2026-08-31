/**
 * Cỡ khung lời nổi suy ra từ bề ngang màn hình.
 *
 * Một con số cố định không thể vừa cho mọi máy. 34px vừa mắt trên màn hình
 * 1080p thì trên màn 4K để nguyên độ phân giải chỉ còn là một vệt mờ dưới đáy,
 * còn trên laptop 1366 thì lại chiếm mất chỗ. Khung lời nổi là thứ để LIẾC MẮT
 * ĐỌC trong lúc đang làm việc khác, nên chữ nhỏ quá thì nó vô dụng — mà người
 * dùng thường không nghĩ tới việc vào chỉnh, họ chỉ thấy tính năng này dở.
 *
 * Nên mặc định phải tự đo màn hình. Mốc neo: màn hình rộng 1920 điểm ảnh độc
 * lập → khung rộng 920, chữ 41. Các cỡ khác nội suy tuyến tính từ đó rồi kẹp
 * vào khoảng còn đọc được.
 *
 * Đơn vị ở đây là ĐIỂM ẢNH ĐỘC LẬP (CSS px của Electron), không phải điểm ảnh
 * vật lý — Windows đã nhân tỉ lệ hiển thị vào đó rồi. Màn 4K đặt tỉ lệ 150% báo
 * về 2560 chứ không phải 3840, và đó đúng là con số ta cần: nó đã tính cả việc
 * người dùng ngồi xa hay gần.
 */

/** Khung rộng bằng ngần này phần bề ngang màn hình. */
const WIDTH_RATIO = 0.48
const WIDTH_MIN = 560
const WIDTH_MAX = 1800

/** Chữ cao bằng ngần này phần bề ngang KHUNG (không phải màn hình). */
const FONT_RATIO = 0.045
const FONT_MIN = 24
const FONT_MAX = 72

/** Giãn dòng và khoảng đệm trên dưới, tính theo cỡ chữ. */
const LINE_HEIGHT = 1.6
const PADDING_RATIO = 0.8

export interface OverlaySuggestion {
  width: number
  height: number
  fontSize: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Cỡ chữ gợi ý cho một màn hình rộng `screenWidth` điểm ảnh độc lập.
 *
 * Tách riêng khỏi `suggestOverlay` vì giao diện chỉnh cần đúng con số này mà
 * không cần dựng lại cả khung: người dùng bấm "cỡ gợi ý" thì chỉ đổi chữ, vị
 * trí và kích thước khung họ đã kéo phải giữ nguyên.
 */
export function suggestOverlayFontSize(screenWidth: number): number {
  const width = clamp(screenWidth * WIDTH_RATIO, WIDTH_MIN, WIDTH_MAX)
  return Math.round(clamp(width * FONT_RATIO, FONT_MIN, FONT_MAX))
}

/**
 * Bề cao vừa đủ cho dòng đang hát cộng `contextLines` dòng mỗi bên.
 *
 * Cửa sổ overlay không tự co giãn theo nội dung — nó là một cửa sổ thật của hệ
 * điều hành, cao bao nhiêu là do ta đặt. Đặt hụt thì dòng trên dòng dưới bị cắt
 * mất một nửa.
 */
export function suggestOverlayHeight(fontSize: number, contextLines: number): number {
  const lines = 2 * Math.max(0, contextLines) + 1
  return Math.round(fontSize * LINE_HEIGHT * lines + fontSize * PADDING_RATIO)
}

/** Cả ba con số cho lần đầu dựng khung. */
export function suggestOverlay(screenWidth: number, contextLines = 1): OverlaySuggestion {
  const width = Math.round(clamp(screenWidth * WIDTH_RATIO, WIDTH_MIN, WIDTH_MAX))
  const fontSize = suggestOverlayFontSize(screenWidth)
  return { width, fontSize, height: suggestOverlayHeight(fontSize, contextLines) }
}
