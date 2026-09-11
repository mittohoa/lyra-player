/**
 * Doc va ghi tep sao luu cua AURA Android.
 *
 * VI SAO CAN. Hai ban da di lech nhau gan mot nam va khong chia nhau mot byte
 * nao. Ai go tay loi mot bai tren dien thoai roi mo may tinh len thi go lai tu
 * dau — cong do ay la thu ton nhieu phut nhat trong ca app, va no ket lai trong
 * dung mot lan cai dat.
 *
 * Tep sao luu cua Android da la chu tron, da doc duoc bang mat, va da co san
 * ben ay. Khong can dung mot duong dong bo nao, khong can tai khoan, khong can
 * may chu: nguoi dung chep mot tep qua, the la xong.
 *
 * DINH DANG — dung y ben Android, xem `SaoLuuTatCa.kt` va `SaoLuuLoi.kt`:
 *
 *     LYRA-TATCA  1
 *     === LYRA-LOI
 *     LYRA-LOI  1
 *     ===  24  <khoa>  <nghe si>  <ten bai>
 *     [00:12.30]cau thu nhat
 *     ... dung 24 dong ...
 *     === LYRA-NGHE
 *     ...
 *
 * Cac cot cach nhau bang TAB. Dong `===` trong phan loi ghi SO DONG cua khoi
 * ngay sau no chu khong dung dau phan cach — loi bai hat la chu nguoi dung tu
 * go, va khong ai cam duoc mot cau bat dau bang "===".
 *
 * GHEP BAI THEO NGHE SI + TEN, KHONG THEO KHOA. Khoa ben Android la dia chi
 * phat tren may do (`lyra://may/1000005468`); ben nay khoa la duong dan file.
 * Hai thu khong bao gio trung nhau, nen thu duy nhat hai ben cung hieu la ten
 * bai va ten nghe si. Ghep kieu ay co the truot — hai ban thu khac nhau cua
 * cung mot bai chi la mot — va do la danh doi co y: thieu mot bai loi thi go
 * lai duoc, con ghep sai thi nguoi dung khong hieu chuyen gi xay ra.
 *
 * BEN NAY CHI DUNG PHAN LOI. Lich su nghe, yeu thich va can bang am la thu
 * Windows khong co cho de cat; doc ra roi vut di thi thanh ra noi doi. Nhung
 * tep van duoc DOC NGUYEN VEN va ghi lai du ca bon phan khi xuat, de mot vong
 * Android -> Windows -> Android khong lam rot mat ba phan kia.
 */

export const NHAN_TATCA = 'LYRA-TATCA'
export const NHAN_LOI = 'LYRA-LOI'
export const NHAN_NGHE = 'LYRA-NGHE'
export const NHAN_THICH = 'LYRA-THICH'
export const NHAN_CANBANG = 'LYRA-CANBANG'

/** Ten cac phan hop le. Ngoai danh sach nay thi chi la mot dong chu. */
const CAC_PHAN = new Set([NHAN_LOI, NHAN_NGHE, NHAN_THICH, NHAN_CANBANG])

export interface BanLoi {
  /** Khoa ben may nguon. Giu nguyen de con ghi tra lai. */
  khoa: string
  ngheSi: string
  tenBai: string
  /** Noi dung .lrc, con nguyen xuong dong. */
  loi: string
}

export type LoaiTep = 'tatca' | 'chi-loi' | 'chi-nghe' | 'khong-biet'

/** Tep dang cam la loai nao. */
export function loaiTep(raw: string): LoaiTep {
  const dong = raw.trimStart().split('\n', 1)[0] ?? ''
  if (dong.startsWith(NHAN_TATCA)) return 'tatca'
  if (dong.startsWith(NHAN_LOI)) return 'chi-loi'
  if (dong.startsWith(NHAN_NGHE)) return 'chi-nghe'
  return 'khong-biet'
}

/**
 * Cat tep gop thanh tung phan.
 *
 * Phan nao khong co thi tra chuoi rong — tep cua mot may chua nhap loi nao van
 * hop le, chi la phan loi trong.
 */
export function tachPhan(raw: string): Record<string, string> {
  const dong = raw.replace(/\r\n/g, '\n').split('\n')
  if (!dong.length || !dong[0].startsWith(NHAN_TATCA)) return {}

  const ra: Record<string, string[]> = {}
  let hien: string[] | null = null
  for (let i = 1; i < dong.length; i++) {
    const d = dong[i]
    const ten = d.startsWith('=== ') ? d.slice(4).trim() : ''
    // CHI NHAN DUNG BON TEN PHAN, khong nhan moi dong mo dau bang "=== ".
    //
    // Loi bai hat la chu NGUOI DUNG TU GO, va khong co gi cam mot cau bat dau
    // bang "=== ". Nhan bua thi mot cau nhu the cat doi tep ngay giua phan
    // loi: nua sau roi vao mot phan mang ten la chinh cau hat do, va moi thu
    // sau no bien mat khoi ban khoi phuc. Ben Android sua cung luc - xem
    // `SaoLuuTatCa.tach`.
    if (ten && CAC_PHAN.has(ten)) {
      if (!ra[ten]) ra[ten] = []
      hien = ra[ten]
      continue
    }
    if (hien) hien.push(d)
  }

  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(ra)) out[k] = v.join('\n')
  return out
}

/**
 * Doc phan loi.
 *
 * Doc duoc bao nhieu thi lay bay nhieu: mot khoi hong o giua khong duoc phep
 * lam mat nhung khoi con lai — nguoi dung dang o dung luc can nhat.
 */
export function docLoi(phan: string): BanLoi[] {
  const dong = phan.replace(/\r\n/g, '\n').split('\n')
  if (!dong.length) return []

  // Tep chi-loi co dong nhan o dau; phan cat ra tu tep gop thi khong. Nhan ca
  // hai chu khong bat ben goi phai biet minh dang dua vao cai nao.
  let i = dong[0].startsWith(NHAN_LOI) ? 1 : 0

  const ra: BanLoi[] = []
  while (i < dong.length) {
    const d = dong[i]
    if (!d.startsWith('===')) {
      i++
      continue
    }

    const cot = d.split('\t')
    const soDong = Number.parseInt((cot[1] ?? '').trim(), 10)
    // Chan ca so am lan so to hon ca tep: mot con so hong khong duoc phep nuot
    // not nhung khoi con lai phia sau.
    if (!Number.isFinite(soDong) || soDong <= 0 || soDong > dong.length) {
      i++
      continue
    }

    const loi = dong.slice(i + 1, i + 1 + soDong).join('\n')
    ra.push({
      khoa: cot[2] ?? '',
      ngheSi: cot[3] ?? '',
      tenBai: cot[4] ?? '',
      loi
    })
    i += 1 + soDong
  }
  return ra
}

/** Ghi phan loi, dung dinh dang ben Android doc duoc. */
export function ghiLoi(cac: BanLoi[]): string {
  let ra = `${NHAN_LOI}\t1\n`
  for (const b of cac) {
    const dong = b.loi.replace(/\n+$/, '').split('\n')
    ra += `===\t${dong.length}\t${don(b.khoa)}\t${don(b.ngheSi)}\t${don(b.tenBai)}\n`
    ra += `${dong.join('\n')}\n`
  }
  return ra
}

/**
 * Dung lai mot tep gop.
 *
 * [giu] la cac phan doc duoc tu tep nguon. Ba phan Windows khong dung —
 * lich su nghe, yeu thich, can bang am — di qua nguyen ven, nen mot vong
 * Android -> Windows -> Android khong lam rot mat gi.
 */
export function ghiTatCa(loi: BanLoi[], giu: Record<string, string> = {}): string {
  let ra = `${NHAN_TATCA}\t1\n`
  ra += `=== ${NHAN_LOI}\n${ghiLoi(loi)}`
  for (const ten of [NHAN_NGHE, NHAN_THICH, NHAN_CANBANG]) {
    const p = giu[ten]
    if (p === undefined || p.trim() === '') continue
    ra += `=== ${ten}\n${p.replace(/\n+$/, '')}\n`
  }
  return ra
}

/**
 * Khoa ghep bai giua hai may: nghe si + ten, da don.
 *
 * Bo dau cach thua, ha chu thuong, va bo dau tieng Viet. Bo dau la vi mot ben
 * co the lay ten bai tu the ID3 go khong dau con ben kia lay tu LRCLIB co dau
 * — cung mot bai ma khong ghep duoc thi ca viec nay thanh vo nghia.
 */
export function khoaGhep(ngheSi: string, tenBai: string): string {
  return `${don2(ngheSi)}|${don2(tenBai)}`
}

function don2(s: string): string {
  // SO MA KY TU CHU KHONG DUNG BIEU THUC CHINH QUY.
  //
  // Dai dau ket hop nam o U+0300..U+036F, va viet no vao mot lop ky tu thi
  // trong ma nguon chi la mot cho trong nhin khong ra - trinh soan nao cung
  // co the nuot mat, va nuot roi thi ham nay lang le thoi khong bo dau nua.
  // So bang so thi doc ra ngay va khong hong duoc.
  let ra = ''
  for (const c of s.normalize('NFD')) {
    const m = c.codePointAt(0) ?? 0
    if (m >= 0x0300 && m <= 0x036f) continue
    // d gach ngang khong tach ra duoi NFD nen phai thay rieng.
    ra += m === 0x0111 || m === 0x0110 ? 'd' : c
  }
  // Gop dau cach thua. Chi can lo dau cach thuong: tab la dau cot cua chinh
  // dinh dang nay nen khong bao gio nam trong mot o, va `don` da thay no
  // bang dau cach truoc khi ghi.
  return ra.toLowerCase().split(' ').filter(Boolean).join(' ')
}

function don(s: string): string {
  return s.replace(/\t/g, ' ').replace(/\n/g, ' ').trim()
}
