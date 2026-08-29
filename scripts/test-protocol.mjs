// Kiem tra scheme media:// : doc dung file, xu ly dung header Range.
// Chay: npx electron scripts/test-protocol.mjs
import { app, net, protocol } from 'electron'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true } }
])

// Tao file WAV 8kHz mono 0.5 giay de co du lieu that ma doc
function makeWav(path) {
  const rate = 8000
  const samples = rate / 2
  const data = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 12000), i * 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8)
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28)
  head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34)
  head.write('data', 36); head.writeUInt32LE(data.length, 40)
  const all = Buffer.concat([head, data])
  writeFileSync(path, all)
  return all
}

const dir = mkdtempSync(join(tmpdir(), 'mp-test-'))
// Ten co dau va khoang trang - dung kieu thu muc nhac that
const file = join(dir, 'Nghe si - Bai hat thu nghiem.wav')
const bytes = makeWav(file)

let failed = false
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok  ${name}`) }
  catch (err) { failed = true; console.error(`  FAIL ${name}\n       ${err.message}`) }
}

app.whenReady().then(async () => {
  // Dung dung module cua app, khong chep lai logic
  const { handleMediaProtocol } = await import('../src/main/protocol.ts')
  handleMediaProtocol()

  const url = `media://local/${encodeURIComponent(file)}`

  await check('doc duoc toan bo file', async () => {
    const res = await net.fetch(url)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('accept-ranges'), 'bytes')
    assert.equal(res.headers.get('content-type'), 'audio/wav')
    const got = Buffer.from(await res.arrayBuffer())
    assert.equal(got.length, bytes.length)
    assert.ok(got.equals(bytes), 'noi dung phai giong file goc')
  })

  await check('Range tra ve 206 va dung doan byte', async () => {
    const res = await net.fetch(url, { headers: { Range: 'bytes=100-199' } })
    assert.equal(res.status, 206)
    assert.equal(res.headers.get('content-range'), `bytes 100-199/${bytes.length}`)
    assert.equal(res.headers.get('content-length'), '100')
    const got = Buffer.from(await res.arrayBuffer())
    assert.ok(got.equals(bytes.subarray(100, 200)))
  })

  await check('Range mo (bytes=N-) chay toi cuoi file', async () => {
    const start = bytes.length - 50
    const res = await net.fetch(url, { headers: { Range: `bytes=${start}-` } })
    assert.equal(res.status, 206)
    assert.equal(res.headers.get('content-range'), `bytes ${start}-${bytes.length - 1}/${bytes.length}`)
    assert.equal((await res.arrayBuffer()).byteLength, 50)
  })

  await check('Range am (bytes=-N) lay N byte cuoi', async () => {
    const res = await net.fetch(url, { headers: { Range: 'bytes=-30' } })
    assert.equal(res.status, 206)
    const got = Buffer.from(await res.arrayBuffer())
    assert.ok(got.equals(bytes.subarray(bytes.length - 30)))
  })

  await check('Range vuot qua cuoi file -> 416', async () => {
    const res = await net.fetch(url, { headers: { Range: `bytes=${bytes.length + 10}-` } })
    assert.equal(res.status, 416)
  })

  await check('file khong ton tai -> 404', async () => {
    const res = await net.fetch(`media://local/${encodeURIComponent(join(dir, 'khong-co.mp3'))}`)
    assert.equal(res.status, 404)
  })

  console.log(failed ? '\nCo kiem tra that bai.' : '\nTat ca kiem tra media:// deu dat.')
  app.exit(failed ? 1 : 0)
})
