import type { JSX } from 'react'
import { IconAlert, IconCheck, IconClose, IconInfo } from '@/lib/icons'
import { useApp, type ToastKind } from '@/store/app'

const ICON: Record<ToastKind, (props: { size?: number }) => JSX.Element> = {
  info: IconInfo,
  success: IconCheck,
  warning: IconAlert,
  error: IconAlert
}

export function Toasts(): JSX.Element {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICON[toast.kind]
        return (
          <div key={toast.id} className={`toast toast--${toast.kind}`}>
            <Icon size={16} />
            <span className="toast-text">{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Đóng thông báo"
            >
              <IconClose size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
