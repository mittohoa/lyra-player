import { useEffect, useMemo, useRef, type JSX } from 'react'
import { usePlayer } from '@/store/player'
import { useLyrics } from '@/store/lyrics'
import { activeLineIndex } from '@/lib/lyrics'
import { formatOffset } from '@/lib/format'
import { useApp } from '@/store/app'
import { IconEdit, IconRefresh, IconSparkle, IconTranslate } from '@/lib/icons'
import { LyraLoader } from './LyraLoader'

const ORIGIN_LABEL: Record<string, string> = {
  embedded: 'từ tag trong file',
  sidecar: 'từ file .lrc đi kèm',
  subtitle: 'từ file phụ đề đi kèm',
  lrclib: 'từ LRCLIB',
  manual: 'bạn tự nhập',
  none: 'không có'
}

export function LyricsPanel(): JSX.Element {
  const track = usePlayer((s) => s.current())
  const position = usePlayer((s) => s.position)
  const seek = usePlayer((s) => s.seek)

  const {
    lyrics,
    loading,
    translation,
    translating,
    aligning,
    alignPercent,
    refetch,
    nudgeOffset,
    setOffset,
    setEditorOpen,
    alignWithAi,
    translate,
    clearTranslation
  } = useLyrics()

  const toast = useApp((s) => s.toast)
  const settings = useApp((s) => s.settings)

  // Can timestamp chi lam duoc voi bài co file tren may, va chi can khi
  // lyric dang o dang van ban thuan
  const canAlign = !!track?.filePath && lyrics.kind === 'plain'
  const canTranslate = lyrics.lines.length > 0

  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  /** Tạm dừng tu cuon mot lat sau khi nguoi dung tu cuon tay. */
  const pauseAutoScroll = useRef(0)

  const active = useMemo(
    () => (lyrics.kind === 'synced' ? activeLineIndex(lyrics.lines, position, lyrics.offset) : -1),
    [lyrics, position]
  )

  useEffect(() => {
    if (active < 0 || Date.now() < pauseAutoScroll.current) return
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  if (!track) {
    return (
      <div className="empty">
        <h3>Chưa phát bài nào</h3>
        <p>Chọn một bài trong thư viện hoặc tìm trên mạng để bắt đầu.</p>
      </div>
    )
  }

  return (
    <div className="lyrics">
      <div className="lyrics__head">
        <strong style={{ fontSize: 14 }}>Lời bài hát</strong>
        <span className="lyrics__origin">
          {loading ? 'đang tìm…' : ORIGIN_LABEL[lyrics.origin]}
          {lyrics.kind === 'plain' && ' · không có mốc thời gian'}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {lyrics.kind === 'synced' && (
            <div className="offset-ctl" title="Chỉnh lệch nếu lyric chạy sớm hoặc trễ">
              <button className="icon-btn" onClick={() => nudgeOffset(-0.5)}>
                −
              </button>
              <span className="offset-ctl__value">{formatOffset(lyrics.offset)}</span>
              <button className="icon-btn" onClick={() => nudgeOffset(0.5)}>
                +
              </button>
              {lyrics.offset !== 0 && (
                <button className="btn btn--sm btn--ghost" onClick={() => setOffset(0)}>
                  Reset
                </button>
              )}
            </div>
          )}

          {canAlign && (
            <button
              className="icon-btn"
              onClick={async () => {
                const r = await alignWithAi(track)
                toast(r.message, r.ok ? 'info' : 'error')
              }}
              disabled={aligning}
              title="Dùng AI nghe bài hát rồi tự căn mốc thời gian cho lyric"
            >
              {aligning ? <LyraLoader /> : <IconSparkle size={16} />}
            </button>
          )}

          {canTranslate && (
            <button
              className={`icon-btn ${translation ? 'icon-btn--on' : ''}`}
              onClick={async () => {
                if (translation) {
                  clearTranslation()
                  return
                }
                const r = await translate(track)
                toast(r.message, r.ok ? 'info' : 'error')
              }}
              disabled={translating}
              title={
                translation
                  ? 'Ẩn bản dịch'
                  : `Dịch lyric sang ${settings?.translateTo ?? 'vi'}`
              }
            >
              {translating ? <LyraLoader /> : <IconTranslate size={16} />}
            </button>
          )}

          <button
            className="icon-btn"
            onClick={() => void refetch(track)}
            title="Tìm lại trên LRCLIB"
            disabled={loading}
          >
            <IconRefresh size={16} />
          </button>
          <button className="icon-btn" onClick={() => setEditorOpen(true)} title="Tự nhập hoặc sửa lời">
            <IconEdit size={16} />
          </button>
        </div>
      </div>

      <div
        className="lyrics__scroll"
        ref={scrollRef}
        onWheel={() => {
          pauseAutoScroll.current = Date.now() + 6000
        }}
      >
        {loading && <div className="lyric-line">Đang tìm lời bài hát…</div>}

        {aligning && (
          <div className="alert">
            <LyraLoader />
            <div className="alert__body">
              Đang nghe bài hát để căn mốc thời gian{alignPercent > 0 ? ` — ${alignPercent}%` : ''}.
              Một bài 4 phút mất vài phút, tuỳ máy.
            </div>
          </div>
        )}

        {!loading && !aligning && lyrics.kind === 'plain' && canAlign && (
          <div className="alert" style={{ marginBottom: 14 }}>
            <div className="alert__body">
              Lyric này không có mốc thời gian nên không chạy theo nhạc được. Bấm nút ✨ ở trên
              để AI nghe bài hát rồi tự căn mốc — chạy hoàn toàn trên máy bạn.
            </div>
          </div>
        )}

        {!loading && lyrics.kind === 'none' && (
          <div className="empty" style={{ padding: '40px 10px' }}>
            <h3>Không tìm thấy lời</h3>
            <p>
              Thu bam nut lam moi de tim lai tren LRCLIB, hoac tu dan loi vao bang nut sua ben tren.
              Ban cung co the de file <code>.lrc</code> cung ten canh file nhac.
            </p>
          </div>
        )}

        {lyrics.lines.map((line, i) => {
          const isActive = i === active
          const isNear = active >= 0 && Math.abs(i - active) === 1
          const clickable = lyrics.kind === 'synced' && !track.isLive

          return (
            <div
              key={`${line.time}-${i}`}
              ref={isActive ? activeRef : undefined}
              className={[
                'lyric-line',
                lyrics.kind === 'plain' && 'lyric-line--plain',
                isActive && 'lyric-line--active',
                isNear && 'lyric-line--near',
                clickable && 'lyric-line--clickable'
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={clickable ? () => seek(line.time - lyrics.offset) : undefined}
              title={clickable ? 'Bấm để nhảy tới dòng này' : undefined}
            >
              {line.text || '♪'}
              {translation?.[i] && translation[i] !== line.text && (
                <div className="lyric-line__translation">{translation[i]}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
