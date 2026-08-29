import { createReadStream, promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { protocol, session } from 'electron'

/** Kieu MIME theo duoi file - the <audio> can dung de chon bo giai ma. */
const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.wma': 'audio/x-ms-wma',
  '.webm': 'audio/webm'
}

/**
 * Phai goi TRUOC app.whenReady().
 * `stream: true` cho phep tra ve body dang stream, `supportFetchAPI` cho phep fetch().
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'media',
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true }
    }
  ])
}

/** Parse `bytes=start-end`. Tra ve null neu header khong hop le. */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = header.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return null
  const [, rawStart, rawEnd] = match

  if (rawStart === '' && rawEnd === '') return null
  if (rawStart === '') {
    // `bytes=-500` = 500 byte cuoi file
    const length = Number(rawEnd)
    if (!length) return null
    return { start: Math.max(0, size - length), end: size - 1 }
  }

  const start = Number(rawStart)
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (start > end || start >= size) return null
  return { start, end }
}

/**
 * Phuc vu file nhac local qua `media://local/<duong-dan-da-encode>`.
 * Tu xu ly Range de tua duoc - net.fetch cho file:// khong ho tro Range.
 */
export function handleMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    let filePath: string
    try {
      const url = new URL(request.url)
      filePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    } catch {
      return new Response('URL khong hop le', { status: 400 })
    }
    if (!filePath) return new Response('Thieu duong dan', { status: 400 })

    let size: number
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) return new Response('Khong phai file', { status: 404 })
      size = stat.size
    } catch {
      return new Response('Khong tim thay file', { status: 404 })
    }

    const contentType = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const rangeHeader = request.headers.get('range')
    const range = rangeHeader ? parseRange(rangeHeader, size) : null

    if (rangeHeader && !range) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` }
      })
    }

    const { start, end } = range ?? { start: 0, end: size - 1 }
    const stream = createReadStream(filePath, { start, end })

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
      }
    })
  })
}

/**
 * The <audio> khong dat duoc header rieng, nhung Zing/NCT doi dung Referer.
 * Dang ky header theo tung URL roi chen vao ngay truoc khi request bay di.
 */
const pendingHeaders = new Map<string, Record<string, string>>()

export function registerStreamHeaders(url: string, headers?: Record<string, string>): void {
  if (!headers || !Object.keys(headers).length) return
  pendingHeaders.set(url, headers)
  // Don rac de map khong phinh to sau nhieu gio nghe nhac
  if (pendingHeaders.size > 50) {
    const oldest = pendingHeaders.keys().next().value
    if (oldest) pendingHeaders.delete(oldest)
  }
}

export function installRequestHeaderInterceptor(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const extra = pendingHeaders.get(details.url)
    if (!extra) return callback({ requestHeaders: details.requestHeaders })
    callback({ requestHeaders: { ...details.requestHeaders, ...extra } })
  })
}
