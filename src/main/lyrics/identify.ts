/**
 * Doan ten bai va nghe si that tu mot chuoi tho.
 *
 * Van de: khi nhac phat o app khac, Windows chi dua cho ta cai ma app do khai
 * bao. Spotify khai bao sach se, nhung TRINH DUYET thi khai bao TEN VIDEO:
 *
 *   "NƠI NÀY CÓ ANH | OFFICIAL MUSIC VIDEO | SƠN TÙNG M-TP"
 *   "Hà Anh Tuấn - Nhà Tôi Có Treo Một Lá Cờ (Official Lyric Video) - YouTube"
 *   "【MV】Bo Hen - Vu Cat Tuong「Lyrics Video」4K"
 *
 * Dem nguyen chuoi do di tra LRCLIB thi truot gan nhu chac chan. Module nay boc
 * rac ra, roi sinh NHIEU phuong an (nghe si, ten bai) de ben goi thu lan luot -
 * vi khong the biet chac ve nao la nghe si, ve nao la ten bai.
 */

/** Cum thuong gap trong ten video, khong phai mot phan ten bai. */
const NOISE = [
  'official music video',
  'official video',
  'official mv',
  'official audio',
  'official lyric video',
  'official lyrics video',
  'official visualizer',
  'official',
  'music video',
  'lyric video',
  'lyrics video',
  'lyric',
  'lyrics',
  'audio',
  'visualizer',
  'mv',
  'm/v',
  'hd',
  'hq',
  '4k',
  '8k',
  'full',
  'full hd',
  'video',
  'освещение',
  'vietsub',
  'engsub',
  'sub',
  'karaoke',
  'beat',
  'instrumental',
  'reaction',
  'cover by',
  'live performance',
  'performance video',
  'dance practice',
  'teaser',
  'trailer',
  'clip'
]

/** Dau ngoac cac loai, ke ca ngoac tieng Nhat/Trung hay gap trong ten video. */
const BRACKETS: [string, string][] = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['【', '】'],
  ['「', '」'],
  ['『', '』'],
  ['〈', '〉'],
  ['《', '》']
]

/**
 * Cum tach nghe si va ten bai, kem chieu thuong gap cua chinh dau do.
 *
 * Hai kieu dat ten pho bien va NGUOC nhau:
 *   "Sơn Tùng M-TP - Nơi Này Có Anh"        gach ngang: nghe si dung truoc
 *   "NƠI NÀY CÓ ANH | ... | SƠN TÙNG M-TP"  gach dung:  ten bai dung truoc
 * Ap mot chieu cho ca hai thi mot nua so truong hop se nhan nham.
 */
const SEPARATORS: { sep: string; artistFirst: boolean }[] = [
  { sep: ' - ', artistFirst: true },
  { sep: ' – ', artistFirst: true },
  { sep: ' — ', artistFirst: true },
  { sep: ' | ', artistFirst: false },
  { sep: ' ~ ', artistFirst: true },
  { sep: ' / ', artistFirst: true },
  { sep: '「', artistFirst: true },
  { sep: '『', artistFirst: true }
]

function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
}

/** Chuoi de so sanh: bo dau, bo ky tu khong phai chu/so, ve chu thuong. */
export function normalizeForCompare(text: string): string {
  return stripDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Doan nay co phai chi toan tu rac khong. */
function isNoise(segment: string): boolean {
  const n = normalizeForCompare(segment)
  if (!n) return true
  if (NOISE.includes(n)) return true
  // "official music video 4k" - toan tu rac ghep lai
  const words = n.split(' ')
  return words.length <= 5 && words.every((w) => NOISE.some((x) => x === w))
}

/** Bo cac cum trong ngoac neu cum do chi la nhan quang cao. */
function stripBrackets(text: string): string {
  let out = text
  for (const [open, close] of BRACKETS) {
    let guard = 0
    for (;;) {
      const start = out.indexOf(open)
      if (start === -1) break
      const end = out.indexOf(close, start + 1)
      if (end === -1) break
      const inside = out.slice(start + 1, end)
      // Giu lai neu la thong tin that (vd. "Remix", "feat. X", "Acoustic")
      out = isNoise(inside) ? out.slice(0, start) + ' ' + out.slice(end + 1) : out
      if (!isNoise(inside)) break
      if (++guard > 12) break
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Bo duoi " - YouTube", " - Spotify"... ma trinh duyet them vao tieu de tab. */
function stripAppSuffix(text: string): string {
  return text
    .replace(/\s*[-–—|]\s*(YouTube|YouTube Music|Spotify|SoundCloud|Vimeo|Zing MP3|NhacCuaTui)\s*$/i, '')
    .trim()
}

/**
 * Bo tung tu rac o hai dau mot doan.
 *
 * "Vũ Cát Tường 4K" -> "Vũ Cát Tường". Cac nhan nay bam vao dau hoac cuoi ten
 * ma khong co dau ngan cach nao, nen buoc loc theo doan o tren khong voi toi.
 *
 * Chi bo o HAI DAU, khong bo o giua: "Anh Là Video Của Em" thi chu o giua la
 * ten bai that. Va luon chua lai it nhat mot tu, khong thi mot bai ten
 * "Karaoke" se bi xoa sach.
 */
function trimNoiseWords(text: string): string {
  let words = text.split(/\s+/).filter(Boolean)
  while (words.length > 1 && isNoise(words[words.length - 1])) words = words.slice(0, -1)
  while (words.length > 1 && isNoise(words[0])) words = words.slice(1)
  return words.join(' ')
}

/** Bo cac cum rac dung roi le, va dau cau thua o hai dau. */
function tidy(text: string): string {
  let out = text
  for (const sep of ['|', '·', '•']) {
    out = out
      .split(sep)
      .filter((part) => !isNoise(part))
      .join(' | ')
  }
  out = out
    .replace(/^[\s\-–—|·•,.:]+/, '')
    .replace(/[\s\-–—|·•,.:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return trimNoiseWords(out)
}

/**
 * Bo ten nghe si ra khoi ten bai neu no bi lap lai o do.
 * So sanh sau khi bo dau nen "SƠN TÙNG M-TP" van khop voi "Sơn Tùng M-TP".
 */
function removeArtistFromTitle(title: string, artist: string): string {
  const needle = normalizeForCompare(artist)
  if (needle.length < 3) return title

  // Cat theo tung doan giua cac dau ngan cach, bo doan nao chinh la ten nghe si
  const kept = title
    .split(/\s+[-–—|~/]\s+/)
    .filter((part) => normalizeForCompare(part) !== needle)
    .join(' - ')

  return tidy(kept)
}

export interface Candidate {
  artist: string
  title: string
  /** Cang cao cang dang thu truoc. */
  weight: number
}

export interface RawNowPlaying {
  title: string
  artist?: string
  album?: string
}

/**
 * Sinh danh sach phuong an (nghe si, ten bai) de thu lan luot.
 *
 * Khong the biet chac ve nao la nghe si: "Sơn Tùng M-TP - Nơi Này Có Anh" va
 * "Nơi Này Có Anh - Sơn Tùng M-TP" deu gap ngoai doi. Nen sinh ca hai chieu,
 * de ben goi tra thu tu phuong an nang nhat tro xuong.
 */
export function candidatesFrom(raw: RawNowPlaying): Candidate[] {
  const cleanedTitle = tidy(stripBrackets(stripAppSuffix(raw.title ?? '')))
  const rawArtist = tidy(stripBrackets(raw.artist ?? ''))

  // Nhieu trinh duyet dat nghe si = ten kenh: "Sơn Tùng M-TP Official"
  const artist = rawArtist.replace(/\s*-?\s*(Official|Topic|VEVO)\s*$/i, '').trim()

  const out: Candidate[] = []
  const seen = new Set<string>()
  const add = (a: string, t: string, weight: number): void => {
    const key = `${normalizeForCompare(a)}|${normalizeForCompare(t)}`
    if (!t.trim() || seen.has(key)) return
    seen.add(key)
    out.push({ artist: a.trim(), title: t.trim(), weight })
  }

  // 1. App khai bao nghe si rieng - dang tin nhat (Spotify, Windows Media Player)
  if (artist) {
    // Ten video thuong lap lai ten nghe si trong chinh no:
    //   "NƠI NÀY CÓ ANH | SƠN TÙNG M-TP"  voi nghe si "Sơn Tùng M-TP"
    // Bo phan trung di thi ten bai gon va tra cung trung hon.
    const withoutArtist = removeArtistFromTitle(cleanedTitle, artist)
    if (withoutArtist && withoutArtist !== cleanedTitle) add(artist, withoutArtist, 110)
    add(artist, cleanedTitle, 100)
  }

  // 2. Tach theo dau ngan cach. Van sinh ca hai chieu de con duong lui,
  //    nhung chieu thuong gap cua chinh dau do duoc thu truoc.
  for (const { sep, artistFirst } of SEPARATORS) {
    if (!cleanedTitle.includes(sep)) continue

    // Ten nhieu doan ("A | B | C"): ghep doan DAU voi doan CUOI, vi phan giua
    // thuong la nhan quang cao (da bi loc bot o buoc tren)
    const parts = cleanedTitle.split(sep).map(tidy).filter(Boolean)
    if (parts.length < 2) continue
    const head = parts[0]
    const tail = parts.at(-1)!

    if (artistFirst) {
      add(head, tail, 80)
      add(tail, head, 60)
    } else {
      add(tail, head, 80)
      add(head, tail, 60)
    }

    // Va tra bang RIENG ten bai, khong kem nghe si.
    //
    // Doan sai ve nghe si khong chi vo ich ma con pha: no bi nem vao cau truy
    // van va lam nguon tra ve thu khac han. Gap that tren may:
    //   "Nhà Tôi Có Treo Một Lá Cờ - Noo Phước Thịnh tại Concert ... Live"
    // ve dau la ten bai dung, nhung ve kia thanh mot chuoi rac dai lam nghe si.
    // Tra bang mot minh ten bai thi sach, va LRCLIB tim theo ten rat kha.
    add('', head, 55)
    add('', tail, 50)
    break
  }

  // 3. Khong tach duoc thi tra bang chinh ten da lam sach, khong co nghe si
  add('', cleanedTitle, 40)

  return out.sort((a, b) => b.weight - a.weight)
}

/**
 * Do giong nhau giua hai ten (0..1), dua tren ti le tu chung.
 * Dung de cham diem ket qua tra ve co dung bai khong.
 *
 * Dung trung binh dieu hoa cua HAI chieu, khong chia cho ben nho hon.
 *
 * Ban dau ham nay chia cho ben nho hon, de "Nơi Này Có Anh" van khop tot voi
 * "Nơi Này Có Anh (Remix)". Nhung no phan tac dung nang: BAT KY ten bai ngan
 * nao nam lot trong mot ten video dai deu duoc cham 1.0.
 *
 * Da sap bay that tren dien thoai: YouTube phat
 *   "Nhà Tôi Có Treo Một Lá Cờ - Noo Phước Thịnh tại Concert 'Tổ Quốc Trong Tim'"
 * va app hien loi bai "Tổ Quốc Trong Tim" - do la TEN CONCERT, khong phai ten
 * bai. Bon tu do deu nam trong ten video nen diem la 4/4 = 1.0.
 *
 * Trung binh dieu hoa doi hoi ca hai ben cung phu nhau:
 *   "Nơi Này Có Anh" vs "... (Remix)"   -> 0,89  nhan
 *   "Tổ Quốc Trong Tim" vs ten dai      -> 0,44  bo
 */
export function titleSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeForCompare(a).split(' ').filter(Boolean))
  const wb = new Set(normalizeForCompare(b).split(' ').filter(Boolean))
  if (!wa.size || !wb.size) return 0

  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  if (!shared) return 0

  const coverA = shared / wa.size
  const coverB = shared / wb.size
  return (2 * coverA * coverB) / (coverA + coverB)
}
