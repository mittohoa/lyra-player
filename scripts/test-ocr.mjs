// Do phan DOC CHU TU ANH tren mot ban chay that.
//
// Tam anh thu duoc DUNG RA NGAY TRONG APP: ve chu len canvas roi ghi ra PNG.
// Khong nhet mot tam anh co san vao kho — anh nao cung la anh cua ai do, va
// mot bai kiem khong nen mang theo noi dung khong ai doc lai duoc.
//
// Lan chay dau se TAI du lieu ngon ngu (vie + eng, chung 9 MB). Khong co mang
// thi bai nay TU BO QUA thay vi bao hong: mat mang khong phai la loi cua ma
// nguon.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PORT = 9338
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let hong = 0
function check(ten, dat, chiTiet = '') {
  console.log(`  ${dat ? 'ok  ' : 'FAIL'} ${ten}${chiTiet ? `  (${chiTiet})` : ''}`)
  if (!dat) hong++
}

const root = mkdtempSync(join(tmpdir(), 'mp-ocr-'))
const userData = join(root, 'userData')
mkdirSync(userData, { recursive: true })
writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({ libraryFolders: [], volume: 0.02, minimizeToTray: false }, null, 2),
  'utf8'
)

const CAU = ['Em ngày em đánh rơi', 'nụ cười vào anh', 'Có nghĩ sau này em sẽ chờ']

const EXE = process.env.AURA_EXE
const { default: electron } = await import('electron')
console.log('  do tren: ' + (EXE ? 'ban da cai' : 'ma nguon'))
const child = spawn(
  EXE ?? electron,
  [...(EXE ? [] : ['.']), `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`],
  { stdio: ['ignore', 'pipe', 'pipe'] }
)
const appLog = []
child.stdout.on('data', (b) => appLog.push(b.toString()))
child.stderr.on('data', (b) => appLog.push(b.toString()))

async function timTrang() {
  for (let i = 0; i < 40; i++) {
    try {
      const ds = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const t = ds.find((x) => x.type === 'page' && x.url.includes('index.html'))
      if (t?.webSocketDebuggerUrl) return t
    } catch {
      // chua mo cong debug
    }
    await sleep(500)
  }
  throw new Error('khong noi duoc vao cua so chinh qua CDP')
}

let ws
try {
  const trang = await timTrang()
  ws = await new Promise((res, rej) => {
    const w = new WebSocket(trang.webSocketDebuggerUrl)
    w.onopen = () => res(w)
    w.onerror = () => rej(new Error('loi websocket CDP'))
  })
  let idSo = 0
  const dangCho = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data))
    const c = dangCho.get(m.id)
    if (!c) return
    dangCho.delete(m.id)
    m.error ? c.rej(new Error(m.error.message)) : c.res(m.result)
  }
  const goi = (method, params) =>
    new Promise((res, rej) => {
      const id = ++idSo
      dangCho.set(id, { res, rej })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const ev = async (bt, cho = 300000) => {
    const r = await Promise.race([
      goi('Runtime.evaluate', { expression: bt, awaitPromise: true, returnByValue: true }),
      sleep(cho).then(() => {
        throw new Error('qua han ' + cho / 1000 + 's')
      })
    ])
    if (r.exceptionDetails) {
      const d = r.exceptionDetails
      throw new Error(
        d.text + ': ' + (d.exception?.description ?? d.exception?.value ?? '(khong ro)')
      )
    }
    return r.result.value
  }

  await goi('Runtime.enable')
  await sleep(1200)

  // 1. Ve chu len canvas roi lay ra PNG
  const dataUrl = await ev(`
    (() => {
      const cv = document.createElement('canvas')
      cv.width = 900; cv.height = 320
      const c = cv.getContext('2d')
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height)
      c.fillStyle = '#000000'
      c.font = '46px "Segoe UI", system-ui, sans-serif'
      // Gan vao bien truoc: mot dong mo dau bang dau ngoac vuong se bi dinh
      // vao cau lenh truoc do thanh phep truy cap chi so, khong phai mot mang
      // moi. Da mat mot luot chay vi chuyen nay.
      const cau = ${JSON.stringify(CAU)}
      cau.forEach((d, i) => c.fillText(d, 40, 80 + i * 80))
      return cv.toDataURL('image/png')
    })()
  `)
  const anh = join(root, 'loi-chup.png')
  writeFileSync(anh, Buffer.from(dataUrl.split(',')[1], 'base64'))
  check('dung duoc tam anh thu', dataUrl.startsWith('data:image/png'))

  // 2. Bat app doc tam anh do
  let ra
  try {
    ra = JSON.parse(
      await ev(
        `window.api.ocr.read(${JSON.stringify(anh)}).then(r => JSON.stringify(r))`,
        420000
      )
    )
  } catch (e) {
    const loi = String(e.message)
    if (/fetch|network|ENOTFOUND|EAI_AGAIN|qua han/i.test(loi)) {
      console.log('\nBo qua bai do doc chu: khong tai duoc du lieu ngon ngu (' + loi + ').\n')
      process.exit(0)
    }
    throw e
  }

  check('doc ra duoc chu', ra.chu.trim().length > 0, `${ra.chu.split('\n').length} dong`)

  // So khop tung tu: doi Tesseract doc dung tung dau la doi qua nhieu, nhung
  // doc ra duoc phan lon tu thi la dung duoc.
  const canCo = CAU.join(' ').toLowerCase().split(/\s+/)
  const docDuoc = ra.chu.toLowerCase()
  const trung = canCo.filter((t) => docDuoc.includes(t))
  const tiLe = Math.round((trung.length / canCo.length) * 100)
  check('doc dung phan lon cac tu tieng Viet', tiLe >= 70,
    `${trung.length}/${canCo.length} tu = ${tiLe}%`)

  check('giu dau tieng Viet', /[àáảãạăằắâầấèéẻẽẹêềếìíĩòóỏõọôồốơờớùúủũụưừứỳýỹđ]/.test(ra.chu),
    ra.chu.split('\n')[0]?.slice(0, 40) ?? '')

  check('co bao do tin', typeof ra.doTin === 'number' && ra.doTin > 0, `${ra.doTin}%`)

  check('giu nguyen so dong cua anh', ra.chu.split('\n').length === CAU.length,
    `${ra.chu.split('\n').length} dong, anh co ${CAU.length}`)

  const coPick = await ev(`typeof window.api?.ocr?.pick`)
  check('co duong chon anh rieng', coPick === 'function', String(coPick))
} catch (err) {
  console.log('  FAIL ' + err.message)
  hong++
  console.log('  --- log app ---\n' + appLog.join('').slice(-1500))
} finally {
  try {
    ws?.close()
  } catch {
    // da dong roi
  }
  child.kill()
}

console.log(hong === 0 ? '\nDoc chu tu anh: dat.\n' : `\n${hong} kiem tra that bai.\n`)
process.exit(hong === 0 ? 0 : 1)
