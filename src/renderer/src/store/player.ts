import { create } from 'zustand'
import type { RepeatMode, Track } from '@shared/types'
import {
  bindMediaSession,
  setMediaMetadata,
  setPlaybackState,
  setPositionState
} from '@/lib/mediaSession'
import { logToMain, report } from '@/lib/report'

/** Mot the <audio> duy nhat cho ca app - tao san de khong bi mat khi React re-render. */
const audio = new Audio()
audio.preload = 'auto'
// Khong dat crossOrigin: nhieu CDN nhac (Zing/NCT) khong tra header CORS,
// dat vao se lam the <audio> tu choi phat.

interface PlayerState {
  queue: Track[]
  /** Chi so trong `queue` cua bai dang phat, -1 = chua co gi. */
  index: number
  /** Thu tu phat khi bat tron bai; rong khi tat. */
  shuffleOrder: number[]

  isPlaying: boolean
  loading: boolean
  position: number
  duration: number
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
  error: string | null

  current: () => Track | null
}

interface PlayerActions {
  hydrate: (s: { volume: number; muted: boolean; repeat: RepeatMode; shuffle: boolean }) => void
  playTracks: (tracks: Track[], startIndex?: number) => Promise<void>
  playAt: (index: number) => Promise<void>
  enqueue: (tracks: Track[], playNext?: boolean) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  toggle: () => Promise<void>
  next: (auto?: boolean) => Promise<void>
  prev: () => Promise<void>
  seek: (position: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  cycleRepeat: () => RepeatMode
  toggleShuffle: () => boolean
  stop: () => void
}

type Store = PlayerState & PlayerActions

/** Xao tron Fisher-Yates, giu bai dang phat o dau danh sach. */
function buildShuffleOrder(length: number, current: number): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== current)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return current >= 0 ? [current, ...rest] : rest
}

/**
 * Token chong "race": moi lan nap bai tang len 1.
 * Ket qua phan giai ve muon hon lan nap moi nhat se bi bo qua.
 */
/**
 * Doi ma loi cua the <audio> thanh ly do doc duoc.
 *
 * Bon ma nay noi ro nguyen nhan khac han nhau - gop chung thanh "khong phat
 * duoc" thi nguoi dung khong biet nen kiem tra mang hay kiem tra file.
 */
function mediaErrorReason(error: MediaError | null): string {
  switch (error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Quá trình tải bị dừng giữa chừng.'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Mất kết nối trong lúc tải.'
    case MediaError.MEDIA_ERR_DECODE:
      return 'File nhạc hỏng hoặc dùng định dạng nén Lyra chưa đọc được.'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Không mở được nguồn nhạc này. File có thể đã bị xoá, đổi tên, hoặc đường dẫn đã hết hạn.'
    default:
      return 'Không rõ nguyên nhân; xem Cài đặt → Nhật ký để biết thêm.'
  }
}

let loadToken = 0

/** URL online co the het han - cho phep thu lai dung mot lan cho moi bai. */
let retriedTrackId: string | null = null

export const usePlayer = create<Store>((set, get) => {
  /** Nap bai vao the <audio> va phat. */
  async function load(track: Track, autoplay = true): Promise<void> {
    const token = ++loadToken
    set({ loading: true, error: null, position: 0, duration: track.duration || 0 })
    setMediaMetadata(track)

    try {
      const stream = await window.api.sources.resolve(track)
      if (token !== loadToken) return // da co lenh nap bai khac de len

      audio.src = stream.url
      audio.load()
      if (autoplay) await audio.play()
      set({ loading: false, isPlaying: autoplay })
    } catch (err) {
      if (token !== loadToken) return
      set({
        loading: false,
        isPlaying: false,
        error: report('phát nhạc', err, {
          fallback: `Không phát được "${track.title}".`,
          silent: true
        })
      })
    }
  }

  /** Danh sach chi so theo dung thu tu phat hien tai. */
  function order(): number[] {
    const { shuffle, shuffleOrder, queue } = get()
    return shuffle && shuffleOrder.length === queue.length
      ? shuffleOrder
      : queue.map((_, i) => i)
  }

  // ---- Su kien tu the <audio> -----------------------------------------
  audio.addEventListener('timeupdate', () => {
    set({ position: audio.currentTime })
    setPositionState(audio.currentTime, audio.duration)
  })

  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration)) set({ duration: audio.duration })
  })

  audio.addEventListener('play', () => {
    set({ isPlaying: true })
    setPlaybackState(true)
  })

  audio.addEventListener('pause', () => {
    set({ isPlaying: false })
    setPlaybackState(false)
  })

  audio.addEventListener('ended', () => {
    void get().next(true)
  })

  audio.addEventListener('error', () => {
    const track = get().current()
    if (!track) return

    // URL cua YouTube/Zing/NCT het han sau vai gio - phan giai lai dung mot lan
    if (track.source !== 'local' && retriedTrackId !== track.id) {
      retriedTrackId = track.id
      void (async () => {
        try {
          const stream = await window.api.sources.resolve(track, true)
          audio.src = stream.url
          await audio.play()
          set({ error: null })
        } catch (err) {
          set({
            isPlaying: false,
            error: report('phát nhạc', err, {
              fallback: `Không phát lại được "${track.title}". Đường dẫn có thể đã hết hạn.`,
              silent: true
            })
          })
        }
      })()
      return
    }

    const why = mediaErrorReason(audio.error)
    logToMain('error', 'phát nhạc', `Không phát được "${track.title}": ${why}`, {
      code: audio.error?.code,
      message: audio.error?.message,
      source: track.source
    })
    set({ isPlaying: false, error: `Không phát được "${track.title}". ${why}` })
  })

  bindMediaSession({
    play: () => void get().toggle(),
    pause: () => void get().toggle(),
    next: () => void get().next(),
    prev: () => void get().prev(),
    seek: (position) => get().seek(position)
  })

  return {
    queue: [],
    index: -1,
    shuffleOrder: [],
    isPlaying: false,
    loading: false,
    position: 0,
    duration: 0,
    volume: 0.8,
    muted: false,
    repeat: 'off',
    shuffle: false,
    error: null,

    current: () => {
      const { queue, index } = get()
      return index >= 0 && index < queue.length ? queue[index] : null
    },

    hydrate: (s) => {
      audio.volume = s.volume
      audio.muted = s.muted
      set({ volume: s.volume, muted: s.muted, repeat: s.repeat, shuffle: s.shuffle })
    },

    playTracks: async (tracks, startIndex = 0) => {
      if (!tracks.length) return
      const index = Math.max(0, Math.min(startIndex, tracks.length - 1))
      retriedTrackId = null
      set({
        queue: tracks,
        index,
        shuffleOrder: get().shuffle ? buildShuffleOrder(tracks.length, index) : []
      })
      await load(tracks[index])
    },

    playAt: async (index) => {
      const { queue } = get()
      if (index < 0 || index >= queue.length) return
      retriedTrackId = null
      set({ index })
      await load(queue[index])
    },

    enqueue: (tracks, playNext = false) => {
      const { queue, index, shuffle } = get()
      if (!tracks.length) return

      const at = playNext && index >= 0 ? index + 1 : queue.length
      const nextQueue = [...queue.slice(0, at), ...tracks, ...queue.slice(at)]
      set({
        queue: nextQueue,
        shuffleOrder: shuffle ? buildShuffleOrder(nextQueue.length, get().index) : []
      })

      // Hang doi dang rong thi phat luon bai vua them
      if (index < 0) void get().playAt(at)
    },

    removeFromQueue: (target) => {
      const { queue, index } = get()
      if (target < 0 || target >= queue.length) return

      const nextQueue = queue.filter((_, i) => i !== target)
      if (target === index) {
        // Xoa dung bai dang phat: nhay sang bai ke tiep (hoac dung neu het)
        if (nextQueue.length === 0) {
          get().stop()
          set({ queue: [], index: -1, shuffleOrder: [] })
          return
        }
        const nextIndex = Math.min(target, nextQueue.length - 1)
        set({ queue: nextQueue, shuffleOrder: [] })
        void get().playAt(nextIndex)
        return
      }

      set({
        queue: nextQueue,
        index: target < index ? index - 1 : index,
        shuffleOrder: get().shuffle ? buildShuffleOrder(nextQueue.length, index) : []
      })
    },

    clearQueue: () => {
      get().stop()
      set({ queue: [], index: -1, shuffleOrder: [], position: 0, duration: 0 })
    },

    toggle: async () => {
      const track = get().current()
      if (!track) return
      if (audio.paused) {
        // Nguon chua duoc nap (vd. sau khi loi) thi nap lai tu dau
        if (!audio.src) await load(track)
        else
          await audio.play().catch((err: Error) =>
            set({ error: report('phát nhạc', err, { silent: true }) })
          )
      } else {
        audio.pause()
      }
    },

    next: async (auto = false) => {
      const { queue, index, repeat } = get()
      if (!queue.length) return

      if (auto && repeat === 'one') {
        audio.currentTime = 0
        await audio.play()
        return
      }

      const seq = order()
      const pos = seq.indexOf(index)
      const isLast = pos === seq.length - 1

      if (isLast && auto && repeat === 'off') {
        // Het hang doi: dung lai o dau bai cuoi thay vi quay vong
        audio.pause()
        audio.currentTime = 0
        set({ isPlaying: false, position: 0 })
        return
      }

      const nextPos = isLast ? 0 : pos + 1
      await get().playAt(seq[nextPos])
    },

    prev: async () => {
      const { queue, index } = get()
      if (!queue.length) return

      // Qua 3 giay thi nut "truoc" nghia la ve dau bai
      if (audio.currentTime > 3) {
        audio.currentTime = 0
        set({ position: 0 })
        return
      }

      const seq = order()
      const pos = seq.indexOf(index)
      const prevPos = pos <= 0 ? seq.length - 1 : pos - 1
      await get().playAt(seq[prevPos])
    },

    seek: (position) => {
      if (!Number.isFinite(audio.duration)) return
      audio.currentTime = Math.max(0, Math.min(position, audio.duration))
      set({ position: audio.currentTime })
    },

    setVolume: (volume) => {
      const v = Math.max(0, Math.min(1, volume))
      audio.volume = v
      audio.muted = false
      set({ volume: v, muted: false })
      void window.api.settings.patch({ volume: v, muted: false })
    },

    toggleMute: () => {
      const muted = !get().muted
      audio.muted = muted
      set({ muted })
      void window.api.settings.patch({ muted })
    },

    cycleRepeat: () => {
      const orderList: RepeatMode[] = ['off', 'all', 'one']
      const repeat = orderList[(orderList.indexOf(get().repeat) + 1) % orderList.length]
      set({ repeat })
      void window.api.settings.patch({ repeat })
      return repeat
    },

    toggleShuffle: () => {
      const shuffle = !get().shuffle
      const { queue, index } = get()
      set({ shuffle, shuffleOrder: shuffle ? buildShuffleOrder(queue.length, index) : [] })
      void window.api.settings.patch({ shuffle })
      return shuffle
    },

    stop: () => {
      loadToken++
      setMediaMetadata(null)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      set({ isPlaying: false, position: 0 })
    }
  }
})

/** Cho phep man hinh Now Playing doc truc tiep (vd. de ve pho tan so sau nay). */
export { audio }
