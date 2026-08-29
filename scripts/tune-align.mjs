// Chay Whisper MOT LAN, luu ban phien am lai, roi thu nhieu bien the cua thuat
// toan can chinh tren cung du lieu do. Nho vay lap thuat toan trong vai giay
// thay vi cho vai phut moi lan.
//
//   npm run tune:align            (dung ban phien am da luu neu co)
//   LYRA_FRESH=1 npm run tune:align   (chay lai Whisper)
import { app } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

app.setName('Lyra')

const WORK = join(tmpdir(), 'lyra-tune')
const SIZE = process.env.LYRA_MODEL ?? 'small'

/** Bo dau, dau cau, ve chu thuong - giong ham trong align.ts. */
function normalize(word) {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Khoang cach sua doi, dung sat nguong de thoat som. */
function withinEditDistance(a, b, max) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > max) return false
  const prev = new Array(b.length + 1)
  const cur = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      best = Math.min(best, cur[j])
    }
    if (best > max) return false
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]
  }
  return prev[b.length] <= max
}

/** LCS voi ham so sanh thay doi duoc. */
function lcsPairs(a, b, equal) {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = equal(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const pairs = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (equal(a[i], b[j])) {
      pairs.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return pairs
}

/** Can chinh dung mot ham so sanh cho truoc; tra ve moc thoi gian tung dong. */
function align(lines, words, equal) {
  const flat = []
  lines.forEach((line, lineIndex) => {
    for (const raw of line.split(/\s+/)) {
      const t = normalize(raw)
      if (t) flat.push({ text: t, lineIndex })
    }
  })
  const heard = words.map((w) => ({ ...w, norm: normalize(w.text) })).filter((w) => w.norm)
  if (!flat.length || !heard.length) return { times: [], confidence: 0 }

  const pairs = lcsPairs(flat.map((w) => w.text), heard.map((w) => w.norm), equal)

  const anchor = new Map()
  for (const [li, hi] of pairs) {
    const line = flat[li].lineIndex
    const t = heard[hi].start
    if (!anchor.has(line) || t < anchor.get(line)) anchor.set(line, t)
  }
  if (!anchor.size) return { times: [], confidence: 0 }

  const times = lines.map((_, i) => anchor.get(i))
  const known = times.map((t, i) => (t === undefined ? null : { i, t })).filter(Boolean)
  for (let i = 0; i < times.length; i++) {
    if (times[i] !== undefined) continue
    const before = [...known].reverse().find((k) => k.i < i)
    const after = known.find((k) => k.i > i)
    if (before && after) times[i] = before.t + ((after.t - before.t) * (i - before.i)) / (after.i - before.i)
    else if (before) times[i] = before.t + (i - before.i) * 3
    else if (after) times[i] = Math.max(0, after.t - (after.i - i) * 3)
    else times[i] = i * 3
  }
  let prev = -1
  const out = times.map((t) => {
    let v = Math.max(0, t)
    if (v <= prev) v = prev + 0.05
    prev = v
    return v
  })
  return { times: out, confidence: pairs.length / flat.length, anchors: anchor.size }
}

async function main() {
  const { nctSource } = await import('../src/main/sources/nct')
  const { downloadTrack } = await import('../src/main/download')
  const { patchSettings } = await import('../src/main/store')
  const w = await import('../src/main/ai/whisper')

  await fs.mkdir(WORK, { recursive: true })
  patchSettings({ downloadFolder: WORK })

  const audioPath = join(WORK, 'bai-thu.mp3')
  const lrcPath = join(WORK, 'bai-thu.lrc')
  const cachePath = join(WORK, `phien-am-${SIZE}.json`)

  try {
    await fs.access(audioPath)
  } catch {
    const track = (await nctSource.search(process.env.LYRA_SONG ?? 'Noi nay co anh', 1))[0]
    const got = await downloadTrack(track)
    await fs.rename(got, audioPath)
    await fs.rename(got.replace(/\.[^.]+$/, '.lrc'), lrcPath)
  }

  const truth = (await fs.readFile(lrcPath, 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/))
    .filter(Boolean)
    .map((m) => ({ time: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() }))
    .filter((l) => l.text)
  const plain = truth.map((l) => l.text)

  // ---- Ban phien am: dung lai neu da co ----
  let words
  if (!process.env.LYRA_FRESH) {
    try {
      words = JSON.parse(await fs.readFile(cachePath, 'utf8'))
      console.log(`dung lai ban phien am da luu (${words.length} tu)\n`)
    } catch {}
  }

  if (!words) {
    await w.installWhisper(() => {})
    if (!(await w.hasModel(SIZE))) {
      console.log(`dang tai model ${SIZE}...`)
      await w.installModel(SIZE, () => {})
    }
    console.log(`chay Whisper (${SIZE}) co mom loi bai hat...`)
    const outBase = join(WORK, 'align-out')
    const t0 = Date.now()
    const bin = await w.findWhisper()
    await new Promise((res, rej) => {
      const proc = spawn(
        bin,
        [
          '-m', w.modelPath(SIZE), '-l', 'vi', '-oj', '-of', outBase, '-t', '8',
          '--prompt', plain.join(' ').replace(/\s+/g, ' ').slice(0, 600),
          // Lap lai goi y o moi cua so 30 giay lam Whisper cham gap nhieu lan:
          // small + carry chay qua 35 phut cho mot bai 4 phut van chua xong.
          ...(process.env.LYRA_CARRY ? ['--carry-initial-prompt'] : []),
          audioPath
        ],
        { windowsHide: true }
      )
      proc.stderr.on('data', () => {})
      proc.on('exit', (c) => (c === 0 ? res() : rej(new Error('whisper exit ' + c))))
    })
    const parsed = JSON.parse(await fs.readFile(outBase + '.json', 'utf8'))
    words = []
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
    await fs.writeFile(cachePath, JSON.stringify(words))
    console.log(`Whisper: ${words.length} tu trong ${((Date.now() - t0) / 1000).toFixed(0)}s\n`)
  }

  // ---- Cac bien the ham so sanh ----
  const VARIANTS = {
    'khop chinh xac': (a, b) => a === b,
    'sai 1 ky tu (tu >= 3)': (a, b) =>
      a === b || (a.length >= 3 && b.length >= 3 && withinEditDistance(a, b, 1)),
    'sai 1 ky tu (tu >= 2)': (a, b) =>
      a === b || (a.length >= 2 && b.length >= 2 && withinEditDistance(a, b, 1)),
    'bo nguyen am cuoi': (a, b) =>
      a === b || (a.length >= 3 && b.length >= 3 && a.slice(0, 2) === b.slice(0, 2))
  }

  console.log(`Bai co ${truth.length} dong dap an, Whisper nghe ${words.length} tu\n`)
  for (const [name, equal] of Object.entries(VARIANTS)) {
    const r = align(plain, words, equal)
    if (!r.times.length) {
      console.log(`${name.padEnd(24)} khong can duoc dong nao`)
      continue
    }
    const errors = r.times.map((t, i) => Math.abs(t - truth[i].time))
    const sorted = [...errors].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const within3 = errors.filter((e) => e <= 3).length / errors.length
    const within5 = errors.filter((e) => e <= 5).length / errors.length
    console.log(
      `${name.padEnd(24)} khop ${(r.confidence * 100).toFixed(0).padStart(3)}% | ` +
        `neo ${String(r.anchors).padStart(3)}/${truth.length} dong | ` +
        `trung vi ${median.toFixed(1).padStart(5)}s | trong 3s ${(within3 * 100).toFixed(0).padStart(3)}% | ` +
        `trong 5s ${(within5 * 100).toFixed(0).padStart(3)}%`
    )
  }

  app.exit(0)
}

app.whenReady().then(main).catch((e) => {
  console.error('LOI:', e?.stack ?? e)
  app.exit(1)
})
