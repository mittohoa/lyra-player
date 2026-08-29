// Test dau-cuoi bang app that: quet thu vien -> bam phat -> kiem tra co ra tieng.
//
// Khong dung API noi bo nao ca: script bat app len voi mot thu muc du lieu rieng,
// noi vao qua CDP (remote debugging) roi thao tac dung nhu nguoi dung.
// Dong ho phat chi nhich len khi the <audio> that su giai ma duoc file,
// nen "elapsed > 0" la bang chung chac chan rang chuoi media:// -> <audio> chay.
//
//   node scripts/test-playback.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 9333
let failed = 0

const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** WAV 16-bit mono, mot not sin - du de trinh duyet giai ma va chay dong ho. */
function writeWav(path, seconds, freq) {
  const rate = 22050
  const n = rate * seconds
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    // Giam dan ve cuoi de khong bi tach o doan noi
    const fade = Math.min(1, (n - i) / (rate * 0.2))
    data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * freq) * 9000 * fade), i * 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVE', 8)
  head.write('fmt ', 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([head, data]))
}

// ---- Chuan bi thu muc nhac va thu muc du lieu rieng ---------------------
const root = mkdtempSync(join(tmpdir(), 'mp-e2e-'))
const musicDir = join(root, 'Nhac')
const userData = join(root, 'userData')
mkdirSync(musicDir, { recursive: true })
mkdirSync(userData, { recursive: true })

const DEMO = [
  { file: 'Ban Thu Nghiem - Bai Mot.wav', freq: 440, secs: 20 },
  { file: 'Ban Thu Nghiem - Bai Hai.wav', freq: 523, secs: 15 },
  { file: 'Ban Thu Nghiem - Bai Ba.wav', freq: 349, secs: 15 }
]
for (const d of DEMO) writeWav(join(musicDir, d.file), d.secs, d.freq)

// File .lrc di kem cho ca ba bai. Thu tu hien thi phu thuoc cach sap xep cua app,
// nen dat cho tat ca de test khong phu thuoc bai nao dung dau danh sach.
const LRC = ['[00:00.00]Dong dau tien', '[00:03.00]Dong thu hai', '[00:07.50]Dong thu ba'].join('\n')
for (const d of DEMO) {
  writeFileSync(join(musicDir, d.file.replace(/\.wav$/, '.lrc')), LRC, 'utf8')
}

writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({ libraryFolders: [musicDir], volume: 0.05, minimizeToTray: false }, null, 2),
  'utf8'
)

// ---- Bat app ------------------------------------------------------------
// Goi package 'electron' tra ve duong dan tuyet doi toi file nhi phan
const { default: electron } = await import('electron')
const child = spawn(
  electron,
  ['.', `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`],
  { stdio: ['ignore', 'pipe', 'pipe'] }
)
const appLog = []
child.stdout.on('data', (b) => appLog.push(b.toString()))
child.stderr.on('data', (b) => appLog.push(b.toString()))

// ---- Noi vao renderer qua CDP ------------------------------------------
async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'))
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      // app chua mo cong debug - thu lai
    }
    await sleep(500)
  }
  throw new Error('khong noi duoc vao cua so chinh qua CDP')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let id = 0
    const pending = new Map()
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
    }
    ws.onerror = () => reject(new Error('loi websocket CDP'))
    ws.onopen = () =>
      resolve({
        send: (method, params) =>
          new Promise((res, rej) => {
            const myId = ++id
            pending.set(myId, { resolve: res, reject: rej })
            ws.send(JSON.stringify({ id: myId, method, params }))
          }),
        close: () => ws.close()
      })
  })
}

let cdp
try {
  const page = await findPage()
  cdp = await connect(page.webSocketDebuggerUrl)

  /** Chay JS trong renderer va tra ve gia tri that. */
  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? 'loi khi chay JS')
    }
    return r.result.value
  }

  /** Cho den khi bieu thuc trong renderer tra ve gia tri that (khong cho cung). */
  const waitFor = async (expression, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs
    let value
    while (Date.now() < deadline) {
      value = await evaluate(expression)
      if (value) return value
      await sleep(300)
    }
    return value
  }

  await evaluate('1')
  check('app bat len va noi duoc vao renderer', true)

  // 1. Quet thu vien qua dung API ma UI dung
  const scanned = await evaluate('window.api.library.scan().then(t => t.length)')
  check('quet thu vien thay du 3 bai', scanned === 3, `thay ${scanned}`)

  // 2. Nap lai de UI doc thu vien vua quet
  await evaluate('location.reload()')
  const rows = await waitFor('document.querySelectorAll(".track-row").length')
  check('danh sach hien du 3 dong', rows === 3, `hien ${rows}`)

  const firstTitle = await evaluate('document.querySelector(".track-row__title")?.textContent')
  check(
    'doc duoc ten bai tu ten file',
    firstTitle === 'Bai Ba' || firstTitle === 'Bai Hai' || firstTitle === 'Bai Mot',
    `"${firstTitle}"`
  )

  // 3. Bam nut phat cua dong dau tien - dung nhu nguoi dung
  await evaluate(
    `document.querySelector('.track-row [title="Phát"]')
       .dispatchEvent(new MouseEvent('click', { bubbles: true }))`
  )
  await sleep(4000)

  // 4. Dong ho chi nhich khi <audio> that su giai ma duoc file
  const elapsed = await evaluate('document.querySelector(".seek__time")?.textContent')
  const seconds = (() => {
    const m = /^(\d+):(\d{2})$/.exec(elapsed ?? '')
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1
  })()
  check('nhac that su dang phat (dong ho chay)', seconds > 0, `dong ho hien ${elapsed}`)

  const isPause = await evaluate(
    'document.querySelector(".transport__play")?.getAttribute("title")'
  )
  check('nut chuyen sang trang thai dang phat', isPause === 'Tạm dừng', `title="${isPause}"`)

  // 5. Lyric .lrc nam canh file phai duoc nhan va chay theo nhac
  await evaluate(
    `[...document.querySelectorAll('.nav-item')]
       .find(b => b.textContent.includes('Đang phát')).click()`
  )
  await sleep(1500)

  const origin = await evaluate('document.querySelector(".lyrics__origin")?.textContent')
  const lyricLines = await evaluate('document.querySelectorAll(".lyric-line").length')
  const active = await evaluate('document.querySelector(".lyric-line--active")?.textContent')

  check('nhan ra file .lrc di kem', /lrc đi kèm/.test(origin ?? ''), `nguon: "${origin}"`)
  check('hien du 3 dong lyric', lyricLines === 3, `hien ${lyricLines}`)
  check('to sang dung dong theo thoi gian', !!active, `dong dang hat: "${active}"`)

  // 6. Tua den giay thu 8 -> phai nhay sang dong cuoi
  await evaluate(
    `[...document.querySelectorAll('.lyric-line')].at(-1)
       .dispatchEvent(new MouseEvent('click', { bubbles: true }))`
  )
  await sleep(1200)
  const afterSeek = await evaluate('document.querySelector(".lyric-line--active")?.textContent')
  check('bam vao dong lyric thi tua den dung cho', afterSeek === 'Dong thu ba', `"${afterSeek}"`)

  // 7. Playlist: tao moi tu thanh ben, them bai, mo ra xem
  await evaluate(
    `[...document.querySelectorAll('.nav-item')]
       .find(b => b.textContent.includes('Thư viện')).click()`
  )
  await sleep(600)

  await evaluate('document.querySelector(\'[title="Tạo playlist mới"]\').click()')
  await sleep(300)
  await evaluate(`
    const input = document.querySelector('.sidebar input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'Nhạc thư giãn')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  `)
  await sleep(1000)

  const plName = await evaluate('document.querySelector(".view-head h1")?.textContent')
  check('tao playlist va mo ra ngay', plName === 'Nhạc thư giãn', `dang mo: "${plName}"`)

  // Quay ve thu vien, them hai bai dau vao playlist qua menu "+"
  await evaluate(
    `[...document.querySelectorAll('.nav-item')]
       .find(b => b.textContent.includes('Thư viện')).click()`
  )
  await sleep(600)

  for (const rowIndex of [0, 1]) {
    await evaluate(`
      document.querySelectorAll('.track-row')[${rowIndex}]
        .querySelector('[title="Thêm vào playlist"]').click()
    `)
    await sleep(400)
    await evaluate(`document.querySelector('.menu__item').click()`)
    await sleep(500)
  }

  const sidebarCount = await evaluate(`
    [...document.querySelectorAll('.nav-item')]
      .find(b => b.textContent.includes('Nhạc thư giãn'))
      ?.querySelector('.nav-item__count')?.textContent
  `)
  check('so bai trong playlist cap nhat o thanh ben', sidebarCount === '2', `hien ${sidebarCount}`)

  await evaluate(
    `[...document.querySelectorAll('.nav-item')]
       .find(b => b.textContent.includes('Nhạc thư giãn')).click()`
  )
  await sleep(800)

  const plRows = await evaluate('document.querySelectorAll(".track-row").length')
  check('mo playlist thay du 2 bai', plRows === 2, `thay ${plRows}`)

  // Doi thu tu: dua bai thu hai len dau
  const beforeMove = await evaluate('document.querySelector(".track-row__title")?.textContent')
  await evaluate(
    `document.querySelectorAll('.track-row')[1].querySelector('[title="Lên trên"]').click()`
  )
  await sleep(600)
  const afterMove = await evaluate('document.querySelector(".track-row__title")?.textContent')
  check('doi duoc thu tu bai trong playlist', afterMove !== beforeMove, `"${beforeMove}" -> "${afterMove}"`)

  // Playlist phai con nguyen sau khi khoi dong lai
  await evaluate('location.reload()')
  const persisted = await waitFor(`
    [...document.querySelectorAll('.nav-item')]
      .find(b => b.textContent.includes('Nhạc thư giãn'))
      ?.querySelector('.nav-item__count')?.textContent
  `)
  check('playlist duoc luu lai sau khi nap lai', persisted === '2', `hien ${persisted}`)

  // Anh chup man hinh de xem bang mat - chi khi duoc yeu cau
  if (process.env.MP_SHOT) {
    await evaluate(
      `[...document.querySelectorAll('.nav-item')]
         .find(b => b.textContent.includes('Nhạc thư giãn')).click()`
    )
    await sleep(800)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(process.env.MP_SHOT, Buffer.from(shot.data, 'base64'))
    console.log(`  (da luu anh chup vao ${process.env.MP_SHOT})`)
  }
} catch (err) {
  failed++
  console.error('  FAIL  ', err.message)
  if (appLog.length) console.error('  --- log app ---\n' + appLog.join('').slice(0, 1500))
} finally {
  cdp?.close()
  child.kill('SIGKILL')

  // Windows con giu file cache cua Electron them mot lat sau khi tien trinh chet.
  // Thu vai lan roi thoi - thu muc nam trong %TEMP% nen he thong se tu don.
  for (let i = 0; i < 5; i++) {
    await sleep(500)
    try {
      rmSync(root, { recursive: true, force: true })
      break
    } catch {
      if (i === 4) console.warn(`  (khong xoa duoc thu muc tam ${root} - de he thong tu don)`)
    }
  }
}

console.log(failed ? `\n${failed} kiem tra that bai.` : '\nTat ca kiem tra phat nhac deu dat.')
process.exit(failed ? 1 : 0)
