// Kiem chung viec THOAT: dong cua so chinh thi khung loi noi phai di theo,
// va tien trinh phai chet han.
//
// Loi that da gap: khung noi co `skipTaskbar` nen nguoi dung khong thay no la
// mot cua so, nhung Electron van dem. 'window-all-closed' khong bao gio ban,
// app song tiep voi mot khung noi troi giua man hinh khong cach nao tat.
//
//   node scripts/test-quit.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

const { default: electron } = await import('electron')

/**
 * Mo Lyra voi khung noi dang bat, dong cua so chinh, xem tien trinh co chet
 * khong. Tra ve so giay cho, hoac null neu no khong chiu chet.
 */
async function runCase({ label, minimizeToTray, port }) {
  const root = mkdtempSync(join(tmpdir(), 'lyra-quit-'))
  const userData = join(root, 'userData')
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({
      followSystemMedia: false,
      autoFetchLyrics: false,
      volume: 0.01,
      minimizeToTray,
      overlay: { enabled: true, showWhenPaused: true }
    }),
    'utf8'
  )

  const app = spawn(
    electron,
    ['.', `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )
  app.stdout.on('data', () => {})
  app.stderr.on('data', () => {})

  let exited = false
  app.on('exit', () => (exited = true))

  const cleanup = async () => {
    if (!exited) app.kill('SIGKILL')
    await sleep(800)
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(root, { recursive: true, force: true })
        break
      } catch {
        await sleep(400)
      }
    }
  }

  const pages = async () => {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      return list.filter((t) => t.type === 'page')
    } catch {
      return []
    }
  }

  // Doi ca hai cua so len
  let ready = []
  for (let i = 0; i < 60; i++) {
    ready = await pages()
    if (ready.some((p) => p.url.includes('index.html')) && ready.some((p) => p.url.includes('overlay.html'))) break
    await sleep(500)
  }
  const both =
    ready.some((p) => p.url.includes('index.html')) && ready.some((p) => p.url.includes('overlay.html'))
  check(`${label}: mo duoc ca cua so chinh va khung noi`, both, `${ready.length} trang`)
  if (!both) {
    await cleanup()
    return null
  }

  // Dong cua so chinh y het nhu nguoi dung bam nut X
  const main = ready.find((p) => p.url.includes('index.html'))
  const ws = new WebSocket(main.webSocketDebuggerUrl)
  await new Promise((res) => (ws.onopen = res))
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: 'window.api.window.close()' }
    })
  )
  await sleep(300)
  try {
    ws.close()
  } catch {}

  // Cho toi 12 giay xem tien trinh co chiu chet khong
  for (let i = 0; i < 24 && !exited; i++) await sleep(500)

  // Chup lai TRUOC khi don dep: `cleanup` tu kill tien trinh, doc `exited` sau
  // do thi lan nao cung ra true va bai kiem tra thanh vo nghia
  const didExit = exited
  const left = didExit ? [] : await pages()
  await cleanup()
  return { exited: didExit, left }
}

// ---- 1. Khong thu xuong khay: dong cua so chinh = thoat han ----
const off = await runCase({ label: 'khong thu xuong khay', minimizeToTray: false, port: 9415 })
if (off) {
  check(
    'khong thu xuong khay: dong cua so chinh thi app thoat han',
    off.exited,
    off.exited ? 'tien trinh da thoat' : `con ${off.left.length} trang: ${off.left.map((p) => p.url.split('/').pop()).join(', ')}`
  )
}

// ---- 2. Co thu xuong khay: khung noi duoc phep o lai ----
const on = await runCase({ label: 'co thu xuong khay', minimizeToTray: true, port: 9416 })
if (on) {
  check(
    'co thu xuong khay: app o lai khay cung khung noi',
    !on.exited && on.left.some((p) => p.url.includes('overlay.html')),
    on.exited ? 'da thoat mat (khong dung y)' : `con ${on.left.length} trang`
  )
}

console.log(failed ? `\n${failed} kiem tra that bai.` : '\nDuong thoat: dat.')
process.exit(failed ? 1 : 0)
