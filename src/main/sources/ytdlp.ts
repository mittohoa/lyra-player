import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getSettings } from '../store'

let cachedPath: string | null = null
let cachedAt = 0
const CACHE_MS = 30_000

/** Cac vi tri thu tim yt-dlp, theo thu tu uu tien. */
function candidatePaths(): string[] {
  const configured = getSettings().ytDlpPath.trim()
  const userData = app.getPath('userData')
  return [
    configured,
    join(userData, 'bin', 'yt-dlp.exe'),
    join(process.resourcesPath ?? '', 'bin', 'yt-dlp.exe'),
    'yt-dlp.exe',
    'yt-dlp'
  ].filter(Boolean)
}

function tryRun(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 8000, windowsHide: true }, (err) => resolve(!err))
  })
}

/** Tra ve duong dan yt-dlp dung duoc, hoac null neu chua cai. */
export async function findYtDlp(force = false): Promise<string | null> {
  if (!force && cachedPath && Date.now() - cachedAt < CACHE_MS) return cachedPath

  for (const candidate of candidatePaths()) {
    // Duong dan tuyet doi thi kiem tra ton tai truoc cho nhanh
    if (/[\/]/.test(candidate) && !existsSync(candidate)) continue
    if (await tryRun(candidate)) {
      cachedPath = candidate
      cachedAt = Date.now()
      return candidate
    }
  }

  cachedPath = null
  cachedAt = Date.now()
  return null
}

export class YtDlpMissingError extends Error {
  constructor() {
    super(
      'Chưa tìm thấy yt-dlp. Vào Cài đặt → YouTube để cài đặt, hoặc trỏ tới file yt-dlp.exe có sẵn.'
    )
    this.name = 'YtDlpMissingError'
  }
}

/** Chay yt-dlp va tra ve stdout. Nem YtDlpMissingError neu chua cai. */
export function runYtDlp(args: string[], timeoutMs = 45_000): Promise<string> {
  return findYtDlp().then(
    (bin) =>
      new Promise<string>((resolve, reject) => {
        if (!bin) return reject(new YtDlpMissingError())
        const ffmpeg = getSettings().ffmpegPath.trim()
        const fullArgs = [
          '--no-warnings',
          '--no-playlist',
          '--no-check-certificate',
          ...(ffmpeg ? ['--ffmpeg-location', ffmpeg] : []),
          ...args
        ]
        execFile(
          bin,
          fullArgs,
          { timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
          (err, stdout, stderr) => {
            if (err) {
              const detail = stderr?.trim().split('\n').slice(-3).join(' ') || err.message
              return reject(new Error(`yt-dlp thất bại: ${detail}`))
            }
            resolve(stdout)
          }
        )
      })
  )
}

/**
 * Chay yt-dlp va bao tien do tai theo phan tram.
 *
 * Khac `runYtDlp`: dung spawn de doc stdout theo dong. Tai mot bai YouTube mat
 * ca phut - khong bao gi thi nguoi dung tuong app treo va tat di.
 */
export async function runYtDlpWithProgress(
  args: string[],
  onProgress: (percent: number) => void,
  timeoutMs = 10 * 60 * 1000
): Promise<void> {
  const bin = await findYtDlp()
  if (!bin) throw new YtDlpMissingError()

  const ffmpeg = getSettings().ffmpegPath.trim()
  const fullArgs = [
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificate',
    // Mot dong tien do moi lan, de parse thay vi thanh tien do ve lai cho
    '--newline',
    ...(ffmpeg ? ['--ffmpeg-location', ffmpeg] : []),
    ...args
  ]

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, fullArgs, { windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('yt-dlp chạy quá lâu'))
    }, timeoutMs)

    proc.stdout.on('data', (buf: Buffer) => {
      // Dang: "[download]  45.2% of 4.30MiB at 1.20MiB/s ETA 00:02"
      for (const m of buf.toString().matchAll(/\[download\]\s+([\d.]+)%/g)) {
        onProgress(Number(m[1]))
      }
    })
    proc.stderr.on('data', (buf: Buffer) => (stderr += buf.toString()))

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`Không chạy được yt-dlp: ${err.message}`))
    })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`yt-dlp that bai: ${stderr.trim().split('\n').slice(-2).join(' ')}`))
    })
  })
}

/** Chay yt-dlp voi --dump-single-json va parse ket qua. */
export async function runYtDlpJson<T>(args: string[], timeoutMs?: number): Promise<T> {
  const stdout = await runYtDlp([...args, '--dump-single-json'], timeoutMs)
  const trimmed = stdout.trim()
  if (!trimmed) throw new Error('yt-dlp không trả về dữ liệu')
  return JSON.parse(trimmed) as T
}
