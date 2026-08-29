// Kiem chung DAU-CUOI phan phu de: cho Edge phat mot video YouTube that,
// xem Lyra co nhan dien va lay duoc phu de cho no khong.
//
//   node scripts/test-subs-live.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

const PORT = 9411
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

// Video co phu de tieng Viet do nguoi dang tai len
const VIDEO = 'https://www.youtube.com/watch?v=FN7ALfpGxiI'

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

const root = mkdtempSync(join(tmpdir(), 'lyra-subs-'))
const userData = join(root, 'userData')
mkdirSync(userData, { recursive: true })
writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({
    followSystemMedia: true,
    externalSubtitles: true,
    subtitleLangs: 'vi,en',
    volume: 0.01,
    ytDlpPath: join(process.env.APPDATA ?? homedir(), 'Lyra', 'bin', 'yt-dlp.exe')
  }),
  'utf8'
)

const { default: electron } = await import('electron')
const app = spawn(electron, ['.', `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe']
})
app.stdout.on('data', () => {})
app.stderr.on('data', () => {})

let edge = null
let ws = null

try {
  let target = null
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((t) => t.type === 'page' && t.url.includes('index.html'))
    } catch {}
    if (!target) await sleep(500)
  }
  if (!target) throw new Error('khong noi duoc CDP')

  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('loi websocket'))
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    pending.get(m.id)?.(m.result)
    pending.delete(m.id)
  }
  const ev = (expression) =>
    new Promise((res) => {
      const myId = ++id
      pending.set(myId, (r) => res(r?.result?.value))
      ws.send(
        JSON.stringify({
          id: myId,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true }
        })
      )
    })

  for (let i = 0; i < 40; i++) {
    if (await ev('document.querySelectorAll(".nav-item").length')) break
    await sleep(400)
  }
  check('Lyra khoi dong', true)

  // ---- Cho Edge phat video YouTube ----
  edge = spawn(EDGE, [`--user-data-dir=${join(root, 'edge')}`, '--new-window', VIDEO], {
    stdio: 'ignore'
  })

  // Doi Windows bao co phien media
  let now = null
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    now = await ev('window.api.smtc.now()')
    if (now?.title) break
  }
  check('Lyra thay video dang phat', !!now?.title, now ? `"${now.title.slice(0, 50)}"` : 'khong thay')
  if (!now?.title) throw new Error('SMTC khong bao gi')

  // ---- Doi app tim ra loi cho video do ----
  await ev(
    `[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Cài đặt')).click()`
  )

  let card = ''
  for (let i = 0; i < 90; i++) {
    await sleep(1000)
    card = await ev(`
      [...document.querySelectorAll('.card')]
        .find(c => c.textContent.includes('Lyric cho nhạc ở app khác'))?.textContent ?? ''
    `)
    if (/lời bài hát từ|phụ đề\s*(\[|từ)/.test(card)) break
  }

  // Doc DUNG dong trang thai, khong doc ca the - trong the con co nhan cai dat
  // cung chua chu "phụ đề"/"lời bài hát", doi chieu ca the se khop nham.
  const status = await ev(`
    [...document.querySelectorAll('.folder-row div')]
      .map(d => d.textContent)
      .find(t => t && (t.includes('đang phát') || t.includes('tạm dừng'))) ?? ''
  `)

  const found = /(\d+) dòng/.exec(status)
  check(
    'tim duoc loi cho thu dang phat',
    !!found && Number(found[1]) > 0,
    status || 'chua tim ra'
  )

  // Loai ket qua phu thuoc thu dang phat tren may, nen chi bao chu khong khang dinh
  const type = status.includes('phụ đề')
    ? 'phụ đề'
    : status.includes('lời bài hát')
      ? 'lời bài hát'
      : '(chưa rõ)'
  check('phan loai duoc noi dung', type !== '(chưa rõ)', `nhận ra là ${type}`)

  const shown = await ev(`
    [...document.querySelectorAll('.folder-row div')]
      .map(d => d.textContent).find(t => t && t.startsWith('nhận diện:')) ?? ''
  `)
  if (shown) console.log(`        ${shown}`)
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
    try {
      rmSync(root, { recursive: true, force: true })
      break
    } catch {
      await sleep(500)
    }
  }
}

console.log(failed ? `\n${failed} kiem tra that bai.` : '\nPhu de dau-cuoi: dat.')
process.exit(failed ? 1 : 0)
