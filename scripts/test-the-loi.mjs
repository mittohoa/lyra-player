// Do THE LOI CHIA SE tren mot ban chay that, qua dung giao dien nguoi dung
// bam: phat mot bai, mo trang Dang phat, bam nut lam the tren mot dong loi,
// roi doc thang diem anh cua tam the ra ma do.
//
// Doc diem anh chu khong nhin bang mat, vi bo kiem tu dong khong nhin duoc.
// Phep do quan trong nhat la SAU MAU CO KHAC NHAU THAT KHONG — sau mau ma ba
// mau ve ra giong het nhau thi bai kiem van xanh neu chi hoi "co ve duoc
// khong".
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PORT = 9337
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let hong = 0
function check(ten, dat, chiTiet = '') {
  console.log(`  ${dat ? 'ok  ' : 'FAIL'} ${ten}${chiTiet ? `  (${chiTiet})` : ''}`)
  if (!dat) hong++
}

/**
 * Mot tam anh BMP dac mot mau, dung lam anh bia.
 *
 * BMP chu khong PNG: PNG can nen zlib va bon ma CRC32, ma o day chi can mot o
 * mau de hai mau the "can bia" co cai ma ve. BMP thi ghi thang duoc.
 */
function anhBmp(canh, r, g, b) {
  const hangByte = Math.ceil((canh * 3) / 4) * 4
  const than = Buffer.alloc(hangByte * canh)
  for (let y = 0; y < canh; y++) {
    for (let x = 0; x < canh; x++) {
      const i = y * hangByte + x * 3
      than[i] = b
      than[i + 1] = g
      than[i + 2] = r
    }
  }
  const dau = Buffer.alloc(54)
  dau.write('BM', 0)
  dau.writeUInt32LE(54 + than.length, 2)
  dau.writeUInt32LE(54, 10)
  dau.writeUInt32LE(40, 14)
  dau.writeInt32LE(canh, 18)
  dau.writeInt32LE(canh, 22)
  dau.writeUInt16LE(1, 26)
  dau.writeUInt16LE(24, 28)
  dau.writeUInt32LE(than.length, 34)
  return Buffer.concat([dau, than])
}

/** Mot file MP3 im lang co the ID3v2.3 mang ten bai va ANH BIA. */
function vietMp3(duong, tenBai, caSi) {
  const songAn = (v) => Buffer.from([(v >> 21) & 0x7f, (v >> 14) & 0x7f, (v >> 7) & 0x7f, v & 0x7f])
  const lonTruoc = (v) => Buffer.from([(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff])
  const khung = (ten, noi) =>
    Buffer.concat([Buffer.from(ten, 'latin1'), lonTruoc(noi.length), Buffer.from([0, 0]), noi])

  const chu = (t) => Buffer.concat([Buffer.from([3]), Buffer.from(t, 'utf8')])
  const bia = anhBmp(64, 200, 96, 48)
  const apic = Buffer.concat([
    Buffer.from([3]),
    Buffer.from('image/bmp', 'latin1'),
    Buffer.from([0]),
    Buffer.from([3]), // 3 = anh bia mat truoc
    Buffer.from([0]), // mo ta rong
    bia
  ])

  const than = Buffer.concat([khung('TIT2', chu(tenBai)), khung('TPE1', chu(caSi)), khung('APIC', apic)])
  const the = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([3, 0, 0]), songAn(than.length), than])

  // Khung MPEG1 Layer3 128kbps 44.1kHz = 417 byte. 2300 khung ~ 60 giay.
  const mot = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)])
  writeFileSync(duong, Buffer.concat([the, ...Array(2300).fill(mot)]))
}

const root = mkdtempSync(join(tmpdir(), 'mp-the-'))
const nhacDir = join(root, 'Nhac')
const userData = join(root, 'userData')
mkdirSync(nhacDir, { recursive: true })
mkdirSync(userData, { recursive: true })

// Dung MP3 co anh bia chu khong dung WAV: thieu bia thi hai mau "can bia" bi
// tat, va bai kiem se bao xanh trong khi hai mau do chua tung duoc ve lan nao.
vietMp3(join(nhacDir, 'Nguoi Thu - Bai Thu.mp3'), 'Bài Thử', 'Người Thử')
writeFileSync(
  join(nhacDir, 'Nguoi Thu - Bai Thu.lrc'),
  ['[00:00.00]Em ngày em đánh rơi nụ cười vào anh',
   '[00:04.00]Có nghĩ sau này em sẽ chờ',
   '[00:09.00]Dòng thứ ba'].join('\n'),
  'utf8'
)
writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({ libraryFolders: [nhacDir], volume: 0.02, minimizeToTray: false }, null, 2),
  'utf8'
)

const { default: electron } = await import('electron')
const child = spawn(
  electron,
  ['.', `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`],
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
  const ev = async (bt) => {
    const r = await goi('Runtime.evaluate', {
      expression: bt,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result.value
  }

  await goi('Runtime.enable')
  await sleep(1200)

  await ev('window.api.library.scan()')
  await ev('location.reload()')
  await sleep(2500)
  await goi('Runtime.enable')

  await ev(
    `[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Thư viện'))?.click()`
  )
  await sleep(1500)
  await ev(
    `document.querySelector('.track-row')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`
  )
  await sleep(2500)
  await ev(
    `[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Đang phát'))?.click()`
  )

  let soDong = 0
  for (let i = 0; i < 30; i++) {
    soDong = await ev(`document.querySelectorAll('.lyric-line').length`)
    if (soDong >= 3) break
    await sleep(500)
  }
  check('doc duoc loi tu file .lrc di kem', soDong >= 3, `${soDong} dong`)

  const coNut = await ev(`document.querySelectorAll('.lyric-line__the').length`)
  check('moi dong loi deu co nut lam the', coNut >= 3, `${coNut} nut`)

  await ev(`document.querySelector('.lyric-line__the').click()`)
  await sleep(1200)

  const moRa = await ev(`!!document.querySelector('.the-loi__xem')`)
  check('bam nut thi hop the loi mo ra', moRa === true)

  const soMau = await ev(`document.querySelectorAll('.the-loi__chip').length`)
  check('co du sau mau de chon', soMau === 6, `${soMau} mau`)

  // Ve tung mau roi lay chu ky diem anh
  const bang = JSON.parse(
    await ev(`
      (async () => {
        const chip = [...document.querySelectorAll('.the-loi__chip')]
        const cv = document.querySelector('.the-loi__xem')
        const c = cv.getContext('2d')
        const ra = {}
        for (const n of chip) {
          n.click()
          await new Promise(r => setTimeout(r, 260))
          const d = c.getImageData(0, 0, cv.width, cv.height).data
          let tong = 0, khacNen = 0
          const r0 = d[0], g0 = d[1], b0 = d[2]
          for (let i = 0; i < d.length; i += 4 * 97) {
            tong += d[i] + d[i+1] + d[i+2]
            if (Math.abs(d[i]-r0) + Math.abs(d[i+1]-g0) + Math.abs(d[i+2]-b0) > 24) khacNen++
          }
          ra[n.textContent.trim()] = { tong, khacNen, rong: cv.width, cao: cv.height, tat: n.disabled }
        }
        return JSON.stringify(ra)
      })()
    `)
  )

  const ten = Object.keys(bang)
  check('tam the dung co 1080x1350',
    ten.every((k) => bang[k].rong === 1080 && bang[k].cao === 1350),
    `${bang[ten[0]].rong}x${bang[ten[0]].cao}`)

  // Hai mau can bia bi tat vi bai thu khong co anh bia - dung nhu thiet ke
  const dungDuoc = ten.filter((k) => !bang[k].tat)
  const biTat = ten.filter((k) => bang[k].tat)
  check('bai co bia thi ca sau mau deu dung duoc', biTat.length === 0,
    biTat.length ? 'bi mo: ' + biTat.join(', ') : 'ca sau mau deu bat')

  const trong = dungDuoc.filter((k) => bang[k].khacNen < 200)
  check('tam nao cung co chu, khong tam nao trong', trong.length === 0,
    trong.length ? 'trong: ' + trong.join(', ') : `${dungDuoc.length} tam deu co noi dung`)

  const trung = []
  for (let i = 0; i < dungDuoc.length; i++) {
    for (let j = i + 1; j < dungDuoc.length; j++) {
      if (bang[dungDuoc[i]].tong === bang[dungDuoc[j]].tong) {
        trung.push(dungDuoc[i] + ' = ' + dungDuoc[j])
      }
    }
  }
  check('cac mau ve ra nhung tam khac nhau', trung.length === 0,
    trung.length ? 'trung nhau: ' + trung.join(', ') : `${dungDuoc.length} mau, khong cap nao trung`)

  const coCau = await ev(`typeof window.api?.share?.saveCard`)
  check('co duong luu the ra file', coCau === 'function', String(coCau))
} catch (err) {
  console.log('  FAIL ' + err.message)
  hong++
  console.log('  --- log app ---\n' + appLog.join(''))
} finally {
  try {
    ws?.close()
  } catch {
    // da dong roi
  }
  child.kill()
}

console.log(hong === 0 ? '\nThe loi: dat.\n' : `\n${hong} kiem tra that bai.\n`)
process.exit(hong === 0 ? 0 : 1)
