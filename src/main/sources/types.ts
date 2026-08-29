import type { ResolvedStream, SourceId, Track } from '@shared/types'

/** Giao dien chung cho moi nguon nhac online. */
export interface MusicSource {
  id: SourceId
  label: string
  /** Nguon nay co the tim kiem duoc khong (Direct URL thi khong). */
  searchable: boolean
  /** Nguon nay co the phat audio khong (Spotify thi khong). */
  playable: boolean
  /** Ly do khong dung duoc, vd. thieu yt-dlp hoac thieu API key. Rong = san sang. */
  unavailableReason(): Promise<string | null>
  search?(query: string, limit: number): Promise<Track[]>
  resolve?(track: Track): Promise<ResolvedStream>
  /** Lay lyric rieng cua nguon (Zing/NCT co san lyric .lrc). */
  lyrics?(track: Track): Promise<string | null>
  /** Ban tai ve chat luong cao nhat; co the khac ban dung de stream. */
  downloadUrl?(track: Track): Promise<DownloadTarget>
}

/** Mot ban tai ve cu the: di dau, duoi gi, chat luong bao nhieu. */
export interface DownloadTarget {
  url: string
  headers?: Record<string, string>
  /** Duoi file khong co dau cham, vd. 'mp3', 'm4a'. */
  ext: string
  /** Nhan chat luong de hien cho nguoi dung, vd. '320 kbps'. */
  quality: string
}

export class SourceError extends Error {
  constructor(
    public readonly source: SourceId,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'SourceError'
  }
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** fetch co timeout + User-Agent trinh duyet, dung chung cho cac nguon web. */
export async function httpGet(
  url: string | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 12_000, headers, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { 'User-Agent': UA, ...(headers as Record<string, string> | undefined) }
    })
  } finally {
    clearTimeout(timer)
  }
}

export { UA as BROWSER_UA }
