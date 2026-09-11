// Kiem phan GHEP BAI cua cau noi voi ban Android.
//
// `test-saoluu.ts` kiem bo doc dinh dang - chu tron vao, cau truc ra. Bai nay
// kiem phan con lai va la phan de sai am tham hon: ghep bai trong tep voi bai
// trong thu vien may nay, roi ghi vao kho loi tu nhap.
//
// Sai o day khong lam gi bao loi ca. Ghep truot het thi cau bao noi "0 bai" va
// nguoi dung tuong tep hong; ghep bua thi loi bai nay nam duoi ten bai kia.
//
// Chay TRONG tien trinh chinh cua Electron vi kho du lieu dua tren
// `app.getPath('userData')`.
//
//   npm run test:cau
import { app } from 'electron'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

app.setName('Lyra')
const sandbox = mkdtempSync(join(tmpdir(), 'lyra-cau-'))
app.setPath('userData', sandbox)

let failed = 0
const check = (n, ok, d = '') => {
  if (ok) console.log(`  ok  ${n}${d ? `  (${d})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${n}  ${d}`)
  }
}

const bai = (id, artist, title) => ({
  id,
  source: 'file',
  sourceId: id,
  title,
  artist,
  album: '',
  duration: 200
})

// Thu vien gia. Hai bai co trong tep mau, mot bai khong - va ten cua chung
// KHAC DAU, KHAC HOA THUONG so voi ben Android, dung nhu ngoai doi: mot ben
// lay ten tu the ID3 go khong dau, mot ben lay tu LRCLIB co dau.
writeFileSync(
  join(sandbox, 'library.json'),
  JSON.stringify([
    bai('file:a.mp3', 'SON TUNG M-TP', 'chung ta cua hien tai'),
    bai('file:b.mp3', 'Mỹ Tâm', 'Đúng Cũng Thành Sai'),
    bai('file:c.mp3', 'Ai Do', 'Bai khong co trong tep')
  ]),
  'utf8'
)

const mau = readFileSync(join(import.meta.dirname, 'mau-sao-luu.txt'), 'utf8')

// Ban da goi bang esbuild - xem `test:cau` trong package.json. Khong chay
// thang tu `src` duoc vi file do la TypeScript va co dinh `@shared`.
const { nhap, xuat } = await import('../out/main/test-cau.cjs')

try {
  // ---- Lan nhap dau ----
  const k1 = nhap(mau)
  check('khong bao hong voi tep that cua Android', k1.hong === false)
  check('ghep duoc ca hai bai du khac dau khac hoa thuong', k1.them === 2, `them=${k1.them}`)
  check('khong bia ra bai nao khong ghep duoc', k1.khongKhop === 0, `khongKhop=${k1.khongKhop}`)

  // ---- Nhap lai chinh tep ay ----
  // Cong go tay tren may nay khong duoc phep bi de len. Day la ly do ca tinh
  // nang ton tai, nen no phai dung ngay ca khi nguoi dung bam nhap hai lan.
  const k2 = nhap(mau)
  check('nhap lai thi khong ghi de, dem vao "da co"', k2.them === 0 && k2.daCo === 2,
    `them=${k2.them} daCo=${k2.daCo}`)

  // ---- Bai trong tep ma thu vien khong co ----
  const thieu = mau.replace('Đúng Cũng Thành Sai', 'Mot Bai Khong Ai Co')
  const k3 = nhap(thieu)
  check('bai khong co trong thu vien thi dem rieng, khong im lang bo qua',
    k3.khongKhop === 1, `khongKhop=${k3.khongKhop}`)

  // ---- Tep khong phai cua AURA ----
  check('tep la thi bao hong', nhap('mot tep bat ky').hong === true)

  // Tep chi co lich su nghe la tep HOP LE cua AURA, chi la ben nay khong dung
  // duoc gi. Bao hong thi nguoi dung tuong tep hong.
  const k4 = nhap('LYRA-NGHE\t1\n1789\t\t\tSon\tBai A\t1\t2026-09-10 23:33\n')
  check('tep chi co lich su nghe: khong hong, chi la 0 bai',
    k4.hong === false && k4.them === 0)

  // ---- Xuat nguoc ra ----
  const ra = xuat()
  check('xuat ra dung nhan tep gop', ra.startsWith('LYRA-TATCA'))
  check('xuat co phan loi', ra.includes('=== LYRA-LOI'))
  // Ba phan Windows khong dung phai di qua nguyen ven, khong thi mot vong
  // dien thoai -> may tinh -> dien thoai lam mat sach chung.
  check('ba phan kia di qua nguyen ven', ra.includes('=== LYRA-NGHE') &&
    ra.includes('=== LYRA-THICH') && ra.includes('=== LYRA-CANBANG'))
  check('lich su nghe con dung noi dung',
    ra.includes('Chúng Ta Của Hiện Tại') && ra.includes('com.zing.mp3'))

  console.log(failed ? `\n${failed} phep thu hong.` : '\nCau noi sao luu: dat.')
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}

app.exit(failed ? 1 : 0)
