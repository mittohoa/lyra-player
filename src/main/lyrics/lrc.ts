import type { LyricLine, Lyrics } from '@shared/types'

/** [mm:ss.xx] hoac [mm:ss:xx] hoac [h:mm:ss.xx] - mot dong co the co nhieu tag. */
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
/** Tag metadata cua .lrc: [ar:], [ti:], [offset:]... */
const META_TAG = /^\[([a-zA-Z#]+):(.*)\]$/

export interface ParsedLrc {
  lines: LyricLine[]
  /** offset trong tag [offset:] cua file, don vi giay (duong = lyric hien som hon). */
  fileOffset: number
  meta: Record<string, string>
}

/**
 * Parse noi dung .lrc. Tra ve mang dong da sap xep theo thoi gian.
 * Dong khong co timestamp bi bo qua o day - ben goi tu quyet dinh coi la plain text.
 */
export function parseLrc(content: string): ParsedLrc {
  const lines: LyricLine[] = []
  const meta: Record<string, string> = {}
  let fileOffset = 0

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const metaMatch = line.match(META_TAG)
    if (metaMatch && !/^\d+$/.test(metaMatch[1])) {
      const key = metaMatch[1].toLowerCase()
      const value = metaMatch[2].trim()
      meta[key] = value
      if (key === 'offset') {
        const ms = Number.parseInt(value, 10)
        // Tag [offset:] tinh bang ms; duong nghia la lyric can hien som hon
        if (Number.isFinite(ms)) fileOffset = -ms / 1000
      }
      continue
    }

    TIME_TAG.lastIndex = 0
    const stamps: number[] = []
    let match: RegExpExecArray | null
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fracRaw = match[3] ?? '0'
      // '5' -> .5s, '50' -> .50s, '500' -> .500s
      const frac = Number(fracRaw) / 10 ** fracRaw.length
      stamps.push(minutes * 60 + seconds + frac)
    }
    if (!stamps.length) continue

    const text = line.replace(TIME_TAG, '').trim()
    for (const time of stamps) lines.push({ time, text })
  }

  lines.sort((a, b) => a.time - b.time)
  return { lines, fileOffset, meta }
}

/** Doan xem chuoi co phai .lrc co timestamp khong. */
export function looksSynced(content: string): boolean {
  TIME_TAG.lastIndex = 0
  return TIME_TAG.test(content)
}

/** Bien mot chuoi bat ky (lrc hoac plain) thanh doi tuong Lyrics. */
export function toLyrics(content: string, origin: Lyrics['origin'], offset = 0): Lyrics {
  const trimmed = content.trim()
  if (!trimmed) return emptyLyrics()

  if (looksSynced(trimmed)) {
    const parsed = parseLrc(trimmed)
    if (parsed.lines.length) {
      return {
        kind: 'synced',
        lines: parsed.lines,
        origin,
        offset: offset + parsed.fileOffset
      }
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.replace(TIME_TAG, '').trim())
    .filter((l) => l.length > 0 && !META_TAG.test(l))

  return {
    kind: lines.length ? 'plain' : 'none',
    lines: lines.map((text) => ({ time: -1, text })),
    plainText: lines.join('\n'),
    origin,
    offset
  }
}

export function emptyLyrics(): Lyrics {
  return { kind: 'none', lines: [], origin: 'none', offset: 0 }
}

/**
 * Tim chi so dong dang hat tai `position` (giay).
 * Tra ve -1 khi chua toi dong dau tien.
 */
export function activeLineIndex(lines: LyricLine[], position: number, offset = 0): number {
  const t = position + offset
  let lo = 0
  let hi = lines.length - 1
  let result = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= t) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}
