// Kiem chung tinh nang "AI can timestamp" bang DU LIEU THAT co dap an.
//
// Cach lam: tai mot bai tu NhacCuaTui - ho cho san file .lrc chuan co timestamp.
// Lay file do lam DAP AN, boc timestamp di de con loi thuan, roi bat Whisper +
// thuat toan can chinh dung lai timestamp. Cuoi cung do sai so voi dap an.
//
//   npm run test:whisper
import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

app.setName('Lyra')

const SIZE = process.env.LYRA_MODEL ?? 'base'
const QUERY = process.env.LYRA_SONG ?? 'Noi nay co anh'

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else { failed++; console.error(`  FAIL ${name}  ${detail}`) }
}
const mb = (n) => (n / 1048576).toFixed(0) + ' MB'

async function main() {
  const { nctSource } = await import('../src/main/sources/nct')
  const { downloadTrack } = await import('../src/main/download')
  const { patchSettings } = await import('../src/main/store')
  const { alignLyrics } = await import('../src/main/ai/align')
  const w = await import('../src/main/ai/whisper')

  // ---- 1. Cai whisper + model ----
  let last = 0
  const onProgress = (p) => {
    const pct = p.total ? Math.round((p.received / p.total) * 100) : 0
    if (pct >= last + 25) { last = pct; console.log(`      ${p.step}: ${pct}% (${mb(p.received)})`) }
  }

  console.log('--- cai dat ---')
  last = 0
  await w.installWhisper(onProgress)
  check('cai duoc whisper.cpp', !!(await w.findWhisper()), (await w.findWhisper()) ?? '')

  last = 0
  await w.installModel(SIZE, onProgress)
  check(`tai duoc model ${SIZE}`, await w.hasModel(SIZE), w.MODEL_INFO[SIZE].mb + ' MB')

  // ---- 2. Tai bai that kem .lrc lam dap an ----
  console.log('\n--- tai bai co dap an ---')
  const folder = join(tmpdir(), 'lyra-align-' + Date.now())
  await fs.mkdir(folder, { recursive: true })
  patchSettings({ downloadFolder: folder })

  const tracks = await nctSource.search(QUERY, 1)
  if (!tracks.length) { check('tim thay bai de thu', false, 'khong co ket qua'); return
  }
  const track = tracks[0]
  const audioPath = await downloadTrack(track)
  const lrcPath = audioPath.replace(/\.[^.]+$/, '.lrc')

  const truthLrc = await fs.readFile(lrcPath, 'utf8')
  const truth = truthLrc
    .split(/\r?\n/)
    .map((l) => l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/))
    .filter(Boolean)
    .map((m) => ({ time: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() }))
    .filter((l) => l.text)

  check('co dap an de doi chieu', truth.length > 20, `${truth.length} dong co timestamp`)
  check('file nhac ton tai', !!(await fs.stat(audioPath)), `"${track.title}"`)

  // ---- 3. Phien am + can chinh ----
  console.log('\n--- phien am (mat vai phut) ---')
  const t0 = Date.now()
  const words = await w.transcribe(audioPath, { size: SIZE, language: 'vi' })
  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  check('Whisper nghe ra duoc tu', words.length > 50, `${words.length} tu trong ${secs}s`)

  const plain = truth.map((l) => l.text) // loi thuan, da boc timestamp
  const aligned = alignLyrics(plain, words)

  check('can chinh ra du so dong', aligned.lines.length === plain.length,
    `${aligned.lines.length}/${plain.length}`)
  check('do tin cay hop ly', aligned.confidence > 0.25,
    `${(aligned.confidence * 100).toFixed(0)}% tu bat duoc moc`)

  // ---- 4. Do sai so voi dap an ----
  if (!aligned.lines.length) {
    console.log('
Khong can duoc dong nao - bo qua phan do sai so.')
    console.log(failed ? `
${failed} kiem tra that bai.` : '')
    app.exit(1)
    return
  }

  const errors = aligned.lines.map((l, i) => Math.abs(l.time - truth[i].time))
  const sorted = [...errors].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length
  const within2 = errors.filter((e) => e <= 2).length / errors.length
  const within5 = errors.filter((e) => e <= 5).length / errors.length

  console.log('\n--- sai so so voi ban chuan cua NhacCuaTui ---')
  console.log(`      trung vi : ${median.toFixed(2)}s`)
  console.log(`      trung binh: ${mean.toFixed(2)}s`)
  console.log(`      trong 2s : ${(within2 * 100).toFixed(0)}% so dong`)
  console.log(`      trong 5s : ${(within5 * 100).toFixed(0)}% so dong`)
  console.log('\n      5 dong dau:')
  aligned.lines.slice(0, 5).forEach((l, i) => {
    console.log(`      ${l.time.toFixed(2).padStart(7)}s  (chuan ${truth[i].time.toFixed(2)}s)  ${l.text.slice(0, 46)}`)
  })

  check('trung vi sai so duoi 3 giay', median < 3, `${median.toFixed(2)}s`)
  check('qua nua so dong lech duoi 2 giay', within2 > 0.5, `${(within2 * 100).toFixed(0)}%`)

  try { await fs.rm(folder, { recursive: true, force: true }) } catch {}
  console.log(failed ? `\n${failed} kiem tra that bai.` : '\nTat ca kiem tra can timestamp deu dat.')
  app.exit(failed ? 1 : 0)
}

app.whenReady().then(main).catch((err) => {
  console.error('  FAIL  ', err?.stack ?? err)
  app.exit(1)
})
