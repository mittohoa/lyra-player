// Test dau-cuoi tinh nang "lyric cho nhac phat o app khac".
//
// Bat Lyra (khong phat gi), bat theo doi SMTC, roi cho Edge phat mot file audio cuc bo.
// Neu Lyra nhin thay bai do va day duoc sang overlay thi tinh nang chay.
//
//   node scripts/test-smtc.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 9355
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

/** WAV dai de Edge coi la mot ban nhac that va bao len SMTC. */
function writeWav(path, seconds) {
  const rate = 22050
  const n = rate * seconds
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 4000), i * 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([h, data]))
}

const root = mkdtempSync(join(tmpdir(), 'lyra-smtc-'))
const userData = join(root, 'userData')
mkdirSync(userData, { recursive: true })
// Ten file chinh la ten bai Edge se bao len SMTC
const wav = join(root, 'Bai Hat Ngoai App.wav')
writeWav(wav, 300)

writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({ followSystemMedia: true, volume: 0.02 }, null, 2),
  'utf8'
)

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const edgeProfile = join(root, 'edge')

const { default: electron } = await import('electron')
const app = spawn(electron, ['.', `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe']
})
app.stdout.on('data', () => {})
app.stderr.on('data', () => {})

let edge = null
let ws = null

try {
  // ---- Noi vao Lyra qua CDP ----
  let target = null
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((t) => t.type === 'page' && t.url.includes('index.html'))
    } catch {}
    if (!target) await sleep(500)
  }
  if (!target) throw new Error('khong noi duoc vao Lyra qua CDP')

  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error('loi websocket'))
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    pending.get(m.id)?.(m.result)
    pending.delete(m.id)
  }
  const evaluate = (expression) =>
    new Promise((resolve) => {
      const myId = ++id
      pending.set(myId, (r) => resolve(r?.result?.value))
      ws.send(JSON.stringify({
        id: myId,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true }
      }))
    })

  check('Lyra khoi dong va noi duoc CDP', true)

  // Bat loi ngay tai cho: neu kenh nem loi, `evaluate` chi tra ve undefined va
  // ta khong biet gi them - con doc duoc cau loi thi lan ra nguyen nhan ngay
  const watching = await evaluate(
    "window.api.smtc.setWatch(true).then(v => v, e => 'LOI: ' + (e?.message ?? e))"
  )
  check('bat duoc bo theo doi SMTC', watching === true, `tra ve ${watching}`)

  // Khong gia dinh may dang ranh - nguoi dung co the dang nghe gi do.
  // Chi can ban tin dung dinh dang: hoac null, hoac co du truong.
  await sleep(2500)
  const before = await evaluate('window.api.smtc.now()')
  check(
    'ban tin SMTC dung dinh dang',
    before === null || (typeof before.title === 'string' && typeof before.position === 'number'),
    before ? `dang phat: "${before.title}" (${before.app})` : 'khong co app nao phat'
  )

  // ---- Cho Edge phat file audio cuc bo ----
  edge = spawn(EDGE, [`--user-data-dir=${edgeProfile}`, '--new-window', 'file:///' + wav.replace(/\\/g, '/')], {
    stdio: 'ignore',
    detached: false
  })
  await sleep(14000)

  const now = await evaluate('window.api.smtc.now()')
  check('Lyra nhin thay nhac phat o app khac', !!now, now ? `${now.app} — "${now.title}"` : 'khong thay gi')

  if (now) {
    check('doc dung ten bai', now.title.includes('Bai Hat Ngoai App'), `"${now.title}"`)
    check('biet dang phat', now.status === 'Playing', now.status)
    check('doc duoc do dai bai', Math.round(now.duration) === 300, `${now.duration}s`)
  }

  // Vi tri phai TU CHAY - day la cho de sai nhat: SMTC chi tra ve anh chup
  const p1 = (await evaluate('window.api.smtc.now()'))?.position ?? 0
  await sleep(4000)
  const p2 = (await evaluate('window.api.smtc.now()'))?.position ?? 0
  check('vi tri phat tu chay (da bu thoi gian troi)', p2 - p1 > 2.5, `${p1.toFixed(1)}s -> ${p2.toFixed(1)}s`)

  // Giao dien phai hien dung bai do trong muc Cai dat
  await evaluate(
    `[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Cài đặt')).click()`
  )
  await sleep(1500)
  const shown = await evaluate(`
    [...document.querySelectorAll('.card')]
      .find(c => c.textContent.includes('Lyric cho nhạc ở app khác'))?.textContent ?? ''
  `)
  check(
    'muc Cai dat hien dung bai app khac dang phat',
    shown.includes('Bai Hat Ngoai App'),
    shown.includes('Chưa thấy app nào') ? 'van bao chua thay app nao' : 'da hien'
  )
  check('nhan ra dung app nguon', shown.includes('MSEdge'), shown.includes('MSEdge') ? 'MSEdge' : 'khong thay ten app')
} catch (err) {
  failed++
  console.error('  FAIL  ', err.message)
} finally {
  ws?.close()
  edge?.kill('SIGKILL')
  app.kill('SIGKILL')
  spawn('taskkill', ['/IM', 'msedge.exe', '/F'], { stdio: 'ignore' })
  await sleep(1500)
  for (let i = 0; i < 5; i++) {
    try { rmSync(root, { recursive: true, force: true }); break } catch { await sleep(500) }
  }
}

console.log(failed ? `\n${failed} kiem tra that bai.` : '\nTat ca kiem tra SMTC deu dat.')
process.exit(failed ? 1 : 0)
