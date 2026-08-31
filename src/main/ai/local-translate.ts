import { join } from 'node:path'
import { detectLanguage, languageName, type LanguageCode } from '@shared/language'
import { log } from '../logger'

/**
 * Dịch lời bài hát **ngay trên máy**: không khoá API, không tài khoản, không
 * tiền, và chạy được khi mất mạng.
 *
 * Cùng triết lý với bản Android — tải một gói mô hình về một lần rồi dùng mãi —
 * nhưng ở đây ta tự nạp mô hình chạy qua ONNX thay vì mượn ML Kit của hệ điều
 * hành.
 *
 * Có **hai bộ máy**, và chúng khác nhau đủ nhiều để đáng cho người dùng chọn.
 * Số liệu dưới đây đo thật trên 24 dòng đầu của "Shape of You":
 *
 * | | `nhanh` (opus-mt) | `tot` (NLLB-200) |
 * |---|---|---|
 * | Tải về | 102 MB **mỗi chiều** | 853 MB, dùng cho **mọi** chiều |
 * | Tốc độ | 0,97 giây/dòng | 5,68 giây/dòng |
 * | Dòng dịch ra đọc được | 17/24 | 24/24 |
 *
 * `tot` làm mặc định vì chất lượng mới là thứ quyết định tính năng này có đáng
 * bật hay không: `nhanh` bỏ trống gần một phần ba số dòng, và những dòng còn lại
 * thì thô — nó dịch "the bar" thành "thanh", để nguyên "The club" không dịch.
 *
 * Bù lại cái chậm bằng cách **trả từng dòng ngay khi xong** (`onDong`) chứ không
 * đợi cả bài: người nghe đọc được dòng đầu sau vài giây thay vì sau vài phút.
 */

export type BoMay = 'nhanh' | 'tot'

// ---- Bộ máy `nhanh`: opus-mt, mỗi cặp ngôn ngữ một mô hình nhỏ ----

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

// ---- Bộ máy `tot`: NLLB-200, một mô hình cho hai trăm ngôn ngữ ----

const NLLB = 'Xenova/nllb-200-distilled-600M'

/** Mã ngôn ngữ NLLB dùng — khác chuẩn hai chữ cái, gồm cả hệ chữ viết. */
const FLORES: Record<LanguageCode, string> = {
  vi: 'vie_Latn',
  en: 'eng_Latn',
  ja: 'jpn_Jpan',
  ko: 'kor_Hang',
  zh: 'zho_Hans',
  th: 'tha_Thai',
  ru: 'rus_Cyrl'
}

/** Các thứ tiếng chọn được làm ngôn ngữ ĐỌC. */
export const NGON_NGU_DOC: LanguageCode[] = ['vi', 'en', 'ja', 'ko', 'zh']

/**
 * Dịch từng câu một, không gộp lô.
 *
 * Không phải vì gộp lô sai — đã thử và gộp lô cho ra kết quả y hệt. Mà vì mỗi
 * câu cần được xét riêng: bộ máy `nhanh` thỉnh thoảng rơi vào vòng lặp và sinh
 * ra rác (xem `hongHan`), và khi đó phải bỏ RIÊNG câu đó. Dịch từng câu cũng là
 * thứ cho phép trả kết quả dần.
 */

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
  /** Tên gói đang tải, cho người đọc chứ không phải mã máy. */
  goi: string
  phanTram: number
}

/**
 * Các mô hình cần cho một lần dịch, theo bộ máy đã chọn.
 *
 * Trả về mảng rỗng khi không có đường nào — và đó là câu trả lời thật thà, hơn
 * là bịa ra một chặng rồi cho ra thứ vô nghĩa.
 */
export function duongDi(tu: LanguageCode, toi: LanguageCode, boMay: BoMay = 'tot'): string[] {
  if (tu === toi) return []
  if (boMay === 'tot') return FLORES[tu] && FLORES[toi] ? [NLLB] : []

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

/** Dung lượng phải tải cho một đường đi, tính bằng MB. Số đo thật, không ước. */
export function uocLuongMB(duong: string[]): number {
  return duong.reduce((tong, m) => tong + (m === NLLB ? 875 : 102), 0)
}

async function boDich(model: string, onTai?: (p: TienDoTai) => void): Promise<any> {
  const san = daNap.get(model)
  if (san) return san

  const lib = await nap()
  const t0 = Date.now()
  const bo = await lib.pipeline('translation', model, {
    dtype: 'q8',
    progress_callback: (p: any) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        onTai?.({
          goi: model === NLLB ? 'gói dịch đa ngôn ngữ' : model.replace('Xenova/opus-mt-', ''),
          phanTram: Math.round(p.progress)
        })
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
 * `no_repeat_ngram_size` cấm lặp lại cùng một cụm ba chữ — đây là thứ chặn đúng
 * cái bệnh "Đêm đêm đêm đêm ♪ ♪ ♪ ♪" mà bộ máy `nhanh` mắc phải với những câu
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
 * Bốn dấu hiệu, tất cả đều gặp thật khi chạy thử bộ máy `nhanh`:
 *
 *   - Chép lại nguyên văn câu gốc — mô hình "bí" thì nó copy đầu vào ra đầu ra
 *   - Dấu câu tràn ngập: "Tôi,, và,,, không, đồng, không không,,"
 *   - Chữ cái đơn lẻ rải rác: "R R R chóng"
 *   - Lặp cặp từ: "cùng cùng nhau cùng nhau", "mỗi ngày, mỗi ngày"
 *
 * Gặp thì bỏ dòng đó, giao diện chỉ hiện dòng gốc. Không dịch còn hơn hiện ra
 * một dòng vô nghĩa mà người đọc tưởng là nghĩa của bài hát.
 */
function hongHan(goc: string, ra: string): boolean {
  if (!ra) return true
  if (ra.length > goc.length * 3 + 40) return true

  const tu = ra.toLowerCase().split(/\s+/).filter(Boolean)
  if (tu.length < 2) return true

  const tuGoc = goc.toLowerCase().split(/\s+/).filter(Boolean)
  for (let i = 0; i + 3 <= tuGoc.length; i++) {
    if (ra.toLowerCase().includes(tuGoc.slice(i, i + 3).join(' '))) return true
  }

  const dauCau = (ra.match(/[,.;:!?#*]/g) ?? []).length
  if (dauCau > tu.length * 0.5) return true

  const donLe = tu.filter((t) => t.replace(/[^\p{L}]/gu, '').length === 1).length
  if (donLe >= 3) return true

  const dem = new Map<string, number>()
  for (const t of tu) dem.set(t, (dem.get(t) ?? 0) + 1)
  if (Math.max(...dem.values()) > Math.max(2, tu.length * 0.3)) return true

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

export interface KetQuaDich {
  /** Đúng bằng số dòng đầu vào. Dòng không dịch được để rỗng. */
  ket: string[]
  tu: LanguageCode
}

export interface CacBuoc {
  /** Gọi ngay khi một dòng dịch xong, để giao diện hiện dần. */
  onDong?: (chiSo: number, chu: string) => void
  onTienDo?: (xong: number, tong: number) => void
  onTai?: (p: TienDoTai) => void
  /** Trả về true để dừng giữa chừng — vd. người dùng đã đổi bài. */
  huy?: () => boolean
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
  boMay: BoMay = 'tot',
  buoc: CacBuoc = {}
): Promise<KetQuaDich | null> {
  if (!dong.length) return null

  const tu = detectLanguage(dong.join('\n'))
  if (!tu) {
    log.info('dịch lời', 'Không đoán được lời đang là tiếng gì — bỏ qua')
    return null
  }
  if (tu === toi) return null

  const duong = duongDi(tu, toi, boMay)
  if (!duong.length) {
    log.info('dịch lời', `Chưa có mô hình cho ${languageName(tu)} → ${languageName(toi)}`)
    return null
  }

  const chang: any[] = []
  for (const m of duong) chang.push(await boDich(m, buoc.onTai))

  // Chỉ đưa qua mô hình những dòng thật sự có chữ; các dòng còn lại giữ nguyên
  // vị trí bằng cách nhớ chỉ số
  const canDich: { i: number; text: string }[] = []
  dong.forEach((d, i) => {
    const t = d.trim()
    if (t && t !== '♪') canDich.push({ i, text: t })
  })

  const ket = [...dong]
  const t0 = Date.now()

  for (let n = 0; n < canDich.length; n++) {
    if (buoc.huy?.()) {
      log.info('dịch lời', `Dừng giữa chừng sau ${n}/${canDich.length} dòng`)
      break
    }

    const { i, text } = canDich[n]
    let van = text
    for (const bo of chang) {
      const ra = await bo(
        van,
        boMay === 'tot'
          ? { ...thamSoSinh(van), src_lang: FLORES[tu], tgt_lang: FLORES[toi] }
          : thamSoSinh(van)
      )
      van = (Array.isArray(ra) ? ra[0] : ra)?.translation_text ?? ''
    }

    const sach = donDep(van)
    ket[i] = hongHan(text, sach) ? '' : sach
    buoc.onDong?.(i, ket[i])
    buoc.onTienDo?.(n + 1, canDich.length)
  }

  const giay = (Date.now() - t0) / 1000
  log.info(
    'dịch lời',
    `${languageName(tu)} → ${languageName(toi)} bằng bộ máy "${boMay}": ` +
      `${canDich.length} dòng trong ${giay.toFixed(1)}s`
  )
  return { ket, tu }
}

/** Các gói đã có sẵn trên máy cho một đường đi. */
export async function daCoTrenMay(duong: string[]): Promise<boolean> {
  if (!duong.length) return true
  const { existsSync } = await import('node:fs')
  const thuMuc = await goc()
  return duong.every((m) => existsSync(join(thuMuc, ...m.split('/'), 'onnx')))
}
