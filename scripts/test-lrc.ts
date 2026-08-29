// Kiem tra nhanh bo parse .lrc va ham tim dong dang hat.
// Chay: node scripts/test-lrc.ts
import assert from 'node:assert/strict'
import { activeLineIndex, parseLrc, toLyrics } from '../src/main/lyrics/lrc.ts'

let passed = 0
const check = (name: string, fn: () => void): void => {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

check('doc timestamp mm:ss.xx', () => {
  const { lines } = parseLrc('[00:12.50]Dong mot\n[01:05.20]Dong hai')
  assert.equal(lines.length, 2)
  assert.equal(lines[0].time, 12.5)
  assert.equal(lines[0].text, 'Dong mot')
  assert.equal(lines[1].time, 65.2)
})

check('phan biet do dai phan thap phan', () => {
  const { lines } = parseLrc('[00:01.5]a\n[00:02.50]b\n[00:03.500]c')
  assert.deepEqual(lines.map((l) => l.time), [1.5, 2.5, 3.5])
})

check('mot dong nhieu timestamp (diep khuc lap lai)', () => {
  const { lines } = parseLrc('[00:10.00][01:10.00]Diep khuc')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines.map((l) => l.time), [10, 70])
})

check('doc tag [offset:] va dao dau', () => {
  // offset duong trong file nghia la lyric can hien SOM hon
  const { fileOffset, meta } = parseLrc('[offset:+500]\n[ar:Nghe si]\n[00:01.00]x')
  assert.equal(fileOffset, -0.5)
  assert.equal(meta.ar, 'Nghe si')
})

check('bo tag metadata khoi danh sach dong', () => {
  const { lines } = parseLrc('[ti:Ten bai]\n[al:Album]\n[00:01.00]Dong that')
  assert.equal(lines.length, 1)
  assert.equal(lines[0].text, 'Dong that')
})

check('sap xep theo thoi gian du file ghi lon xon', () => {
  const { lines } = parseLrc('[00:30.00]sau\n[00:10.00]truoc')
  assert.deepEqual(lines.map((l) => l.text), ['truoc', 'sau'])
})

check('van ban thuan -> kind plain', () => {
  const lyrics = toLyrics('Dong mot\nDong hai', 'manual')
  assert.equal(lyrics.kind, 'plain')
  assert.equal(lyrics.lines.length, 2)
})

check('chuoi rong -> kind none', () => {
  assert.equal(toLyrics('   ', 'manual').kind, 'none')
})

check('toLyrics cong don offset cua file va cua nguoi dung', () => {
  const lyrics = toLyrics('[offset:1000]\n[00:05.00]x', 'sidecar', 2)
  assert.equal(lyrics.kind, 'synced')
  assert.equal(lyrics.offset, 1) // 2 (nguoi dung) + (-1) (file)
})

check('tim dong dang hat', () => {
  const lines = [
    { time: 0, text: 'a' },
    { time: 10, text: 'b' },
    { time: 20, text: 'c' }
  ]
  assert.equal(activeLineIndex(lines, -1), -1, 'truoc dong dau tra ve -1')
  assert.equal(activeLineIndex(lines, 0), 0, 'dung ngay moc dau')
  assert.equal(activeLineIndex(lines, 9.9), 0)
  assert.equal(activeLineIndex(lines, 10), 1)
  assert.equal(activeLineIndex(lines, 999), 2, 'sau dong cuoi giu nguyen dong cuoi')
})

check('offset dich dong dang hat', () => {
  const lines = [
    { time: 0, text: 'a' },
    { time: 10, text: 'b' }
  ]
  assert.equal(activeLineIndex(lines, 9, 0), 0)
  assert.equal(activeLineIndex(lines, 9, 1.5), 1, 'offset duong keo lyric len som')
  assert.equal(activeLineIndex(lines, 11, -1.5), 0, 'offset am lui lyric lai')
})

console.log(`\n${passed} kiem tra deu dat.`)
