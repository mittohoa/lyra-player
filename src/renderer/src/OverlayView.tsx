import { useEffect, useMemo, useState, type CSSProperties, type JSX } from 'react'
import type { OverlayState } from '@shared/ipc'
import type { OverlaySettings } from '@shared/types'
import { activeLineIndex } from '@/lib/lyrics'
import {
  IconClose,
  IconMouseOff,
  IconNext,
  IconPause,
  IconPin,
  IconPlay,
  IconPrev,
  IconSliders
} from '@/lib/icons'

/**
 * Font để chọn nhanh ngay trên khung nổi.
 *
 * Chỉ liệt kê font có sẵn trong Windows 10/11 và đủ dấu tiếng Việt — chọn phải
 * font máy không có thì chữ lặng lẽ rơi về font khác, người dùng tưởng nút hỏng.
 * Font đang dùng luôn được chèn vào đầu danh sách kể cả khi không nằm ở đây,
 * vì người dùng có thể đã tự gõ tên font khác trong Cài đặt.
 */
const FONTS = [
  'Segoe UI',
  'Segoe UI Variable Display',
  'Arial',
  'Tahoma',
  'Verdana',
  'Calibri',
  'Candara',
  'Corbel',
  'Cambria',
  'Constantia',
  'Georgia',
  'Times New Roman',
  'Bahnschrift',
  'Consolas'
]

const MIN_SIZE = 12
const MAX_SIZE = 96

const EMPTY_STATE: OverlayState = {
  title: '',
  artist: '',
  isPlaying: false,
  position: 0,
  duration: 0,
  lines: [],
  kind: 'none',
  offset: 0
}

export default function OverlayView(): JSX.Element | null {
  const [state, setState] = useState<OverlayState>(EMPTY_STATE)
  const [settings, setSettings] = useState<OverlaySettings | null>(null)
  const [hover, setHover] = useState(false)
  /** Bảng tinh chỉnh: mặc định đóng, bấm nút mới mở. */
  const [tuning, setTuning] = useState(false)
  /** Phím tắt bật/tắt khung, chỉ để hiện lại cho người dùng nhớ. */
  const [toggleKey, setToggleKey] = useState('')

  useEffect(() => {
    void window.api.settings.get().then((s) => {
      setSettings(s.overlay)
      setToggleKey(s.hotkeys.toggleOverlay || 'chưa đặt')
    })
    void window.api.overlay.pullState().then((s) => s && setState(s))

    const offState = window.api.overlay.onState(setState)
    const offTick = window.api.overlay.onTick((tick) =>
      setState((prev) => ({ ...prev, position: tick.position, isPlaying: tick.isPlaying }))
    )
    const offSettings = window.api.overlay.onSettings(setSettings)

    return () => {
      offState()
      offTick()
      offSettings()
    }
  }, [])

  // Esc để đóng bảng tinh chỉnh — khung nổi không có viền, không có chỗ nào
  // khác để bấm ra ngoài cho tự nhiên
  useEffect(() => {
    if (!tuning) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setTuning(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tuning])

  const active = useMemo(
    () =>
      state.kind === 'synced' ? activeLineIndex(state.lines, state.position, state.offset) : -1,
    [state]
  )

  // Font người dùng đang dùng có thể không nằm trong danh sách (họ tự gõ tên
  // trong Cài đặt) - vẫn phải hiện ra, không thì mở bảng lên là bị đổi mất
  const fontChoices = useMemo(() => {
    const current = settings?.fontFamily
    return current && !FONTS.includes(current) ? [current, ...FONTS] : FONTS
  }, [settings?.fontFamily])

  /**
   * Ghi cài đặt mới và vẽ lại ngay.
   *
   * Không đợi tiến trình chính trả lời rồi mới vẽ: thanh trượt mà chờ một vòng
   * IPC cho mỗi bước thì kéo rất giật. Đặt trước ở đây, tiến trình chính lưu
   * xuống đĩa rồi phát lại cho cả hai cửa sổ sau.
   */
  const patch = (next: Partial<OverlaySettings>): void => {
    setSettings((prev) => (prev ? { ...prev, ...next } : prev))
    void window.api.overlay.patchSettings(next)
  }

  if (!settings) return null
  // Đang mở bảng tinh chỉnh thì giữ khung lại: biến mất giữa lúc người dùng
  // đang kéo thanh cỡ chữ vì nhạc vừa tạm dừng thì không còn đường nào chỉnh nữa
  if (!settings.showWhenPaused && !state.isPlaying && !tuning) return null

  // Đóng dang hat + may dong truoc/sau theo cai dat
  const span = settings.contextLines
  const visible: {
    text: string
    translation?: string
    isActive: boolean
    key: string
  }[] = []

  if (state.kind === 'synced' && state.lines.length && active >= 0) {
    const from = Math.max(0, active - span)
    const to = Math.min(state.lines.length - 1, active + span)
    for (let i = from; i <= to; i++) {
      const text = state.lines[i].text || '♪'
      const translation = state.translations?.[i]
      visible.push({
        text,
        // Chi hien ban dich khi no khac dong goc (tranh lap lai voi dong chi co ♪)
        translation: translation && translation !== text ? translation : undefined,
        isActive: i === active,
        key: `l${i}`
      })
    }
  }

  // Chua co lyric (hoac chua toi dong dau) thi hien ten bài cho do trong
  const idle =
    visible.length === 0
      ? state.title
        ? `${state.artist} — ${state.title}`
        : 'Chưa phát bài nào'
      : null

  const textStyle: CSSProperties = {
    fontFamily: `"${settings.fontFamily}", "Segoe UI", system-ui, sans-serif`,
    fontSize: settings.fontSize,
    color: settings.color,
    textAlign: settings.align,
    // paint-order dat vien nam duoi net chu thay vi an vao than chu
    paintOrder: 'stroke fill',
    WebkitTextStrokeWidth: settings.strokeWidth ? `${settings.strokeWidth}px` : undefined,
    WebkitTextStrokeColor: settings.strokeColor,
    textShadow: settings.strokeWidth ? '0 2px 8px rgba(0,0,0,0.55)' : undefined
  }

  const origin =
    settings.align === 'left'
      ? 'left center'
      : settings.align === 'right'
        ? 'right center'
        : 'center'

  return (
    <div
      className={[
        'ov',
        // Mở bảng tinh chỉnh thì giữ thanh công cụ hiện, kể cả khi chuột đã rời
        // đi — không thì bấm sang thanh trượt là thanh công cụ tự trốn mất
        (hover || tuning) && 'ov--hover',
        (settings.locked || settings.clickThrough) && 'ov--locked'
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        background: hexToRgba(settings.backgroundColor, settings.backgroundOpacity),
        ['--ov-origin' as string]: origin
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="ov__lines">
        {idle ? (
          <div className="ov__line ov__line--active ov__idle" style={textStyle}>
            {idle}
          </div>
        ) : (
          visible.map((line) => (
            <div key={line.key} className={line.isActive ? 'ov__row ov__row--active' : 'ov__row'}>
              <div
                className={`ov__line ${line.isActive ? 'ov__line--active' : ''}`}
                style={textStyle}
              >
                {line.text}
              </div>
              {line.translation && (
                <div
                  className="ov__line ov__line--translation"
                  style={{ ...textStyle, fontSize: Math.round(settings.fontSize * 0.62) }}
                >
                  {line.translation}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="ov__tools">
        <button
          className="ov__tool"
          onClick={() => window.api.overlay.sendCommand({ type: 'prev' })}
          title="Bài trước"
        >
          <IconPrev size={14} />
        </button>
        <button
          className="ov__tool"
          onClick={() => window.api.overlay.sendCommand({ type: 'play-pause' })}
          title={state.isPlaying ? 'Tạm dừng' : 'Phát'}
        >
          {state.isPlaying ? <IconPause size={13} /> : <IconPlay size={13} />}
        </button>
        <button
          className="ov__tool"
          onClick={() => window.api.overlay.sendCommand({ type: 'next' })}
          title="Bài sau"
        >
          <IconNext size={14} />
        </button>

        <button
          className="ov__tool ov__tool--wide"
          onClick={() => window.api.overlay.sendCommand({ type: 'nudge-offset', delta: -0.5 })}
          title="Lời đang chậm — kéo sớm lại 0,5 giây"
        >
          −0.5s
        </button>
        <button
          className="ov__tool ov__tool--wide"
          onClick={() => window.api.overlay.sendCommand({ type: 'nudge-offset', delta: 0.5 })}
          title="Lời đang nhanh — lùi lại 0,5 giây"
        >
          +0.5s
        </button>

        <button
          className={`ov__tool ${tuning ? 'ov__tool--on' : ''}`}
          onClick={() => setTuning((v) => !v)}
          title="Tinh chỉnh chữ và nền"
        >
          <IconSliders size={14} />
        </button>

        <button
          className={`ov__tool ${settings.locked ? 'ov__tool--on' : ''}`}
          onClick={() => void window.api.overlay.patchSettings({ locked: !settings.locked })}
          title={settings.locked ? 'Mở khoá để kéo thả' : 'Khoá vị trí'}
        >
          <IconPin size={14} />
        </button>
        <button
          className={`ov__tool ${settings.clickThrough ? 'ov__tool--on' : ''}`}
          onClick={() => void window.api.overlay.setClickThrough(!settings.clickThrough)}
          title="Cho chuột đi xuyên qua khung — tắt lại ở Cài đặt của cửa sổ chính"
        >
          <IconMouseOff size={14} />
        </button>
        <button
          className="ov__tool"
          onClick={() => void window.api.overlay.setVisible(false)}
          title="Đóng khung lời nổi"
        >
          <IconClose size={13} />
        </button>
      </div>

      {tuning && (
        <div className="ov__tune">
          <label className="ov__tune-row">
            <span>Font chữ</span>
            <select
              value={settings.fontFamily}
              onChange={(e) => void patch({ fontFamily: e.target.value })}
            >
              {fontChoices.map((font) => (
                <option key={font} value={font} style={{ fontFamily: font }}>
                  {font}
                </option>
              ))}
            </select>
          </label>

          <label className="ov__tune-row">
            <span>Cỡ chữ</span>
            <div className="ov__tune-slider">
              <input
                type="range"
                min={MIN_SIZE}
                max={MAX_SIZE}
                value={settings.fontSize}
                onChange={(e) => void patch({ fontSize: Number(e.target.value) })}
              />
              <b>{settings.fontSize}</b>
            </div>
          </label>

          <label className="ov__tune-row">
            <span>Nền mờ</span>
            <div className="ov__tune-slider">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.backgroundOpacity * 100)}
                onChange={(e) => void patch({ backgroundOpacity: Number(e.target.value) / 100 })}
              />
              <b>{Math.round(settings.backgroundOpacity * 100)}%</b>
            </div>
          </label>

          <label className="ov__tune-row">
            <span>Màu chữ</span>
            <div className="ov__tune-colors">
              <input
                type="color"
                value={settings.color}
                onChange={(e) => void patch({ color: e.target.value })}
                title="Màu chữ"
              />
              <input
                type="color"
                value={settings.strokeColor}
                onChange={(e) => void patch({ strokeColor: e.target.value })}
                title="Màu viền chữ — giúp đọc được trên nền sáng"
              />
            </div>
          </label>

          <div className="ov__tune-foot">Ẩn/hiện nhanh khung này: {toggleKey}</div>
        </div>
      )}

      <div className="ov__meta">
        {state.artist} — {state.title}
        {state.offset !== 0 && ` · lệch ${state.offset > 0 ? '+' : ''}${state.offset.toFixed(1)}s`}
      </div>
    </div>
  )
}

/** '#rrggbb' + do mo -> chuoi rgba(); do mo bang 0 thi trong suot han. */
function hexToRgba(hex: string, alpha: number): string {
  if (alpha <= 0) return 'transparent'
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean
  const num = Number.parseInt(full, 16)
  if (!Number.isFinite(num)) return 'transparent'
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}
