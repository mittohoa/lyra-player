import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { getSettings } from '../store'

/**
 * Dich loi bai hat sang ngon ngu khac, giu dung so dong de overlay ghep duoc
 * tung dong goc voi tung dong dich.
 *
 * Dung structured output nen mo hinh buoc phai tra ve dung mot mang chuoi -
 * khong phai tu boc tach van ban tu do roi cau mong dung dinh dang.
 */

const MODEL = 'claude-opus-5'

/** Chia nho lyric dai de mot lan goi khong qua dai va de doi chieu so dong. */
const CHUNK = 60

const TranslationSchema = z.object({
  lines: z.array(z.string())
})

export const LANGUAGES: Record<string, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  'zh-CN': '简体中文',
  fr: 'Français',
  es: 'Español'
}

function client(): Anthropic {
  const apiKey = getSettings().anthropicApiKey.trim()
  // Khong co khoa trong cai dat thi de SDK tu tim trong bien moi truong
  return apiKey ? new Anthropic({ apiKey }) : new Anthropic()
}

const SYSTEM = [
  'Bạn dịch lời bài hát. Quy tắc bắt buộc:',
  '- Trả về ĐÚNG số dòng như đầu vào, theo đúng thứ tự. Không gộp, không tách, không bỏ dòng nào.',
  '- Dịch nghĩa và giữ được cảm xúc, nghe tự nhiên như lời hát — không dịch máy móc từng chữ.',
  '- Dòng chỉ có ký hiệu nhạc (ví dụ ♪) hoặc dòng trống thì giữ nguyên y hệt.',
  '- Chỉ trả về bản dịch, không thêm chú thích hay giải thích gì.'
].join('\n')

async function translateChunk(lines: string[], targetLabel: string): Promise<string[]> {
  const numbered = lines.map((line, i) => `${i + 1}. ${line}`).join('\n')

  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: zodOutputFormat(TranslationSchema)
    },
    messages: [
      {
        role: 'user',
        content: `Dịch ${lines.length} dòng lời bài hát sau sang ${targetLabel}. Trả về đúng ${lines.length} dòng.\n\n${numbered}`
      }
    ]
  })

  const parsed = response.parsed_output
  if (!parsed) throw new Error('Mô hình không trả về đúng định dạng')

  // Neu so dong lech, can lai cho khop de overlay khong bi truot dong
  const out = parsed.lines.slice(0, lines.length)
  while (out.length < lines.length) out.push('')
  return out
}

export interface TranslateProgress {
  done: number
  total: number
}

/**
 * Dich toan bo lyric. Tra ve mang cung do dai voi dau vao.
 * @param targetLang ma ngon ngu trong LANGUAGES
 */
export async function translateLyrics(
  lines: string[],
  targetLang: string,
  onProgress?: (p: TranslateProgress) => void
): Promise<string[]> {
  if (!lines.length) return []

  const targetLabel = LANGUAGES[targetLang] ?? targetLang
  const out: string[] = []

  for (let i = 0; i < lines.length; i += CHUNK) {
    const chunk = lines.slice(i, i + CHUNK)
    out.push(...(await translateChunk(chunk, targetLabel)))
    onProgress?.({ done: Math.min(i + CHUNK, lines.length), total: lines.length })
  }

  return out
}

/** Kiem tra khoa API co dung khong, bang mot yeu cau nho nhat co the. */
export async function checkApiKey(): Promise<{ ok: boolean; error?: string }> {
  try {
    await client().messages.create({
      model: MODEL,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Trả lời đúng một chữ: ok' }]
    })
    return { ok: true }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: 'Khoá API không đúng' }
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: 'Bi gioi han tan suat - thu lai sau' }
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `Loi API ${err.status}: ${err.message}` }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
