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
  IconPrev
} from '@/lib/icons'

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

  useEffect(() => {
    void window.api.settings.get().then((s) => setSettings(s.overlay))
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

  const active = useMemo(
    () =>
      state.kind === 'synced' ? activeLineIndex(state.lines, state.position, state.offset) : -1,
    [state]
  )

  if (!settings) return null
  if (!settings.showWhenPaused && !state.isPlaying) return null

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
        hover && 'ov--hover',
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
          className={`ov__tool ${settings.locked ? 'ov__tool--on' : ''}`}
          onClick={() => void window.api.overlay.patchSettings({ locked: !settings.locked })}
          title={settings.locked ? 'Mo khoa de keo tha' : 'Khoa vi tri'}
        >
          <IconPin size={14} />
        </button>
        <button
          className={`ov__tool ${settings.clickThrough ? 'ov__tool--on' : ''}`}
          onClick={() => void window.api.overlay.setClickThrough(!settings.clickThrough)}
          title="Cho chuot di xuyen qua overlay - tat lai o Cài đặt cua cua so chinh"
        >
          <IconMouseOff size={14} />
        </button>
        <button
          className="ov__tool"
          onClick={() => void window.api.overlay.setVisible(false)}
          title="Đóng overlay"
        >
          <IconClose size={13} />
        </button>
      </div>

      <div className="ov__meta">
        {state.artist} — {state.title}
        {state.offset !== 0 && ` · lech ${state.offset > 0 ? '+' : ''}${state.offset.toFixed(1)}s`}
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
