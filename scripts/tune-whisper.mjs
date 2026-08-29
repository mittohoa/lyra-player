// Thu nghiem: Whisper nghe nhac co nhac nen rat kem voi thiet lap mac dinh.
// Script nay tai mot bai ve MOT LAN roi chay thu nhieu bo tham so de xem
// bo nao nghe ra duoc nhieu tu nhat va can chinh chinh xac nhat.
//
//   npm run tune:whisper
import { app } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

app.setName('Lyra')

const QUERY = process.env.LYRA_SONG ?? 'Noi nay co anh'

/** Cac bo tham so muon so sanh. */
/** 'PROMPT' se duoc thay bang chinh loi bai hat luc chay. */
const ROUND2 = [
  { name: 'base + goi y', size: 'base', extra: ['PROMPT'] },
  { name: 'small + goi y', size: 'small', extra: ['PROMPT'] },
  {
    name: 'small + goi y + noi',
    size: 'small',
    extra: ['PROMPT', '-nth', '0.2', '-et', '3.0', '-lpt', '-1.5']
  }
]

const ROUND1 = [
  { name: 'base mac dinh', size: 'base', extra: [] },
  { name: 'base noi nguong', size: 'base', extra: ['-nth', '0.2', '-et', '3.0', '-lpt', '-1.5'] },
  { name: 'small mac dinh', size: 'small', extra: [] },
  { name: 'small noi nguong', size: 'small', extra: ['-nth', '0.2', '-et', '3.0', '-lpt', '-1.5'] }
]

const TRIALS = process.env.LYRA_ROUND === '2' ? ROUND2 : ROUND1

async function main() {
  const { nctSource } = await import('../src/main/sources/nct')
  const { downloadTrack } = await import('../src/main/download')
  const { patchSettings } = await import('../src/main/store')
  const { alignLyrics } = await import('../src/main/ai/align')
  const w = await import('../src/main/ai/whisper')

  await w.installWhisper(() => {})

  // ---- Tai bai mot lan, giu lai de moi bo tham so dung chung ----
  const folder = join(tmpdir(), 'lyra-tune')
  await fs.mkdir(folder, { recursive: true })
  patchSettings({ downloadFolder: folder })

  const tracks = await nctSource.search(QUERY, 1)
  const track = tracks[0]
  let audioPath = join(folder, 'bai-thu.mp3')
  let lrcPath = join(folder, 'bai-thu.lrc')

  try {
    await fs.access(audioPath)
    console.log('dung lai file da tai truoc do')
  } catch {
    const downloaded = await downloadTrack(track)
    await fs.rename(downloaded, audioPath)
    await fs.rename(downloaded.replace(/\.[^.]+$/, '.lrc'), lrcPath)
  }

  const truth = (await fs.readFile(lrcPath, 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/))
    .filter(Boolean)
    .map((m) => ({ time: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() }))
    .filter((l) => l.text)

  const plain = truth.map((l) => l.text)
  console.log(`Bai: "${track.title}" - ${truth.length} dong co dap an\n`)

  const bin = await w.findWhisper()

  for (const trial of TRIALS) {
    if (!(await w.hasModel(trial.size))) {
      console.log(`--- ${trial.name}: dang tai model ${trial.size}...`)
      await w.installModel(trial.size, (p) => {
        const pct = p.total ? Math.round((p.received / p.total) * 100) : 0
        if (pct % 25 === 0) process.stdout.write(`\r    ${pct}%   `)
      })
      console.log('')
    }

    const outBase = join(folder, 'out-' + trial.size + trial.extra.length)
    const args = [
      '-m', w.modelPath(trial.size),
      '-l', 'vi',
      '-oj',
      '-of', outBase,
      '-t', '8',
      ...trial.extra.flatMap((a) =>
        a === 'PROMPT'
          ? [
              '--prompt',
              plain.join(' ').replace(/\s+/g, ' ').slice(0, 600),
              '--carry-initial-prompt'
            ]
          : [a]
      ),
      audioPath
    ]

    const t0 = Date.now()
    await new Promise((resolve, reject) => {
      const proc = spawn(bin, args, { windowsHide: true })
      proc.stderr.on('data', () => {})
      proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('exit ' + code))))
      proc.on('error', reject)
    })
    const secs = ((Date.now() - t0) / 1000).toFixed(0)

    const parsed = JSON.parse(await fs.readFile(outBase + '.json', 'utf8'))
    const words = []
    for (const seg of parsed.transcription ?? []) {
      const text = seg.text?.trim()
      if (!seg.offsets || !text) continue
      const start = seg.offsets.from / 1000
      const end = seg.offsets.to / 1000
      const parts = text.split(/\s+/).filter(Boolean)
      const step = (end - start) / parts.length
      parts.forEach((word, i) =>
        words.push({ start: start + i * step, end: start + (i + 1) * step, text: word })
      )
    }

    const r = alignLyrics(plain, words)
    let summary = `${String(words.length).padStart(4)} tu | khop ${(r.confidence * 100).toFixed(0).padStart(3)}%`
    if (r.lines.length) {
      const errors = r.lines.map((l, i) => Math.abs(l.time - truth[i].time))
      const sorted = [...errors].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const within3 = errors.filter((e) => e <= 3).length / errors.length
      summary += ` | trung vi ${median.toFixed(1).padStart(5)}s | trong 3s: ${(within3 * 100).toFixed(0)}%`
    } else {
      summary += ' | khong can duoc dong nao'
    }
    console.log(`${trial.name.padEnd(20)} ${String(secs).padStart(4)}s | ${summary}`)
    await fs.rm(outBase + '.json', { force: true })
  }

  app.exit(0)
}

app.whenReady().then(main).catch((err) => {
  console.error('LOI:', err?.stack ?? err)
  app.exit(1)
})
