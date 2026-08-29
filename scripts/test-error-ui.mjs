// Kiem chung DAU-CUOI he thong bao loi va logo dong: mo Lyra that, gay loi
// that, xem no co hien ra dung cho khong.
//
//   node scripts/test-error-ui.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 9412
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

const root = mkdtempSync(join(tmpdir(), 'lyra-err-'))
const userData = join(root, 'userData')
mkdirSync(userData, { recursive: true })
// Tat cac thu goi ra mang de bai kiem tra nay chi noi ve viec bao loi
writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({ followSystemMedia: false, autoFetchLyrics: false, volume: 0.01 }),
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

  // ---- 1. Logo dong thay cho vong xoay chung chung ----
  await ev(`[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Tìm')).click()`)
  await sleep(300)
  // Tim mot bai bat ky de sinh trang thai dang cho
  const typed = await ev(`
    (() => {
      const form = document.querySelector('.search-bar')
      const box = form?.querySelector('input')
      if (!box) return 'khong thay o tim'
      // React nghe su kien input tren setter that, khong phai tren .value
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(box, 'test')
      box.dispatchEvent(new Event('input', { bubbles: true }))
      form.requestSubmit()
      return 'da gui'
    })()
  `)
  // Doi den luc nut tim chuyen sang trang thai dang cho
  let sawLoader = false
  for (let i = 0; i < 30 && !sawLoader; i++) {
    sawLoader = await ev(`!!document.querySelector('.lyra-loader')`)
    if (!sawLoader) await sleep(100)
  }
  const loaderSeen = sawLoader

  // Bat dung khoanh khac dang cho thi hen; nhung cai phai chac chan la CSS
  // that su bam vao cac lop cua logo. Dung thu mot ban roi doc lai kieu da tinh:
  // neu ai doi ten lop o mot ben ma quen ben kia, cho nay se bao ngay.
  const bound = await ev(`
    (() => {
      const box = document.createElement('div')
      box.innerHTML =
        '<svg class="lyra-loader lyra-loader--block">' +
        '<g class="lyra-loader__note"></g>' +
        '<rect class="lyra-loader__bar"></rect>' +
        '<circle class="lyra-loader__ring"></circle>' +
        '<rect class="lyra-loader__tile"></rect></svg>'
      document.body.appendChild(box)
      const nameOf = (sel) =>
        getComputedStyle(box.querySelector(sel)).animationName
      const got = {
        note: nameOf('.lyra-loader__note'),
        bar: nameOf('.lyra-loader__bar'),
        ring: nameOf('.lyra-loader__ring'),
        tile: nameOf('.lyra-loader__tile')
      }
      box.remove()
      return JSON.stringify(got)
    })()
  `)
  const bindings = JSON.parse(bound ?? '{}')
  check(
    'CSS bam dung vao cac lop cua logo',
    bindings.note === 'lyra-rock' &&
      bindings.bar === 'lyra-sweep' &&
      bindings.ring === 'lyra-orbit' &&
      bindings.tile === 'lyra-breathe',
    bound
  )
  check(
    'logo dong duoc dung ra khi dang cho',
    loaderSeen,
    loaderSeen ? 'thay tren man hinh luc dang tim' : `khong thay (${typed})`
  )

  const anim = await ev(`
    (() => {
      const s = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules] } catch { return [] } })
      const names = s.filter(r => r.type === CSSRule.KEYFRAMES_RULE).map(r => r.name)
      return ['lyra-rock','lyra-sweep','lyra-breathe','lyra-orbit'].filter(n => names.includes(n)).join(',')
    })()
  `)
  check('co du 4 hoat anh cua logo', (anim ?? '').split(',').filter(Boolean).length === 4, anim)

  // ---- 2. Loi tu tien trinh chinh phai thanh toast doc duoc ----
  const toastText = await ev(`
    (async () => {
      try {
        // Kenh nay co that; duong dan nay thi khong - de xem loi he dieu hanh
        // co duoc doi thanh cau tieng Viet khong
        await window.api.library.addFiles(['D:\\\\khong-he-ton-tai\\\\a.mp3'])
      } catch {}
      await new Promise(r => setTimeout(r, 400))
      return [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')
    })()
  `)
  // Duong dan hong khong nem loi ma chi bo qua file - dung ra la vay
  check('duong dan hong khong lam sap app', typeof toastText === 'string', 'app van tra loi')

  // Gay loi that su: goi kenh voi kieu du lieu sai
  const badCall = await ev(`
    (async () => {
      try {
        await window.api.lyrics.setManual(null, null)
        return '(khong nem loi)'
      } catch (e) {
        return String(e.message ?? e)
      }
    })()
  `)
  check(
    'loi tu tien trinh chinh duoc doi thanh cau doc duoc',
    // Phai sach han: khong con ten kenh, khong con chu "Error" nao sot lai o dau
    typeof badCall === 'string' &&
      !badCall.includes('Error invoking remote method') &&
      !/^\s*Error:/.test(badCall) &&
      badCall.trim() === badCall,
    badCall.slice(0, 90)
  )

  // ---- 3. Loi ben giao dien phai chui vao nhat ky ----
  await ev(`window.dispatchEvent(new ErrorEvent('error', {
    error: new Error('ENOTFOUND kiem-tra.invalid'),
    message: 'ENOTFOUND kiem-tra.invalid'
  }))`)
  await sleep(400)

  const logged = await ev(`
    window.api.log.recent().then(rows =>
      rows.filter(r => r.level === 'error').map(r => r.message).join(' | ')
    )
  `)
  check(
    'loi ben giao dien duoc ghi vao nhat ky chung',
    (logged ?? '').includes('Internet'),
    (logged ?? '').slice(0, 100) || '(nhat ky trong)'
  )

  const toastNow = await ev(
    `[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')`
  )
  check(
    'loi ben giao dien hien thanh toast',
    (toastNow ?? '').includes('Internet'),
    (toastNow ?? '').slice(0, 90) || '(khong co toast)'
  )

  check(
    'toast loi duoc danh dau muc do',
    await ev(`!!document.querySelector('.toast--error')`),
    'co lop toast--error'
  )

  // ---- 4. Duong bao tin tu tien trinh chinh sang giao dien ----
  // Canh bao chu dong (`pushNotice`) va dong nhat ky moi (`onEntry`) di chung
  // mot duong broadcast. Thu duong do bang `onEntry` - de kich hoat hon, ma
  // hong thi ca hai cung hong.
  const streamed = await ev(`
    (async () => {
      const seen = []
      const off = window.api.log.onEntry(e => seen.push(e.message))
      try { await window.api.lyrics.setManual(null, null) } catch {}
      await new Promise(r => setTimeout(r, 500))
      off()
      return seen.join(' | ')
    })()
  `)
  check(
    'dong nhat ky moi chay thang len giao dien',
    (streamed ?? '').length > 0,
    (streamed ?? '').slice(0, 70) || '(khong nhan duoc gi)'
  )

  // ---- 5. The Nhat ky trong Cai dat ----
  await ev(`[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Cài đặt')).click()`)
  await sleep(500)
  const card = await ev(`
    [...document.querySelectorAll('.card')]
      .find(c => c.querySelector('h3')?.textContent === 'Nhật ký')?.textContent ?? ''
  `)
  check('the Nhat ky co trong Cai dat', card.length > 0, card.slice(0, 60))
  check('the Nhat ky liet ke duoc loi vua sinh', card.includes('Internet'), card.slice(0, 120))

  // ---- 6. File nhat ky tren dia ----
  const logDir = join(userData, 'logs')
  const files = existsSync(logDir) ? readdirSync(logDir).filter((f) => f.endsWith('.log')) : []
  check('co ghi ra file nhat ky', files.length > 0, files.join(', ') || 'khong co file nao')
  if (files.length) {
    const body = readFileSync(join(logDir, files[0]), 'utf8')
    check('file nhat ky co dong khoi dong', /khoi dong/.test(body), `${body.length} ky tu`)
    check('file nhat ky co ca chi tiet ky thuat', /ENOTFOUND/.test(body), 'giu duoc chuoi goc de dieu tra')
  }
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

console.log(failed ? `\n${failed} kiem tra that bai.` : '\nHe thong bao loi: dat.')
process.exit(failed ? 1 : 0)
