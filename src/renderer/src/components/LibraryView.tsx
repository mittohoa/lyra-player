import { useMemo, useState, type JSX } from 'react'
import { useApp } from '@/store/app'
import { usePlayer } from '@/store/player'
import { TrackRow } from './TrackRow'
import { formatTotalDuration } from '@/lib/format'
import { IconFolder, IconMusic, IconPlus, IconRefresh, IconShuffle } from '@/lib/icons'
import { LyraLoader } from './LyraLoader'

export function LibraryView(): JSX.Element {
  const { scanning, scanProgress, filter, setFilter, scan, addFolder, addFiles, removeTracks } =
    useApp()
  const filteredTracks = useApp((s) => s.filteredTracks)
  const tracks = useApp((s) => s.tracks)
  const settings = useApp((s) => s.settings)

  const playTracks = usePlayer((s) => s.playTracks)
  const enqueue = usePlayer((s) => s.enqueue)
  const currentId = usePlayer((s) => s.current()?.id)

  const [sort, setSort] = useState<'artist' | 'title' | 'recent'>('artist')

  const visible = useMemo(() => {
    const list = [...filteredTracks()]
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'vi'))
    else if (sort === 'recent') list.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    return list
    // `tracks` va `filter` la nguon that su cua filteredTracks()
  }, [filteredTracks, tracks, filter, sort])

  const totalSeconds = useMemo(() => visible.reduce((sum, t) => sum + t.duration, 0), [visible])

  const playShuffled = (): void => {
    if (!visible.length) return
    const shuffled = [...visible]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    void playTracks(shuffled, 0)
  }

  if (!tracks.length && !scanning) {
    return (
      <div className="empty">
        <div className="empty__icon">
          <IconMusic size={44} />
        </div>
        <h3>Thư viện đang trống</h3>
        <p>
          Thêm thư mục nhạc trên máy. App quét đệ quy, đọc tag, và tự nhận file .lrc nằm cạnh mỗi bài.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button className="btn btn--primary" onClick={() => void addFolder()}>
            <IconFolder size={16} />
            Thêm thư mục nhạc
          </button>
          <button className="btn btn--ghost" onClick={() => void addFiles()}>
            <IconPlus size={16} />
            Chọn từng file
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="view-head">
        <h1>Thư viện</h1>
        <div className="view-head__sub">
          {visible.length} bài
          {totalSeconds > 0 && ` · ${formatTotalDuration(totalSeconds)}`}
        </div>

        <div className="view-head__actions">
          <input
            placeholder="Lọc trong thư viện…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 220 }}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="artist">Theo nghệ sĩ</option>
            <option value="title">Theo tên bài</option>
            <option value="recent">Mới thêm</option>
          </select>
          <button className="btn btn--ghost btn--sm" onClick={playShuffled} title="Phát trộn">
            <IconShuffle size={15} />
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => void scan()}
            disabled={scanning}
            title="Quét lại thư mục"
          >
            {scanning ? <LyraLoader /> : <IconRefresh size={15} />}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => void addFolder()}>
            <IconFolder size={15} />
            Thư mục
          </button>
        </div>
      </div>

      {scanning && scanProgress && (
        <div className="alert">
          <LyraLoader />
          <div className="alert__body">
            {scanProgress.phase === 'scanning'
              ? 'Đang duyệt thư mục…'
              : `Đang đọc tag ${scanProgress.scanned}/${scanProgress.total} — ${scanProgress.current}`}
          </div>
        </div>
      )}

      {!settings?.libraryFolders.length && tracks.length > 0 && (
        <div className="alert">
          <div className="alert__body">
            Chưa theo dõi thư mục nào — các bài dưới đây được thêm lẻ. Thêm thư mục để app tự cập nhật khi bạn tải nhạc mới.
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty">
          <h3>Không tìm thấy bài nào</h3>
          <p>Thử bớt từ khoá lọc.</p>
        </div>
      ) : (
        <div className="track-list">
          {visible.map((track, i) => (
            <TrackRow
              key={track.id}
              track={track}
              index={i}
              playing={track.id === currentId}
              onPlay={() => void playTracks(visible, i)}
              onEnqueue={() => enqueue([track])}
              onRemove={() => void removeTracks([track.id])}
            />
          ))}
        </div>
      )}
    </>
  )
}
