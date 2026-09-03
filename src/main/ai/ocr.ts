import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { log } from '../logger'

/**
 * Đọc chữ từ một tấm ảnh — để nhập lời bài hát chụp từ màn hình hay từ sách.
 *
 * DÙNG TESSERACT CHẠY TẠI CHỖ, không gọi dịch vụ nào. Ảnh không rời khỏi máy.
 *
 * VÌ SAO KHÔNG DÙNG BỘ ĐỌC SẴN CỦA WINDOWS (`Windows.Media.Ocr`): đã đo trên
 * máy thật — nó chỉ có `en-US`, không có tiếng Việt. Mà lời bài hát cần đọc ở
 * đây gần như luôn là tiếng Việt, và tiếng Việt sai dấu thì đọc ra vô nghĩa.
 * Bộ đọc của Windows chỉ có nếu người dùng tự cài gói ngôn ngữ, không thể trông
 * vào được.
 *
 * DỮ LIỆU NGÔN NGỮ TẢI KHI DÙNG LẦN ĐẦU, không nhúng sẵn: `vie` chừng 5 MB,
 * `eng` chừng 4 MB. Nhúng vào bộ cài là bắt mọi người tải thêm 9 MB cho một
 * tính năng phần lớn không đụng tới — cùng lối nghĩ với mô hình dịch và với
 * ML Kit bên bản Android. Tải xong nằm trong thư mục dữ liệu, lần sau không
 * tải lại.
 */

/** Nơi cất dữ liệu ngôn ngữ đã tải. */
function thuMuc(): string {
  return join(app.getPath('userData'), 'ocr')
}

/**
 * Đọc `vie` TRƯỚC `eng`.
 *
 * Thứ tự có ý nghĩa với Tesseract: bộ đứng trước được ưu tiên khi hai bộ đọc ra
 * hai kết quả khác nhau. Đảo lại thì "đã" hay thành "da", "cười" thành "cuoi".
 */
const NGON_NGU = 'vie+eng'

let dangChay = false

export interface KetQuaDoc {
  chu: string
  /** Độ tin trung bình, 0-100. Dưới 60 thì nên nói cho người dùng biết. */
  doTin: number
}

export async function docChuTuAnh(duongAnh: string): Promise<KetQuaDoc> {
  // Một lượt đọc chiếm khá nhiều CPU. Chạy hai lượt chồng nhau thì cả hai đều
  // chậm đi và máy yếu sẽ đứng hình — chặn ở đây rẻ hơn là để người dùng bấm
  // liên tục rồi tưởng app treo.
  if (dangChay) throw new Error('Đang đọc một ảnh khác, đợi xong đã')
  dangChay = true

  const bd = Date.now()
  try {
    await fs.mkdir(thuMuc(), { recursive: true })

    // Nạp muộn: gói này kéo theo WebAssembly vài MB, nạp lúc khởi động thì app
    // mở chậm hơn cho mọi người dù phần lớn không dùng tới.
    const { createWorker } = await import('tesseract.js')

    const tho = await createWorker(NGON_NGU, undefined, {
      cachePath: thuMuc(),
      logger: () => {
        // Tesseract bắn tiến độ rất dày. Không ghi nhật ký ở đây - một lượt đọc
        // sẽ đẻ ra hàng trăm dòng và lấp mất mọi thứ khác.
      }
    })

    try {
      const { data } = await tho.recognize(duongAnh)
      const chu = donDep(data.text)
      log.info(
        'đọc chữ',
        `Đọc xong ${chu.split('\n').length} dòng trong ${((Date.now() - bd) / 1000).toFixed(1)}s`
      )
      return { chu, doTin: Math.round(data.confidence) }
    } finally {
      await tho.terminate()
    }
  } finally {
    dangChay = false
  }
}

/**
 * Dọn kết quả thô của Tesseract cho ra dáng lời bài hát.
 *
 * Nó hay để lại dòng trống thừa và khoảng trắng ở đầu cuối dòng. Bỏ đi thì
 * người dùng dán vào ô soạn là dùng được ngay, không phải sửa tay từng dòng.
 * KHÔNG động tới nội dung chữ: đoán sai một chữ còn đỡ hơn tự ý sửa.
 */
export function donDep(tho: string): string {
  return tho
    .split('\n')
    .map((d) => d.replace(/\s+/g, ' ').trim())
    .filter((d, i, ds) => d !== '' || (i > 0 && ds[i - 1] !== ''))
    .join('\n')
    .trim()
}
