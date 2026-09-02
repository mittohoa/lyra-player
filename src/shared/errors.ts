/**
 * Doi loi ky thuat thanh cau tieng Viet noi ro chuyen gi va nen lam gi.
 *
 * De o `shared` vi ca hai tien trinh deu can: tien trinh chinh dung khi ghi
 * nhat ky, giao dien dung cho loi sinh ra ngay tai cho (loi ve, loi the audio).
 * Mot bang duy nhat thi cung mot loi luon hien ra cung mot cau, du no phat sinh
 * o dau.
 */
/** Chuoi co it nhat mot chu tieng Viet co dau. */
const VIETNAMESE =
  /[àáãạảăằắẵặẳâầấẫậẩèéẽẹẻêềếễệểìíĩịỉòóõọỏôồốỗộổơờớỡợởùúũụủưừứữựửỳýỹỵỷđ]/i

/** Ma loi kieu ENOENT / EACCES - dau hieu day la cau cua he dieu hanh. */
const ERRNO = /\bE[A-Z]{3,}\b/

export function describe(err: unknown, fallback = 'Có lỗi xảy ra.'): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '')
  const text = raw.toLowerCase()

  // Cau do CHINH APP viet ra thi giu nguyen: no bao gio cung cu the hon mot
  // muc chung chung ("Chua tai model small..." ro hon "Cong cu AI gap loi").
  //
  // Phai loc truoc hai truong hop de khong lot chuoi ky thuat ra man hinh:
  // loi cua he dieu hanh vo tinh chua duong dan tieng Viet (D:\Nhạc\bài.mp3),
  // va loi kem ma HTTP - loai do da co cau rieng noi ro hon o duoi.
  const own = err instanceof Error ? err.message : ''
  if (VIETNAMESE.test(own) && !ERRNO.test(own) && !/\b[45]\d\d\b/.test(own)) return own

  // ---- Mang -----------------------------------------------------------
  if (/enotfound|eai_again|getaddrinfo/.test(text))
    return 'Không kết nối được mạng. Kiểm tra kết nối Internet rồi thử lại.'
  if (/econnrefused|econnreset|epipe|socket hang up/.test(text))
    return 'Máy chủ ngắt kết nối giữa chừng. Thử lại sau ít phút.'
  if (/etimedout|timeout|timed out|qua lau/.test(text))
    return 'Máy chủ phản hồi quá chậm. Thử lại sau, hoặc kiểm tra mạng.'
  if (/certificate|cert_|self.signed/.test(text))
    return 'Chứng chỉ bảo mật của máy chủ không hợp lệ. Có thể do mạng công ty chặn.'
  if (/\b429\b|too many requests|rate limit/.test(text))
    return 'Nguồn nhạc đang tạm chặn vì hỏi quá nhiều. Chờ vài phút rồi thử lại.'
  if (/\b40[13]\b|forbidden|unauthorized/.test(text))
    return 'Nguồn từ chối truy cập. Có thể bài này bị giới hạn khu vực hoặc cần đăng nhập.'
  if (/\b404\b|not found|does not exist/.test(text))
    return 'Không tìm thấy nội dung này ở nguồn.'
  if (/\b5\d\d\b|internal server|bad gateway|service unavailable/.test(text))
    return 'Máy chủ của nguồn đang gặp sự cố. Thử lại sau.'

  // ---- File va o dia --------------------------------------------------
  if (/enoent/.test(text)) return 'Không tìm thấy file hoặc thư mục. Có thể đã bị xoá hoặc đổi tên.'
  if (/eacces|eperm/.test(text))
    return 'Không có quyền truy cập file. Thử chạy AURA với quyền quản trị, hoặc chọn thư mục khác.'
  if (/ebusy|elocked/.test(text))
    return 'File đang được chương trình khác dùng. Đóng chương trình đó rồi thử lại.'
  if (/enospc/.test(text)) return 'Ổ đĩa đã đầy. Dọn bớt chỗ trống rồi thử lại.'
  if (/emfile|enfile/.test(text)) return 'Mở quá nhiều file cùng lúc. Khởi động lại AURA.'

  // ---- Cong cu ngoai --------------------------------------------------
  if (/ytdlpmissing|chua tim thay yt-dlp/.test(text))
    return 'Chưa có yt-dlp. Vào Cài đặt → YouTube để cài đặt.'
  if (/ffmpeg/.test(text))
    return 'Cần ffmpeg cho bước này. Vào Cài đặt → YouTube để trỏ tới ffmpeg.'
  if (/whisper/.test(text))
    return 'Công cụ nhận dạng giọng hát gặp lỗi. Vào Cài đặt → AI để cài lại.'
  if (/api key|x-api-key|anthropic/.test(text))
    return 'Khoá API chưa đúng hoặc chưa nhập. Vào Cài đặt → AI để kiểm tra.'

  // ---- Du lieu --------------------------------------------------------
  if (/json|unexpected token|parse/.test(text))
    return 'Nguồn trả về dữ liệu lạ. Có thể họ vừa đổi API - thử nguồn khác.'
  if (/signature|incorect|incorrect sig/.test(text))
    return 'Nguồn từ chối yêu cầu. Có thể họ vừa đổi cách xác thực.'

  // Cau tieng Viet kem ma HTTP hay ma loi he thong: khong khop mau nao o tren
  // thi den day van con hon la mot cau chung chung
  if (VIETNAMESE.test(own)) return own

  return fallback
}
