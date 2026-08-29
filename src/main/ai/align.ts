import type { LyricLine } from '@shared/types'

/**
 * Can lyric thuan (khong co moc thoi gian) vao ban phien am cua Whisper.
 *
 * Y tuong: ta DA BIET loi bai hat dung, chi thieu moc thoi gian. Whisper nghe ra
 * mot chuoi tu kem moc thoi gian - nghe sai kha nhieu, nhat la voi tieng hat.
 * Nen thay vi tin vao chu Whisper doc duoc, ta chi dung no lam MOC: doi chieu hai
 * chuoi tu, tim nhung cho khop chac chan, roi noi suy thoi gian cho phan con lai.
 *
 * Nho vay ban lyric cuoi cung van la loi dung tung chu, chi thoi gian la uoc luong.
 */

export interface WhisperWord {
  start: number
  end: number
  text: string
}

/** Bo dau tieng Viet, dau cau, va chuyen ve chu thuong de so sanh. */
function normalize(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Hai tu co coi la khop khong.
 *
 * Cho phep sai MOT ky tu, va chi voi tu tu 3 ky tu tro len. Do khong phai con so
 * tuy tien - da do tren bai that co dap an:
 *   khop chinh xac        -> sai so trung vi 4.2s, neo duoc 38/58 dong
 *   sai 1 ky tu, tu >= 3  -> sai so trung vi 2.0s, neo duoc 49/58 dong  <- chon
 *   sai 1 ky tu, tu >= 2  -> sai so trung vi 5.6s (te hon han)
 * Am tiet tieng Viet rat ngan, noi long toi tu 2 ky tu la khop nham tran lan.
 */
function similar(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 3 || b.length < 3) return false
  return withinOneEdit(a, b)
}

/** Khoang cach sua doi co dung mot khong (Levenshtein, dung som khi vuot nguong). */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false

  let prev = new Array<number>(b.length + 1)
  let cur = new Array<number>(b.length + 1)
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
      if (cur[j] < best) best = cur[j]
    }
    if (best > 1) return false
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length] <= 1
}

interface FlatWord {
  text: string
  lineIndex: number
}

/** Tach cac dong lyric thanh mot chuoi tu phang, nho lai tung tu thuoc dong nao. */
function flatten(lines: string[]): FlatWord[] {
  const out: FlatWord[] = []
  lines.forEach((line, lineIndex) => {
    for (const raw of line.split(/\s+/)) {
      const text = normalize(raw)
      if (text) out.push({ text, lineIndex })
    }
  })
  return out
}

/**
 * Tim cac cap tu khop nhau giua hai chuoi (chuoi con chung dai nhat).
 * Tra ve mang cap chi so [chiSoLyric, chiSoWhisper] theo thu tu tang dan.
 *
 * Dung `similar` chu khong phai so sanh bang: Whisper nghe hat rat de sai mot
 * ky tu. LCS van ep thu tu tang dan nen vai cap khop nham khong pha duoc ket qua.
 *
 * Do dai thuc te: lyric ~300 tu, Whisper ~500 tu -> bang 150k o, chay tuc thi.
 */
function longestCommonSubsequence(a: string[], b: string[]): [number, number][] {
  const n = a.length
  const m = b.length
  if (!n || !m) return []

  // dp[i][j] = do dai chuoi con chung dai nhat cua a[i..] va b[j..]
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = similar(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (similar(a[i], b[j])) {
      pairs.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }
  return pairs
}

/** Do tin cay cua ket qua can chinh: ti le tu lyric bat duoc moc. */
export interface AlignResult {
  lines: LyricLine[]
  /** 0..1 - duoi 0.3 thi ket qua gan nhu vo dung. */
  confidence: number
  matchedWords: number
  totalWords: number
}

export function alignLyrics(rawLines: string[], words: WhisperWord[]): AlignResult {
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0)
  const flat = flatten(lines)
  const heard = words
    .map((w) => ({ ...w, norm: normalize(w.text) }))
    .filter((w) => w.norm.length > 0)

  if (!lines.length || !flat.length || !heard.length) {
    return { lines: [], confidence: 0, matchedWords: 0, totalWords: flat.length }
  }

  const pairs = longestCommonSubsequence(
    flat.map((w) => w.text),
    heard.map((w) => w.norm)
  )

  // Moc thoi gian som nhat bat duoc cho tung dong
  const anchor = new Map<number, number>()
  for (const [lyricIdx, heardIdx] of pairs) {
    const lineIndex = flat[lyricIdx].lineIndex
    const time = heard[heardIdx].start
    const existing = anchor.get(lineIndex)
    if (existing === undefined || time < existing) anchor.set(lineIndex, time)
  }

  const confidence = pairs.length / flat.length
  if (!anchor.size) {
    return { lines: [], confidence, matchedWords: pairs.length, totalWords: flat.length }
  }

  // Noi suy tuyen tinh cho cac dong khong bat duoc moc nao
  const times: (number | undefined)[] = lines.map((_, i) => anchor.get(i))
  const known = times
    .map((t, i) => (t === undefined ? null : { i, t }))
    .filter((x): x is { i: number; t: number } => x !== null)

  for (let i = 0; i < times.length; i++) {
    if (times[i] !== undefined) continue

    const before = [...known].reverse().find((k) => k.i < i)
    const after = known.find((k) => k.i > i)

    if (before && after) {
      const ratio = (i - before.i) / (after.i - before.i)
      times[i] = before.t + (after.t - before.t) * ratio
    } else if (before) {
      // Sau moc cuoi cung: gian deu 3 giay moi dong, chi la uoc chung
      times[i] = before.t + (i - before.i) * 3
    } else if (after) {
      times[i] = Math.max(0, after.t - (after.i - i) * 3)
    } else {
      times[i] = i * 3
    }
  }

  // Ep tang dan: mot dong khong the bat dau truoc dong lien truoc no
  const result: LyricLine[] = []
  let previous = -1
  lines.forEach((text, i) => {
    let time = Math.max(0, times[i] ?? 0)
    if (time <= previous) time = previous + 0.05
    previous = time
    result.push({ time: Math.round(time * 100) / 100, text })
  })

  return {
    lines: result,
    confidence,
    matchedWords: pairs.length,
    totalWords: flat.length
  }
}

/** Doi ket qua can chinh thanh noi dung file .lrc. */
export function toLrc(lines: LyricLine[]): string {
  return lines
    .map(({ time, text }) => {
      const mm = String(Math.floor(time / 60)).padStart(2, '0')
      const ss = (time % 60).toFixed(2).padStart(5, '0')
      return `[${mm}:${ss}]${text}`
    })
    .join('\n')
}
