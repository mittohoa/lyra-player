import type { JSX } from 'react'
import { usePlayer } from '@/store/player'
import { useApp } from '@/store/app'
import { formatTime, sourceLabel } from '@/lib/format'
import { IconClose, IconTrash } from '@/lib/icons'

export function QueuePanel(): JSX.Element | null {
  const queueOpen = useApp((s) => s.queueOpen)
  const setQueueOpen = useApp((s) => s.setQueueOpen)

  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const playAt = usePlayer((s) => s.playAt)
  const removeFromQueue = usePlayer((s) => s.removeFromQueue)
  const clearQueue = usePlayer((s) => s.clearQueue)

  if (!queueOpen) return null

  return (
    <aside className="queue-panel">
      <div className="queue-panel__head">
        Hàng đợi ({queue.length})
        <div style={{ flex: 1 }} />
        {queue.length > 0 && (
          <button className="btn btn--sm btn--ghost btn--danger" onClick={clearQueue}>
            Xoá hết
          </button>
        )}
        <button className="icon-btn" onClick={() => setQueueOpen(false)} title="Đóng">
          <IconClose size={14} />
        </button>
      </div>

      <div className="queue-panel__list">
        {queue.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
            Hàng đợi đang trống.
          </div>
        ) : (
          queue.map((track, i) => (
            <div
              key={`${track.id}-${i}`}
              className={`track-row ${i === index ? 'track-row--playing' : ''}`}
              style={{ gridTemplateColumns: '22px 1fr auto auto' }}
              onDoubleClick={() => void playAt(i)}
            >
              <div className="track-row__index">{i + 1}</div>
              <div style={{ overflow: 'hidden' }}>
                <div className="track-row__title">{track.title}</div>
                <div className="track-row__meta">
                  {track.artist} · {sourceLabel(track.source)}
                </div>
              </div>
              <div className="track-row__dur">
                {track.isLive ? 'LIVE' : formatTime(track.duration)}
              </div>
              <div className="track-row__actions">
                <button className="icon-btn" onClick={() => removeFromQueue(i)} title="Bỏ khỏi hàng đợi">
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
