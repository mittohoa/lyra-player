import { join } from 'node:path'
import { detectLanguage, languageName, type LanguageCode } from '@shared/language'
import { log } from '../logger'

/**
 * Dịch lời bài hát **ngay trên máy**, không khoá API, không tài khoản, không
 * tiền, và chạy được khi mất mạng.
 *
 * Cùng một triết lý với bản Android: tải một gói mô hình về một lần rồi dùng
 * mãi. Khác ở chỗ Android có ML Kit dựng sẵn trong hệ điều hành, còn ở đây ta
 * tự nạp mô hình Marian (opus-mt) chạy qua ONNX.
 *
 * Cái giá phải trả, nói thẳng: gói nặng hơn ML Kit khoảng ba lần (~100 MB mỗi
 * chiều), và bản dịch thô hơn hẳn một mô hình lớn — nó nuốt từ, dịch sai nghĩa
 * của từ nhiều nghĩa, và đôi khi tự thêm ký hiệu nhạc vào (xem `donDep`). Đổi
 * lại là không ai phải trả tiền và không lời bài hát nào rời khỏi máy.
 */

/** Về tiếng Anh — chặng trung chuyển cho mọi cặp không có mô hình trực tiếp. */
const VE_TIENG_ANH: Partial<Record<LanguageCode, string>> = {
  vi: 'Xenova/opus-mt-vi-en',
  ja: 'Xenova/opus-mt-ja-en',
  ko: 'Xenova/opus-mt-ko-en',
  zh: 'Xenova/opus-mt-zh-en',
  th: 'Xenova/opus-mt-th-en',
  ru: 'Xenova/opus-mt-ru-en'
}

/** Từ tiếng Anh đi ra. Đây là chỗ hẹp: không có mô hình Anh→Hàn. */
const TU_TIENG_ANH: Partial<Record<LanguageCode, string>> = {
  vi: 'Xenova/opus-mt-en-vi',
  ja: 'Xenova/opus-mt-en-jap',
  zh: 'Xenova/opus-mt-en-zh'
}

/** Các thứ tiếng chọn được làm ngôn ngữ ĐỌC. */
export const NGON_NGU_DOC: LanguageCode[] = ['vi', 'en', 'ja', 'zh']

/**
 * Dịch từng câu một.
 *
 * Không phải vì gộp lô sai — đã thử và gộp lô cho ra kết quả y hệt. Mà vì mỗi
 * câu cần được xét riêng: mô hình nhỏ thỉnh thoảng rơi vào vòng lặp và sinh ra
 * rác (xem `hongHan`), và khi đó ta phải bỏ RIÊNG câu đó chứ không bỏ cả lô.
 */
const LO = 1

/**
 * Thư mục chứa mô hình.
 *
 * Đặt được từ ngoài để bộ kiểm tra chạy thẳng bằng Node, không cần dựng cả
 * Electron lên chỉ để thử một phép dịch. Không đặt thì lấy thư mục dữ liệu
 * của app.
 */
let thuMucMoHinh: string | null = null

export function datThuMucMoHinh(duong: string): void {
  thuMucMoHinh = duong
}

async function goc(): Promise<string> {
  if (thuMucMoHinh) return thuMucMoHinh
  const { app } = await import('electron')
  return join(app.getPath('userData'), 'mo-hinh-dich')
}

/** Mô hình đã nạp, giữ lại để lần sau khỏi dựng lại. */
const daNap = new Map<string, unknown>()

let thuVien: typeof import('@huggingface/transformers') | null = null

/**
 * Nạp thư viện và trỏ chỗ để mô hình.
 *
 * Nạp muộn (`import()` trong hàm) chứ không nạp ở đầu file: gói này kéo theo bộ
 * chạy ONNX khá nặng, và phần lớn người dùng không bao giờ bật dịch lời. Nạp ở
 * đầu file là bắt mọi lần mở app phải trả cái giá đó.
 */
async function nap(): Promise<typeof import('@huggingface/transformers')> {
  if (thuVien) return thuVien
  const lib = await import('@huggingface/transformers')
  lib.env.cacheDir = await goc()
  // Chỉ lấy mô hình từ trên mạng về thư mục trên; không dò tìm trong thư mục
  // cài đặt của app — ở đó không có gì, và việc dò chỉ tạo ra lỗi khó hiểu
  lib.env.allowLocalModels = false
  thuVien = lib
  return lib
}

export interface TienDoTai {
  /** Tên gói đang tải, ví dụ "Anh → Việt". */
  goi: string
  phanTram: number
}

/**
 * Đường đi từ `tu` tới `toi`, gồm một hoặc hai chặng.
 *
 * Trả về mảng rỗng khi không có đường nào — và đó là câu trả lời thật thà, hơn
 * là bịa ra một chặng rồi cho ra thứ vô nghĩa.
 */
export function duongDi(tu: LanguageCode, toi: LanguageCode): string[] {
  if (tu === toi) return []
  if (tu === 'en') {
    const m = TU_TIENG_ANH[toi]
    return m ? [m] : []
  }
  if (toi === 'en') {
    const m = VE_TIENG_ANH[tu]
    return m ? [m] : []
  }
  const chang1 = VE_TIENG_ANH[tu]
  const chang2 = TU_TIENG_ANH[toi]
  return chang1 && chang2 ? [chang1, chang2] : []
}

/** Ước lượng dung lượng phải tải cho một đường đi, tính bằng MB. */
export function uocLuongMB(duong: string[]): number {
  return duong.length * 102
}

async function boDich(model: string, onProgress?: (p: TienDoTai) => void): Promise<any> {
  const san = daNap.get(model)
  if (san) return san

  const lib = await nap()
  const t0 = Date.now()
  const bo = await lib.pipeline('translation', model, {
    dtype: 'q8',
    progress_callback: (p: any) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        onProgress?.({ goi: model.replace('Xenova/opus-mt-', ''), phanTram: Math.round(p.progress) })
      }
    }
  })
  log.info('dịch lời', `Nạp xong ${model} sau ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  daNap.set(model, bo)
  return bo
}

/**
 * Tham số sinh chữ, đặt để chặn vòng lặp.
 *
 * `no_repeat_ngram_size` cấm lặp lại cùng một cụm ba chữ — đây là thứ chặn
 * đúng cái bệnh "Đêm đêm đêm đêm ♪ ♪ ♪ ♪" mà mô hình mắc phải với những câu
 * hát vốn đã lặp sẵn.
 *
 * `max_new_tokens` chặn theo độ dài câu gốc: một câu hát dịch ra không thể dài
 * gấp mấy lần chính nó, nên cứ vượt là biết đã đi lạc.
 */
function thamSoSinh(cau: string): Record<string, unknown> {
  const chu = cau.split(/\s+/).length
  return {
    no_repeat_ngram_size: 3,
    max_new_tokens: Math.min(120, Math.max(24, chu * 3 + 12))
  }
}

/**
 * Nhận ra một bản dịch đã hỏng.
 *
 * Ba dấu hiệu, đều gặp thật khi chạy thử:
 *
 *   - Chép lại nguyên văn câu gốc (mô hình "bí" thì nó copy)
 *   - Một từ lặp quá nhiều lần so với tổng số từ
 *   - Dài gấp mấy lần câu gốc
 *
 * Gặp thì trả về câu rỗng, và giao diện chỉ hiện dòng gốc. Không dịch còn hơn
 * hiện ra một dòng vô nghĩa mà người đọc tưởng là nghĩa của bài hát.
 */
function hongHan(goc: string, ra: string): boolean {
  if (!ra) return true
  if (ra.length > goc.length * 3 + 40) return true

  const tu = ra.toLowerCase().split(/\s+/).filter(Boolean)
  if (tu.length < 2) return true

  // Chép lại nguyên văn câu gốc: mô hình "bí" thì nó copy đầu vào ra đầu ra
  const tuGoc = goc.toLowerCase().split(/\s+/).filter(Boolean)
  for (let i = 0; i + 3 <= tuGoc.length; i++) {
    if (ra.toLowerCase().includes(tuGoc.slice(i, i + 3).join(' '))) return true
  }

  // Dấu câu tràn ngập: "Tôi,, và,,, không, đồng, không không,,"
  const dauCau = (ra.match(/[,.;:!?#*]/g) ?? []).length
  if (dauCau > tu.length * 0.5) return true

  // Chữ cái đơn lẻ rải rác: "R R R chóng"
  const donLe = tu.filter((t) => t.replace(/[^\p{L}]/gu, '').length === 1).length
  if (donLe >= 3) return true

  const dem = new Map<string, number>()
  for (const t of tu) dem.set(t, (dem.get(t) ?? 0) + 1)
  if (Math.max(...dem.values()) > Math.max(2, tu.length * 0.3)) return true

  // Cặp từ lặp: "cùng cùng nhau cùng nhau", "mỗi ngày, mỗi ngày"
  const cap = new Map<string, number>()
  for (let i = 0; i + 1 < tu.length; i++) {
    const k = tu[i] + ' ' + tu[i + 1]
    cap.set(k, (cap.get(k) ?? 0) + 1)
    if ((cap.get(k) ?? 0) > 1) return true
  }

  return false
}

/**
 * Dọn những thứ mô hình tự thêm vào.
 *
 * `opus-mt` được huấn luyện phần lớn trên phụ đề phim, nơi lời hát luôn được kẹp
 * giữa hai ký hiệu `♪`. Nên khi gặp một câu nghe như lời hát, nó tự thêm ký hiệu
 * đó vào — đúng thói quen nó học được, nhưng ở đây chỉ là rác.
 */
function donDep(cau: string): string {
  return cau
    .replace(/^[\s♪♫#*\-–—]+|[\s♪♫#*\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Dịch một mảng dòng, trả về mảng **đúng bằng số dòng đầu vào**.
 *
 * Giữ đúng số dòng là điều bắt buộc chứ không phải cho đẹp: giao diện ghép dòng
 * gốc với dòng dịch theo chỉ số, lệch một dòng là cả bài lệch. Dòng trống và
 * dòng chỉ có ký hiệu nhạc được giữ nguyên, không đưa qua mô hình.
 */
export async function dichCacDong(
  dong: string[],
  toi: LanguageCode,
  onProgress?: (xong: number, tong: number) => void,
  onTai?: (p: TienDoTai) => void
): Promise<{ ket: string[]; tu: LanguageCode } | null> {
  if (!dong.length) return null

  const tu = detectLanguage(dong.join('\n'))
  if (!tu) {
    log.info('dịch lời', 'Không đoán được lời đang là tiếng gì — bỏ qua')
    return null
  }
  if (tu === toi) return null

  const duong = duongDi(tu, toi)
  if (!duong.length) {
    log.info('dịch lời', `Chưa có mô hình cho ${languageName(tu)} → ${languageName(toi)}`)
    return null
  }

  const boCacChang = []
  for (const m of duong) boCacChang.push(await boDich(m, onTai))

  // Chỉ đưa qua mô hình những dòng thật sự có chữ; các dòng còn lại giữ nguyên
  // vị trí bằng cách nhớ chỉ số
  const canDich: { i: number; text: string }[] = []
  dong.forEach((d, i) => {
    const t = d.trim()
    if (t && t !== '♪') canDich.push({ i, text: t })
  })

  const ket = [...dong]
  for (let i = 0; i < canDich.length; i += LO) {
    const lo = canDich.slice(i, i + LO)
    let van = lo.map((x) => x.text)

    for (const bo of boCacChang) {
      const ra = await bo(van, thamSoSinh(van[0] ?? ''))
      van = (Array.isArray(ra) ? ra : [ra]).map((x: any) => x.translation_text ?? '')
    }

    lo.forEach((x, k) => {
      const dich = donDep(van[k] ?? '')
      ket[x.i] = hongHan(x.text, dich) ? '' : dich
    })
    onProgress?.(Math.min(i + LO, canDich.length), canDich.length)
  }

  return { ket, tu }
}

/** Các gói đã có sẵn trên máy cho một đường đi. */
export async function daCoTrenMay(duong: string[]): Promise<boolean> {
  if (!duong.length) return true
  const { existsSync } = await import('node:fs')
  const thuMuc = await goc()
  return duong.every((m) => existsSync(join(thuMuc, ...m.split('/'), 'onnx')))
}
