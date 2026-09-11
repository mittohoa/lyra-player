// Kiem tra bo doc/ghi tep sao luu cua AURA Android.
// Chay: node scripts/test-saoluu.ts
//
// Day la cho duy nhat hai ban Android va Windows cham vao nhau, va no cham qua
// mot dinh dang chu tron do ben kia dinh nghia. Doc sai mot cot la mat cong go
// tay cua nguoi dung mot cach im lang - khong loi, khong bao, chi la thieu bai.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  docLoi,
  ghiLoi,
  ghiTatCa,
  khoaGhep,
  loaiTep,
  tachPhan
} from '../src/main/saoluu.ts'

let passed = 0
const check = (name: string, fn: () => void): void => {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

const TAB = '\t'

check('nhan ra tung loai tep', () => {
  assert.equal(loaiTep(`LYRA-TATCA${TAB}1\n`), 'tatca')
  assert.equal(loaiTep(`LYRA-LOI${TAB}1\n`), 'chi-loi')
  assert.equal(loaiTep(`LYRA-NGHE${TAB}1\n`), 'chi-nghe')
  assert.equal(loaiTep('mot tep bat ky\n'), 'khong-biet')
})

check('cat tep gop thanh tung phan', () => {
  const raw = [
    `LYRA-TATCA${TAB}1`,
    '=== LYRA-LOI',
    `LYRA-LOI${TAB}1`,
    '=== LYRA-THICH',
    'lyra://may/1',
    'lyra://may/2',
    ''
  ].join('\n')
  const phan = tachPhan(raw)
  assert.equal(phan['LYRA-THICH'].trim(), 'lyra://may/1\nlyra://may/2')
})

check('cau hat bat dau bang "=== " KHONG cat doi tep gop', () => {
  // Loi bai hat la chu nguoi dung tu go. Mot cau bat dau bang "=== " tung
  // lam bo cat ngoai tuong day la dau mot phan moi: nua sau cua phan loi roi
  // vao mot phan mang ten la chinh cau hat do, va phan lich su nghe nam sau
  // no bien mat khoi ban khoi phuc - khong loi, khong bao.
  const raw = [
    `LYRA-TATCA${TAB}1`,
    '=== LYRA-LOI',
    `LYRA-LOI${TAB}1`,
    `===${TAB}2${TAB}k${TAB}Son${TAB}Bai A`,
    'cau mot',
    '=== day la mot cau hat',
    '=== LYRA-THICH',
    'lyra://may/5',
    ''
  ].join('\n')
  const phan = tachPhan(raw)
  assert.equal(phan['LYRA-THICH'].trim(), 'lyra://may/5')
  assert.ok(!('day la mot cau hat' in phan))
  const cac = docLoi(phan['LYRA-LOI'])
  assert.equal(cac.length, 1)
  assert.equal(cac[0].loi, 'cau mot\n=== day la mot cau hat')
})

check('doc mot khoi loi, dem dung so dong', () => {
  const raw = [
    `LYRA-LOI${TAB}1`,
    `===${TAB}2${TAB}lyra://may/9${TAB}Son${TAB}Bai A`,
    '[00:01.00]cau mot',
    '[00:05.00]cau hai',
    ''
  ].join('\n')
  const cac = docLoi(raw)
  assert.equal(cac.length, 1)
  assert.equal(cac[0].ngheSi, 'Son')
  assert.equal(cac[0].tenBai, 'Bai A')
  assert.equal(cac[0].loi, '[00:01.00]cau mot\n[00:05.00]cau hai')
})

check('mot cau bat dau bang === van nam trong loi, khong cat khoi', () => {
  // Day la ly do dinh dang dem SO DONG thay vi dung dau phan cach. Neu doc sai
  // cho nay thi mot bai loi bi cat lam doi va nua sau bien mat.
  const raw = [
    `LYRA-LOI${TAB}1`,
    `===${TAB}3${TAB}k${TAB}Son${TAB}Bai A`,
    'cau mot',
    '=== khong phai dau khoi',
    'cau ba',
    `===${TAB}1${TAB}k2${TAB}An${TAB}Bai B`,
    'cau cua bai B',
    ''
  ].join('\n')
  const cac = docLoi(raw)
  assert.equal(cac.length, 2)
  assert.equal(cac[0].loi, 'cau mot\n=== khong phai dau khoi\ncau ba')
  assert.equal(cac[1].tenBai, 'Bai B')
})

check('so dong hong khong nuot nhung khoi phia sau', () => {
  const raw = [
    `LYRA-LOI${TAB}1`,
    `===${TAB}999999${TAB}k${TAB}Son${TAB}Bai hong`,
    `===${TAB}1${TAB}k2${TAB}An${TAB}Bai lanh`,
    'cau',
    ''
  ].join('\n')
  const cac = docLoi(raw)
  assert.equal(cac.length, 1)
  assert.equal(cac[0].tenBai, 'Bai lanh')
})

check('ghi roi doc lai ra dung cai vua ghi', () => {
  const goc = [
    { khoa: 'k1', ngheSi: 'Sơn Tùng', tenBai: 'Chúng Ta', loi: 'a\nb\nc' },
    { khoa: 'k2', ngheSi: 'Mỹ Tâm', tenBai: 'Đúng Cũng', loi: 'x' }
  ]
  assert.deepEqual(docLoi(ghiLoi(goc)), goc)
})

check('vong Android -> Windows -> Android khong lam rot ba phan kia', () => {
  // Cho nay la thu de sai nhat trong ca file. Windows khong dung lich su nghe,
  // yeu thich hay can bang am - va "khong dung" rat de thanh "vut di". Nguoi
  // dung mang tep sang may tinh roi mang nguoc ve dien thoai la mat sach.
  const raw = [
    `LYRA-TATCA${TAB}1`,
    '=== LYRA-LOI',
    `LYRA-LOI${TAB}1`,
    `===${TAB}1${TAB}k${TAB}Son${TAB}Bai A`,
    'cau',
    '=== LYRA-NGHE',
    `LYRA-NGHE${TAB}1`,
    `1789${TAB}lyra://may/5${TAB}${TAB}Son${TAB}Bai A${TAB}2${TAB}2026-09-10 23:33`,
    '=== LYRA-THICH',
    'lyra://may/5',
    '=== LYRA-CANBANG',
    'bat=1',
    'mau=2',
    ''
  ].join('\n')

  const phan = tachPhan(raw)
  const giu = { ...phan }
  delete giu['LYRA-LOI']

  const raLai = ghiTatCa(docLoi(phan['LYRA-LOI']), giu)
  const phanLai = tachPhan(raLai)

  assert.equal(phanLai['LYRA-NGHE'].trim(), phan['LYRA-NGHE'].trim())
  assert.equal(phanLai['LYRA-THICH'].trim(), 'lyra://may/5')
  assert.equal(phanLai['LYRA-CANBANG'].trim(), 'bat=1\nmau=2')
  assert.equal(docLoi(phanLai['LYRA-LOI'])[0].tenBai, 'Bai A')
})

check('phan rong khong ghi ra dau khoi trong', () => {
  const ra = ghiTatCa([], { 'LYRA-NGHE': '', 'LYRA-THICH': '   ' })
  assert.ok(!ra.includes('=== LYRA-NGHE'))
  assert.ok(!ra.includes('=== LYRA-THICH'))
})

check('khoa ghep bo dau va khong phan biet hoa thuong', () => {
  assert.equal(khoaGhep('Sơn Tùng', 'Chúng Ta'), khoaGhep('SON TUNG', 'chung ta'))
  assert.equal(khoaGhep('Đàm Vĩnh Hưng', 'Xin Lỗi'), 'dam vinh hung|xin loi')
})

check('khoa ghep gop dau cach thua', () => {
  assert.equal(khoaGhep('  Son   Tung  ', ' Bai   A '), 'son tung|bai a')
})

check('khoa ghep KHONG dung lan bai khac ten', () => {
  // Bo dau manh tay qua thi hai bai khac han nhau doi thanh mot, va nguoi dung
  // thay loi bai nay nam duoi ten bai kia ma khong hieu tai sao.
  assert.notEqual(khoaGhep('Son', 'Mua'), khoaGhep('Son', 'Mua Roi'))
  assert.notEqual(khoaGhep('An', 'Bai A'), khoaGhep('Binh', 'Bai A'))
})

check('khoa ghep giu nguyen chu so', () => {
  // Mot lan sua truoc day suyt nua bo ca chu so cung voi dau. "Bai 2" va
  // "Bai 3" ma cung khoa thi loi nhay lung tung giua hai bai.
  assert.notEqual(khoaGhep('Son', 'Bai 2'), khoaGhep('Son', 'Bai 3'))
  assert.equal(khoaGhep('Son', 'Top 40'), 'son|top 40')
})

check('tep khong phai cua AURA thi khong doc ra gi', () => {
  assert.deepEqual(tachPhan('mot tep bat ky\nnoi dung'), {})
  assert.deepEqual(docLoi(''), [])
})

// ---- Kiem cheo voi tep THAT do ban Android sinh ra ----------------------
//
// `mau-sao-luu.txt` khong go tay: no do `XuatMauSaoLuuTest` ben kho
// lyra-android ghi ra bang chinh bo ghi cua ban Android. Go tay mot tep mau
// nghia la kiem bo doc nay voi thu TA NGHI ben ay ghi ra, chu khong phai thu
// no ghi ra that - va hai thu do da tung khac nhau.
const duongMau = join(import.meta.dirname, 'mau-sao-luu.txt')
if (!existsSync(duongMau)) {
  console.error('  !!  thieu scripts/mau-sao-luu.txt - sinh lai bang:')
  console.error('        cd lyra-android && gradlew :app:testSideloadReleaseUnitTest')
  console.error('        cp app/build/mau-sao-luu.txt ../media-player/scripts/')
  process.exit(1)
}

check('doc duoc tep that do ban Android ghi ra', () => {
  const raw = readFileSync(duongMau, 'utf8')
  assert.equal(loaiTep(raw), 'tatca')

  const phan = tachPhan(raw)
  assert.deepEqual(Object.keys(phan).sort(), [
    'LYRA-CANBANG',
    'LYRA-LOI',
    'LYRA-NGHE',
    'LYRA-THICH'
  ])

  const cac = docLoi(phan['LYRA-LOI'])
  assert.equal(cac.length, 2)
  assert.equal(cac[0].tenBai, 'Chúng Ta Của Hiện Tại')
  // Cau giua bai bat dau bang '===' phai con nguyen trong loi.
  assert.ok(cac[0].loi.includes('=== dòng này KHÔNG phải đầu khối'))
  assert.equal(cac[0].loi.split('\n').length, 3)
  assert.equal(cac[1].ngheSi, 'Mỹ Tâm')

  // Ba phan Windows khong dung van phai toi noi nguyen ven.
  assert.equal(phan['LYRA-THICH'].trim(), 'lyra://may/1000005468')
  assert.equal(phan['LYRA-CANBANG'].trim(), 'bat=1\nmau=2')
  assert.equal(phan['LYRA-NGHE'].trim().split('\n').length, 3)
})

console.log(`\n${passed} bai kiem, khong bai nao hong.`)
