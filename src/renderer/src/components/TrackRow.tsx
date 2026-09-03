import type { JSX } from 'react'
import type { Track } from '@shared/types'
import { AddToPlaylist } from './AddToPlaylist'
import { formatTime, sourceLabel } from '@/lib/format'
import { useDownloads } from '@/store/downloads'
import {
  IconDownload,
  IconFolder,
  IconMusic,
  IconPlay,
  IconQueue,
  IconTrash,
  IconVideo
} from '@/lib/icons'
import { LyraLoader } from './LyraLoader'

interface Props {
  track: Track
  index?: number
  playing?: boolean
  showSource?: boolean
  onPlay: () => void
  onEnqueue?: () => void
  onRemove?: () => void
  /** Chi co trong playlist - doi thu tu bài. */
  onMoveUp?: () => void
  onMoveDown?: () => void
  /** Nguon chi doc metadata (Spotify) - khong phat duoc. */
  disabled?: boolean
  disabledReason?: string
}

export function TrackRow({
  track,
  index,
  playing = false,
  showSource = false,
  onPlay,
  onEnqueue,
  onRemove,
  onMoveUp,
  onMoveDown,
  disabled = false,
  disabledReason
}: Props): JSX.Element {
  const progress = useDownloads((s) => s.items[track.id])
  const startDownload = useDownloads((s) => s.start)

  // Bai o may thi khong can tai; Spotify khong cho tai audio
  const canDownload = track.source !== 'local' && track.source !== 'spotify' && !track.isLive
  const busy = progress !== undefined && progress.phase !== 'done' && progress.phase !== 'error'

  const downloadTitle = (): string => {
    if (!progress) return 'Tải về máy kèm lời'
    switch (progress.phase) {
      case 'resolving':
        return 'Đang tìm bản tải…'
      case 'downloading':
        return progress.total
          ? `Đang tải ${Math.round((progress.received / progress.total) * 100)}%`
          : 'Đang tải...'
      case 'tagging':
        return 'Đang ghi tag…'
      case 'lyrics':
        return 'Đang lấy lời…'
      case 'done':
        return 'Đã tải xong'
      case 'error':
        return `Lỗi: ${progress.error ?? ''}`
    }
  }

  return (
    <div
      className={`track-row ${playing ? 'track-row--playing' : ''}`}
      onDoubleClick={disabled ? undefined : onPlay}
      title={disabled ? disabledReason : undefined}
    >
      <div className="track-row__index">{index !== undefined ? index + 1 : ''}</div>

      {/*
        Phim thi de icon phim thay cho not nhac. Nhieu tep phim khong co anh
        bia, va mot danh sach toan not nhac khong cho biet bam vao se ra tieng
        hay ra hinh.
      */}
      <div className="track-row__art">
        {track.artwork ? (
          <img src={track.artwork} alt="" width={40} height={40} loading="lazy" />
        ) : track.kind === 'video' ? (
          <IconVideo size={16} />
        ) : (
          <IconMusic size={16} />
        )}
      </div>

      <div className="track-row__title" title={track.title}>
        {track.title}
      </div>

      <div className="track-row__meta" title={track.artist}>
        {track.artist}
      </div>

      <div className="track-row__meta" title={track.album}>
        {showSource ? (
          <span className={`source-tag source-tag--${track.source}`}>
            {sourceLabel(track.source)}
          </span>
        ) : (
          track.album
        )}
      </div>

      <div className="track-row__dur">
        {track.isLive ? 'LIVE' : track.duration ? formatTime(track.duration) : '--:--'}
      </div>

      <div className="track-row__actions">
        {(onMoveUp || onMoveDown) && (
          <>
            <button className="icon-btn" onClick={onMoveUp} disabled={!onMoveUp} title="Lên trên">
              ↑
            </button>
            <button
              className="icon-btn"
              onClick={onMoveDown}
              disabled={!onMoveDown}
              title="Xuống dưới"
            >
              ↓
            </button>
          </>
        )}

        <button className="icon-btn" onClick={onPlay} disabled={disabled} title="Phát">
          <IconPlay size={15} />
        </button>

        {onEnqueue && (
          <button
            className="icon-btn"
            onClick={onEnqueue}
            disabled={disabled}
            title="Thêm vào hàng đợi"
          >
            <IconQueue size={15} />
          </button>
        )}

        {!disabled && <AddToPlaylist tracks={[track]} />}

        {canDownload && (
          <button
            className={`icon-btn ${progress?.phase === 'done' ? 'icon-btn--on' : ''}`}
            onClick={() => void startDownload(track)}
            disabled={busy}
            title={downloadTitle()}
          >
            {busy ? <LyraLoader size={15} /> : <IconDownload size={15} />}
          </button>
        )}

        {track.filePath && (
          <button
            className="icon-btn"
            onClick={() => window.api.system.revealInFolder(track.filePath!)}
            title="Mở thư mục chứa file"
          >
            <IconFolder size={15} />
          </button>
        )}

        {onRemove && (
          <button className="icon-btn" onClick={onRemove} title="Gỡ khỏi danh sách">
            <IconTrash size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
