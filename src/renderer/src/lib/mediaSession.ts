import type { Track } from '@shared/types'
import { logToMain } from './log'

/**
 * Cong bo bai dang phat len Windows qua Media Session API.
 *
 * Chromium chuyen thong tin nay sang SMTC (System Media Transport Controls) cua
 * Windows, nen Lyra hien ra trong bang dieu khien media (bam nut am luong),
 * kem anh bia va nut dieu khien - va phim media tren ban phim cung nhan dung app.
 *
 * Khong co metadata thi Windows KHONG tao phien media nao cho app ca.
 */

type Handlers = {
  play: () => void
  pause: () => void
  next: () => void
  prev: () => void
  seek: (position: number) => void
}

let bound = false

/** Gan cac nut dieu khien cua he thong vao player. Chi can goi mot lan. */
export function bindMediaSession(handlers: Handlers): void {
  if (bound || !('mediaSession' in navigator)) return
  bound = true

  const set = (
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null
  ): void => {
    try {
      navigator.mediaSession.setActionHandler(action, handler)
    } catch {
      // Trinh duyet khong ho tro hanh dong nay - bo qua
    }
  }

  set('play', () => handlers.play())
  set('pause', () => handlers.pause())
  set('nexttrack', () => handlers.next())
  set('previoustrack', () => handlers.prev())
  set('seekto', (details) => {
    if (details.seekTime !== undefined) handlers.seek(details.seekTime)
  })
  set('seekbackward', (details) => handlers.seek(-(details.seekOffset ?? 10)))
  set('seekforward', (details) => handlers.seek(details.seekOffset ?? 10))
}

/** Cap nhat ten bai / nghe si / anh bia hien trong bang media cua Windows. */
export function setMediaMetadata(track: Track | null): void {
  if (!('mediaSession' in navigator)) return

  if (!track) {
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
    return
  }

  // Day chi la thong tin hien thi cho he dieu hanh. No KHONG duoc phep can viec
  // phat nhac, nen boc try/catch: mot anh bia la hay tag ky quac cung khong
  // duoc lam hong ca luong phat.
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512' }] : []
    })
  } catch (err) {
    logToMain('warn', 'thông tin bài hát', 'Không đặt được thông tin bài hát cho hệ thống', err)
  }
}

export function setPlaybackState(isPlaying: boolean): void {
  if (!('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  } catch {
    // Khong quan trong bang viec phat nhac
  }
}

/**
 * Bao vi tri phat de thanh tua trong bang media cua Windows chay theo.
 * Chi goi khi so lieu hop le - setPositionState nem loi neu duration khong huu han
 * hoac position vuot qua duration (hay gap voi radio stream).
 */
export function setPositionState(position: number, duration: number): void {
  if (!('mediaSession' in navigator)) return
  if (!Number.isFinite(duration) || duration <= 0) return
  try {
    navigator.mediaSession.setPositionState({
      duration,
      position: Math.min(Math.max(position, 0), duration),
      playbackRate: 1
    })
  } catch {
    // So lieu chua on dinh giua luc doi bai - lan cap nhat sau se dung
  }
}
