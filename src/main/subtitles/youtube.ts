import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { LyricLine } from '@shared/types'
import { runYtDlp, runYtDlpJson } from '../sources/ytdlp'
import { parseSubtitles } from './parse'
import { log, pushNotice } from '../logger'

/**
 * Lay phu de cua video YouTube.
 *
 * Windows chi cho ta TEN video dang phat, khong cho id. Nen phai tim lai video
 * tren YouTube theo ten roi moi lay phu de cua no.
 *
 * Chia lam hai viec, moi viec dung cong cu manh cua no:
 *
 *   - QUYET DINH lay ban nao: doc metadata (`-J`), noi liet ke ro rang ban
 *     nguoi dang tai len (`subtitles`) va ban may tu nghe (`automatic_captions`)
 *     o hai o rieng biet.
 *   - TAI ve: giao cho yt-dlp. Trong metadata co san URL, nhung goi thang vao
 *     do bang `fetch` thi Google tra 429 rat nhanh - da do. yt-dlp co header,
 *     cookie va co che thu lai dung cach nen di duoc.
 *
 * Ba dieu da kiem chung tren video that, deu la bay:
 *
 *  1. Khi mot ngon ngu DA CO ban nguoi dang tai len, o `automatic_captions` cua
 *     chinh ngon ngu do YouTube tra lai... dung ban do. Nghia la voi video kieu
 *     ay khong co duong nao toi ban may tu nghe that - hoi lai chi ton them mot
 *     lan tai ma khong duoc gi moi.
 *  2. Co kenh tai len "phu de" chi gom dung mot dong quang cao. Ket hop voi (1)
 *     thi ta ket that - nen phai tu choi han, xem `isPlausible`.
 *  3. URL `vtt` cua ban may tu nghe khong tra ve phu de ma tra ve mot playlist
 *     HLS. Day la mot ly do nua de yt-dlp tai thay vi tu tai.
 */

export interface SubtitleResult {
  lines: LyricLine[]
  /** Ma ngon ngu lay duoc, vd. 'vi'. */
  language: string
  /** True neu la ban may tu nghe, khong phai nguoi dang tai len. */
  auto: boolean
  videoId: string
  videoTitle: string
}

interface FlatEntry {
  id: string
  title?: string
  duration?: number
}

interface VideoInfo {
  title?: string
  duration?: number
  /** Ban do nguoi dang video tai len; chi can biet co ngon ngu nao. */
  subtitles?: Record<string, unknown>
  /** Ban do YouTube tu nghe ra. */
  automatic_captions?: Record<string, unknown>
}

/** Tim video tren YouTube theo ten, tra ve id cua ket qua hop nhat. */
export async function findVideo(
  query: string,
  duration?: number
): Promise<{ id: string; title: string } | null> {
  const info = await runYtDlpJson<{ entries?: FlatEntry[] }>([
    `ytsearch5:${query}`,
    '--flat-playlist',
    '--yes-playlist'
  ])
  const entries = (info.entries ?? []).filter((e) => e.id)
  if (!entries.length) return null

  // Biet do dai thi chon ban gan nhat - tranh nham sang ban remix hay reaction
  if (duration && duration > 0) {
    const withDuration = entries.filter((e) => e.duration)
    if (withDuration.length) {
      const best = withDuration.sort(
        (a, b) => Math.abs(a.duration! - duration) - Math.abs(b.duration! - duration)
      )[0]
      // Lech qua 45 giay thi coi nhu khong phai video do
      if (Math.abs(best.duration! - duration) <= 45) {
        return { id: best.id, title: best.title ?? '' }
      }
    }
  }

  return { id: entries[0].id, title: entries[0].title ?? '' }
}

/** Ngon ngu dau tien trong danh sach uu tien ma video co ban phu de. */
function pickLanguage(
  tracks: Record<string, unknown> | undefined,
  languages: string[]
): string | null {
  if (!tracks) return null
  const keys = Object.keys(tracks)
  for (const want of languages) {
    // Ma ngon ngu YouTube co the co hau to: 'vi', 'vi-VN', 'en-US'
    if (keys.some((k) => k === want || k.startsWith(`${want}-`))) return want
  }
  return null
}

/** Doc file phu de yt-dlp vua ghi ra, roi don sach thu muc tam. */
async function readWritten(dir: string, base: string): Promise<string> {
  let files: string[] = []
  try {
    files = (await fs.readdir(dir)).filter((f) => f.startsWith(base))
  } catch {
    return ''
  }

  let content = ''
  for (const f of files) {
    if (content) break
    if (!/\.(vtt|srt)$/i.test(f)) continue
    try {
      const text = await fs.readFile(join(dir, f), 'utf8')
      if (text.trim()) content = text
    } catch {
      // File hong - thu file tiep theo
    }
  }

  for (const f of files) await fs.rm(join(dir, f), { force: true }).catch(() => {})
  return content
}

/** Nho yt-dlp tai mot ban phu de cu the ve, roi doc thanh cac dong. */
async function downloadTrack(
  videoId: string,
  language: string,
  auto: boolean
): Promise<LyricLine[]> {
  const dir = app.getPath('temp')
  const base = `lyra-sub-${auto ? 'auto' : 'goc'}-${Date.now()}`

  try {
    await runYtDlp(
      [
        `https://www.youtube.com/watch?v=${videoId}`,
        '--skip-download',
        auto ? '--write-auto-subs' : '--write-subs',
        '--sub-langs',
        `${language}.*`,
        '--sub-format',
        'vtt/srt/best',
        '-o',
        join(dir, base)
      ],
      90_000
    )
  } catch (err) {
    log.warn('phụ đề', 'yt-dlp không tải được phụ đề', err)

    // Bi Google chan tam thoi la truong hop rieng: khong phai video thieu phu
    // de, ma la ta hoi qua nhieu. Im lang thi nguoi dung doi mai khong hieu sao
    // video nao cung khong co phu de - phai noi ro va noi ro la se tu het.
    if (/\b429\b|too many requests/i.test(String(err))) {
      pushNotice({
        level: 'warning',
        scope: 'phụ đề',
        message: 'YouTube đang tạm chặn vì hỏi quá nhiều. Phụ đề sẽ hoạt động lại sau ít phút.'
      })
    }
    return []
  }

  const content = await readWritten(dir, base)
  return content ? parseSubtitles(content) : []
}

/**
 * Ban phu de nay co dang tin khong.
 *
 * Nhieu kenh tai len mot "phu de" chi gom dung mot dong quang cao ("nho like va
 * dang ky"). Voi video 16 phut thi hien dong do ra khung lyric con te hon la
 * khong hien gi - vi app se dung tim, va nguoi dung nhin mai mot dong do suot
 * ca video. Nen doi hoi so dong toi thieu tuong xung voi do dai: it nhat 3
 * dong, va it nhat mot dong moi 3 phut.
 */
function isPlausible(lines: LyricLine[], duration?: number): boolean {
  if (lines.length < 3) return false
  if (!duration || duration <= 0) return true
  return lines.length >= Math.floor(duration / 180)
}

/**
 * Tim va tai phu de cho mot video dang phat.
 * @param languages ma ngon ngu theo thu tu uu tien, vd. ['vi', 'en']
 */
export async function fetchYouTubeSubtitles(
  query: string,
  languages: string[],
  duration?: number
): Promise<SubtitleResult | null> {
  const video = await findVideo(query, duration)
  if (!video) return null

  const info = await runYtDlpJson<VideoInfo>([
    `https://www.youtube.com/watch?v=${video.id}`,
    '--skip-download'
  ])
  const title = info.title || video.title

  // Uu tien ban nguoi dang tai len: chinh xac hon han ban may tu nghe, von
  // khong co dau cau va nghe nham ten rieng
  const manualLang = pickLanguage(info.subtitles, languages)
  if (manualLang) {
    const lines = await downloadTrack(video.id, manualLang, false)
    // Da co ban nguoi dang tai len thi khong hoi ban may tu nghe nua: YouTube
    // se tra lai chinh ban vua lay (xem ghi chu dau file)
    if (!isPlausible(lines, info.duration ?? duration)) return null
    return { lines, language: manualLang, auto: false, videoId: video.id, videoTitle: title }
  }

  const autoLang = pickLanguage(info.automatic_captions, languages)
  if (!autoLang) return null

  const lines = await downloadTrack(video.id, autoLang, true)
  if (!isPlausible(lines, info.duration ?? duration)) return null
  return { lines, language: autoLang, auto: true, videoId: video.id, videoTitle: title }
}
