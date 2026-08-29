import type { LyricLine } from '@shared/types'

/**
 * Doc phu de .srt / .vtt / .ass ve cung dang voi lyric (mang { time, text }).
 *
 * Nho dua ve chung mot dang, toan bo phan hien thi dung lai duoc y nguyen:
 * khung noi trong suot, do dong dang hat, chinh lech thoi gian, ban dich.
 */

/** '00:01:23,456' / '00:01:23.456' / '0:01:23.45' -> so giay. */
function parseTimestamp(text: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(text.trim())
  if (!m) return null
  const [, h, mm, ss, frac] = m
  // '45' la 45/100 giay, '456' la 456/1000 - phai chia theo do dai that
  const fraction = Number(frac) / 10 ** frac.length
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + fraction
}

/**
 * Bo the danh dau trong phu de.
 * Phu de tu dong cua YouTube nhoi day the thoi gian tung chu:
 *   "<00:00:01.000><c>xin</c> <00:00:01.400><c>chào</c>"
 */
function stripTags(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\{[^}]*\}/g, '') // the dinh dang cua .ass
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\\N/g, ' ') // xuong dong trong .ass
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Bo cac dong lap lien tiep.
 *
 * Phu de tu dong cua YouTube hien theo kieu cuon: moi khoi lap lai dong truoc
 * roi them tu moi. De nguyen thi khung noi nhay lien tuc va lap lai chinh no.
 */
function dedupe(lines: LyricLine[]): LyricLine[] {
  const out: LyricLine[] = []
  for (const line of lines) {
    if (!line.text) continue
    const prev = out.at(-1)
    if (prev && prev.text === line.text) continue
    // Dong moi chi la dong cu cong them duoi -> thay cho dong cu
    if (prev && line.text.startsWith(prev.text) && line.text.length > prev.text.length) {
      out[out.length - 1] = { time: prev.time, text: line.text }
      continue
    }
    out.push(line)
  }
  return out
}

function parseSrtOrVtt(content: string): LyricLine[] {
  const lines: LyricLine[] = []
  // Ho tro ca hai kieu xuong dong, va bo header WEBVTT / NOTE
  const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/)

  for (const block of blocks) {
    const rows = block.split('\n').map((r) => r.trim()).filter(Boolean)
    if (!rows.length) continue
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/i.test(rows[0])) continue

    const arrowRow = rows.findIndex((r) => r.includes('-->'))
    if (arrowRow === -1) continue

    const [rawStart] = rows[arrowRow].split('-->')
    // Dong thoi gian cua .vtt co the co tham so vi tri o cuoi - cat bo
    const time = parseTimestamp(rawStart.trim().split(/\s+/)[0])
    if (time === null) continue

    const text = stripTags(rows.slice(arrowRow + 1).join(' '))
    if (text) lines.push({ time, text })
  }
  return lines
}

function parseAss(content: string): LyricLine[] {
  const lines: LyricLine[] = []
  // Thu tu cot khai bao o dong "Format:" cua muc [Events], khong co dinh
  let textIndex = 9
  let startIndex = 1

  for (const raw of content.replace(/\r\n/g, '\n').split('\n')) {
    const row = raw.trim()

    if (/^Format:/i.test(row)) {
      const cols = row.slice(row.indexOf(':') + 1).split(',').map((c) => c.trim().toLowerCase())
      const t = cols.indexOf('text')
      const s = cols.indexOf('start')
      if (t !== -1) textIndex = t
      if (s !== -1) startIndex = s
      continue
    }

    if (!/^Dialogue:/i.test(row)) continue
    // Cot cuoi (Text) co the chua dau phay, nen chi tach dung so cot phia truoc
    const parts = row.slice(row.indexOf(':') + 1).split(',')
    if (parts.length <= textIndex) continue

    const time = parseTimestamp(parts[startIndex]?.trim() ?? '')
    if (time === null) continue

    const text = stripTags(parts.slice(textIndex).join(','))
    if (text) lines.push({ time, text })
  }
  return lines
}

export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'unknown'

export function detectFormat(content: string): SubtitleFormat {
  const head = content.slice(0, 400)
  if (/^﻿?WEBVTT/.test(head)) return 'vtt'
  if (/\[Script Info\]|^Dialogue:/im.test(head)) return 'ass'
  if (/-->/.test(head)) return 'srt'
  return 'unknown'
}

/** Doc phu de bat ky dang nao ve mang dong da sap xep theo thoi gian. */
export function parseSubtitles(content: string): LyricLine[] {
  const format = detectFormat(content)
  const lines =
    format === 'ass' ? parseAss(content) : format === 'unknown' ? [] : parseSrtOrVtt(content)

  lines.sort((a, b) => a.time - b.time)
  return dedupe(lines)
}
