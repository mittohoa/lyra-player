import type { LyricLine } from '@shared/types'

/**
 * Tim chi so dong dang hat tai `position` (giay). Tra ve -1 khi chua toi dong dau.
 * Tim nhi phan vi ham nay chay moi lan timeupdate (~4 lan/giay).
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
