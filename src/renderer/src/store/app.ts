import { create } from 'zustand'
import type { AppSettings, ScanProgress, SearchResult, SourceId, Track } from '@shared/types'
import { normalize } from '@/lib/format'
import { logError } from '@/lib/log'

export type ViewId = 'library' | 'search' | 'now-playing' | 'playlist' | 'settings'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

/**
 * Bon muc, moi muc mot y nghia rieng:
 *   info    - dang lam gi do, khong can nguoi dung lam gi
 *   success - vua xong viec nguoi dung yeu cau
 *   warning - lam duoc mot phan, hoac co dieu can biet truoc
 *   error   - that bai, viec khong xong
 */
export type ToastKind = 'info' | 'success' | 'warning' | 'error'

/** Toast loi nam lau hon: nguoi dung can kip doc va hieu chuyen gi. */
const TOAST_MS: Record<ToastKind, number> = {
  info: 3500,
  success: 3500,
  warning: 6000,
  error: 8000
}

export interface SourceStatus {
  id: SourceId
  label: string
  searchable: boolean
  playable: boolean
  error: string | null
}

interface AppState {
  ready: boolean
  view: ViewId
  /** Playlist dang mo khi view === 'playlist'. */
  activePlaylistId: string | null
  settings: AppSettings | null

  tracks: Track[]
  scanning: boolean
  scanProgress: ScanProgress | null
  filter: string

  searchQuery: string
  searchResults: SearchResult[]
  searching: boolean
  enabledSources: SourceId[]
  sourceStatus: SourceStatus[]

  toasts: Toast[]
  queueOpen: boolean
}

interface AppActions {
  init: () => Promise<void>
  setView: (view: ViewId) => void
  openPlaylist: (id: string) => void
  setFilter: (filter: string) => void
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>

  scan: () => Promise<void>
  addFolder: () => Promise<void>
  removeFolder: (folder: string) => Promise<void>
  addFiles: () => Promise<void>
  removeTracks: (ids: string[]) => Promise<void>

  runSearch: (query: string) => Promise<void>
  setSearchQuery: (query: string) => void
  toggleSource: (id: SourceId) => void
  addFromUrl: (url: string) => Promise<Track | null>

  toast: (message: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
  setQueueOpen: (open: boolean) => void

  filteredTracks: () => Track[]
}

let toastId = 0

export const useApp = create<AppState & AppActions>((set, get) => ({
  ready: false,
  view: 'library',
  activePlaylistId: null,
  settings: null,

  tracks: [],
  scanning: false,
  scanProgress: null,
  filter: '',

  searchQuery: '',
  searchResults: [],
  searching: false,
  enabledSources: ['zing', 'nct', 'youtube'],
  sourceStatus: [],

  toasts: [],
  queueOpen: false,

  init: async () => {
    const [settings, tracks, sourceStatus] = await Promise.all([
      window.api.settings.get(),
      window.api.library.get(),
      window.api.sources.status()
    ])
    document.documentElement.dataset.theme = settings.theme
    set({ settings, tracks, sourceStatus, ready: true })

    window.api.library.onProgress((scanProgress) => {
      set({ scanProgress, scanning: scanProgress.phase !== 'done' })
    })
  },

  setView: (view) => set({ view }),
  openPlaylist: (id) => set({ view: 'playlist', activePlaylistId: id }),
  setFilter: (filter) => set({ filter }),

  patchSettings: async (patch) => {
    const settings = await window.api.settings.patch(patch)
    if (patch.theme) document.documentElement.dataset.theme = settings.theme
    set({ settings })
  },

  scan: async () => {
    const settings = get().settings
    if (!settings?.libraryFolders.length) {
      get().toast('Chưa có thư mục nào. Thêm thư mục nhạc trước đã.', 'warning')
      return
    }
    set({ scanning: true })
    try {
      const tracks = await window.api.library.scan()
      set({ tracks })
      get().toast(`Đã quét xong: ${tracks.length} bài hát.`, 'success')
    } catch (err) {
      get().toast(logError('thư viện', err, 'Quét thư viện thất bại.'), 'error')
    } finally {
      set({ scanning: false, scanProgress: null })
    }
  },

  addFolder: async () => {
    const libraryFolders = await window.api.library.addFolder()
    const settings = get().settings
    if (settings) set({ settings: { ...settings, libraryFolders } })
    if (libraryFolders.length) await get().scan()
  },

  removeFolder: async (folder) => {
    const libraryFolders = await window.api.library.removeFolder(folder)
    const settings = get().settings
    if (settings) set({ settings: { ...settings, libraryFolders } })
  },

  addFiles: async () => {
    const added = await window.api.library.addFiles()
    if (!added.length) return
    set({ tracks: await window.api.library.get() })
    get().toast(`Đã thêm ${added.length} bài hát.`, 'success')
  },

  removeTracks: async (ids) => {
    set({ tracks: await window.api.library.remove(ids) })
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  runSearch: async (query) => {
    const q = query.trim()
    if (!q) return
    set({ searching: true, searchQuery: q })
    try {
      const searchResults = await window.api.sources.search(q, get().enabledSources)
      set({ searchResults })
    } catch (err) {
      get().toast(logError('tìm kiếm', err, 'Tìm kiếm thất bại.'), 'error')
    } finally {
      set({ searching: false })
    }
  },

  toggleSource: (id) => {
    const current = get().enabledSources
    const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
    set({ enabledSources: next })
  },

  addFromUrl: async (url) => {
    try {
      const track = await window.api.sources.fromUrl(url)
      get().toast(`Đã thêm "${track.title}" vào hàng đợi.`, 'success')
      return track
    } catch (err) {
      get().toast(logError('đọc URL', err, 'Không đọc được đường dẫn này.'), 'error')
      return null
    }
  },

  toast: (message, kind = 'info') => {
    const id = ++toastId
    // Cung mot loi lap lai (vd. mat mang, moi bai mot lan) chi hien mot lan
    const same = get().toasts.find((t) => t.message === message && t.kind === kind)
    if (same) return

    set({ toasts: [...get().toasts, { id, message, kind }] })
    setTimeout(() => get().dismissToast(id), TOAST_MS[kind])
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  setQueueOpen: (queueOpen) => set({ queueOpen }),

  filteredTracks: () => {
    const { tracks, filter } = get()
    const q = normalize(filter)
    if (!q) return tracks
    return tracks.filter((t) =>
      normalize(`${t.title} ${t.artist} ${t.album}`).includes(q)
    )
  }
}))
