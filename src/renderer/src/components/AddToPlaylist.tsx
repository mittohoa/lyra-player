import { useEffect, useRef, useState, type JSX } from 'react'
import type { Track } from '@shared/types'
import { usePlaylists } from '@/store/playlists'
import { useApp } from '@/store/app'
import { IconPlus } from '@/lib/icons'

interface Props {
  tracks: Track[]
  /** Nhan hien thi tren nut; bo trong thi chi hien icon. */
  label?: string
}

/**
 * Nut them bai vao playlist, kem menu tha xuong.
 * Menu duoc dat co dinh theo toa do cua nut, de khong bi cat boi vung cuon
 * cua danh sach bai hat.
 */
export function AddToPlaylist({ tracks, label }: Props): JSX.Element {
  const playlists = usePlaylists((s) => s.playlists)
  const addTracks = usePlaylists((s) => s.addTracks)
  const create = usePlaylists((s) => s.create)
  const toast = useApp((s) => s.toast)

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [newName, setNewName] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = (): void => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      // Menu cao toi da 300px - lat len tren khi khong du cho ben duoi
      const below = window.innerHeight - rect.bottom
      setPos({
        top: below > 320 ? rect.bottom + 4 : Math.max(8, rect.top - 304),
        left: Math.max(8, Math.min(rect.left - 150, window.innerWidth - 250))
      })
    }
    setNewName('')
    setOpen(true)
  }

  const addTo = async (id: string, name: string): Promise<void> => {
    const added = await addTracks(id, tracks)
    setOpen(false)
    toast(
      added === 0 ? `Tất cả đã có sẵn trong "${name}".` : `Đã thêm ${added} bài vào "${name}".`,
      added === 0 ? 'info' : 'success'
    )
  }

  const createAndAdd = async (): Promise<void> => {
    const playlist = await create(newName, tracks)
    setOpen(false)
    toast(`Đã tạo "${playlist.name}" với ${tracks.length} bài.`, 'success')
  }

  return (
    <>
      <button
        ref={buttonRef}
        className={label ? 'btn btn--ghost btn--sm' : 'icon-btn'}
        onClick={toggle}
        title="Thêm vào playlist"
      >
        <IconPlus size={15} />
        {label}
      </button>

      {open && (
        <div className="menu" ref={menuRef} style={{ top: pos.top, left: pos.left }}>
          <div className="menu__label">Thêm {tracks.length} bài vào</div>

          <div className="menu__list">
            {playlists.length === 0 ? (
              <div className="menu__empty">Chưa có playlist nào</div>
            ) : (
              playlists.map((p) => (
                <button key={p.id} className="menu__item" onClick={() => void addTo(p.id, p.name)}>
                  <span className="menu__item-name">{p.name}</span>
                  <span className="menu__item-count">{p.tracks.length}</span>
                </button>
              ))
            )}
          </div>

          <form
            className="menu__new"
            onSubmit={(e) => {
              e.preventDefault()
              void createAndAdd()
            }}
          >
            <input
              placeholder="Tạo playlist mới..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <button className="btn btn--primary btn--sm" type="submit" disabled={!newName.trim()}>
              Tạo
            </button>
          </form>
        </div>
      )}
    </>
  )
}
