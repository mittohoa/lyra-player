/**
 * Đoán ngôn ngữ của lời bài hát bằng hệ chữ viết.
 *
 * Bản Android có ML Kit lo việc này. Trên Windows thì không có sẵn thứ tương
 * đương miễn phí, nhưng may là bài toán ở đây dễ hơn nhiều so với nhận diện
 * ngôn ngữ nói chung: ta chỉ cần phân biệt vài thứ tiếng, và mỗi thứ tiếng đó
 * dùng một **hệ chữ viết** khác hẳn nhau. Đếm ký tự theo khối Unicode là đủ, và
 * đủ một cách chắc chắn — không có chuyện tiếng Hàn bị nhầm thành tiếng Nhật khi
 * cả bài viết bằng Hangul.
 *
 * Chỗ duy nhất thật sự phải cân nhắc là tiếng Việt với tiếng Anh: cả hai đều
 * dùng chữ Latin. Phân biệt bằng các chữ cái **chỉ tiếng Việt mới có** (ă â ê ô
 * ơ ư đ và các dấu thanh). Một bài tiếng Việt luôn có chúng; một bài tiếng Anh
 * thì không bao giờ.
 */

/** Mã ngôn ngữ theo chuẩn hai chữ cái. */
export type LanguageCode = 'vi' | 'en' | 'ja' | 'ko' | 'zh' | 'th' | 'ru'

/** Chữ cái và dấu thanh chỉ tiếng Việt mới có. */
const VIET =
  /[ăâêôơưđĂÂÊÔƠƯĐàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/

/**
 * Nhận ra một số chữ cái có dấu mà tiếng Việt KHÔNG dùng.
 *
 * Không có bước này thì tiếng Pháp, Tây Ban Nha hay Bồ Đào Nha — vốn đầy dấu
 * sắc và dấu huyền trên nguyên âm — dễ bị đọc nhầm thành tiếng Việt.
 */
const KHONG_PHAI_VIET = /[çñßøåæœšžğıİÅÆØ]/

const KHOI: [RegExp, LanguageCode][] = [
  [/[가-힯ᄀ-ᇿ㄰-㆏]/, 'ko'], // Hangul
  [/[぀-ゟ゠-ヿ]/, 'ja'], // Hiragana + Katakana
  [/[฀-๿]/, 'th'], // Thái
  [/[Ѐ-ӿ]/, 'ru'], // Ki-ri-lô
  [/[一-鿿㐀-䶿]/, 'zh'] // Hán — xét SAU kana, xem chú thích
]

/**
 * Ngôn ngữ của một đoạn chữ, hoặc `null` khi không đủ căn cứ.
 *
 * Trả `null` chứ không đoán bừa: dịch từ một ngôn ngữ đoán sai ra thứ vô nghĩa
 * còn tệ hơn là không dịch.
 */
export function detectLanguage(text: string): LanguageCode | null {
  const sach = text.replace(/\[[^\]]*\]/g, ' ').trim() // bỏ mốc thời gian .lrc
  if (sach.length < 12) return null

  const dem = new Map<LanguageCode, number>()
  for (const [khoi, ma] of KHOI) {
    const n = (sach.match(new RegExp(khoi, 'g')) ?? []).length
    if (n > 0) dem.set(ma, n)
  }

  // Tiếng Nhật dùng cả chữ Hán lẫn kana. Có kana thì chắc chắn là tiếng Nhật,
  // dù chữ Hán có nhiều hơn — tiếng Trung không bao giờ có kana.
  if (dem.has('ja')) return 'ja'
  // Tiếng Hàn hiện đại xen rất ít chữ Hán, nên chỉ cần thấy Hangul là đủ.
  if (dem.has('ko')) return 'ko'

  const [ma, so] = [...dem.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  if (ma && so && so >= 4) return ma

  // Còn lại là chữ Latin: chỉ có tiếng Việt mang những chữ cái riêng của nó
  if (VIET.test(sach) && !KHONG_PHAI_VIET.test(sach)) return 'vi'

  const chuLatin = (sach.match(/[a-zA-Z]/g) ?? []).length
  return chuLatin >= 12 ? 'en' : null
}

/** Tên tiếng Việt của một mã ngôn ngữ, để nói cho người dùng biết. */
export function languageName(code: string): string {
  return (
    {
      vi: 'Việt',
      en: 'Anh',
      ja: 'Nhật',
      ko: 'Hàn',
      zh: 'Trung',
      th: 'Thái',
      ru: 'Nga'
    }[code] ?? code
  )
}
