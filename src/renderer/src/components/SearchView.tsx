import { useState, type FormEvent, type JSX } from 'react'
import type { SourceId } from '@shared/types'
import { useApp } from '@/store/app'
import { usePlayer } from '@/store/player'
import { TrackRow } from './TrackRow'
import { sourceLabel } from '@/lib/format'
import { IconLink, IconSearch } from '@/lib/icons'
import { LyraLoader } from './LyraLoader'

export function SearchView(): JSX.Element {
  const {
    searchQuery,
    searchResults,
    searching,
    enabledSources,
    sourceStatus,
    runSearch,
    toggleSource,
    addFromUrl,
    setView
  } = useApp()

  const playTracks = usePlayer((s) => s.playTracks)
  const enqueue = usePlayer((s) => s.enqueue)
  const currentId = usePlayer((s) => s.current()?.id)

  const [input, setInput] = useState(searchQuery)
  const [urlInput, setUrlInput] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    void runSearch(input)
  }

  const submitUrl = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!urlInput.trim()) return
    setUrlBusy(true)
    const track = await addFromUrl(urlInput)
    setUrlBusy(false)
    if (track) {
      setUrlInput('')
      enqueue([track])
    }
  }

  const searchable = sourceStatus.filter((s) => s.searchable)

  return (
    <>
      <div className="view-head">
        <h1>Tìm nhạc online</h1>
        <div className="view-head__sub">Tìm song song trên các nguồn đang bật</div>
      </div>

      <form className="search-bar" onSubmit={submit}>
        <input
          placeholder="Tên bài hát, nghệ sĩ…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
        <button className="btn btn--primary" type="submit" disabled={searching || !input.trim()}>
          {searching ? <LyraLoader /> : <IconSearch size={16} />}
          Tìm
        </button>
      </form>

      <div className="chips">
        {searchable.map((source) => (
          <button
            key={source.id}
            className={`chip ${enabledSources.includes(source.id) ? 'chip--on' : ''}`}
            onClick={() => toggleSource(source.id)}
            title={source.error ?? (source.playable ? undefined : 'Chỉ tra cứu thông tin, không phát được')}
          >
            {source.label}
            {source.error ? ' ⚠' : ''}
          </button>
        ))}
      </div>

      <form className="search-bar" onSubmit={(e) => void submitUrl(e)}>
        <input
          placeholder="Hoặc dán link trực tiếp: YouTube, mp3, radio…"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
        />
        <button className="btn btn--ghost" type="submit" disabled={urlBusy || !urlInput.trim()}>
          {urlBusy ? <LyraLoader /> : <IconLink size={16} />}
          Thêm vào hàng đợi
        </button>
      </form>

      {searchResults.length === 0 && !searching && (
        <div className="empty">
          <div className="empty__icon">
            <IconSearch size={40} />
          </div>
          <h3>Chưa có kết quả</h3>
          <p>
            Gõ từ khoá ở trên để tìm trên {searchable.map((s) => s.label).join(', ')}. Bạn cũng có thể dán thẳng một link YouTube hay địa chỉ radio.
          </p>
        </div>
      )}

      {searchResults.map((result) => {
        const status = sourceStatus.find((s) => s.id === result.source)
        const playable = status?.playable ?? true

        return (
          <section key={result.source}>
            <div className="section-title">
              <span className={`source-tag source-tag--${result.source}`}>
                {sourceLabel(result.source)}
              </span>
              {result.tracks.length > 0 && `${result.tracks.length} kết quả`}
              {!playable && result.tracks.length > 0 && ' · chỉ tra cứu, không phát được'}
            </div>

            {result.error ? (
              <div className="alert alert--error">
                <div className="alert__body">
                  {result.error}
                  {result.source === 'youtube' && (
                    <>
                      {' '}
                      <button
                        className="btn btn--sm btn--ghost"
                        style={{ marginLeft: 6 }}
                        onClick={() => setView('settings')}
                      >
                        Mở cài đặt
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : result.tracks.length === 0 ? (
              <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '4px 10px' }}>
                Không có kết quả nào.
              </div>
            ) : (
              <div className="track-list">
                {result.tracks.map((track, i) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={i}
                    playing={track.id === currentId}
                    onPlay={() => void playTracks(result.tracks, i)}
                    onEnqueue={() => enqueue([track])}
                    disabled={!playable}
                    disabledReason="Spotify chỉ cho tra cứu thông tin — không stream audio qua API công khai."
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
