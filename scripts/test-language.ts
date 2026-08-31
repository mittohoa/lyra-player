// Kiem tra bo doan ngon ngu cua loi bai hat.
//
//   node scripts/test-language.ts
import assert from 'node:assert/strict'
import { detectLanguage } from '../src/shared/language.ts'

let passed = 0
const check = (name: string, fn: () => void): void => {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

/** Loi that, lay tu chinh nhung bai da dung de thu app. */
const THAT: [string, string | null, string][] = [
  [
    'tieng Viet co dau',
    'vi',
    '[00:16.64]Em, ngày em đánh rơi nụ cười vào anh\n[00:22.81]Có nghĩa sau này em sẽ chờ'
  ],
  [
    'tieng Viet khong dau thanh nhung co chu rieng',
    'vi',
    'Nhà tôi có treo một lá cờ, đỏ thắm những câu chuyện xưa'
  ],
  [
    'tieng Anh',
    'en',
    "The club isn't the best place to find a lover, so the bar is where I go"
  ],
  ['tieng Han', 'ko', "'Cause I, I, I'm in the stars tonight 아름다웠던 우리의 계절 속에서"],
  ['tieng Nhat co kana', 'ja', '君の名前を呼ぶよ、いつまでも変わらない気持ちで'],
  ['tieng Trung chi co chu Han', 'zh', '我们的爱情就像一场雨，来得快去得也快，留下满地回忆'],
  ['tieng Thai', 'th', 'ฉันรักเธอมากกว่าที่เธอจะรู้ และฉันจะอยู่ตรงนี้เสมอ'],
  ['tieng Nga', 'ru', 'Я не могу забыть тебя, моя любовь навсегда останется']
]

for (const [name, mong, text] of THAT) {
  check(`${name} -> ${mong}`, () => {
    const ra = detectLanguage(text)
    assert.equal(ra, mong, `ra "${ra}"`)
  })
}

check('tieng Phap khong bi doc nham thanh tieng Viet', () => {
  const ra = detectLanguage("Je t'aime encore, ça fait si longtemps que je pense à toi")
  assert.notEqual(ra, 'vi', 'bi doc thanh tieng Viet')
})

check('tieng Nhat co nhieu chu Han van ra ja chu khong ra zh', () => {
  // Cau nay co 5 chu Han va chi 2 ky tu kana - neu chi dem so luong thi ra zh
  assert.equal(detectLanguage('私は音楽が大好きです、毎日聴いています'), 'ja')
})

check('doan qua ngan thi tra ve null', () => {
  assert.equal(detectLanguage('Oh'), null)
  assert.equal(detectLanguage(''), null)
  assert.equal(detectLanguage('   \n  '), null)
})

check('moc thoi gian khong lam lech ket qua', () => {
  // Chi co moc, khong co chu - khong duoc doan bua thanh tieng Anh
  assert.equal(detectLanguage('[00:12.34][00:18.00][00:24.10][00:31.55]'), null)
})

check('dong chi co ky hieu nhac thi khong doan', () => {
  assert.equal(detectLanguage('♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪'), null)
})

console.log(`\n${passed} phep thu deu dat.`)
