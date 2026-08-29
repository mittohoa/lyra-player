import { create } from 'zustand'
import type { DownloadProgress } from '@shared/ipc'
import type { Track } from '@shared/types'
import { logToMain } from '@/lib/log'
import { report } from '@/lib/report'
import { useApp } from './app'

/**
 * Theo doi cac bai dang tai. Giu theo trackId de nut tai o moi dong
 * biet duoc bai cua no dang o buoc nao.
 */
interface DownloadState {
  /** trackId -> tien do gan nhat. */
  items: Record<string, DownloadProgress>
}

interface DownloadActions {
  subscribe: () => () => void
  start: (track: Track) => Promise<string | null>
  dismiss: (trackId: string) => void
  isBusy: (trackId: string) => boolean
}

export const useDownloads = create<DownloadState & DownloadActions>((set, get) => ({
  items: {},

  subscribe: () =>
    window.api.download.onProgress((p) => {
      set({ items: { ...get().items, [p.trackId]: p } })

      // Tai xong ma khong noi gi thi nguoi dung tuong no khong chay - va bam lai.
      // Bao ro ket qua, kem duong dan de con biet file nam o dau.
      if (p.phase === 'done') {
        const name = p.filePath?.split(/[\\/]/).pop() ?? p.title
        useApp.getState().toast(`Đã tải "${name}". Mở thư mục ở Cài đặt → Tải nhạc.`, 'success')
      } else if (p.phase === 'error') {
        // `p.error` da qua bang dien giai o ben kia roi, nhung van ghi lai o day
        // de trong nhat ky co ca ten bai - de lan hon la mot cau loi tro troi
        logToMain('error', 'tai ve', `Tai "${p.title}" that bai: ${p.error ?? 'khong ro ly do'}`, p)
        useApp
          .getState()
          .toast(`Tải "${p.title}" thất bại. ${p.error ?? 'Xem Cài đặt → Nhật ký.'}`, 'error')
      }

      if (p.phase === 'done' || p.phase === 'error') {
        setTimeout(() => get().dismiss(p.trackId), p.phase === 'error' ? 8000 : 4000)
      }
    }),

  start: async (track) => {
    try {
      return await window.api.download.track(track)
    } catch (err) {
      // Duong tien do thuong da bao loi roi - nen chi ghi, khong toast lan hai
      report('tai ve', err, { silent: true })
      return null
    }
  },

  dismiss: (trackId) => {
    const next = { ...get().items }
    delete next[trackId]
    set({ items: next })
  },

  isBusy: (trackId) => {
    const phase = get().items[trackId]?.phase
    return phase !== undefined && phase !== 'done' && phase !== 'error'
  }
}))
