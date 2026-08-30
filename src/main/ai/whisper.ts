import { execFile, spawn } from 'node:child_process'
import { cpus } from 'node:os'
import { createWriteStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import type { WhisperWord } from './align'

/**
 * Quan ly whisper.cpp: tai binary + model, roi chay phien am kem moc thoi gian.
 *
 * Chay hoan toan tren may, khong gui audio di dau. Doi lai la nguoi dung phai
 * tai mot lan: binary ~20 MB va model 74-465 MB tuy co nho hay to.
 */

export type ModelSize = 'tiny' | 'base' | 'small'

export const MODEL_INFO: Record<ModelSize, { label: string; mb: number; note: string }> = {
  tiny: { label: 'Tiny', mb: 74, note: 'Nhanh nhất, nghe kém — chỉ đủ để bắt mốc' },
  base: { label: 'Base', mb: 141, note: 'Cân bằng, đủ dùng cho việc căn mốc' },
  small: { label: 'Small', mb: 465, note: 'Nghe tốt nhất, chậm hơn vài lần' }
}

/** Ban CPU (BLAS) - chay duoc tren moi may Windows x64, khong can card do hoa. */
const WHISPER_ZIP =
  'https://github.com/ggml-org/whisper.cpp/releases/download/b4938/whisper-blas-bin-x64.zip'

const modelUrl = (size: ModelSize): string =>
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${size}.bin`

function aiDir(): string {
  return join(app.getPath('userData'), 'ai')
}

function whisperDir(): string {
  return join(aiDir(), 'whisper')
}

export function modelPath(size: ModelSize): string {
  return join(aiDir(), 'models', `ggml-${size}.bin`)
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/** Tim whisper-cli.exe trong thu muc da giai nen (cau truc zip co the loi thu muc con). */
export async function findWhisper(): Promise<string | null> {
  const roots = [whisperDir(), join(whisperDir(), 'Release'), join(whisperDir(), 'build', 'bin')]
  for (const root of roots) {
    const candidate = join(root, 'whisper-cli.exe')
    if (await exists(candidate)) return candidate
  }
  return null
}

export async function hasModel(size: ModelSize): Promise<boolean> {
  return exists(modelPath(size))
}

export interface InstallProgress {
  step: 'whisper' | 'model'
  received: number
  total: number
}

/** Tai mot file lon kem bao tien do. */
async function downloadTo(url: string, dest: string, onProgress: (r: number, t: number) => void) {
  await fs.mkdir(join(dest, '..'), { recursive: true })
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Tải thất bại (HTTP ${res.status})`)

  const total = Number(res.headers.get('content-length') ?? 0)
  let received = 0

  const body = Readable.fromWeb(res.body as never)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    onProgress(received, total)
  })

  const tmp = `${dest}.part`
  await pipeline(body, createWriteStream(tmp))
  await fs.rename(tmp, dest)
}

/** Giai nen bang PowerShell - Windows co san, khoi them thu vien unzip. */
function unzip(zipPath: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destination}' -Force`
      ],
      { windowsHide: true, timeout: 120_000 },
      (err) => (err ? reject(new Error(`Giải nén thất bại: ${err.message}`)) : resolve())
    )
  })
}

export async function installWhisper(onProgress: (p: InstallProgress) => void): Promise<void> {
  if (!(await findWhisper())) {
    const zip = join(aiDir(), 'whisper.zip')
    await fs.mkdir(aiDir(), { recursive: true })
    await downloadTo(WHISPER_ZIP, zip, (received, total) =>
      onProgress({ step: 'whisper', received, total })
    )
    await unzip(zip, whisperDir())
    await fs.rm(zip, { force: true })

    if (!(await findWhisper())) {
      throw new Error('Giải nén xong nhưng không tìm thấy whisper-cli.exe')
    }
  }
}

export async function installModel(
  size: ModelSize,
  onProgress: (p: InstallProgress) => void
): Promise<void> {
  if (await hasModel(size)) return
  await fs.mkdir(join(aiDir(), 'models'), { recursive: true })
  await downloadTo(modelUrl(size), modelPath(size), (received, total) =>
    onProgress({ step: 'model', received, total })
  )
}

/** Mot doan trong file JSON ma whisper.cpp xuat ra. */
interface WhisperSegment {
  offsets?: { from: number; to: number }
  text?: string
}

/** whisper-cli doc thang duoc may dinh dang nay, khong can chuyen ma. */
const NATIVE_FORMATS = new Set(['.mp3', '.wav', '.flac', '.ogg'])

export function canTranscribeDirectly(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.')
  return dot !== -1 && NATIVE_FORMATS.has(filePath.slice(dot).toLowerCase())
}

export interface TranscribeOptions {
  size: ModelSize
  /** Ma ngon ngu ISO ('vi', 'en'...) hoac 'auto'. */
  language: string
  /**
   * Loi bai hat, dung lam "goi y" cho Whisper.
   *
   * Day la don bay lon nhat cho viec nay: ta DA BIET bai hat noi gi, mom truoc
   * cho mo hinh thi no thien ve nghe ra dung nhung chu do thay vi doan bua.
   * Whisper gioi han goi y o n_text_ctx/2 = 224 token nen phai cat bot.
   */
  prompt?: string
  /** Nhan phan tram hoan thanh (0-100). */
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

/** Cat goi y cho vua gioi han token cua Whisper (uoc chung ~3 ky tu / token). */
function trimPrompt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 600 ? flat.slice(0, 600) : flat
}

/**
 * Phien am file audio thanh chuoi tu kem moc thoi gian.
 *
 * Whisper tra ve tung DOAN (dai co mot cau) kem moc dau/cuoi. Ta tu chia deu
 * thoi gian cua doan cho cac tu trong no de co moc muc tu.
 *
 * Vi sao khong bat whisper tu cat theo tu (`-ml 1 -sow`): do lam no cham gap
 * nhieu lan - mot bai 4 phut chay qua 12 phut van chua xong. Ma thuat toan can
 * chinh chi can moc DU TOT de neo tung dong lyric, nen chia deu la du.
 */
export async function transcribe(
  audioPath: string,
  options: TranscribeOptions
): Promise<WhisperWord[]> {
  const bin = await findWhisper()
  if (!bin) {
    throw new Error(
      'Chưa tải bộ nhận dạng. Vào Cài đặt → AI căn mốc thời gian để tải (một lần duy nhất).'
    )
  }
  if (!(await hasModel(options.size))) {
    throw new Error(
      `Chưa tải model "${options.size}". Vào Cài đặt → AI căn mốc thời gian để tải.`
    )
  }

  const stamp = Date.now()
  const outBase = join(app.getPath('temp'), `lyra-whisper-${stamp}`)

  // whisper-cli la chuong trinh Windows dung argv hep: duong dan co ky tu ngoai
  // bang ma ANSI (vd. ten bai tieng Viet co dau) bi bien dang, no khong thay file
  // dau vao nen in trang tro giup roi thoat. Chep sang ten thuan ASCII de tranh.
  const needsCopy = !/^[ -~]*$/.test(audioPath)
  const ext = audioPath.slice(audioPath.lastIndexOf('.'))
  const workPath = needsCopy ? join(app.getPath('temp'), `lyra-audio-${stamp}${ext}`) : audioPath
  if (needsCopy) await fs.copyFile(audioPath, workPath)

  const args = [
    '-m', modelPath(options.size),
    '-l', options.language || 'auto',
    '-oj',
    '-of', outBase,
    '-t', String(Math.max(2, Math.min(8, cpus().length - 1))),
    // In phan tram tien do ra stderr - viec nay mat vai phut, khong bao gi
    // thi nguoi dung tuong app treo
    '-pp',
    // Mom loi bai hat, va lap lai o moi cua so 30 giay chu khong chi cua so dau
    ...(options.prompt ? ['--prompt', trimPrompt(options.prompt), '--carry-initial-prompt'] : []),
    workPath
  ]

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { windowsHide: true })
    let stderr = ''

    proc.stderr.on('data', (buf: Buffer) => {
      const text = buf.toString()
      stderr += text
      // whisper in dang "progress = 45%"; lay con so cuoi cung trong cum vua nhan
      const matches = [...text.matchAll(/progresss*=s*(d+)%/g)]
      const last = matches.at(-1)
      if (last) options.onProgress?.(Number(last[1]))
    })

    options.signal?.addEventListener('abort', () => proc.kill(), { once: true })

    proc.on('error', (err) => reject(new Error(`Không chạy được whisper: ${err.message}`)))
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`whisper thoat voi ma ${code}: ${stderr.trim().slice(-300)}`))
    })
  }).catch(async (err) => {
    if (needsCopy) await fs.rm(workPath, { force: true })
    throw err
  })

  const jsonPath = `${outBase}.json`
  try {
    const raw = await fs.readFile(jsonPath, 'utf8')
    const parsed = JSON.parse(raw) as { transcription?: WhisperSegment[] }

    // Chia deu thoi luong moi doan cho cac tu trong doan do
    const words: WhisperWord[] = []
    for (const segment of parsed.transcription ?? []) {
      const text = segment.text?.trim()
      if (!segment.offsets || !text) continue

      const start = segment.offsets.from / 1000
      const end = segment.offsets.to / 1000
      const parts = text.split(/s+/).filter(Boolean)
      if (!parts.length) continue

      const step = (end - start) / parts.length
      parts.forEach((word, i) => {
        words.push({ start: start + i * step, end: start + (i + 1) * step, text: word })
      })
    }
    return words
  } finally {
    await fs.rm(jsonPath, { force: true })
    if (needsCopy) await fs.rm(workPath, { force: true })
  }
}
