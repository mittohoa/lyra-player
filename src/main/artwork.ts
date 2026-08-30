import { nativeImage } from 'electron'
import { httpGet } from './sources/types'
import { log } from './logger'

/**
 * Lay mau chu dao cua anh bia de nen app doi mau theo bai dang phat.
 *
 * Lam o main process chu khong phai renderer: anh bia den tu CDN cua Zing/NCT/
 * YouTube, ma cac CDN do khong tra header CORS nen renderer khong doc duoc diem
 * anh (canvas bi "nhiem" hoac fetch bi chan). Main process khong bi rang buoc do.
 *
 * Giai ma anh bang `nativeImage` co san cua Electron - khong can them thu vien.
 */

/** Nho ket qua theo URL: mot anh bia chi can tinh mot lan. */
const cache = new Map<string, string>()
const MAX_CACHE = 200

/** RGB -> HSL, de danh gia do tuoi va do sang cua mau. */
function toHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [h * 360, s, l]
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/**
 * Chon mau dai dien: gom cac diem anh vao o mau tho, roi cham diem uu tien
 * mau TUOI va KHONG qua toi/qua sang - nen app can mau co suc song, chu khong
 * phai mau xam trung binh cua ca anh (lay trung binh luon ra mau bun).
 */
function pickDominant(bitmap: Buffer): string {
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>()

  // nativeImage.getBitmap() tra ve BGRA
  for (let i = 0; i < bitmap.length; i += 4) {
    const b = bitmap[i]
    const g = bitmap[i + 1]
    const r = bitmap[i + 2]
    const a = bitmap[i + 3]
    if (a < 128) continue

    const [, s, l] = toHsl(r, g, b)
    if (l < 0.12 || l > 0.92) continue // gan den hoac gan trang - bo
    if (s < 0.12) continue // gan nhu xam - bo

    // O mau tho 32 muc moi kenh: gom cac sac do gan nhau lam mot
    const key = `${r >> 3}|${g >> 3}|${b >> 3}`
    const cur = buckets.get(key)
    if (cur) {
      cur.r += r
      cur.g += g
      cur.b += b
      cur.n++
    } else {
      buckets.set(key, { r, g, b, n: 1 })
    }
  }

  if (!buckets.size) return '#6b6b78' // anh don sac - tra ve mau trung tinh

  let best = { score: -1, hex: '#6b6b78' }
  for (const { r, g, b, n } of buckets.values()) {
    const ar = r / n
    const ag = g / n
    const ab = b / n
    const [, s, l] = toHsl(ar, ag, ab)

    // Nhieu diem anh thi diem cao, nhung mau tuoi duoc uu ai;
    // phat mau qua toi hoac qua sang vi nen app can nhin duoc chu tren do.
    const vividness = s * (1 - Math.abs(l - 0.5) * 1.4)
    const score = Math.sqrt(n) * (0.35 + vividness)
    if (score > best.score) best = { score, hex: toHex(ar, ag, ab) }
  }
  return best.hex
}

/** Tra ve mau chu dao dang '#rrggbb', hoac null neu khong doc duoc anh. */
export async function dominantColor(artworkUrl: string): Promise<string | null> {
  if (!artworkUrl) return null

  const cached = cache.get(artworkUrl)
  if (cached) return cached

  try {
    let buffer: Buffer
    if (artworkUrl.startsWith('data:')) {
      const comma = artworkUrl.indexOf(',')
      buffer = Buffer.from(artworkUrl.slice(comma + 1), 'base64')
    } else {
      const res = await httpGet(artworkUrl, { timeoutMs: 8000 })
      if (!res.ok) return null
      buffer = Buffer.from(await res.arrayBuffer())
    }

    // Thu nho truoc khi doc diem anh: 32x32 la du de biet mau chu dao,
    // ma nhanh hon ca tram lan so voi anh goc.
    const image = nativeImage.createFromBuffer(buffer).resize({ width: 32, height: 32 })
    if (image.isEmpty()) return null

    // electron.d.ts khai getBitmap() tra ve void, nhung thuc te no tra ve Buffer
    // BGRA. Day la loi trong file khai bao kieu cua Electron, khong phai o day.
    const hex = pickDominant(image.getBitmap() as unknown as Buffer)

    if (cache.size >= MAX_CACHE) {
      const oldest = cache.keys().next().value
      if (oldest) cache.delete(oldest)
    }
    cache.set(artworkUrl, hex)
    return hex
  } catch (err) {
    log.debug('ảnh bìa', 'Không lấy được màu chủ đạo của ảnh bìa', err)
    return null
  }
}
