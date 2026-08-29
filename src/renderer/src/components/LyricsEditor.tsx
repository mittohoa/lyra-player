import { useEffect, useState, type JSX } from 'react'
import { usePlayer } from '@/store/player'
import { useLyrics } from '@/store/lyrics'
import { formatTime } from '@/lib/format'
import { LyraLoader } from './LyraLoader'

/**
 * Hop thoai tu nhap lyric. Chap nhan ca van ban thuan lan dinh dang .lrc.
 * Nut "Chèn mốc <vi tri>" chen moc thoi gian cua thoi diem dang phat
 * de canh tay tung dong ma khong can roi app.
 */
export function LyricsEditor(): JSX.Element | null {
  const track = usePlayer((s) => s.current())
  const position = usePlayer((s) => s.position)

  const { editorOpen, setEditorOpen, saveManual, lyrics } = useLyrics()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editorOpen || !track) return
    void (async () => {
      const manual = await window.api.lyrics.getManual(track.id)
      if (manual) {
        setText(manual)
        return
      }
      // Chua co ban tu nhap: mo san lyric dang hien de sua tiep
      if (lyrics.kind === 'synced') {
        setText(
          lyrics.lines
            .map((l) => {
              const mm = String(Math.floor(l.time / 60)).padStart(2, '0')
              const ss = (l.time % 60).toFixed(2).padStart(5, '0')
              return `[${mm}:${ss}]${l.text}`
            })
            .join('\n')
        )
      } else {
        setText(lyrics.lines.map((l) => l.text).join('\n'))
      }
    })()
  }, [editorOpen, track, lyrics])

  if (!editorOpen || !track) return null

  const stampCurrent = (): void => {
    const mm = String(Math.floor(position / 60)).padStart(2, '0')
    const ss = (position % 60).toFixed(2).padStart(5, '0')
    setText((prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}[${mm}:${ss}]`)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    await saveManual(track, text)
    setSaving(false)
    setEditorOpen(false)
  }

  const clear = async (): Promise<void> => {
    setSaving(true)
    await saveManual(track, '')
    setSaving(false)
    setEditorOpen(false)
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => setEditorOpen(false)}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          Sua loi — {track.artist} · {track.title}
        </div>

        <div className="modal__body">
          <p style={{ marginTop: 0, fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Dán lời thuần hoặc định dạng <code>.lrc</code> co timestamp{' '}
            <code>[mm:ss.xx]</code> ở đầu mỗi dòng. Bản bạn tự nhập được ưu tiên hơn mọi nguồn khác.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={'[00:12.50]Dòng đầu tiên\n[00:18.20]Dòng thứ hai'}
          />
        </div>

        <div className="modal__foot">
          <button className="btn btn--ghost btn--sm" onClick={stampCurrent}>
            Chèn mốc {formatTime(position)}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn--ghost btn--danger" onClick={() => void clear()} disabled={saving}>
            Xoá bản tự nhập
          </button>
          <button className="btn btn--ghost" onClick={() => setEditorOpen(false)}>
            Huỷ
          </button>
          <button className="btn btn--primary" onClick={() => void save()} disabled={saving}>
            {saving ? <LyraLoader /> : null}
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}
