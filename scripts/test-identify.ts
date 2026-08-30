// Kiem tra bo doan ten bai / nghe si tu chuoi tho ma app khac khai bao.
// Cac chuoi duoi day lay tu ten video that tren YouTube.
//
//   node scripts/test-identify.ts
import assert from 'node:assert/strict'
import { candidatesFrom, titleSimilarity } from '../src/main/lyrics/identify.ts'

let passed = 0
const check = (name: string, fn: () => void): void => {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

/** Co phuong an nao khop cap (nghe si, ten bai) mong doi khong. */
const has = (
  list: { artist: string; title: string }[],
  artist: string,
  title: string
): boolean =>
  list.some(
    (c) =>
      titleSimilarity(c.artist, artist) >= 0.99 && titleSimilarity(c.title, title) >= 0.99
  )

check('boc "| OFFICIAL MUSIC VIDEO |" giua ten', () => {
  const c = candidatesFrom({ title: 'NƠI NÀY CÓ ANH | OFFICIAL MUSIC VIDEO | SƠN TÙNG M-TP' })
  assert.ok(has(c, 'SƠN TÙNG M-TP', 'NƠI NÀY CÓ ANH'), JSON.stringify(c.slice(0, 3)))
})

check('boc ngoac quang cao va duoi " - YouTube"', () => {
  const c = candidatesFrom({
    title: 'Hà Anh Tuấn - Nhà Tôi Có Treo Một Lá Cờ (Official Lyric Video) - YouTube'
  })
  assert.ok(has(c, 'Hà Anh Tuấn', 'Nhà Tôi Có Treo Một Lá Cờ'), JSON.stringify(c.slice(0, 3)))
})

check('boc ngoac kieu Nhat va duoi 4K', () => {
  const c = candidatesFrom({ title: '【MV】Bó Hoa - Vũ Cát Tường「Lyrics Video」4K' })
  assert.ok(has(c, 'Vũ Cát Tường', 'Bó Hoa'), JSON.stringify(c.slice(0, 3)))
})

check('bo duoi "Official" trong ten kenh', () => {
  const c = candidatesFrom({
    title: 'NƠI NÀY CÓ ANH',
    artist: 'Sơn Tùng M-TP Official'
  })
  assert.equal(c[0].artist, 'Sơn Tùng M-TP')
  assert.equal(c[0].title, 'NƠI NÀY CÓ ANH')
})

check('bo duoi "- Topic" ma YouTube Music them vao', () => {
  const c = candidatesFrom({ title: 'Chúng Ta Của Hiện Tại', artist: 'Sơn Tùng M-TP - Topic' })
  assert.equal(c[0].artist, 'Sơn Tùng M-TP')
})

check('nghe si tu app duoc uu tien cao nhat', () => {
  const c = candidatesFrom({ title: 'A - B', artist: 'Nghệ Sĩ Thật' })
  assert.equal(c[0].artist, 'Nghệ Sĩ Thật', 'phuong an dau phai dung nghe si app khai bao')
  assert.ok(c.length > 1, 'van phai co phuong an du phong tu viec tach ten')
})

check('sinh ca hai chieu nghe si/ten bai', () => {
  const c = candidatesFrom({ title: 'Sơn Tùng M-TP - Nơi Này Có Anh' })
  assert.ok(has(c, 'Sơn Tùng M-TP', 'Nơi Này Có Anh'), 'chieu thuan')
  assert.ok(has(c, 'Nơi Này Có Anh', 'Sơn Tùng M-TP'), 'chieu nguoc')
  // Chieu thuan phai duoc thu truoc
  const iThuan = c.findIndex((x) => titleSimilarity(x.artist, 'Sơn Tùng M-TP') >= 0.99)
  const iNguoc = c.findIndex((x) => titleSimilarity(x.title, 'Sơn Tùng M-TP') >= 0.99)
  assert.ok(iThuan < iNguoc, 'chieu "nghe si - ten bai" phai duoc uu tien')
})

check('GIU lai ngoac mang thong tin that', () => {
  const c = candidatesFrom({ title: 'Nơi Này Có Anh (Remix) - Sơn Tùng M-TP' })
  assert.ok(
    c.some((x) => x.title.includes('Remix')),
    'khong duoc boc mat chu Remix: ' + JSON.stringify(c.slice(0, 3))
  )
})

check('ten khong tach duoc thi van tra ve mot phuong an', () => {
  const c = candidatesFrom({ title: 'Bohemian Rhapsody' })
  assert.ok(c.length >= 1)
  assert.equal(c.at(-1)!.artist, '')
  assert.equal(c.at(-1)!.title, 'Bohemian Rhapsody')
})

check('chuoi rong thi khong no', () => {
  assert.deepEqual(candidatesFrom({ title: '' }), [])
  assert.deepEqual(candidatesFrom({ title: '   ' }), [])
})

check('chuoi toan tu rac thi khong sinh phuong an vo nghia', () => {
  const c = candidatesFrom({ title: '(Official Music Video) [4K]' })
  assert.equal(c.length, 0, 'khong con gi that thi khong nen tra ve gi: ' + JSON.stringify(c))
})

check('bo ten nghe si bi lap trong chinh ten bai', () => {
  // Ten video YouTube rat hay lap lai ten nghe si o cuoi; app khai bao nghe si
  // rieng nen ta biet doan nao la thua
  const c = candidatesFrom({
    title: 'NƠI NÀY CÓ ANH | OFFICIAL MUSIC VIDEO | SƠN TÙNG M-TP',
    artist: 'Sơn Tùng M-TP Official'
  })
  assert.equal(c[0].artist, 'Sơn Tùng M-TP')
  assert.equal(c[0].title, 'NƠI NÀY CÓ ANH', JSON.stringify(c.slice(0, 3)))
})

check('khong bo nham khi ten bai chinh la ten nghe si', () => {
  // Bai trung ten nghe si - bo het thi con chuoi rong, phai giu phuong an goc
  const c = candidatesFrom({ title: 'Hà Anh Tuấn', artist: 'Hà Anh Tuấn' })
  assert.ok(
    c.some((x) => x.title === 'Hà Anh Tuấn'),
    'khong duoc xoa sach ten bai: ' + JSON.stringify(c)
  )
})

check('do giong nhau: bo qua dau va phan thua', () => {
  assert.equal(titleSimilarity('Nơi Này Có Anh', 'noi nay co anh'), 1)
  // Ban Remix dai hon mot chut - van phai coi la cung bai
  assert.ok(titleSimilarity('Nơi Này Có Anh', 'Nơi Này Có Anh (Remix)') > 0.85)
  assert.ok(titleSimilarity('Nơi Này Có Anh', 'Chúng Ta Của Hiện Tại') < 0.3)
  assert.equal(titleSimilarity('', 'abc'), 0)
})

check('ten ngan lot trong ten dai KHONG duoc coi la khop', () => {
  // Bay that da sap tren dien thoai: YouTube phat mot bai, ma ten concert
  // trong tieu de lai trung ten mot bai KHAC. Cong thuc cu chia cho ve nho
  // hon nen cham 1.0 va app hien nham loi ca buoi.
  const video =
    'Nhà Tôi Có Treo Một Lá Cờ - Noo Phước Thịnh tại Concert Tổ Quốc Trong Tim Live bản đầy đủ'
  assert.ok(
    titleSimilarity('Tổ Quốc Trong Tim', video) < 0.6,
    'ten concert khong duoc coi la ten bai: ' + titleSimilarity('Tổ Quốc Trong Tim', video)
  )
  // Con ten bai that thi van phai duoc nhan ra khi tra dung phuong an
  assert.equal(
    titleSimilarity('Nhà Tôi Có Treo Một Lá Cờ', 'Nhà Tôi Có Treo Một Lá Cờ'),
    1
  )
})

console.log(`\n${passed} kiem tra nhan dien deu dat.`)
