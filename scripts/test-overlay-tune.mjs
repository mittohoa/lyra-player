// Kiem chung bang tinh chinh tren khung loi noi: mac dinh dong, bam moi mo,
// va doi thi cai dat phai duoc luu that.
//
//   node scripts/test-overlay-tune.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 9414
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

const root = mkdtempSync(join(tmpdir(), 'lyra-tune-'))
const userData = join(root, 'userData')
mkdirSync(userData, { recursive: true })
const settingsFile = join(userData, 'settings.json')
writeFileSync(
  settingsFile,
  JSON.stringify({
    followSystemMedia: false,
    autoFetchLyrics: false,
    volume: 0.01,
    overlay: {
      enabled: true,
      fontSize: 28,
      fontFamily: 'Segoe UI',
      backgroundOpacity: 0.35,
      // Hien ca khi khong phat, khong thi khung an mat va khong kiem duoc gi
      showWhenPaused: true
    }
  }),
  'utf8'
)

const { default: electron } = await import('electron')
const app = spawn(electron, ['.', `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe']
})
app.stdout.on('data', () => {})
app.stderr.on('data', () => {})

let ws = null

try {
  // Cua so overlay la mot trang RIENG - phai bat dung no, khong phai cua so chinh
  let target = null
  for (let i = 0; i < 50 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((t) => t.type === 'page' && t.url.includes('overlay.html'))
    } catch {}
    if (!target) await sleep(500)
  }
  if (!target) throw new Error('khong thay cua so overlay')
  check('cua so lyric noi mo duoc', true)

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
    if (await ev(`!!document.querySelector('.ov')`)) break
    await sleep(300)
  }

  // ---- 1. Mac dinh phai dong ----
  check('mac dinh bang tinh chinh khong hien', !(await ev(`!!document.querySelector('.ov__tune')`)))

  // ---- 2. Bam nut moi mo ----
  const opened = await ev(`
    (() => {
      const btn = [...document.querySelectorAll('.ov__tool')]
        .find(b => b.title && b.title.includes('Tinh chỉnh'))
      if (!btn) return 'khong thay nut'
      btn.click()
      return 'da bam'
    })()
  `)
  await sleep(300)
  check('bam nut thi bang hien ra', await ev(`!!document.querySelector('.ov__tune')`), opened)

  // ---- 3. Co du cac muc nguoi dung hoi ----
  const rows = await ev(`
    [...document.querySelectorAll('.ov__tune-row > span')].map(s => s.textContent).join(' | ')
  `)
  for (const want of ['Font chữ', 'Cỡ chữ', 'Nền mờ']) {
    check(`co muc "${want}"`, (rows ?? '').includes(want), rows)
  }

  check(
    'danh sach font co nhieu lua chon',
    (await ev(`document.querySelector('.ov__tune select').options.length`)) >= 10,
    `${await ev(`document.querySelector('.ov__tune select').options.length`)} font`
  )

  // ---- 4. Doi co chu thi chu doi that VA cai dat duoc luu ----
  await ev(`
    (() => {
      const slider = document.querySelectorAll('.ov__tune input[type="range"]')[0]
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(slider, '52')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
    })()
  `)
  await sleep(400)

  const shownSize = await ev(
    `getComputedStyle(document.querySelector('.ov__line')).fontSize`
  )
  check('chu doi co ngay tren khung', shownSize === '52px', shownSize)

  // ---- 5. Doi do trong suot nen ----
  await ev(`
    (() => {
      const slider = document.querySelectorAll('.ov__tune input[type="range"]')[1]
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(slider, '80')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
    })()
  `)
  await sleep(600)

  const bg = await ev(`document.querySelector('.ov').style.background`)
  check('nen doi do trong suot', /0\.8/.test(bg ?? ''), bg)

  // ---- 6. Ghi xuong dia that, khong chi doi tren man hinh ----
  const saved = JSON.parse(readFileSync(settingsFile, 'utf8'))
  check('co chu duoc luu lai', saved.overlay?.fontSize === 52, `fontSize = ${saved.overlay?.fontSize}`)
  check(
    'do trong suot duoc luu lai',
    Math.abs((saved.overlay?.backgroundOpacity ?? 0) - 0.8) < 0.01,
    `backgroundOpacity = ${saved.overlay?.backgroundOpacity}`
  )

  // ---- 7. Esc dong bang ----
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await sleep(250)
  check('bam Esc thi bang dong lai', !(await ev(`!!document.querySelector('.ov__tune')`)))
} catch (err) {
  failed++
  console.error('  FAIL  ', err.message)
} finally {
  ws?.close()
  app.kill('SIGKILL')
  await sleep(1200)
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(root, { recursive: true, force: true })
      break
    } catch {
      await sleep(500)
    }
  }
}

console.log(failed ? `\n${failed} kiem tra that bai.` : '\nBang tinh chinh khung loi noi: dat.')
process.exit(failed ? 1 : 0)
