/**
 * Vẽ một câu hát thành một tấm ảnh chia sẻ được.
 *
 * Vẽ bằng `<canvas>` chứ không chụp lại giao diện, và đó là chủ ý: MỘT hàm duy
 * nhất dựng cả tấm xem trước lẫn file xuất ra, nên thứ người dùng nhìn thấy
 * đúng là thứ được gửi đi. Chụp màn hình thì tấm ảnh phụ thuộc cỡ cửa sổ, mật
 * độ điểm ảnh và cả nền phía sau — mỗi máy một kiểu.
 *
 * Sáu mẫu khác nhau về BỐ CỤC chứ không phải bộ màu: một câu hát dữ dội và một
 * câu hát buồn không nên trông như nhau.
 *
 * Số đo lấy đúng từ bản Android (`share/TheLoi.kt`) để hai bên ra cùng một tấm
 * thẻ — người dùng chia sẻ từ điện thoại hay từ máy tính đều nhận ra là AURA.
 */

export type MaMau = 'giay' | 'bia-mo' | 'bia-tren' | 'chu-lon' | 'khoi-mau' | 'ke-dong'

export interface Mau {
  ma: MaMau
  nhan: string
  moTa: string
  /** Mẫu này có cần ảnh bìa không — không có bìa thì đừng bày ra. */
  canBia: boolean
}

export const MAU_THE: Mau[] = [
  { ma: 'giay', nhan: 'Trang giấy', moTa: 'Nền giấy, lề mực màu bìa — dáng mặc định của AURA', canBia: false },
  { ma: 'bia-mo', nhan: 'Bìa mờ', moTa: 'Ảnh bìa nhoè phủ kín, chữ nổi lên trên', canBia: true },
  { ma: 'bia-tren', nhan: 'Bìa trên', moTa: 'Ảnh bìa vuông ở trên, lời ở dưới như một trang sách', canBia: true },
  { ma: 'chu-lon', nhan: 'Chữ lớn', moTa: 'Bỏ hết trang trí, chỉ còn câu hát thật to', canBia: false },
  { ma: 'khoi-mau', nhan: 'Khối màu', moTa: 'Nền đặc màu lấy từ bìa, chữ ngà nổi lên', canBia: false },
  { ma: 'ke-dong', nhan: 'Kẻ dòng', moTa: 'Chữ nằm trên dòng kẻ như trang vở', canBia: false }
]

/** 4:5 — tỉ lệ dọc mà mọi chỗ đăng ảnh đều nhận, và đọc chữ thoải mái. */
export const RONG = 1080
export const CAO = 1350

/** Dòng ở góc dưới. Giữ nguyên trên cả sáu mẫu. */
const THUONG_HIEU = 'AURA by #mittoHOA'

const LE = 16
const TRAI = 104
const PHAI = 88

const CO_CHAN = "'Segoe UI Variable Display', 'Segoe UI', Georgia, serif"
const KHONG_CHAN = "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"

export interface ThamSoThe {
  cauHat: string
  tenBai: string
  caSi: string
  /** Màu nhấn, lấy từ ảnh bìa. Dạng `#rrggbb`. */
  mauNhan: string
  laGiay: boolean
  mau: MaMau
  bia?: HTMLImageElement | null
}

// ---- màu ------------------------------------------------------------------

const nenGiay = (laGiay: boolean): string => (laGiay ? '#FBF6EC' : '#13110D')
const mucGiay = (laGiay: boolean): string => (laGiay ? '#191510' : '#F6F1E6')

function doc(mau: string): [number, number, number] {
  const m = mau.replace('#', '')
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]
}

/** Trộn `tren` lên `duoi` với độ đục `a`, trả về một màu ĐẶC. */
export function pha(tren: string, duoi: string, a: number): string {
  const [r1, g1, b1] = doc(tren)
  const [r2, g2, b2] = doc(duoi)
  const t = (x: number, y: number): number => Math.round(x * a + y * (1 - a))
  return `rgb(${t(r1, r2)}, ${t(g1, g2)}, ${t(b1, b2)})`
}

/** Ép một màu về đủ tối để chữ ngà nổi lên trên. */
function epToi(mau: string): string {
  const [r, g, b] = doc(mau)
  const sang = (r * 299 + g * 587 + b * 114) / 1000
  if (sang <= 96) return `rgb(${r}, ${g}, ${b})`
  const k = 96 / sang
  return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`
}

// ---- chữ ------------------------------------------------------------------

/** Cắt câu hát thành các dòng vừa bề ngang cho trước. */
function xuongDong(c: CanvasRenderingContext2D, chu: string, rong: number): string[] {
  const dong: string[] = []
  for (const doanTho of chu.split('\n')) {
    let hienTai = ''
    for (const tu of doanTho.split(/\s+/).filter(Boolean)) {
      const thu = hienTai ? hienTai + ' ' + tu : tu
      if (c.measureText(thu).width <= rong || !hienTai) hienTai = thu
      else {
        dong.push(hienTai)
        hienTai = tu
      }
    }
    dong.push(hienTai)
  }
  return dong
}

/**
 * Tìm cỡ chữ lớn nhất mà khối chữ vẫn nằm gọn trong khung.
 *
 * Thu dần chứ không tính thẳng: bề rộng chữ phụ thuộc mặt chữ và từng ký tự,
 * không có công thức nào đoán đúng được — phải đo thật rồi thử lại.
 */
function coVua(
  c: CanvasRenderingContext2D,
  chu: string,
  font: string,
  rong: number,
  coDau: number,
  caoToiDa: number
): { dong: string[]; co: number; caoDong: number } {
  let co = coDau
  for (;;) {
    c.font = `${co}px ${font}`
    const dong = xuongDong(c, chu, rong)
    const caoDong = co * 1.32
    if (dong.length * caoDong <= caoToiDa || co <= 30) {
      return { dong, co, caoDong }
    }
    co -= 3
  }
}

function veKhoi(
  c: CanvasRenderingContext2D,
  dong: string[],
  x: number,
  y: number,
  caoDong: number
): void {
  dong.forEach((d, i) => c.fillText(d, x, y + caoDong * (i + 0.78)))
}

function veThuongHieu(c: CanvasRenderingContext2D, mau: string): void {
  c.font = `25px ${KHONG_CHAN}`
  c.fillStyle = mau
  c.textAlign = 'right'
  c.fillText(THUONG_HIEU, RONG - PHAI, CAO - 62)
  c.textAlign = 'left'
}

function veTen(
  c: CanvasRenderingContext2D,
  tenBai: string,
  caSi: string,
  x: number,
  y: number,
  muc: string,
  nen: string
): void {
  c.font = `34px ${CO_CHAN}`
  c.fillStyle = muc
  c.fillText(tenBai, x, y)
  if (caSi.trim()) {
    c.font = `26px ${KHONG_CHAN}`
    c.fillStyle = pha(muc, nen, 0.55)
    c.fillText(caSi, x, y + 42)
  }
}

// ---- sáu mẫu --------------------------------------------------------------

function veGiay(c: CanvasRenderingContext2D, t: ThamSoThe, keDong: boolean): void {
  const nen = nenGiay(t.laGiay)
  const muc = mucGiay(t.laGiay)
  c.fillStyle = nen
  c.fillRect(0, 0, RONG, CAO)

  const doc = c.createLinearGradient(0, 0, 0, CAO)
  doc.addColorStop(0, pha(t.mauNhan, nen, 0.92))
  doc.addColorStop(1, pha(t.mauNhan, nen, 0.3))
  c.fillStyle = doc
  c.fillRect(0, 0, LE, CAO)

  const rong = RONG - TRAI - PHAI
  const { dong, co, caoDong } = coVua(c, t.cauHat, CO_CHAN, rong, 88, 620)
  const cao = dong.length * caoDong
  const chuY = (CAO - cao) / 2 - 90

  if (keDong) {
    // Nét kẻ chạy theo đúng nhịp dòng của khối chữ, không phải một lưới kẻ sẵn
    // rồi thả chữ lên trên.
    c.strokeStyle = pha(muc, nen, 0.14)
    c.lineWidth = 2
    for (let i = 0; i < dong.length; i++) {
      const y = chuY + caoDong * (i + 1) - 6
      c.beginPath()
      c.moveTo(TRAI, y)
      c.lineTo(RONG - PHAI, y)
      c.stroke()
    }
  }

  c.font = `${co}px ${CO_CHAN}`
  c.fillStyle = muc
  veKhoi(c, dong, TRAI, chuY, caoDong)

  let y = chuY + cao + 78
  c.fillStyle = t.mauNhan
  c.fillRect(TRAI, y, 104, 6)
  y += 58
  veTen(c, t.tenBai, t.caSi, TRAI, y, muc, nen)
  veThuongHieu(c, pha(muc, nen, 0.34))
}

/** Chữ lớn — bỏ hết trang trí, câu hát chiếm gần cả tấm. */
function veChuLon(c: CanvasRenderingContext2D, t: ThamSoThe): void {
  const nen = nenGiay(t.laGiay)
  const muc = mucGiay(t.laGiay)
  c.fillStyle = nen
  c.fillRect(0, 0, RONG, CAO)

  const rong = RONG - PHAI * 2
  // Cho phép to hơn hẳn mẫu khác và chiếm cao hơn: ở đây câu hát là tất cả.
  const { dong, co, caoDong } = coVua(c, t.cauHat, CO_CHAN, rong, 132, 900)
  const chuY = (CAO - dong.length * caoDong) / 2 - 60

  c.font = `${co}px ${CO_CHAN}`
  c.fillStyle = muc
  veKhoi(c, dong, PHAI, chuY, caoDong)

  c.font = `26px ${KHONG_CHAN}`
  c.fillStyle = pha(muc, nen, 0.46)
  const ten = t.caSi.trim() ? `${t.tenBai} · ${t.caSi}` : t.tenBai
  c.fillText(ten.toUpperCase(), PHAI, CAO - 130)
  veThuongHieu(c, pha(muc, nen, 0.34))
}

/** Khối màu — nền đặc màu lấy từ bìa, chữ ngà nổi lên. */
function veKhoiMau(c: CanvasRenderingContext2D, t: ThamSoThe): void {
  const nen = epToi(t.mauNhan)
  const muc = '#F6F1E6'
  c.fillStyle = nen
  c.fillRect(0, 0, RONG, CAO)

  const rong = RONG - TRAI - PHAI
  const { dong, co, caoDong } = coVua(c, t.cauHat, CO_CHAN, rong, 92, 640)
  const cao = dong.length * caoDong
  const chuY = (CAO - cao) / 2 - 80

  c.font = `${co}px ${CO_CHAN}`
  c.fillStyle = muc
  veKhoi(c, dong, TRAI, chuY, caoDong)

  let y = chuY + cao + 76
  c.fillStyle = `rgb(246, 241, 230)`
  c.fillRect(TRAI, y, 104, 6)
  y += 58
  veTen(c, t.tenBai, t.caSi, TRAI, y, muc, nen)
  veThuongHieu(c, 'rgb(246, 241, 230)')
}

/** Bìa mờ — ảnh bìa nhoè phủ kín, chữ nổi lên trên. */
function veBiaMo(c: CanvasRenderingContext2D, t: ThamSoThe, bia: HTMLImageElement): void {
  // Phóng to rồi làm nhoè: ảnh bìa thường chỉ 500-600px, kéo thẳng lên 1080 là
  // thấy rõ điểm ảnh. Nhoè xong thì không ai nhận ra nữa.
  c.save()
  c.filter = 'blur(28px) brightness(0.52)'
  const canh = Math.max(RONG, CAO) * 1.25
  c.drawImage(bia, (RONG - canh) / 2, (CAO - canh) / 2, canh, canh)
  c.restore()

  // Phủ thêm một lớp tối dần xuống dưới, để chữ và dòng thương hiệu luôn đọc
  // được dù ảnh bìa sáng tới đâu.
  const phu = c.createLinearGradient(0, 0, 0, CAO)
  phu.addColorStop(0, 'rgba(0, 0, 0, 0.28)')
  phu.addColorStop(1, 'rgba(0, 0, 0, 0.62)')
  c.fillStyle = phu
  c.fillRect(0, 0, RONG, CAO)

  const muc = '#F6F1E6'
  const rong = RONG - TRAI - PHAI
  const { dong, co, caoDong } = coVua(c, t.cauHat, CO_CHAN, rong, 88, 620)
  const cao = dong.length * caoDong
  const chuY = (CAO - cao) / 2 - 80

  c.font = `${co}px ${CO_CHAN}`
  c.fillStyle = muc
  veKhoi(c, dong, TRAI, chuY, caoDong)

  let y = chuY + cao + 76
  c.fillStyle = t.mauNhan
  c.fillRect(TRAI, y, 104, 6)
  y += 58
  veTen(c, t.tenBai, t.caSi, TRAI, y, muc, '#000000')
  veThuongHieu(c, 'rgba(246, 241, 230, 0.72)')
}

/** Bìa trên — ảnh bìa vuông ở trên, lời ở dưới như một trang sách. */
function veBiaTren(c: CanvasRenderingContext2D, t: ThamSoThe, bia: HTMLImageElement): void {
  const nen = nenGiay(t.laGiay)
  const muc = mucGiay(t.laGiay)
  c.fillStyle = nen
  c.fillRect(0, 0, RONG, CAO)

  // Bìa vuông chiếm nửa trên, cắt giữa để không méo
  const caoBia = 640
  const canh = Math.min(bia.width, bia.height)
  c.drawImage(
    bia,
    (bia.width - canh) / 2,
    (bia.height - canh) / 2,
    canh,
    canh,
    0,
    0,
    RONG,
    caoBia
  )

  const rong = RONG - TRAI - PHAI
  const { dong, co, caoDong } = coVua(c, t.cauHat, CO_CHAN, rong, 66, 330)
  const chuY = caoBia + 96

  c.font = `${co}px ${CO_CHAN}`
  c.fillStyle = muc
  veKhoi(c, dong, TRAI, chuY, caoDong)

  let y = chuY + dong.length * caoDong + 64
  c.fillStyle = t.mauNhan
  c.fillRect(TRAI, y, 104, 6)
  y += 54
  veTen(c, t.tenBai, t.caSi, TRAI, y, muc, nen)
  veThuongHieu(c, pha(muc, nen, 0.34))
}

// ---- cửa vào --------------------------------------------------------------

export function veTheLoi(c: CanvasRenderingContext2D, t: ThamSoThe): void {
  c.clearRect(0, 0, RONG, CAO)
  c.textBaseline = 'alphabetic'
  c.textAlign = 'left'

  // Mẫu cần bìa mà không có bìa thì lùi về mẫu mặc định, đừng vẽ ra một tấm thẻ
  // trống hoác.
  const canBia = MAU_THE.find((m) => m.ma === t.mau)?.canBia ?? false
  const thuc: MaMau = canBia && !t.bia ? 'giay' : t.mau

  switch (thuc) {
    case 'ke-dong':
      veGiay(c, t, true)
      break
    case 'chu-lon':
      veChuLon(c, t)
      break
    case 'khoi-mau':
      veKhoiMau(c, t)
      break
    case 'bia-mo':
      veBiaMo(c, t, t.bia as HTMLImageElement)
      break
    case 'bia-tren':
      veBiaTren(c, t, t.bia as HTMLImageElement)
      break
    default:
      veGiay(c, t, false)
  }
}
