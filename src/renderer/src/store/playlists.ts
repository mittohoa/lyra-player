import { create } from 'zustand'
import type { Playlist, Track } from '@shared/types'

interface PlaylistState {
  playlists: Playlist[]
  loaded: boolean
}

interface PlaylistActions {
  load: () => Promise<void>
  create: (name: string, tracks?: Track[]) => Promise<Playlist>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  addTracks: (id: string, tracks: Track[]) => Promise<number>
  removeAt: (id: string, index: number) => Promise<void>
  move: (id: string, from: number, to: number) => Promise<void>
  byId: (id: string | null) => Playlist | null
}

function newId(): string {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const usePlaylists = create<PlaylistState & PlaylistActions>((set, get) => {
  /** Ghi xuong dia roi dong bo lai state - main process la nguon that su. */
  async function persist(next: Playlist[]): Promise<void> {
    set({ playlists: next })
    await window.api.playlists.save(next)
  }

  /** Sua mot playlist theo id, tu cap nhat `updatedAt`. */
  async function patch(id: string, fn: (p: Playlist) => Playlist): Promise<void> {
    await persist(
      get().playlists.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p))
    )
  }

  return {
    playlists: [],
    loaded: false,

    load: async () => {
      set({ playlists: await window.api.playlists.get(), loaded: true })
    },

    create: async (name, tracks = []) => {
      const playlist: Playlist = {
        id: newId(),
        name: name.trim() || 'Playlist moi',
        tracks,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      await persist([...get().playlists, playlist])
      return playlist
    },

    rename: async (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      await patch(id, (p) => ({ ...p, name: trimmed }))
    },

    remove: async (id) => {
      await persist(get().playlists.filter((p) => p.id !== id))
    },

    addTracks: async (id, tracks) => {
      const playlist = get().playlists.find((p) => p.id === id)
      if (!playlist) return 0

      // Bo qua bai da co san de bam hai lan khong tao ban trung
      const have = new Set(playlist.tracks.map((t) => t.id))
      const fresh = tracks.filter((t) => !have.has(t.id))
      if (!fresh.length) return 0

      await patch(id, (p) => ({ ...p, tracks: [...p.tracks, ...fresh] }))
      return fresh.length
    },

    removeAt: async (id, index) => {
      await patch(id, (p) => ({ ...p, tracks: p.tracks.filter((_, i) => i !== index) }))
    },

    move: async (id, from, to) => {
      await patch(id, (p) => {
        if (from === to || from < 0 || from >= p.tracks.length) return p
        const tracks = [...p.tracks]
        const [moved] = tracks.splice(from, 1)
        tracks.splice(Math.max(0, Math.min(to, tracks.length)), 0, moved)
        return { ...p, tracks }
      })
    },

    byId: (id) => (id ? (get().playlists.find((p) => p.id === id) ?? null) : null)
  }
})
