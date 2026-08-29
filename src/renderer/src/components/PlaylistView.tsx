import { useMemo, useState, type JSX } from 'react'
import { useApp } from '@/store/app'
import { usePlaylists } from '@/store/playlists'
import { usePlayer } from '@/store/player'
import { TrackRow } from './TrackRow'
import { formatTotalDuration } from '@/lib/format'
import { IconEdit, IconLyrics, IconPlay, IconShuffle, IconTrash } from '@/lib/icons'

export function PlaylistView(): JSX.Element {
  const activeId = useApp((s) => s.activePlaylistId)
  const setView = useApp((s) => s.setView)
  const toast = useApp((s) => s.toast)

  const playlists = usePlaylists((s) => s.playlists)
  const { rename, remove, removeAt, move } = usePlaylists()

  const playTracks = usePlayer((s) => s.playTracks)
  const enqueue = usePlayer((s) => s.enqueue)
  const currentId = usePlayer((s) => s.current()?.id)

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')

  const playlist = useMemo(() => playlists.find((p) => p.id === activeId) ?? null, [playlists, activeId])

  const total = useMemo(
    () => (playlist?.tracks ?? []).reduce((sum, t) => sum + t.duration, 0),
    [playlist]
  )

  if (!playlist) {
    return (
      <div className="empty">
        <div className="empty__icon">
          <IconLyrics size={40} />
        </div>
        <h3>Playlist không còn nữa</h3>
        <p>Có thể nó đã bị xoá. Chọn playlist khác ở thanh bên.</p>
      </div>
    )
  }

  const playShuffled = (): void => {
    const shuffled = [...playlist.tracks]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    void playTracks(shuffled, 0)
  }

  const confirmDelete = async (): Promise<void> => {
    await remove(playlist.id)
    setView('library')
    toast(`Đã xoá danh sách "${playlist.name}".`, 'success')
  }

  return (
    <>
      <div className="view-head">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void rename(playlist.id, draftName)
              setEditing(false)
            }}
          >
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => setEditing(false)}
              autoFocus
              style={{ fontSize: 22, fontWeight: 700, width: 320 }}
            />
          </form>
        ) : (
          <h1>{playlist.name}</h1>
        )}

        <div className="view-head__sub">
          {playlist.tracks.length} bài
          {total > 0 && ` · ${formatTotalDuration(total)}`}
        </div>

        <div className="view-head__actions">
          <button
            className="btn btn--primary btn--sm"
            onClick={() => void playTracks(playlist.tracks, 0)}
            disabled={!playlist.tracks.length}
          >
            <IconPlay size={15} />
            Phát
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={playShuffled}
            disabled={!playlist.tracks.length}
            title="Phát trộn"
          >
            <IconShuffle size={15} />
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setDraftName(playlist.name)
              setEditing(true)
            }}
            title="Đổi tên"
          >
            <IconEdit size={15} />
          </button>
          <button
            className="btn btn--ghost btn--sm btn--danger"
            onClick={() => void confirmDelete()}
            title="Xoá playlist"
          >
            <IconTrash size={15} />
          </button>
        </div>
      </div>

      {playlist.tracks.length === 0 ? (
        <div className="empty">
          <h3>Playlist này đang trống</h3>
          <p>
            Bam nut <strong>+</strong> o mot bài bat ky trong thu vien hoac kết quả tim kiem de them
            vao day.
          </p>
        </div>
      ) : (
        <div className="track-list">
          {playlist.tracks.map((track, i) => (
            <TrackRow
              key={`${track.id}-${i}`}
              track={track}
              index={i}
              playing={track.id === currentId}
              showSource
              onPlay={() => void playTracks(playlist.tracks, i)}
              onEnqueue={() => enqueue([track])}
              onRemove={() => void removeAt(playlist.id, i)}
              onMoveUp={i > 0 ? () => void move(playlist.id, i, i - 1) : undefined}
              onMoveDown={
                i < playlist.tracks.length - 1 ? () => void move(playlist.id, i, i + 1) : undefined
              }
            />
          ))}
        </div>
      )}
    </>
  )
}
