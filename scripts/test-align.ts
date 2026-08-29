// Kiem tra thuat toan can lyric vao ban phien am cua Whisper.
// Day la phan loi cua tinh nang "AI can timestamp" nen test ky.
//
//   node scripts/test-align.ts
import assert from 'node:assert/strict'
import { alignLyrics, toLrc, type WhisperWord } from '../src/main/ai/align.ts'

let passed = 0
const check = (name: string, fn: () => void): void => {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

/** Dung nhanh chuoi tu kem moc thoi gian, moi tu cach nhau `step` giay. */
const words = (text: string, start = 0, step = 0.5): WhisperWord[] =>
  text.split(/\s+/).map((w, i) => ({
    text: w,
    start: start + i * step,
    end: start + i * step + step * 0.9
  }))

check('khop hoan hao thi lay dung moc dau moi dong', () => {
  const lines = ['Em la ai', 'Tu dau den']
  const heard = words('em la ai tu dau den') // 0, .5, 1 | 1.5, 2, 2.5
  const r = alignLyrics(lines, heard)
  assert.equal(r.lines.length, 2)
  assert.equal(r.lines[0].time, 0)
  assert.equal(r.lines[1].time, 1.5)
  assert.equal(r.confidence, 1)
})

check('bo qua dau tieng Viet khi so khop', () => {
  // Lyric co dau, Whisper nghe ra khong dau - van phai khop
  const r = alignLyrics(['Đường tôi chở em về'], words('duong toi cho em ve', 10))
  assert.equal(r.lines.length, 1)
  assert.equal(r.lines[0].time, 10)
  assert.equal(r.lines[0].text, 'Đường tôi chở em về', 'chu phai giu nguyen ban goc co dau')
})

check('giu nguyen loi goc du Whisper nghe sai', () => {
  const r = alignLyrics(['Ngam em that lau'], words('ngam em that lau roi', 5))
  assert.equal(r.lines[0].text, 'Ngam em that lau')
})

check('noi suy cho dong khong bat duoc moc nao', () => {
  const lines = ['mot hai', 'xxxxx yyyyy', 'nam sau']
  // Whisper khong nghe ra dong giua
  const heard = [...words('mot hai', 0), ...words('nam sau', 12)]
  const r = alignLyrics(lines, heard)
  assert.equal(r.lines.length, 3)
  assert.equal(r.lines[0].time, 0)
  assert.equal(r.lines[2].time, 12)
  assert.ok(r.lines[1].time > 0 && r.lines[1].time < 12, 'dong giua phai nam giua hai moc')
  assert.equal(r.lines[1].time, 6, 'noi suy tuyen tinh')
})

check('thoi gian luon tang dan', () => {
  // Whisper tra ve moc lung tung (hat lap lai) - ket qua van phai tang dan
  const heard = [
    { text: 'mot', start: 5, end: 5.4 },
    { text: 'hai', start: 1, end: 1.4 },
    { text: 'ba', start: 8, end: 8.4 }
  ]
  const r = alignLyrics(['mot', 'hai', 'ba'], heard)
  for (let i = 1; i < r.lines.length; i++) {
    assert.ok(r.lines[i].time > r.lines[i - 1].time, `dong ${i} phai sau dong ${i - 1}`)
  }
})

check('khong khop gi thi bao confidence 0 va tra ve rong', () => {
  const r = alignLyrics(['aaa bbb'], words('xxx yyy zzz'))
  assert.equal(r.lines.length, 0)
  assert.equal(r.confidence, 0)
})

check('confidence phan anh ti le tu bat duoc', () => {
  const r = alignLyrics(['mot hai ba bon'], words('mot hai xxx yyy'))
  assert.equal(r.matchedWords, 2)
  assert.equal(r.totalWords, 4)
  assert.equal(r.confidence, 0.5)
})

check('bo dong trong khoi ket qua', () => {
  const r = alignLyrics(['mot', '', '   ', 'hai'], words('mot hai'))
  assert.equal(r.lines.length, 2)
})

check('khong co tu nao thi tra ve rong, khong no', () => {
  assert.equal(alignLyrics([], words('mot hai')).lines.length, 0)
  assert.equal(alignLyrics(['mot'], []).lines.length, 0)
})

check('so khop mo: Whisper nghe sai mot ky tu van khop', () => {
  // "nang" nghe thanh "nong" - sai mot nguyen am, van phai neo duoc
  const r = alignLyrics(['anh nang ban mai'], words('anh nong ban mai', 7))
  assert.equal(r.lines.length, 1)
  assert.equal(r.lines[0].time, 7)
  assert.equal(r.lines[0].text, 'anh nang ban mai', 'loi goc phai giu nguyen')
})

check('so khop mo: khong noi long cho tu ngan duoi 3 ky tu', () => {
  // Am tiet tieng Viet rat ngan; noi long o day se khop nham tran lan.
  // "ta" va "va" chi khac mot ky tu nhung KHONG duoc coi la khop.
  const r = alignLyrics(['ta ta ta'], words('va va va'))
  assert.equal(r.confidence, 0, 'tu 2 ky tu khong duoc khop mo')
})

check('so khop mo: sai hai ky tu tro len thi khong khop', () => {
  const r = alignLyrics(['duong'], words('xxxxx'))
  assert.equal(r.confidence, 0)
})

check('toLrc xuat dung dinh dang', () => {
  const lrc = toLrc([
    { time: 0, text: 'dau tien' },
    { time: 65.25, text: 'sau mot phut' }
  ])
  assert.equal(lrc, '[00:00.00]dau tien\n[01:05.25]sau mot phut')
})

check('chay duoc voi bai dai (300 dong) trong thoi gian hop ly', () => {
  const lines = Array.from({ length: 300 }, (_, i) => `dong so ${i} co vai tu o day`)
  const heard = lines.flatMap((l, i) => words(l, i * 4, 0.4))
  const t = Date.now()
  const r = alignLyrics(lines, heard)
  const ms = Date.now() - t
  assert.equal(r.lines.length, 300)
  assert.ok(ms < 3000, `mat ${ms}ms - qua lau`)
})

console.log(`\n${passed} kiem tra can chinh deu dat.`)
