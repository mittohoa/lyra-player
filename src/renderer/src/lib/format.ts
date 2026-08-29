/** Doi giay sang "m:ss" (hoac "h:mm:ss" khi dai hon mot gio). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const total = Math.floor(seconds)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** "3 gio 12 phut" - dung cho tong thoi luong thu vien. */
export function formatTotalDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} phut`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} gio ${rest} phut` : `${hours} gio`
}

export function formatOffset(seconds: number): string {
  const sign = seconds > 0 ? '+' : seconds < 0 ? '-' : ''
  return `${sign}${Math.abs(seconds).toFixed(1)}s`
}

/**
 * Bo dau tieng Viet va ky tu dac biet de tim kiem khong dau van ra kết quả.
 * Vi du: "Đường tôi chở em về" -> "duong toi cho em ve".
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

const SOURCE_LABEL: Record<string, string> = {
  local: 'Trong máy',
  direct: 'URL',
  youtube: 'YouTube',
  zing: 'Zing MP3',
  nct: 'NhacCuaTui',
  spotify: 'Spotify'
}

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source
}
