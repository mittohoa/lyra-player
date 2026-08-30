import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { describe } from '@shared/errors'
import { IPC, type LogEntry, type LogLevel, type Notice } from '@shared/ipc'

/**
 * Ghi nhat ky va dien giai loi.
 *
 * Ba viec, ba doi tuong doc khac nhau:
 *
 *   - `logs/lyra-<ngay>.log` cho luc can dieu tra: ghi day du, ke ca stack.
 *   - Vong dem trong bo nho cho the "Nhat ky" trong Cai dat: xem ngay khong
 *     phai mo file.
 *   - `describe()` cho nguoi dung: doi loi ky thuat thanh mot cau tieng Viet
 *     noi ro chuyen gi va nen lam gi. "ENOENT" khong giup duoc ai.
 *
 * Nguyen tac: ban than viec ghi log KHONG BAO GIO duoc nem loi. Neu no nem thi
 * cai bay bat loi lai thanh nguon sinh loi, va cac lop tren khong con cho nao
 * de bao cao nua.
 */

/** So ban ghi giu trong bo nho cho the Nhat ky. */
const BUFFER_SIZE = 400

/** Qua co nay thi sang file moi (byte). */
const MAX_FILE = 5 * 1024 * 1024

/** Giu nhat ky bao nhieu ngay. */
const KEEP_DAYS = 7

const buffer: LogEntry[] = []
let stream: WriteStream | null = null
let streamDay = ''
let seq = 0

/** Cac ham gui ban tin di, do `index.ts` cam vao - tranh phu thuoc vong tron. */
let broadcaster: ((channel: string, payload: unknown) => void) | null = null

export function setLogBroadcaster(fn: (channel: string, payload: unknown) => void): void {
  broadcaster = fn
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function logFolder(): string {
  return join(app.getPath('userData'), 'logs')
}

/** Xoa cac file nhat ky qua cu. Loi o day chi ghi ra console, khong lan len. */
function pruneOldLogs(dir: string): void {
  try {
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000
    for (const name of readdirSync(dir)) {
      if (!name.startsWith('lyra-') || !name.endsWith('.log')) continue
      const path = join(dir, name)
      if (statSync(path).mtimeMs < cutoff) unlinkSync(path)
    }
  } catch (err) {
    console.error('[log] khong don duoc file cu:', err)
  }
}

/** Mo (hoac mo lai) file nhat ky cua hom nay. */
function ensureStream(): WriteStream | null {
  const day = today()
  if (stream && streamDay === day) return stream

  try {
    const dir = logFolder()
    mkdirSync(dir, { recursive: true })
    if (!streamDay) pruneOldLogs(dir)

    let path = join(dir, `lyra-${day}.log`)
    // File hom nay da qua to (app chay lien nhieu ngay, hoac loi lap vo han)
    try {
      if (statSync(path).size > MAX_FILE) {
        path = join(dir, `lyra-${day}-${Date.now()}.log`)
      }
    } catch {
      // Chua co file - binh thuong
    }

    stream?.end()
    stream = createWriteStream(path, { flags: 'a' })
    stream.on('error', (err) => {
      // O dia day hay file bi khoa: bo duong ghi file, van con vong dem
      console.error('[log] khong ghi duoc file:', err)
      stream = null
    })
    streamDay = day
    return stream
  } catch (err) {
    console.error('[log] khong mo duoc file nhat ky:', err)
    stream = null
    return null
  }
}

/** Rut gon mot thu bat ky thanh chuoi doc duoc, khong nem loi. */
function stringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function write(level: LogLevel, scope: string, message: string, detail?: unknown): LogEntry {
  const entry: LogEntry = {
    id: ++seq,
    at: Date.now(),
    level,
    scope,
    message,
    detail: detail === undefined ? undefined : stringify(detail).slice(0, 4000)
  }

  buffer.push(entry)
  if (buffer.length > BUFFER_SIZE) buffer.splice(0, buffer.length - BUFFER_SIZE)

  const line =
    `${new Date(entry.at).toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}` +
    (entry.detail ? `\n    ${entry.detail.replace(/\n/g, '\n    ')}` : '')

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)

  try {
    ensureStream()?.write(line + '\n')
  } catch (err) {
    console.error('[log] ghi that bai:', err)
  }

  // Cua so co the chua mo, hoac dang dong - broadcast tu no nuot loi
  try {
    broadcaster?.(IPC.logEntry, entry)
  } catch {
    // Khong the lam gi hon
  }

  return entry
}

export const log = {
  debug: (scope: string, message: string, detail?: unknown) =>
    write('debug', scope, message, detail),
  info: (scope: string, message: string, detail?: unknown) => write('info', scope, message, detail),
  warn: (scope: string, message: string, detail?: unknown) => write('warn', scope, message, detail),
  error: (scope: string, message: string, detail?: unknown) => write('error', scope, message, detail)
}

/** Cac ban ghi con giu trong bo nho, moi nhat truoc. */
export function recentLogs(limit = BUFFER_SIZE): LogEntry[] {
  return buffer.slice(-limit).reverse()
}

export function clearLogs(): void {
  buffer.length = 0
  log.info('nhật ký', 'Đã xoá nhật ký trong bộ nhớ')
}

/**
 * Ghi loi va tra ve cau de hien cho nguoi dung.
 * Dung o moi cho bat loi: mot lan goi lo ca hai viec, khong the quen mot ben.
 */
export function reportError(scope: string, err: unknown, fallback?: string): string {
  const friendly = describe(err, fallback)
  log.error(scope, friendly, err)
  return friendly
}

/**
 * Ghi loi VA day mot canh bao len man hinh.
 * Dung cho thu xay ra ngoai luong nguoi dung bam - luc do khong co cho nao
 * khac de bao, neu im lang thi nguoi dung tuong app hong.
 */
export function notify(
  scope: string,
  err: unknown,
  options: { fallback?: string; level?: Notice['level'] } = {}
): string {
  const friendly = describe(err, options.fallback)
  log.error(scope, friendly, err)
  pushNotice({ level: options.level ?? 'error', message: friendly, scope })
  return friendly
}

/** Day mot loi nhan len man hinh, khong kem loi ky thuat. */
export function pushNotice(notice: Notice): void {
  try {
    broadcaster?.(IPC.notice, notice)
  } catch (err) {
    console.error('[log] khong gui duoc thong bao:', err)
  }
}

export { describe }

/** Dong file nhat ky luc thoat, de khong mat dong cuoi. */
export function closeLog(): void {
  try {
    stream?.end()
  } catch {
    // Dang thoat roi, khong con gi de lam
  }
  stream = null
}
