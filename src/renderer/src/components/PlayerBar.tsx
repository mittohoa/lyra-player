import type { JSX } from 'react'
import { usePlayer } from '@/store/player'
import { useApp } from '@/store/app'
import { SeekBar } from './SeekBar'
import { formatTime } from '@/lib/format'
import {
  IconMusic,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconQueue,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
  IconVolume,
  IconVolumeMute
} from '@/lib/icons'
import { LyraLoader } from './LyraLoader'

export function PlayerBar(): JSX.Element {
  const {
    isPlaying,
    loading,
    position,
    duration,
    volume,
    muted,
    repeat,
    shuffle,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
    cycleRepeat,
    toggleShuffle
  } = usePlayer()

  const track = usePlayer((s) => s.current())
  const setView = useApp((s) => s.setView)
  const queueOpen = useApp((s) => s.queueOpen)
  const setQueueOpen = useApp((s) => s.setQueueOpen)

  const seekable = !!track && !track.isLive && duration > 0

  return (
    <footer className="playerbar">
      <div className="np">
        <div className="np__art" onClick={() => setView('now-playing')} style={{ cursor: 'pointer' }}>
          {track?.artwork ? (
            <img
              src={track.artwork}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
            />
          ) : (
            <IconMusic size={20} />
          )}
        </div>
        <div className="np__text">
          <div className="np__title">{track?.title ?? 'Chưa phát bài nào'}</div>
          <div className="np__artist">{track?.artist ?? '—'}</div>
        </div>
      </div>

      <div className="transport">
        <div className="transport__buttons">
          <button
            className={`icon-btn ${shuffle ? 'icon-btn--on' : ''}`}
            onClick={toggleShuffle}
            title={shuffle ? 'Tắt trộn bài' : 'Bật trộn bài'}
          >
            <IconShuffle size={16} />
          </button>

          <button className="icon-btn" onClick={() => void prev()} disabled={!track} title="Bài trước">
            <IconPrev size={19} />
          </button>

          <button
            className="transport__play"
            onClick={() => void toggle()}
            disabled={!track}
            title={isPlaying ? 'Tạm dừng' : 'Phát'}
          >
            {loading ? (
              <LyraLoader size={18} />
            ) : isPlaying ? (
              <IconPause size={17} />
            ) : (
              <IconPlay size={17} />
            )}
          </button>

          <button className="icon-btn" onClick={() => void next()} disabled={!track} title="Bài sau">
            <IconNext size={19} />
          </button>

          <button
            className={`icon-btn ${repeat !== 'off' ? 'icon-btn--on' : ''}`}
            onClick={cycleRepeat}
            title={
              repeat === 'off' ? 'Không lặp' : repeat === 'all' ? 'Lặp cả hàng đợi' : 'Lặp một bài'
            }
          >
            {repeat === 'one' ? <IconRepeatOne size={16} /> : <IconRepeat size={16} />}
          </button>
        </div>

        <div className="seek">
          <span className="seek__time">{track?.isLive ? 'LIVE' : formatTime(position)}</span>
          <SeekBar value={position} max={duration} onChange={seek} disabled={!seekable} />
          <span className="seek__time seek__time--right">
            {seekable ? formatTime(duration) : '--:--'}
          </span>
        </div>
      </div>

      <div className="playerbar__right">
        <button
          className={`icon-btn ${queueOpen ? 'icon-btn--on' : ''}`}
          onClick={() => setQueueOpen(!queueOpen)}
          title="Hàng đợi phát"
        >
          <IconQueue size={17} />
        </button>

        <button className="icon-btn" onClick={toggleMute} title={muted ? 'Bỏ tắt tiếng' : 'Tắt tiếng'}>
          {muted || volume === 0 ? <IconVolumeMute size={17} /> : <IconVolume size={17} />}
        </button>

        <input
          className="volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          title={`Âm lượng ${Math.round((muted ? 0 : volume) * 100)}%`}
        />
      </div>
    </footer>
  )
}
