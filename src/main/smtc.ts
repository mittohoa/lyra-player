import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { app } from 'electron'
import { IPC, type SmtcNowPlaying } from '@shared/ipc'
import { broadcast } from './windows'
import { log, notify, pushNotice } from './logger'

/**
 * Doc bai dang phat tren TOAN MAY qua System Media Transport Controls cua Windows
 * (Spotify, trinh duyet, Windows Media Player... - bat cu app nao co bao cho Windows).
 *
 * SMTC la API WinRT ma Electron khong goi thang duoc, nen doan nay chay mot tien trinh
 * PowerShell con lam cau noi. Doi lai la khong can bien dich native module nao.
 *
 * Luu y quan trong ve vi tri phat: SMTC tra ve mot ANH CHUP tai `lastUpdated`,
 * con so do khong tu chay. Ham `extrapolate` ben duoi bu phan thoi gian troi qua -
 * thieu buoc nay thi lyric se lech dan cho toi khi app kia bao cap nhat lan sau.
 */

let child: ChildProcess | null = null
let latest: SmtcNowPlaying | null = null

function scriptPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'smtc-watch.ps1')
    : join(__dirname, '../../resources/smtc-watch.ps1')
}

/** Ban tin gan nhat, da bu thoi gian troi qua ke tu luc Windows chup. */
export function currentNowPlaying(): SmtcNowPlaying | null {
  return latest ? extrapolate(latest) : null
}

function extrapolate(snapshot: SmtcNowPlaying): SmtcNowPlaying {
  if (snapshot.status !== 'Playing' || !snapshot.lastUpdated) return snapshot
  const drift = (Date.now() - snapshot.lastUpdated) / 1000
  if (drift < 0 || drift > 600) return snapshot // dong ho lech hoac ban tin qua cu

  const position = snapshot.duration
    ? Math.min(snapshot.position + drift, snapshot.duration)
    : snapshot.position + drift
  return { ...snapshot, position }
}

export function isWatching(): boolean {
  return child !== null
}

/**
 * Cau noi toi Windows co the dut: PowerShell bi chinh sach chan, WinRT tra loi
 * la, hoac tien trinh bi diet. Mat no la mat han tinh nang doc nhac tu app
 * khac - nen dung lai vai lan truoc khi chiu thua.
 */
const MAX_RESTARTS = 3

/** Dung lai lien tuc trong khoang nay thi coi la mot chuoi hong (ms). */
const RESTART_WINDOW = 60_000

let restarts = 0
let firstRestartAt = 0

/** Nguoi dung chu dong tat thi dung day lai nua. */
let wanted = false

export function startSmtcWatch(): void {
  wanted = true
  if (child || process.platform !== 'win32') return

  let proc: ReturnType<typeof spawn>
  try {
    proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath()],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
  } catch (err) {
    notify('nhac app khac', err, {
      fallback:
        'Không chạy được PowerShell nên Lyra không đọc được nhạc đang phát ở app khác.'
    })
    return
  }
  child = proc

  // Khong chay duoc file (PowerShell bi go, hoac bi chan): `exit` khong bao gio
  // ban, chi co `error` - thieu nhanh nay thi that bai nay hoan toan im lang
  proc.on('error', (err) => {
    if (child === proc) child = null
    notify('nhac app khac', err, {
      fallback: 'Không chạy được cầu nối tới Windows để đọc nhạc ở app khác.'
    })
  })

  const lines = createInterface({ input: proc.stdout! })
  lines.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) return

    try {
      const msg = JSON.parse(trimmed) as { type: string; message?: string } & Partial<SmtcNowPlaying>

      if (msg.type === 'now') {
        latest = msg as SmtcNowPlaying
        // Nhan duoc du lieu that = cau noi lanh; xoa dem hong cu di
        restarts = 0
        broadcast(IPC.smtcNow, extrapolate(latest))
      } else if (msg.type === 'none') {
        latest = null
        broadcast(IPC.smtcNow, null)
      } else if (msg.type === 'error') {
        log.error('nhac app khac', 'Cau noi Windows bao loi', msg.message)
      }
    } catch (err) {
      log.debug('nhac app khac', 'Dong khong doc duoc tu cau noi', { line: trimmed.slice(0, 200), err: String(err) })
    }
  })

  proc.stderr!.on('data', (buf: Buffer) => {
    log.warn('nhac app khac', 'PowerShell bao loi', buf.toString().trim().slice(0, 500))
  })

  proc.on('exit', (code) => {
    if (child !== proc) return
    child = null
    latest = null
    broadcast(IPC.smtcNow, null)

    if (!wanted) return // nguoi dung vua tat
    log.warn('nhac app khac', `Cau noi Windows dung voi ma ${code}`)

    const now = Date.now()
    if (now - firstRestartAt > RESTART_WINDOW) {
      restarts = 0
      firstRestartAt = now
    }

    if (++restarts > MAX_RESTARTS) {
      pushNotice({
        level: 'warning',
        scope: 'nhạc ở app khác',
        message:
          'Không đọc được nhạc đang phát ở app khác. Tắt rồi bật lại mục này trong Cài đặt để thử lại.'
      })
      return
    }

    // Cho tang dan: hong do may dang ban thi lan sau co the qua
    setTimeout(() => {
      if (wanted && !child) startSmtcWatch()
    }, restarts * 2000)
  })
}

export function stopSmtcWatch(): void {
  wanted = false
  restarts = 0
  child?.kill()
  child = null
  latest = null
  broadcast(IPC.smtcNow, null)
}
