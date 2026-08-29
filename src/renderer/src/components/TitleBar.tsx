import type { JSX } from 'react'
import { useApp } from '@/store/app'
import { IconClose, IconMaximize, IconMinimize, IconOverlay } from '@/lib/icons'
import { Logo } from './Logo'

export function TitleBar(): JSX.Element {
  const settings = useApp((s) => s.settings)
  const patchSettings = useApp((s) => s.patchSettings)
  const overlayOn = settings?.overlay.enabled ?? false

  const toggleOverlay = async (): Promise<void> => {
    const next = !overlayOn
    await window.api.overlay.setVisible(next)
    if (settings) await patchSettings({ overlay: { ...settings.overlay, enabled: next } })
  }

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <Logo size={17} />
        Lyra
      </div>

      <div className="titlebar__spacer" />

      <button
        className={`titlebar__pill ${overlayOn ? 'titlebar__pill--on' : ''}`}
        onClick={toggleOverlay}
        title="Bật/tắt khung lời nổi trên màn hình"
      >
        <IconOverlay size={15} />
        Lời nổi
      </button>

      <div className="titlebar__buttons">
        <button className="titlebar__btn" onClick={() => window.api.window.minimize()} title="Thu nhỏ">
          <IconMinimize />
        </button>
        <button className="titlebar__btn" onClick={() => window.api.window.maximize()} title="Phóng to">
          <IconMaximize />
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          onClick={() => window.api.window.close()}
          title={settings?.minimizeToTray ? 'Thu xuống khay hệ thống' : 'Đóng'}
        >
          <IconClose />
        </button>
      </div>
    </header>
  )
}
