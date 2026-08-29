import { useState, type JSX } from 'react'
import { useApp, type ViewId } from '@/store/app'
import { usePlayer } from '@/store/player'
import { usePlaylists } from '@/store/playlists'
import { IconLyrics, IconMusic, IconPlus, IconSearch, IconSettings } from '@/lib/icons'

const NAV: { id: ViewId; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'library', label: 'Thư viện', icon: IconMusic },
  { id: 'search', label: 'Tìm nhạc online', icon: IconSearch },
  { id: 'now-playing', label: 'Đang phát', icon: IconLyrics },
  { id: 'settings', label: 'Cài đặt', icon: IconSettings }
]

export function Sidebar(): JSX.Element {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const activePlaylistId = useApp((s) => s.activePlaylistId)
  const openPlaylist = useApp((s) => s.openPlaylist)

  const trackCount = useApp((s) => s.tracks.length)
  const queueCount = usePlayer((s) => s.queue.length)

  const playlists = usePlaylists((s) => s.playlists)
  const create = usePlaylists((s) => s.create)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const count: Partial<Record<ViewId, number>> = {
    library: trackCount,
    'now-playing': queueCount
  }

  const submitNew = async (): Promise<void> => {
    if (!name.trim()) {
      setCreating(false)
      return
    }
    const playlist = await create(name)
    setName('')
    setCreating(false)
    openPlaylist(playlist.id)
  }

  return (
    <nav className="sidebar">
      <div className="sidebar__label">Điều hướng</div>
      {NAV.map(({ id, label, icon: Ico }) => (
        <button
          key={id}
          className={`nav-item ${view === id ? 'nav-item--active' : ''}`}
          onClick={() => setView(id)}
        >
          <Ico size={17} />
          {label}
          {count[id] ? <span className="nav-item__count">{count[id]}</span> : null}
        </button>
      ))}

      <div className="sidebar__label sidebar__label--row">
        Playlist
        <button
          className="icon-btn icon-btn--tiny"
          onClick={() => setCreating(true)}
          title="Tạo playlist mới"
        >
          <IconPlus size={14} />
        </button>
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submitNew()
          }}
          style={{ padding: '0 6px 6px' }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void submitNew()}
            placeholder="Tên playlist"
            autoFocus
            style={{ width: '100%', fontSize: 12.5, padding: '6px 8px' }}
          />
        </form>
      )}

      {playlists.length === 0 && !creating ? (
        <div className="sidebar__hint">Chưa có playlist nào.</div>
      ) : (
        playlists.map((p) => (
          <button
            key={p.id}
            className={`nav-item ${
              view === 'playlist' && activePlaylistId === p.id ? 'nav-item--active' : ''
            }`}
            onClick={() => openPlaylist(p.id)}
            title={p.name}
          >
            <IconLyrics size={16} />
            <span className="nav-item__name">{p.name}</span>
            <span className="nav-item__count">{p.tracks.length}</span>
          </button>
        ))
      )}
    </nav>
  )
}
