import { app } from 'electron'
import type { AppSettings } from '@shared/types'

/**
 * Bat/tat chay cung Windows.
 *
 * `--hidden` de ban chay luc khoi dong biet la nen thu thang xuong khay,
 * khong bat cua so len chan man hinh nguoi dung ngay khi vua dang nhap.
 */
export function applyLaunchAtStartup(settings: AppSettings): void {
  // Che do dev chay qua electron.exe nen dang ky se tro nham - bo qua
  if (!app.isPackaged) return

  app.setLoginItemSettings({
    openAtLogin: settings.launchAtStartup,
    args: settings.startMinimized ? ['--hidden'] : []
  })
}

/** App co dang duoc bat len o che do an khong. */
export function startedHidden(): boolean {
  return process.argv.includes('--hidden')
}
