import type { JSX } from 'react'
import { usePlayer } from '@/store/player'
import { useApp } from '@/store/app'
import { LyricsPanel } from './LyricsPanel'
import { formatTime, sourceLabel } from '@/lib/format'
import { IconMusic, IconOverlay } from '@/lib/icons'

export function NowPlayingView(): JSX.Element {
  const track = usePlayer((s) => s.current())
  const settings = useApp((s) => s.settings)
  const patchSettings = useApp((s) => s.patchSettings)

  if (!track) {
    return (
      <div className="empty">
        <div className="empty__icon">
          <IconMusic size={44} />
        </div>
        <h3>Chưa phát bài nào</h3>
        <p>Chọn một bài trong thư viện hoặc tìm trên mạng để bắt đầu.</p>
      </div>
    )
  }

  const overlayOn = settings?.overlay.enabled ?? false

  const toggleOverlay = async (): Promise<void> => {
    const next = !overlayOn
    await window.api.overlay.setVisible(next)
    if (settings) await patchSettings({ overlay: { ...settings.overlay, enabled: next } })
  }

  return (
    <div className="now-playing">
      <div>
        <div className="np-art-large">
          {track.artwork ? (
            <img
              src={track.artwork}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }}
            />
          ) : (
            <IconMusic size={64} />
          )}
        </div>

        <div className="np-info">
          <h2>{track.title}</h2>
          <p>{track.artist}</p>
          <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-faint)' }}>
            {track.album}
            {track.duration > 0 && ` · ${formatTime(track.duration)}`}
          </p>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
            <span className={`source-tag source-tag--${track.source}`}>
              {sourceLabel(track.source)}
            </span>
            <button
              className={`btn btn--sm ${overlayOn ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => void toggleOverlay()}
            >
              <IconOverlay size={15} />
              {overlayOn ? 'Đang hiện lời nổi' : 'Hiện lời nổi'}
            </button>
          </div>
        </div>
      </div>

      <LyricsPanel />
    </div>
  )
}
