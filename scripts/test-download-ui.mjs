// Tai nhac QUA GIAO DIEN cho CA BA nguon, y het nguoi dung bam.
// Test truoc do goi thang downloadTrack() nen khong bat duoc loi o phan noi day,
// cung khong bat duoc truong hop app van ra ngoai.
//
//   node scripts/test-download-ui.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

const PORT = 9366
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

const root = mkdtempSync(join(tmpdir(), 'lyra-dlui-'))
const userData = join(root, 'userData')
const downloads = join(root, 'tai-ve')
mkdirSync(userData, { recursive: true })
mkdirSync(downloads, { recursive: true })

// Dung lai yt-dlp da tai o thu muc that, khoi phai tai lai 18 MB
const realYtDlp = join(process.env.APPDATA ?? homedir(), 'Lyra', 'bin', 'yt-dlp.exe')

writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({ downloadFolder: downloads, volume: 0.02, ytDlpPath: realYtDlp }, null, 2),
  'utf8'
)

const { default: electron } = await import('electron')
const app = spawn(electron, ['.', `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe']
})

let appExited = null
app.on('exit', (code, signal) => (appExited = { code, signal }))

const mainLog = []
app.stdout.on('data', (b) => mainLog.push(b.toString()))
app.stderr.on('data', (b) => mainLog.push(b.toString()))

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
  const rendererErrors = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      rendererErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      rendererErrors.push(m.params.exceptionDetails.exception?.description ?? 'exception')
    }
    pending.get(m.id)?.(m.result)
    pending.delete(m.id)
  }
  const send = (method, params) =>
    new Promise((res) => {
      const myId = ++id
      pending.set(myId, res)
      ws.send(JSON.stringify({ id: myId, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'loi JS')
    return r?.result?.value
  }
  await send('Runtime.enable')

  const waitFor = async (expression, timeoutMs = 25000) => {
    const deadline = Date.now() + timeoutMs
    let v
    while (Date.now() < deadline) {
      v = await evaluate(expression)
      if (v) return v
      await sleep(400)
    }
    return v
  }

  const ready = await waitFor('document.querySelectorAll(".nav-item").length')
  check('giao dien nap xong', ready > 0, `${ready} muc dieu huong`)

  await evaluate(
    `[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Tìm nhạc online')).click()`
  )
  await sleep(600)

  /** Bat mot nguon duy nhat trong o loc nguon. */
  const selectOnly = async (label) => {
    await evaluate(`(() => {
      const chips = [...document.querySelectorAll('.chip')]
      for (const c of chips) {
        const on = c.classList.contains('chip--on')
        const want = c.textContent.includes(${JSON.stringify(label)})
        if (on !== want) c.click()
      }
    })()`)
    await sleep(400)
  }

  const search = async (q) => {
    await evaluate(`(() => {
      const input = document.querySelector('.search-bar input')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, ${JSON.stringify(q)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })()`)
    return waitFor('document.querySelectorAll(".track-row").length', 40000)
  }

  // ---- Thu tung nguon mot ----
  for (const source of ['NhacCuaTui', 'Zing MP3', 'YouTube']) {
    console.log(`\n--- ${source} ---`)
    const before = new Set(readdirSync(downloads))

    await selectOnly(source)
    const rows = await search('Noi nay co anh')
    check(`${source}: tim ra ket qua`, rows > 0, `${rows} dong`)
    if (!rows) continue

    // Ket qua chia theo tung MUC nguon. Phai bam dong trong dung muc cua nguon
    // dang thu, chu khong phai dong dau tien cua ca trang.
    const clicked = await evaluate(`(() => {
      const section = [...document.querySelectorAll('section')].find((s) =>
        s.querySelector('.section-title')?.textContent.includes(${JSON.stringify(source)})
      )
      if (!section) return 'khong thay muc cua nguon nay'
      const btn = section.querySelector('.track-row [title*="Tải về máy"]')
      if (!btn) return 'muc co nhung khong co nut tai'
      btn.click()
      return true
    })()`)
    check(`${source}: bam duoc nut tai trong dung muc`, clicked === true, String(clicked))
    if (!clicked) continue

    // Cho: xong (co file moi), hoac loi (toast), hoac app van ra ngoai
    let outcome = 'het gio'
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      if (appExited) {
        outcome = `APP VAN RA NGOAI (ma ${appExited.code}, tin hieu ${appExited.signal})`
        break
      }
      const fresh = readdirSync(downloads).filter((f) => !before.has(f))
      if (fresh.some((f) => /\.(mp3|m4a|opus|webm)$/i.test(f))) {
        // Cho them mot chut de buoc ghi tag va .lrc kip chay xong
        await sleep(4000)
        outcome = 'xong'
        break
      }
      const err = await evaluate(`document.querySelector('.toast--error')?.textContent ?? ''`).catch(
        () => 'KHONG HOI DUOC RENDERER'
      )
      if (err) {
        outcome = `loi: ${err}`
        break
      }
      await sleep(1000)
    }

    if (appExited) {
      check(`${source}: app khong van ra ngoai`, false, outcome)
      break
    }

    const fresh = readdirSync(downloads).filter((f) => !before.has(f))
    check(
      `${source}: tao ra file nhac`,
      fresh.some((f) => /\.(mp3|m4a|opus|webm)$/i.test(f)),
      fresh.length ? fresh.join(', ') : outcome
    )
    check(
      `${source}: co .lrc di kem`,
      fresh.some((f) => f.endsWith('.lrc')),
      source === 'YouTube' ? '(YouTube khong co lyric rieng - bo qua)' : 'khong co'
    )
  }

  if (rendererErrors.length) {
    console.error('\n  --- loi tu renderer ---')
    ;[...new Set(rendererErrors)].slice(0, 6).forEach((e) => console.error('   ', e.slice(0, 400)))
  }
} catch (err) {
  failed++
  console.error('  FAIL  ', err.message)
} finally {
  const mainErrors = mainLog
    .join('')
    .split('\n')
    .filter((l) => /error|Error|LOI|crash|Cannot|undefined/i.test(l))
  if (mainErrors.length) {
    console.error('\n  --- loi tu main process ---')
    ;[...new Set(mainErrors)].slice(0, 10).forEach((e) => console.error('   ', e.trim().slice(0, 400)))
  }
  ws?.close()
  app.kill('SIGKILL')
}

console.log(failed ? `\n${failed} kiem tra that bai.` : '\nTai qua giao dien chay tot ca ba nguon.')
process.exit(failed ? 1 : 0)
