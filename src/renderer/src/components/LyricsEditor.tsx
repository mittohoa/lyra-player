import { useEffect, useState, type JSX } from 'react'
import { usePlayer } from '@/store/player'
import { useLyrics } from '@/store/lyrics'
import { formatTime } from '@/lib/format'
import { LyraLoader } from './LyraLoader'
import { IconImage } from '@/lib/icons'

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
  // Đang đọc ảnh. Một lượt đọc mất vài giây tới vài chục giây tuỳ ảnh, nên
  // phải cho thấy là app đang làm việc chứ không phải đứng hình.
  const [dangDoc, datDangDoc] = useState(false)
  const [baoOcr, datBaoOcr] = useState<string | null>(null)

  /**
   * Chọn một tấm ảnh rồi chèn chữ đọc được vào CUỐI ô soạn.
   *
   * Chèn thêm chứ không thay thế: người ta có thể chụp lời làm nhiều tấm, và
   * đọc tấm thứ hai mà xoá mất tấm thứ nhất thì phải làm lại từ đầu.
   */
  const nhapTuAnh = async (): Promise<void> => {
    datBaoOcr(null)
    datDangDoc(true)
    try {
      const duong = await window.api.ocr.pick()
      if (!duong) return
      const ra = await window.api.ocr.read(duong)
      if (!ra.chu.trim()) {
        datBaoOcr('Không đọc ra chữ nào trong ảnh này.')
        return
      }
      setText((cu) => (cu.trim() ? cu.replace(/\s*$/, '') + '\n' + ra.chu : ra.chu))
      datBaoOcr(
        ra.doTin < 60
          ? `Đã chèn, nhưng ảnh hơi khó đọc (độ tin ${ra.doTin}%) — xem lại giúp.`
          : `Đã chèn chữ đọc được (độ tin ${ra.doTin}%).`
      )
    } catch (e) {
      datBaoOcr('Không đọc được ảnh: ' + (e instanceof Error ? e.message : 'lỗi không rõ'))
    } finally {
      datDangDoc(false)
    }
  }

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
          {/*
            Báo kết quả đọc ảnh ngay dưới ô soạn, không dùng hộp thoại: chữ vừa
            được chèn vào ngay trên đó, người dùng cần nhìn cả hai cùng lúc để
            biết có phải sửa gì không.
          */}
          {baoOcr && <p className="ocr-bao">{baoOcr}</p>}
        </div>

        <div className="modal__foot">
          <button className="btn btn--ghost btn--sm" onClick={stampCurrent}>
            Chèn mốc {formatTime(position)}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => void nhapTuAnh()}
            disabled={dangDoc}
            title="Chọn ảnh chụp lời, đọc chữ ra rồi chèn vào đây"
          >
            {dangDoc ? <LyraLoader /> : <IconImage size={15} />}
            {dangDoc ? 'Đang đọc ảnh…' : 'Nhập từ ảnh'}
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
