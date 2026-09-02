import { useEffect, useState, type JSX, type ReactNode } from 'react'
import type { LogEntry } from '@shared/ipc'
import type { OverlaySettings } from '@shared/types'
import { suggestOverlayFontSize } from '@shared/overlay-size'
import { useApp } from '@/store/app'
import { useExternal } from '@/store/external'
import { IconFolder, IconRefresh, IconTrash } from '@/lib/icons'
import { attempt, report } from '@/lib/report'
import { LyraLoader } from './LyraLoader'

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="field">
      <div className="field__label">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div className="field__control">{children}</div>
    </div>
  )
}

function Switch({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <button
      className={`switch ${checked ? 'switch--on' : ''}`}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    />
  )
}

/** Doi mot phim vua bam thanh chuoi accelerator cua Electron. */
function toAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')

  const key = e.key
  // Chi bam mot phim bo tro thi chua thanh to hop
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null

  const named: Record<string, string> = {
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ' ': 'Space',
    Escape: 'Esc'
  }
  const main = named[key] ?? (key.length === 1 ? key.toUpperCase() : key)
  if (!parts.length) return null // phim don le se cuop het ban phim - bat buoc co phim bo tro
  return [...parts, main].join('+')
}

/** O nhap phim tat: bam vao roi go to hop phim muon dung. */
function HotkeyInput({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}): JSX.Element {
  const [listening, setListening] = useState(false)

  useEffect(() => {
    if (!listening) return
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      if (e.key === 'Escape') {
        setListening(false)
        return
      }
      const accelerator = toAccelerator(e)
      if (accelerator) {
        onChange(accelerator)
        setListening(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [listening, onChange])

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button
        className={`btn btn--sm ${listening ? 'btn--primary' : 'btn--ghost'}`}
        onClick={() => setListening((v) => !v)}
        style={{ minWidth: 132, justifyContent: 'center', fontFamily: 'ui-monospace, monospace' }}
      >
        {listening ? 'Bấm tổ hợp...' : value || 'Chưa đặt'}
      </button>
      {value && !listening && (
        <button className="icon-btn" onClick={() => onChange('')} title="Bỏ phím tắt">
          <IconTrash size={14} />
        </button>
      )}
    </div>
  )
}

/** Hien bài app khac dang phat, de kiem chung tinh nang chay that. */
/** Mo ta ngan gon dang bat duoc gi, de nguoi dung biet no co chay khong. */
function describeMatch(
  matched: { from: string; type: string; language?: string } | null,
  lyrics: { kind: string; lines: unknown[] }
): string {
  if (!matched || !lyrics.lines.length) return 'chưa tìm thấy lời'

  const source =
    matched.from === 'youtube'
      ? 'YouTube'
      : matched.from === 'youtube-auto'
        ? 'YouTube (máy tự nghe)'
        : matched.from === 'lrclib'
          ? 'LRCLIB'
          : matched.from === 'zing'
            ? 'Zing MP3'
            : 'NhacCuaTui'

  const what = matched.type === 'subtitles' ? 'phụ đề' : 'lời bài hát'
  const lang = matched.language ? ` [${matched.language}]` : ''
  const synced = lyrics.kind === 'synced' ? 'có mốc thời gian' : 'không có mốc'
  return `${what}${lang} từ ${source} · ${lyrics.lines.length} dòng, ${synced}`
}

function NowPlayingElsewhere(): JSX.Element {
  const now = useExternal((s) => s.now)
  const lyrics = useExternal((s) => s.lyrics)
  const matched = useExternal((s) => s.matched)

  if (!now) {
    return (
      <div className="alert" style={{ marginTop: 14, marginBottom: 0 }}>
        <div className="alert__body">
          Chưa thấy app nào đang phát. Mở Spotify hoặc phát một video rồi quay lại đây.
        </div>
      </div>
    )
  }

  return (
    <div className="folder-row" style={{ marginTop: 14, marginBottom: 0, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, direction: 'ltr' }}>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          {now.artist ? `${now.artist} — ` : ''}
          {now.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
          {now.app} · {now.status === 'Playing' ? 'đang phát' : 'tạm dừng'} ·{' '}
          {describeMatch(matched, lyrics)}
        </div>
        {matched && (
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
            nhận diện: {matched.artist ? matched.artist + ' — ' : ''}
            {matched.title}
          </div>
        )}
      </div>
    </div>
  )
}

const MODEL_NOTE: Record<string, string> = {
  tiny: '74 MB · nhanh nhất, nghe kém',
  base: '141 MB · cân bằng, đủ để căn mốc',
  small: '465 MB · nghe tốt nhất, chậm hơn vài lần'
}

const LANGS: Record<string, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  'zh-CN': '简体中文',
  fr: 'Français',
  es: 'Español'
}

/**
 * Hai tinh nang AI rat khac nhau nen tach ro trong UI:
 * - Can timestamp: chay Whisper TREN MAY, khong gui gi di, chi ton dung luong tai ve.
 * - Dich lyric: chay tren may, khong khoa va khong ton tien.
 */
function AiSection(): JSX.Element | null {
  const { settings, patchSettings, toast } = useApp()
  const [status, setStatus] = useState<{
    whisperInstalled: boolean
    models: Record<string, boolean>
    boMayDich: 'nhanh' | 'tot'
  } | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState('')

  useEffect(() => {
    void window.api.ai.status().then(setStatus)
    return window.api.ai.onInstallProgress((p) => {
      const pct = p.total ? Math.round((p.received / p.total) * 100) : 0
      const what = p.step === 'whisper' ? 'bộ nhận dạng' : 'model'
      setProgress(`Đang tải ${what}: ${pct}%`)
    })
  }, [])

  if (!settings || !status) return null

  const size = settings.whisperModel
  const ready = status.whisperInstalled && status.models[size]

  const install = async (): Promise<void> => {
    setInstalling(true)
    setProgress('Đang chuẩn bị...')
    try {
      setStatus(await window.api.ai.install(size))
      toast('Đã cài xong. Giờ căn được mốc thời gian cho lời bài hát rồi.', 'success')
    } catch (err) {
      report('AI', err, { fallback: 'Cài đặt bộ nhận dạng thất bại.' })
    } finally {
      setInstalling(false)
      setProgress('')
    }
  }


  return (
    <>
      <section className="card">
        <h3>AI căn mốc thời gian cho lyric</h3>
        <p className="card__hint">
          Khi chỉ tìm được lời mà không có mốc thời gian, tính năng này nghe bài hát rồi tự dựng
          lại mốc để lyric chạy theo nhạc được. <strong>Chạy hoàn toàn trên máy bạn</strong> —
          không gửi nhạc đi đâu. Đổi lại phải tải bộ nhận dạng một lần.
        </p>

        <Field label="Trạng thái" hint={ready ? 'Sẵn sàng' : 'Chưa tải bộ nhận dạng'}>
          <span style={{ color: ready ? 'var(--ok)' : 'var(--warn)', fontSize: 13 }}>
            {ready ? 'Sẵn sàng' : 'Chưa có'}
          </span>
        </Field>

        <Field label="Model nhận dạng" hint={MODEL_NOTE[size]}>
          <select
            value={size}
            onChange={(e) =>
              void patchSettings({ whisperModel: e.target.value as 'tiny' | 'base' | 'small' })
            }
          >
            {Object.entries(MODEL_NOTE).map(([k]) => (
              <option key={k} value={k}>
                {k}
                {status.models[k] ? ' (đã tải)' : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Ngôn ngữ bài hát" hint="Đặt đúng thì nghe chuẩn hơn nhiều so với để tự đoán">
          <select
            value={settings.whisperLanguage}
            onChange={(e) => void patchSettings({ whisperLanguage: e.target.value })}
          >
            <option value="auto">Tự đoán</option>
            {Object.entries(LANGS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        {!ready && (
          <div style={{ marginTop: 12 }}>
            <button className="btn btn--primary btn--sm" onClick={() => void install()} disabled={installing}>
              {installing ? <LyraLoader /> : null}
              Tải bộ nhận dạng ({MODEL_NOTE[size].split(' ·')[0]})
            </button>
            {progress && (
              <span style={{ marginLeft: 10, fontSize: 12.5, color: 'var(--text-dim)' }}>
                {progress}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h3>Dịch lyric</h3>
        <p className="card__hint">
          Hiện bản dịch ngay dưới mỗi dòng, cả trong app lẫn trên khung lyric nổi.{' '}
          <strong>Chạy hoàn toàn trên máy bạn</strong> — không khoá API, không tài khoản,
          không tốn tiền, và dùng được cả khi mất mạng. Lời bài hát không rời khỏi máy.
        </p>

        <Field label="Dịch sang">
          <select
            value={settings.translateTo}
            onChange={(e) => void patchSettings({ translateTo: e.target.value })}
          >
            {Object.entries(LANGS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Bộ máy dịch"
          hint={
            settings.translateEngine === 'tot'
              ? '875 MB, dùng cho mọi ngôn ngữ'
              : '102 MB mỗi chiều'
          }
        >
          <select
            value={settings.translateEngine}
            onChange={(e) =>
              void patchSettings({ translateEngine: e.target.value as 'nhanh' | 'tot' })
            }
          >
            <option value="tot">Chất lượng — chậm hơn, dịch ra câu đọc được</option>
            <option value="nhanh">Nhanh và nhẹ — thô hơn, bỏ trống nhiều dòng</option>
          </select>
        </Field>

        <p className="card__hint" style={{ marginTop: 10 }}>
          {settings.translateEngine === 'tot'
            ? 'Một gói 875 MB dùng chung cho mọi ngôn ngữ, tải một lần. Khoảng 6 giây mỗi dòng nên một bài mất vài phút — bản dịch hiện dần từng dòng chứ không đợi xong hết, và lần nghe sau thì có ngay.'
            : 'Mỗi chiều dịch một gói 102 MB. Nhanh gấp sáu lần, nhưng đo trên lời thật thì khoảng một phần ba số dòng không dịch nổi và bị bỏ trống.'}
        </p>
      </section>
    </>
  )
}


/**
 * Nhat ky loi.
 *
 * Co no thi luc app cu do chung, nguoi dung mo ra doc duoc dung cau bao loi
 * ma khong phai mo DevTools hay di tim file. Cai nut mo thu muc de ho gui lai
 * ca file khi can.
 */
function LogSection(): JSX.Element {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(true)
  const toast = useApp((s) => s.toast)

  useEffect(() => {
    void window.api.log.recent().then(setEntries)
    // Dong moi den thi chen len dau, khong phai bam tai lai moi thay
    return window.api.log.onEntry((entry) => {
      setEntries((prev) => [entry, ...prev].slice(0, 400))
    })
  }, [])

  const shown = onlyProblems
    ? entries.filter((e) => e.level === 'error' || e.level === 'warn')
    : entries

  const copyAll = async (): Promise<void> => {
    const text = shown
      .map(
        (e) =>
          `${new Date(e.at).toISOString()} [${e.level}] [${e.scope}] ${e.message}` +
          (e.detail ? `\n    ${e.detail}` : '')
      )
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast(`Đã chép ${shown.length} dòng nhật ký.`, 'success')
    } catch (err) {
      report('nhật ký', err, { fallback: 'Không chép được vào clipboard.' })
    }
  }

  return (
    <section className="card">
      <h3>Nhật ký</h3>
      <p className="card__hint">
        Mọi lỗi AURA gặp phải đều được ghi lại ở đây và vào file trong thư mục dữ liệu. Khi có gì
        đó không chạy, mở ra xem trước khi đoán.
      </p>

      <Field label="Chỉ hiện lỗi và cảnh báo" hint={`Đang giữ ${entries.length} dòng gần nhất`}>
        <Switch checked={onlyProblems} onChange={setOnlyProblems} />
      </Field>

      {shown.length === 0 ? (
        <p className="card__hint" style={{ margin: 0 }}>
          {onlyProblems ? 'Chưa có lỗi nào. Tốt.' : 'Chưa có gì được ghi.'}
        </p>
      ) : (
        <div className="log-list">
          {shown.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`log-row log-row--${e.level}`}
              onClick={() => setOpenId(openId === e.id ? null : e.id)}
              title={e.detail ? 'Bấm để xem chi tiết kỹ thuật' : undefined}
            >
              <span className="log-time">
                {new Date(e.at).toLocaleTimeString('vi-VN', { hour12: false })}
              </span>
              <span>
                <span className="log-message">{e.message}</span>{' '}
                <span className="log-scope">— {e.scope}</span>
                {openId === e.id && e.detail && <pre className="log-detail">{e.detail}</pre>}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="row-actions">
        <button type="button" className="btn" onClick={() => void copyAll()} disabled={!shown.length}>
          Chép nhật ký
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void attempt('nhat ky', () => window.api.log.openFolder(), undefined)}
        >
          <IconFolder size={15} /> Mở thư mục nhật ký
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() =>
            void window.api.log.clear().then(() => {
              setEntries([])
              setOpenId(null)
            })
          }
          disabled={!entries.length}
        >
          <IconTrash size={15} /> Xoá
        </button>
      </div>
    </section>
  )
}

export function SettingsView(): JSX.Element {
  const { settings, patchSettings, scan, addFolder, removeFolder, scanning, toast } = useApp()
  const setSourceStatus = useApp.setState

  const [ytPath, setYtPath] = useState<string | null>(null)
  const [ytBusy, setYtBusy] = useState(false)
  const [spotifyDraft, setSpotifyDraft] = useState({ clientId: '', clientSecret: '' })

  useEffect(() => {
    void window.api.ytdlp.status().then((s) => setYtPath(s.path))
  }, [])

  useEffect(() => {
    if (settings) setSpotifyDraft(settings.spotify)
  }, [settings?.spotify.clientId, settings?.spotify.clientSecret])

  if (!settings) return <div className="empty">Đang tải cài đặt…</div>

  const overlay = settings.overlay

  // Do man hinh DANG CHUA cua so nay, khong phai man hinh chinh: nguoi cam hai
  // man hinh thuong keo AURA sang cai phu, va co chu hop voi cai phu moi la co
  // ho muon.
  const suggestedFontSize = suggestOverlayFontSize(window.screen.availWidth)

  /** Sua mot truong cua overlay va day sang cua so overlay ngay lap tuc. */
  const setOverlay = async (patch: Partial<OverlaySettings>): Promise<void> => {
    await window.api.overlay.patchSettings(patch)
    await patchSettings({ overlay: { ...overlay, ...patch } })
  }

  const refreshSources = async (): Promise<void> => {
    setSourceStatus({ sourceStatus: await window.api.sources.status() })
  }

  const installYtDlp = async (): Promise<void> => {
    setYtBusy(true)
    try {
      const path = await window.api.ytdlp.install()
      setYtPath(path)
      await refreshSources()
      toast('Đã cài yt-dlp. Giờ tìm được nhạc trên YouTube rồi.', 'success')
    } catch (err) {
      report('yt-dlp', err, { fallback: 'Cài yt-dlp thất bại.' })
    } finally {
      setYtBusy(false)
    }
  }

  const pickYtDlp = async (): Promise<void> => {
    const path = await window.api.ytdlp.pick()
    if (!path) return
    setYtPath(path)
    await refreshSources()
  }

  const saveSpotify = async (): Promise<void> => {
    await patchSettings({ spotify: spotifyDraft })
    await refreshSources()
    toast('Đã lưu khoá Spotify.', 'success')
  }

  return (
    <>
      <div className="view-head">
        <h1>Cài đặt</h1>
      </div>

      <div className="settings">
        {/* ---- Thư viện ---- */}
        <section className="card">
          <h3>Thư viện nhạc</h3>
          <p className="card__hint">
            App quet de quy cac thu muc nay, doc tag ID3 va tu nhan file <code>.lrc</code> cung ten
            nam canh moi bài.
          </p>

          {settings.libraryFolders.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Chưa có thư mục nào.</p>
          ) : (
            settings.libraryFolders.map((folder) => (
              <div className="folder-row" key={folder}>
                <IconFolder size={15} />
                <span title={folder}>{folder}</span>
                <button
                  className="icon-btn"
                  onClick={() => void removeFolder(folder)}
                  title="Bỏ theo dõi thư mục này"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            ))
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => void addFolder()}>
              <IconFolder size={15} />
              Thêm thư mục
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => void scan()}
              disabled={scanning || !settings.libraryFolders.length}
            >
              {scanning ? <LyraLoader /> : <IconRefresh size={15} />}
              Quét lại
            </button>
          </div>
        </section>

        {/* ---- Overlay lyric ---- */}
        <section className="card">
          <h3>Lời nổi tren man hinh</h3>
          <p className="card__hint">
            Mot cua so nen trong suot, luon noi tren cac cua so khac (ke ca game/video toan man
            hinh). Keo tha de doi cho; bat "click xuyen qua" de chuot di thang xuong cua so ben duoi.
          </p>

          <Field label="Bật lời nổi">
            <Switch
              checked={overlay.enabled}
              onChange={async (v) => {
                await window.api.overlay.setVisible(v)
                await patchSettings({ overlay: { ...overlay, enabled: v } })
              }}
            />
          </Field>

          <Field
            label="Click xuyên qua"
            hint="Chuột đi thẳng xuống cửa sổ phía dưới — lời nổi chỉ còn để nhìn"
          >
            <Switch
              checked={overlay.clickThrough}
              onChange={async (v) => {
                await window.api.overlay.setClickThrough(v)
                await patchSettings({ overlay: { ...overlay, clickThrough: v } })
              }}
            />
          </Field>

          <Field label="Khoá vị trí" hint="Chặn kéo thả để không lỡ xê dịch">
            <Switch checked={overlay.locked} onChange={(v) => void setOverlay({ locked: v })} />
          </Field>

          <Field label="Vẫn hiện khi tạm dừng">
            <Switch
              checked={overlay.showWhenPaused}
              onChange={(v) => void setOverlay({ showWhenPaused: v })}
            />
          </Field>

          <Field label="Cỡ chữ" hint={`${overlay.fontSize}px`}>
            <input
              type="range"
              min={16}
              max={80}
              value={overlay.fontSize}
              onChange={(e) => void setOverlay({ fontSize: Number(e.target.value) })}
              style={{ width: 160 }}
            />
            {suggestedFontSize !== overlay.fontSize && (
              <button
                className="btn btn--ghost"
                style={{ marginLeft: 8, fontSize: 12 }}
                onClick={() => void setOverlay({ fontSize: suggestedFontSize })}
                title={`Cỡ hợp với màn hình ${window.screen.availWidth} điểm ảnh này`}
              >
                Cỡ gợi ý: {suggestedFontSize}
              </button>
            )}
          </Field>

          <Field label="Font chữ">
            <select
              value={overlay.fontFamily}
              onChange={(e) => void setOverlay({ fontFamily: e.target.value })}
            >
              {['Segoe UI', 'Segoe UI Variable Display', 'Arial', 'Tahoma', 'Tìmes New Roman', 'Georgia'].map(
                (f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                )
              )}
            </select>
          </Field>

          <Field label="Màu chữ">
            <input
              type="color"
              value={overlay.color}
              onChange={(e) => void setOverlay({ color: e.target.value })}
            />
          </Field>

          <Field label="Viền chữ" hint="Giúp đọc được khi nền phía sau sáng màu">
            <input
              type="color"
              value={overlay.strokeColor}
              onChange={(e) => void setOverlay({ strokeColor: e.target.value })}
            />
            <input
              type="range"
              min={0}
              max={8}
              value={overlay.strokeWidth}
              onChange={(e) => void setOverlay({ strokeWidth: Number(e.target.value) })}
              style={{ width: 100 }}
            />
          </Field>

          <Field label="Nền mờ" hint={`${Math.round(overlay.backgroundOpacity * 100)}% - de 0 de trong suot han`}>
            <input
              type="color"
              value={overlay.backgroundColor}
              onChange={(e) => void setOverlay({ backgroundColor: e.target.value })}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={overlay.backgroundOpacity}
              onChange={(e) => void setOverlay({ backgroundOpacity: Number(e.target.value) })}
              style={{ width: 100 }}
            />
          </Field>

          <Field label="Số dòng phụ" hint="Hiện thêm mấy dòng trước và sau dòng đang hát">
            <select
              value={overlay.contextLines}
              onChange={(e) => void setOverlay({ contextLines: Number(e.target.value) })}
            >
              <option value={0}>Chỉ dòng đang hát</option>
              <option value={1}>1 dong truoc + sau</option>
              <option value={2}>2 dong truoc + sau</option>
            </select>
          </Field>

          <Field label="Canh lề">
            <select
              value={overlay.align}
              onChange={(e) => void setOverlay({ align: e.target.value as OverlaySettings['align'] })}
            >
              <option value="left">Trai</option>
              <option value="center">Giua</option>
              <option value="right">Phai</option>
            </select>
          </Field>

          <Field label="Vị trí cửa sổ" hint="Đặt lại về giữa dưới màn hình chính">
            <button
              className="btn btn--ghost btn--sm"
              onClick={async () => {
                await setOverlay({ bounds: null })
                if (overlay.enabled) {
                  await window.api.overlay.setVisible(false)
                  await window.api.overlay.setVisible(true)
                }
              }}
            >
              Đặt lại vị trí
            </button>
          </Field>
        </section>

        {/* ---- AI ---- */}
        <AiSection />

        {/* ---- Tai nhac ---- */}
        <section className="card">
          <h3>Tải nhạc về máy</h3>
          <p className="card__hint">
            Nút <strong>↓</strong> ở mỗi bài trong kết quả tìm kiếm sẽ tải file nhạc, ghi tag và
            ảnh bìa, rồi đặt file <code>.lrc</code> ngay cạnh — bài tải về vào thẳng thư viện
            offline và có lyric sẵn. NhacCuaTui cho 320 kbps không cần VIP; Zing MP3 thường chỉ
            128 kbps cho tài khoản thường.
          </p>
          <Field label="Thư mục lưu" hint={settings.downloadFolder || 'Mặc định: Music\Lyra'}>
            <button
              className="btn btn--ghost btn--sm"
              onClick={async () => {
                const folder = await window.api.download.pickFolder()
                await patchSettings({ downloadFolder: folder })
              }}
            >
              <IconFolder size={15} />
              Chọn...
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => void window.api.download.openFolder()}
            >
              Mở thư mục
            </button>
          </Field>
        </section>

        {/* ---- Nhac o app khac ---- */}
        <section className="card">
          <h3>Lyric cho nhạc ở app khác</h3>
          <p className="card__hint">
            Đọc bài đang phát từ Windows để hiện lyric nổi cho cả Spotify, YouTube trên trình
            duyệt, hay bất cứ app nào — không cần phát trong AURA. Khi AURA đang phát thì AURA
            được ưu tiên.
          </p>
          <Field
            label="Theo dõi nhạc toàn máy"
            hint="Chạy một tiến trình PowerShell nhỏ đọc System Media Transport Controls"
          >
            <Switch
              checked={settings.followSystemMedia}
              onChange={async (v) => {
                await window.api.smtc.setWatch(v)
                await patchSettings({ followSystemMedia: v })
              }}
            />
          </Field>
          <Field
            label="Lấy cả phụ đề video"
            hint="Video dài thì tìm phụ đề thay vì lời bài hát. Cần yt-dlp."
          >
            <Switch
              checked={settings.externalSubtitles}
              onChange={(v) => void patchSettings({ externalSubtitles: v })}
            />
          </Field>

          {settings.externalSubtitles && (
            <Field label="Ngôn ngữ phụ đề" hint="Theo thứ tự ưu tiên, cách nhau dấu phẩy">
              <input
                value={settings.subtitleLangs}
                onChange={(e) => void patchSettings({ subtitleLangs: e.target.value })}
                placeholder="vi,en"
                style={{ width: 140 }}
              />
            </Field>
          )}

          {settings.followSystemMedia && <NowPlayingElsewhere />}
        </section>

        {/* ---- Lyric ---- */}
        <section className="card">
          <h3>Nguồn lời bài hát</h3>
          <p className="card__hint">
            Thu tu uu tien: bạn tự nhập → file <code>.lrc</code> canh file nhac → tag nhung trong
            file → LRCLIB (mien phi, khong can key).
          </p>
          <Field label="Tự tìm trên LRCLIB" hint="Khi không tìm thấy lời trong máy">
            <Switch
              checked={settings.autoFetchLyrics}
              onChange={(v) => void patchSettings({ autoFetchLyrics: v })}
            />
          </Field>
        </section>

        {/* ---- YouTube ---- */}
        <section className="card">
          <h3>YouTube</h3>
          <p className="card__hint">
            Phan tim kiem va phat tu YouTube can <code>yt-dlp</code>. App co the tai ban chinh thuc
            tu GitHub ve thu muc du lieu rieng cua no.
          </p>

          <Field
            label="Trạng thái"
            hint={ytPath ? `Dang dung: ${ytPath}` : 'Chưa tìm thấy yt-dlp trên máy'}
          >
            <span style={{ color: ytPath ? 'var(--ok)' : 'var(--warn)', fontSize: 13 }}>
              {ytPath ? 'San sang' : 'Chua co'}
            </span>
          </Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn--primary btn--sm" onClick={() => void installYtDlp()} disabled={ytBusy}>
              {ytBusy ? <LyraLoader /> : null}
              Tai yt-dlp tu dong
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => void pickYtDlp()}>
              Chon file co san...
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => void window.api.system.openExternal('https://github.com/yt-dlp/yt-dlp/releases/latest')}
            >
              Mo trang tai
            </button>
          </div>

          <Field label="Đường dẫn ffmpeg" hint="Không bắt buộc — chỉ cần khi muốn chuyển mã">
            <input
              value={settings.ffmpegPath}
              onChange={(e) => void patchSettings({ ffmpegPath: e.target.value })}
              placeholder="C:\ffmpeg\bin"
              style={{ width: 240 }}
            />
          </Field>
        </section>

        {/* ---- Spotify ---- */}
        <section className="card">
          <h3>Spotify</h3>
          <p className="card__hint">
            Chi dung de tra cuu metadata (ten bài, nghe si, anh bia). API cong khai cua Spotify
            khong cho stream audio, nen kết quả Spotify khong bam phat duoc - dung no de tim dung ten
            bài roi phat tu nguon khac. Tạo app tai developer.spotify.com de lay Client ID/Secret.
          </p>

          <Field label="Client ID">
            <input
              value={spotifyDraft.clientId}
              onChange={(e) => setSpotifyDraft({ ...spotifyDraft, clientId: e.target.value })}
              style={{ width: 260 }}
            />
          </Field>
          <Field label="Client Secret">
            <input
              type="password"
              value={spotifyDraft.clientSecret}
              onChange={(e) => setSpotifyDraft({ ...spotifyDraft, clientSecret: e.target.value })}
              style={{ width: 260 }}
            />
          </Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn--primary btn--sm" onClick={() => void saveSpotify()}>
              Lưu
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => void window.api.system.openExternal('https://developer.spotify.com/dashboard')}
            >
              Mo Spotify Dashboard
            </button>
          </div>
        </section>

        {/* ---- Chung ---- */}
        <section className="card">
          <h3>Chung</h3>

          <Field label="Giao diện">
            <select
              value={settings.theme}
              onChange={(e) => void patchSettings({ theme: e.target.value as 'dark' | 'light' })}
            >
              <option value="dark">Toi</option>
              <option value="light">Sang</option>
            </select>
          </Field>

          <Field label="Nút X thu xuống khay" hint="Thay vì thoát hẳn — thoát qua menu chuột phải ở khay">
            <Switch
              checked={settings.minimizeToTray}
              onChange={(v) => void patchSettings({ minimizeToTray: v })}
            />
          </Field>

          <Field label="Phím media toàn cục" hint="Play/Pause, Next, Prev trên bàn phím">
            <Switch
              checked={settings.globalMediaKeys}
              onChange={(v) => void patchSettings({ globalMediaKeys: v })}
            />
          </Field>

          <Field label="Bật/tắt lyric nổi" hint="Phím tắt toàn cục, dùng được cả khi AURA ở khay">
            <HotkeyInput
              value={settings.hotkeys.toggleOverlay}
              onChange={(v) =>
                void patchSettings({ hotkeys: { ...settings.hotkeys, toggleOverlay: v } })
              }
            />
          </Field>

          <Field label="Lyric sớm hơn 0,5s" hint="Khi lyric chạy chậm hơn nhạc">
            <HotkeyInput
              value={settings.hotkeys.lyricsEarlier}
              onChange={(v) =>
                void patchSettings({ hotkeys: { ...settings.hotkeys, lyricsEarlier: v } })
              }
            />
          </Field>

          <Field label="Lyric muộn hơn 0,5s" hint="Khi lyric chạy nhanh hơn nhạc">
            <HotkeyInput
              value={settings.hotkeys.lyricsLater}
              onChange={(v) =>
                void patchSettings({ hotkeys: { ...settings.hotkeys, lyricsLater: v } })
              }
            />
          </Field>

          <Field label="Chạy cùng Windows">
            <Switch
              checked={settings.launchAtStartup}
              onChange={(v) => void patchSettings({ launchAtStartup: v })}
            />
          </Field>

          <Field label="Mở lên là thu xuống khay" hint="Không hiện cửa sổ khi khởi động">
            <Switch
              checked={settings.startMinimized}
              onChange={(v) => void patchSettings({ startMinimized: v })}
            />
          </Field>

          <Field
            label="Ghi .lrc cạnh file nhạc"
            hint="Khi bạn sửa lyric, lưu luôn thành file .lrc để app khác đọc được"
          >
            <Switch
              checked={settings.writeLrcSidecar}
              onChange={(v) => void patchSettings({ writeLrcSidecar: v })}
            />
          </Field>
        </section>

        <LogSection />
      </div>
    </>
  )
}
