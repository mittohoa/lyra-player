// Do phan PHAT PHIM tren mot ban chay that.
//
// Cach lam giong `test-playback.mjs`: bat app voi mot thu muc du lieu rieng,
// noi vao renderer qua CDP, roi hoi thang cai the <video> xem no co that su
// chay hay khong.
//
// KHONG tu tao file phim: chua co bo ma hoa nao trong may de dung ra mot file
// hop le. Nen bai nay doi mot duong dan phim that qua bien moi truong
// AURA_VIDEO_THU, va TU BO QUA khi khong co - bo kiem van chay duoc tren may
// khac ma khong bao hong gia.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'

const NGUON = process.env.AURA_VIDEO_THU
if (!NGUON || !existsSync(NGUON)) {
  console.log('\nBo qua bai do phim: chua dat AURA_VIDEO_THU tro toi mot file phim co that.\n')
  process.exit(0)
}

const PORT = 9334
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let hong = 0
function check(ten, dat, chiTiet = '') {
  console.log(`  ${dat ? 'ok  ' : 'FAIL'} ${ten}${chiTiet ? `  (${chiTiet})` : ''}`)
  if (!dat) hong++
}

const root = mkdtempSync(join(tmpdir(), 'mp-video-'))
const phimDir = join(root, 'Phim')
const userData = join(root, 'userData')
mkdirSync(phimDir, { recursive: true })
mkdirSync(userData, { recursive: true })

// Ten trung tinh: file nguon la cua nguoi dung, khong de ten that lot vao log
const tenPhim = 'Doan Phim Thu' + extname(NGUON).toLowerCase()
copyFileSync(NGUON, join(phimDir, tenPhim))

// Phu de .srt nam canh - de do luon duong doc phu de
const SRT = [
  '1', '00:00:00,500 --> 00:00:02,000', 'Dong phu de thu nhat', '',
  '2', '00:00:02,000 --> 00:00:04,000', 'Dong phu de thu hai', ''
].join('\n')
writeFileSync(join(phimDir, tenPhim.replace(extname(tenPhim), '.srt')), SRT, 'utf8')

writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({ libraryFolders: [phimDir], volume: 0.05, minimizeToTray: false }, null, 2),
  'utf8'
)

// Mac dinh chay ma nguon. Dat AURA_EXE tro toi mot ban DA CAI thi do chinh
// ban do — de kiem thu that su duoc dong goi ra chu khong chi kiem ma nguon.
const EXE = process.env.AURA_EXE
const { default: electron } = await import('electron')
const lenh = EXE ?? electron
const thamSo = EXE ? [] : ['.']
console.log('  do tren: ' + (EXE ? 'ban da cai' : 'ma nguon'))
const child = spawn(
  lenh,
  [...thamSo, `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`],
  { stdio: ['ignore', 'pipe', 'pipe'] }
)
const appLog = []
child.stdout.on('data', (b) => appLog.push(b.toString()))
child.stderr.on('data', (b) => appLog.push(b.toString()))

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'))
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      // chua mo cong debug
    }
    await sleep(500)
  }
  throw new Error('khong noi duoc vao cua so chinh qua CDP')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.onopen = () => resolve(ws)
    ws.onerror = () => reject(new Error('loi websocket CDP'))
  })
}

let idSo = 0
const dangCho = new Map()

function nhanTraLoi(e) {
  const msg = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data))
  const cho = dangCho.get(msg.id)
  if (!cho) return
  dangCho.delete(msg.id)
  if (msg.error) cho.reject(new Error(msg.error.message))
  else cho.resolve(msg.result)
}

function goi(ws, method, params) {
  const id = ++idSo
  return new Promise((resolve, reject) => {
    dangCho.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function ev(ws, bieuThuc) {
  const r = await goi(ws, 'Runtime.evaluate', {
    expression: bieuThuc,
    awaitPromise: true,
    returnByValue: true
  })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ': ' + bieuThuc)
  return r.result.value
}

try {
  const page = await findPage()
  const ws = await connect(page.webSocketDebuggerUrl)
  ws.onmessage = nhanTraLoi
  await goi(ws, 'Runtime.enable')
  await sleep(1500)

  // ---- 1. Quet ra file phim va nhan dung la phim ----
  // Goi thang lenh quet chu khong doi app tu quet: cho thi phai doan mat bao
  // lau, va doan sai thi bai kiem bao hong trong khi ma nguon khong sai.
  const soQuet = await ev(ws, 'window.api.library.scan().then(t => t.length)')
  check('quet thay file phim', soQuet === 1, `thay ${soQuet}`)

  const loai = await ev(ws, 'window.api.library.scan().then(t => t[0] && t[0].kind)')
  check('nhan dung la phim, khong phai nhac', loai === 'video', String(loai))

  // Nap lai trang de giao dien doc thu vien vua quet: lenh quet o tren chay
  // ben tien trinh chinh, no khong tu day ket qua sang cho giao dien.
  await ev(ws, 'location.reload()')
  await sleep(2000)
  await goi(ws, 'Runtime.enable')

  await ev(ws, `[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Thư viện'))?.click()`)
  let soDong = 0
  for (let i = 0; i < 30; i++) {
    soDong = await ev(ws, `document.querySelectorAll('.track-row').length`)
    if (soDong > 0) break
    await sleep(500)
  }
  if (soDong === 0) {
    const chanDoan = await ev(ws, `JSON.stringify({
      nav: [...document.querySelectorAll('.nav-item')].map(b => b.textContent.trim()),
      trang: document.querySelector('.content, main')?.textContent?.slice(0, 200) ?? '(khong thay)'
    })`)
    console.log('  chan doan: ' + chanDoan)
  }
  check('danh sach hien ra dong phim', soDong === 1, `hien ${soDong} dong`)

  const laPhim = await ev(ws, `
    (() => {
      const el = document.querySelector('.track-row')
      return el ? el.textContent.includes('Doan Phim Thu') : false
    })()
  `)
  check('dong danh sach la file phim vua chep vao', laPhim === true)

  // ---- 2. Phat, va kiem the <video> that su chay ----
  await ev(ws, `document.querySelector('.track-row').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await sleep(1500)

  // Sang trang Dang phat: cho hien hinh nam trong do. O trang Thu vien thi the
  // <video> khong duoc gan vao dau ca - va no van phat tieng binh thuong, dung
  // nhu thiet ke.
  await ev(ws, `[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Đang phát'))?.click()`)
  await sleep(2500)

  const the = await ev(ws, `
    (() => {
      const v = document.querySelector('video')
      if (!v) return null
      return {
        gan: !!v.closest('.video-stage'),
        chay: !v.paused,
        giay: Math.round(v.currentTime * 10) / 10,
        rong: v.videoWidth,
        cao: v.videoHeight
      }
    })()
  `)
  check('the <video> nam trong cho hien hinh', the?.gan === true)
  check('phim dang chay', the?.chay === true, `${the?.giay ?? '?'}s`)
  check('co hinh that (khong phai chi co tieng)', (the?.rong ?? 0) > 0 && (the?.cao ?? 0) > 0,
    `${the?.rong}x${the?.cao}`)

  // ---- 3. Phu de .srt nam canh duoc doc len ----
  let nguon = ''
  for (let i = 0; i < 20; i++) {
    nguon = await ev(ws, `document.querySelector('.lyrics')?.textContent ?? ''`)
    if (nguon.includes('phụ đề') || nguon.includes('Dong phu de')) break
    await sleep(500)
  }
  check('doc duoc phu de .srt nam canh phim',
    nguon.includes('Dong phu de thu nhat'),
    nguon.slice(0, 60).replace(/\s+/g, ' '))

  check('nhan nguon noi dung la phu de, khong noi la .lrc',
    nguon.includes('phụ đề') && !nguon.includes('.lrc đi kèm'),
    nguon.slice(0, 60).replace(/s+/g, ' '))

  // ---- 4. Nut toan man hinh co mat ----
  const coNut = await ev(ws, `!!document.querySelector('.video-stage__nut')`)
  check('co nut toan man hinh', coNut === true)

  ws.close()
} catch (err) {
  console.log('  FAIL ' + err.message)
  hong++
  console.log('  --- log app ---\n' + appLog.join(''))
} finally {
  child.kill()
}

console.log(hong === 0 ? '\nPhat phim: dat.\n' : `\n${hong} kiem tra that bai.\n`)
process.exit(hong === 0 ? 0 : 1)
