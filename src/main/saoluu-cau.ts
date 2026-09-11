import { dialog } from 'electron'
import { promises as fs } from 'node:fs'
import type { KetQuaNhapSaoLuu, Track } from '@shared/types'
import { log } from './logger'
import { libraryStore, manualLyricsStore } from './store'
import {
  BanLoi,
  docLoi,
  ghiTatCa,
  khoaGhep,
  loaiTep,
  NHAN_LOI,
  tachPhan
} from './saoluu'

/**
 * Cau noi giua tep sao luu cua AURA Android va kho loi tu nhap ben Windows.
 *
 * VI SAO CHI CO LOI TU NHAP. Ben Windows khong co lich su nghe, khong co danh
 * sach yeu thich, khong co can bang am - khong co CHO ma cat ba thu do. Doc ra
 * roi vut di thi te hon la khong doc: nguoi dung se tuong da chuyen xong.
 *
 * Nhung ba phan ay KHONG BI MAT khi di qua day. [nhap] giu nguyen van chung,
 * va [xuat] ghi tra lai du - nen mot vong dien thoai -> may tinh -> dien thoai
 * khong lam rot gi. Thieu cho nay thi chinh viec sao luu tro thanh viec mat du
 * lieu, dung kieu hong tram lang nhat.
 *
 * GHEP THEO NGHE SI + TEN. Khoa ben Android la dia chi phat tren may do, ben
 * nay la duong dan file - hai thu khong bao gio trung. Bai nao trong tep ma
 * thu vien ben nay khong co thi BO QUA chu khong tao mot muc mo coi: mot ban
 * loi khong gan voi bai nao thi khong bao gio hien ra, va no chi ngoi do lam
 * phong con so.
 */

/** Ba phan Windows khong dung, giu lai de con ghi tra. */
let phanGiuLai: Record<string, string> = {}


/**
 * Doc mot tep sao luu vao kho loi tu nhap.
 *
 * KHONG GHI DE ban loi da co. Nguoi dung go tay tren may tinh roi chuyen tu
 * dien thoai sang ma ben kia de len la mat cong vua go - ma cong go tay chinh
 * la thu ca viec nay sinh ra de giu.
 */
export function nhap(raw: string): KetQuaNhapSaoLuu {
  const loai = loaiTep(raw)
  if (loai === 'khong-biet' || loai === 'chi-nghe') {
    // `chi-nghe` la tep hop le cua AURA, chi la trong do khong co gi ben nay
    // dung duoc. Bao hong thi nguoi dung tuong tep hong; bao 0 bai thi ho
    // hieu dung - nen tra ve so 0 chu khong phai co hong.
    return { them: 0, daCo: 0, khongKhop: 0, hong: loai === 'khong-biet' }
  }

  let phanLoi: string
  if (loai === 'tatca') {
    const phan = tachPhan(raw)
    phanGiuLai = { ...phan }
    delete phanGiuLai[NHAN_LOI]
    phanLoi = phan[NHAN_LOI] ?? ''
  } else {
    phanGiuLai = {}
    phanLoi = raw
  }

  const cac = docLoi(phanLoi)
  if (!cac.length) return { them: 0, daCo: 0, khongKhop: 0, hong: false }

  const theoKhoa = new Map<string, Track>()
  for (const t of libraryStore.get()) {
    const k = khoaGhep(t.artist, t.title)
    // Bai dau tien thang: thu vien co the co hai ban cua cung mot bai, va
    // chon ban nao cung la doan mo. Lay ban dau thi it ra no on dinh giua
    // hai lan nhap.
    if (!theoKhoa.has(k)) theoKhoa.set(k, t)
  }

  const kho = { ...manualLyricsStore.get() }
  let them = 0
  let daCo = 0
  let khongKhop = 0

  for (const b of cac) {
    const t = theoKhoa.get(khoaGhep(b.ngheSi, b.tenBai))
    if (!t) {
      khongKhop++
      continue
    }
    if (kho[t.id] !== undefined) {
      daCo++
      continue
    }
    kho[t.id] = b.loi
    them++
  }

  if (them > 0) manualLyricsStore.set(kho)
  log.info('saoluu', `nhap: them=${them} daCo=${daCo} khongKhop=${khongKhop}`)
  return { them, daCo, khongKhop, hong: false }
}

/**
 * Dung mot tep sao luu tu kho loi tu nhap ben nay.
 *
 * Ghi kem ba phan da doc vao tu lan nhap gan nhat - xem ghi chu dau file.
 */
export function xuat(): string {
  const thuVien = new Map(libraryStore.get().map((t) => [t.id, t]))
  const cac: BanLoi[] = []
  for (const [id, loi] of Object.entries(manualLyricsStore.get())) {
    const t = thuVien.get(id)
    // Khong con trong thu vien thi khong biet ten bai lan nghe si, ma thieu
    // hai thu do thi ben Android khong ghep duoc vao dau ca. Ghi ra mot muc
    // khong ai nhan duoc chi lam tep to them.
    if (!t) continue
    cac.push({ khoa: id, ngheSi: t.artist, tenBai: t.title, loi })
  }
  return ghiTatCa(cac, phanGiuLai)
}

/** Mo hop chon tep rồi doc. `null` khi nguoi dung bam huy. */
export async function chonVaNhap(): Promise<KetQuaNhapSaoLuu | null> {
  const r = await dialog.showOpenDialog({
    title: 'Chon tep sao luu cua AURA',
    filters: [{ name: 'Tep sao luu AURA', extensions: ['txt'] }],
    properties: ['openFile']
  })
  if (r.canceled || !r.filePaths[0]) return null
  const raw = await fs.readFile(r.filePaths[0], 'utf8')
  return nhap(raw)
}

/** Mo hop luu tep rồi ghi. `null` khi nguoi dung bam huy. */
export async function chonVaXuat(): Promise<string | null> {
  const homNay = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const r = await dialog.showSaveDialog({
    title: 'Luu ban sao luu AURA',
    defaultPath: `aura-sao-luu-${homNay}.txt`,
    filters: [{ name: 'Tep sao luu AURA', extensions: ['txt'] }]
  })
  if (r.canceled || !r.filePath) return null
  await fs.writeFile(r.filePath, xuat(), 'utf8')
  return r.filePath
}
