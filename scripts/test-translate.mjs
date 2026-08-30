// Kiem chung duong di cua tinh nang dich lyric MA KHONG goi API that:
// dung mot server gia cuc bo dong vai API Anthropic.
//
// Kiem duoc: dung mo hinh nao, gui gi len, doc ket qua structured output ra sao,
// chia khoi khi lyric dai, va tu sua khi mo hinh tra ve lech so dong.
// Khong kiem duoc chat luong ban dich - viec do can khoa API that.
//
//   npm run test:translate
import { app } from 'electron'
import { createServer } from 'node:http'

app.setName('Lyra')

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

/** Cac yeu cau ma server gia nhan duoc, de soi lai sau. */
const seen = []

/** Tra ve dung so dong duoc yeu cau, tru khi `mangle` bao lam sai lech. */
function fakeReply(body, mangle) {
  const text = body.messages[0].content
  const count = Number(/Dịch (\d+) dòng/.exec(text)?.[1] ?? 0)
  let lines = Array.from({ length: count }, (_, i) => `dich ${i + 1}`)
  if (mangle === 'thieu') lines = lines.slice(0, Math.max(1, count - 2))
  if (mangle === 'thua') lines = [...lines, 'thua 1', 'thua 2']

  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: body.model,
    content: [{ type: 'text', text: JSON.stringify({ lines }) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 }
  }
}

let mangleMode = null

const server = createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const body = JSON.parse(raw || '{}')
    seen.push({ url: req.url, headers: req.headers, body })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(fakeReply(body, mangleMode)))
  })
})

async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  // SDK doc hai bien nay, nen tro no ve server gia
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`
  process.env.ANTHROPIC_API_KEY = 'sk-ant-gia-de-thu'

  const { translateLyrics } = await import('../src/main/ai/translate')

  // ---- 1. Dich mot doan ngan ----
  const lines = ['Em la ai', 'Tu dau den', 'Nguoi la ai']
  const out = await translateLyrics(lines, 'en')

  check('tra ve dung so dong', out.length === 3, `${out.length}/3`)
  check('goi dung mot lan cho lyric ngan', seen.length === 1, `${seen.length} yeu cau`)

  const req = seen[0]
  check('goi dung endpoint messages', req.url.includes('/v1/messages'), req.url)
  check('dung model claude-opus-5', req.body.model === 'claude-opus-5', req.body.model)
  check('bat adaptive thinking', req.body.thinking?.type === 'adaptive', JSON.stringify(req.body.thinking))
  check(
    'khai bao structured output',
    !!req.body.output_config?.format,
    req.body.output_config?.format?.type ?? '(khong co)'
  )
  check('co dat muc effort', !!req.body.output_config?.effort, req.body.output_config?.effort)
  check('gui khoa API qua header x-api-key', !!req.headers['x-api-key'], 'co')
  check(
    'nhac ro so dong can tra ve',
    /Dịch 3 dòng/.test(req.body.messages[0].content),
    'co'
  )
  check(
    'danh so tung dong de mo hinh khong lech',
    /1\. Em la ai/.test(req.body.messages[0].content),
    'co'
  )
  check(
    'system nhac giu nguyen so dong',
    /ĐÚNG số dòng/.test(req.body.system ?? ''),
    'co'
  )

  // ---- 2. Lyric dai phai duoc chia khoi ----
  seen.length = 0
  const long = Array.from({ length: 140 }, (_, i) => `dong ${i + 1}`)
  const outLong = await translateLyrics(long, 'vi')
  check('lyric dai: tra ve du so dong', outLong.length === 140, `${outLong.length}/140`)
  check('lyric dai: chia thanh nhieu khoi', seen.length === 3, `${seen.length} yeu cau`)
  check(
    'lyric dai: khoi cuoi chi con phan du',
    /Dịch 20 dòng/.test(seen[2].body.messages[0].content),
    'khoi 3 co 20 dong'
  )

  // ---- 3. Mo hinh tra ve lech so dong thi phai tu can lai ----
  seen.length = 0
  mangleMode = 'thieu'
  const short = await translateLyrics(['a', 'b', 'c', 'd'], 'vi')
  check('mo hinh tra thieu dong: van du so dong', short.length === 4, `${short.length}/4`)
  check('cho dong thieu la chuoi rong', short[3] === '', `"${short[3]}"`)

  mangleMode = 'thua'
  const extra = await translateLyrics(['a', 'b'], 'vi')
  check('mo hinh tra thua dong: cat bot cho khop', extra.length === 2, `${extra.length}/2`)

  server.close()
  console.log(
    failed ? `\n${failed} kiem tra that bai.` : '\nTat ca kiem tra duong di dich lyric deu dat.'
  )
  console.log('(Chat luong ban dich chua kiem duoc - can khoa API that.)')
  app.exit(failed ? 1 : 0)
}

app.whenReady().then(main).catch((err) => {
  console.error('  FAIL  ', err?.stack ?? err)
  app.exit(1)
})
