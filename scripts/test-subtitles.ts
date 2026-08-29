// Kiem tra bo doc phu de .srt / .vtt / .ass.
//
//   node scripts/test-subtitles.ts
import assert from 'node:assert/strict'
import { detectFormat, parseSubtitles } from '../src/main/subtitles/parse.ts'

let passed = 0
const check = (name: string, fn: () => void): void => {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

check('doc .srt co ban', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:04,000',
    'Dòng đầu tiên',
    '',
    '2',
    '00:01:05,500 --> 00:01:08,000',
    'Dòng thứ hai'
  ].join('\n')

  assert.equal(detectFormat(srt), 'srt')
  const lines = parseSubtitles(srt)
  assert.equal(lines.length, 2)
  assert.equal(lines[0].time, 1)
  assert.equal(lines[0].text, 'Dòng đầu tiên')
  assert.equal(lines[1].time, 65.5)
})

check('doc .srt nhieu dong trong mot khoi', () => {
  const srt = '1\n00:00:02,000 --> 00:00:05,000\nDòng trên\nDòng dưới'
  const lines = parseSubtitles(srt)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].text, 'Dòng trên Dòng dưới', 'phai ghep lai thanh mot dong')
})

check('doc .vtt va bo header', () => {
  const vtt = [
    'WEBVTT',
    '',
    'NOTE day la ghi chu',
    '',
    '00:00:03.250 --> 00:00:06.000',
    'Xin chào'
  ].join('\n')

  assert.equal(detectFormat(vtt), 'vtt')
  const lines = parseSubtitles(vtt)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].time, 3.25)
  assert.equal(lines[0].text, 'Xin chào')
})

check('bo the thoi gian tung chu cua phu de tu dong YouTube', () => {
  const vtt = [
    'WEBVTT',
    '',
    '00:00:01.000 --> 00:00:03.000 align:start position:0%',
    '<00:00:01.000><c>xin</c> <00:00:01.400><c>chào</c> <00:00:01.800><c>bạn</c>'
  ].join('\n')

  const lines = parseSubtitles(vtt)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].text, 'xin chào bạn')
  assert.equal(lines[0].time, 1, 'tham so vi tri o cuoi dong thoi gian khong duoc lam hong moc')
})

check('gop dong cuon cua phu de tu dong', () => {
  // YouTube hien theo kieu cuon: khoi sau lap lai khoi truoc roi them chu
  const vtt = [
    'WEBVTT',
    '',
    '00:00:01.000 --> 00:00:02.000',
    'hôm nay',
    '',
    '00:00:02.000 --> 00:00:03.000',
    'hôm nay trời',
    '',
    '00:00:03.000 --> 00:00:04.000',
    'hôm nay trời đẹp'
  ].join('\n')

  const lines = parseSubtitles(vtt)
  assert.equal(lines.length, 1, 'ba khoi cuon phai gop thanh mot dong')
  assert.equal(lines[0].text, 'hôm nay trời đẹp')
  assert.equal(lines[0].time, 1, 'giu moc cua lan xuat hien dau')
})

check('bo dong lap lien tiep', () => {
  const srt = [
    '1', '00:00:01,000 --> 00:00:02,000', 'giống nhau', '',
    '2', '00:00:02,000 --> 00:00:03,000', 'giống nhau', '',
    '3', '00:00:04,000 --> 00:00:05,000', 'khác rồi'
  ].join('\n')

  const lines = parseSubtitles(srt)
  assert.equal(lines.length, 2)
  assert.equal(lines[1].text, 'khác rồi')
})

check('doc .ass theo dung thu tu cot khai bao', () => {
  const ass = [
    '[Script Info]',
    'Title: Thu nghiem',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.50,0:00:04.00,Default,,0,0,0,,Chào bạn',
    'Dialogue: 0,0:00:05.00,0:00:07.00,Default,,0,0,0,,Dòng {\\b1}có thẻ{\\b0} định dạng'
  ].join('\n')

  assert.equal(detectFormat(ass), 'ass')
  const lines = parseSubtitles(ass)
  assert.equal(lines.length, 2)
  assert.equal(lines[0].time, 1.5)
  assert.equal(lines[0].text, 'Chào bạn')
  assert.equal(lines[1].text, 'Dòng có thẻ định dạng', 'phai bo the dinh dang')
})

check('.ass: dau phay trong loi thoai khong lam vo cot', () => {
  const ass = [
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Chào, bạn khoẻ không?'
  ].join('\n')

  const lines = parseSubtitles(ass)
  assert.equal(lines[0].text, 'Chào, bạn khoẻ không?')
})

check('.ass: xuong dong \\N thanh dau cach', () => {
  const ass = [
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Dòng trên\\NDòng dưới'
  ].join('\n')

  assert.equal(parseSubtitles(ass)[0].text, 'Dòng trên Dòng dưới')
})

check('sap xep lai khi file ghi lon xon', () => {
  const srt = [
    '1', '00:00:30,000 --> 00:00:32,000', 'sau', '',
    '2', '00:00:10,000 --> 00:00:12,000', 'trước'
  ].join('\n')

  const lines = parseSubtitles(srt)
  assert.deepEqual(lines.map((l) => l.text), ['trước', 'sau'])
})

check('phan biet do dai phan thap phan', () => {
  const srt = '1\n00:00:01,5 --> 00:00:02,0\na\n\n2\n00:00:03,50 --> 00:00:04,0\nb'
  const lines = parseSubtitles(srt)
  assert.equal(lines[0].time, 1.5)
  assert.equal(lines[1].time, 3.5)
})

check('giai ma ky tu HTML', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nAnh &amp; em &quot;vui&quot;'
  assert.equal(parseSubtitles(srt)[0].text, 'Anh & em "vui"')
})

check('noi dung rong hoac khong nhan dang duoc thi tra ve rong', () => {
  assert.deepEqual(parseSubtitles(''), [])
  assert.deepEqual(parseSubtitles('chỉ là văn bản thường'), [])
  assert.equal(detectFormat('chỉ là văn bản thường'), 'unknown')
})

console.log(`\n${passed} kiem tra phu de deu dat.`)
