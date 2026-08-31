import { promises as fs } from 'node:fs'
import { IPC, type AiAlignProgress, type AiInstallProgress, type AiStatus } from '@shared/ipc'
import type { LyricLine, Track } from '@shared/types'
import { setManualLyrics } from '../lyrics'
import { getSettings, translationStore } from '../store'
import { broadcast } from '../windows'
import { alignLyrics, toLrc, type AlignResult } from './align'
import {
  findWhisper,
  hasModel,
  installModel,
  installWhisper,
  MODEL_INFO,
  transcribe,
  type ModelSize
} from './whisper'
import { log } from '../logger'

export { MODEL_INFO } from './whisper'

export async function aiStatus(): Promise<AiStatus> {
  const sizes = Object.keys(MODEL_INFO) as ModelSize[]
  const models: Record<string, boolean> = {}
  for (const size of sizes) models[size] = await hasModel(size)

  return {
    whisperInstalled: !!(await findWhisper()),
    models,
    // SDK cung doc duoc khoa tu bien moi truong, nen coi ca hai la "co khoa"
    boMayDich: getSettings().translateEngine
  }
}

/** Tai whisper.cpp va model da chon; bao tien do len UI. */
export async function installAi(size: ModelSize): Promise<AiStatus> {
  const report = (p: AiInstallProgress): void => broadcast(IPC.aiInstallProgress, p)
  await installWhisper(report)
  await installModel(size, report)
  return aiStatus()
}

/**
 * Can timestamp cho lyric thuan cua mot bai.
 *
 * Chi lam duoc voi bai co file tren may - phai co audio that de nghe.
 * Neu bat `writeLrcSidecar` thi ghi luon ket qua ra .lrc canh file nhac,
 * de lan sau mo len la co ngay khong phai chay lai.
 */
export async function alignTrackLyrics(
  track: Track,
  plainLines: string[]
): Promise<AlignResult & { lrc: string }> {
  if (!track.filePath) {
    throw new Error('Chỉ căn được mốc thời gian cho bài có file trên máy')
  }
  await fs.access(track.filePath).catch(() => {
    throw new Error('Không tìm thấy file nhạc')
  })

  const settings = getSettings()
  const report = (patch: Partial<AiAlignProgress>): void =>
    broadcast(IPC.aiAlignProgress, { trackId: track.id, phase: 'transcribing', ...patch })

  report({ phase: 'transcribing' })

  const words = await transcribe(track.filePath, {
    size: settings.whisperModel,
    language: settings.whisperLanguage,
    // Chinh loi bai hat lam goi y - giup Whisper nghe ra dung chu hon han
    prompt: plainLines.join(' '),
    onProgress: (percent) => report({ phase: 'transcribing', percent })
  })

  report({ phase: 'aligning' })
  const result = alignLyrics(plainLines, words)

  // Duoi nguong nay thi moc thoi gian chi la doan mo - ghi ra file con te hon
  // la khong lam gi, vi no de len file .lrc va nguoi dung tuong da co lyric chuan.
  const MIN_CONFIDENCE = 0.15

  if (!result.lines.length || result.confidence < MIN_CONFIDENCE) {
    const percent = Math.round(result.confidence * 100)
    log.warn('AI', `Căn mốc thất bại: chỉ khớp ${percent}% số từ`, {
      lines: result.lines.length,
      confidence: result.confidence
    })
    report({ phase: 'error', error: `Chỉ khớp ${percent}% số từ nên không đủ tin cậy.` })
    throw new Error(
      `Chỉ khớp được ${percent}% số từ với bản phiên âm — không đủ để căn mốc đáng tin. ` +
        'Nhạc có nhạc đệm mạnh thì Whisper nghe rất kém; thử chọn model "small" trong Cài đặt, ' +
        'hoặc đặt đúng ngôn ngữ bài hát.'
    )
  }

  const lrc = toLrc(result.lines)

  // Luu vao kho cua app truoc: day moi la cho chac chan giu duoc ket qua.
  // Ghi file .lrc canh file nhac chi la them, va co the bi tat trong cai dat.
  setManualLyrics(track.id, lrc)

  if (settings.writeLrcSidecar) {
    const target = track.filePath.replace(/\.[^.]+$/, '.lrc')
    await fs.writeFile(target, lrc, 'utf8').catch((err) => {
      log.warn('AI', 'Không ghi được file .lrc cạnh file nhạc', err)
    })
  }

  report({ phase: 'done' })
  return { ...result, lrc }
}

function translationKey(trackId: string, lang: string): string {
  return `${trackId}|${lang}`
}

export function getCachedTranslation(trackId: string, lang: string): string[] | null {
  return translationStore.get()[translationKey(trackId, lang)] ?? null
}

/** Dich lyric, dung lai ban da dich truoc do neu co. */
export async function translateTrackLyrics(
  trackId: string,
  lines: string[],
  targetLang: string
): Promise<string[]> {
  const cached = getCachedTranslation(trackId, targetLang)
  if (cached && cached.length === lines.length) return cached

  // Nap muon: chi keo SDK Anthropic vao khi nguoi dung that su dung tinh nang dich
  const { translateLyrics } = await import('./translate')

  const translated = await translateLyrics(lines, targetLang, (p) =>
    broadcast(IPC.aiTranslateProgress, { trackId, ...p })
  )

  translationStore.set({
    ...translationStore.get(),
    [translationKey(trackId, targetLang)]: translated
  })
  return translated
}

export type { LyricLine }
