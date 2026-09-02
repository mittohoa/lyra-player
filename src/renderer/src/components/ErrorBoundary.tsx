import { Component, type ErrorInfo, type JSX, type ReactNode } from 'react'
import { describe } from '@shared/errors'
import { IconRefresh } from '@/lib/icons'
import { logToMain } from '@/lib/report'
import { Logo } from './Logo'

/**
 * Luoi cuoi cung cua giao dien.
 *
 * React thao sach cay giao dien khi mot component nem loi luc dung hinh: khong
 * co lop nay thi man hinh thanh trang tron va nguoi dung khong con duong nao
 * ngoai tat app. Bat lai thi ho van doc duoc chuyen gi da xay ra, va co nut
 * quay lai.
 *
 * Chi bat duoc loi luc dung hinh. Loi trong ham xu ly su kien va trong promise
 * do `installGlobalErrorHandlers` lo.
 */

interface Props {
  children: ReactNode
  /** Ten phan dang boc, de ghi vao nhat ky cho de lan. */
  scope: string
  /** Boc mot manh nho (vd. mot the) thi hien gon hon la boc ca man hinh. */
  compact?: boolean
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logToMain('error', this.props.scope, describe(error, 'Giao diện gặp lỗi.'), {
      message: error.message,
      stack: error.stack,
      component: info.componentStack
    })
  }

  private retry = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const message = describe(error, 'Phần này gặp lỗi và không hiển thị được.')

    if (this.props.compact) {
      return (
        <div className="boundary boundary--compact">
          <span>{message}</span>
          <button type="button" className="btn btn--ghost" onClick={this.retry}>
            <IconRefresh size={14} /> Thử lại
          </button>
        </div>
      )
    }

    return (
      <div className="boundary">
        <Logo size={44} />
        <h2>Phần này gặp lỗi</h2>
        <p>{message}</p>
        <p className="boundary-hint">
          Chi tiết đã được ghi vào nhật ký. Vào Cài đặt → Nhật ký để xem hoặc gửi lại cho người
          phát triển.
        </p>
        <div className="boundary-actions">
          <button type="button" className="btn btn--primary" onClick={this.retry}>
            <IconRefresh size={15} /> Thử lại
          </button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Tải lại AURA
          </button>
        </div>
      </div>
    )
  }
}

/** Tien cho boc mot manh nho ma khong phai go dai. */
export function Guard({ scope, children }: { scope: string; children: ReactNode }): JSX.Element {
  return (
    <ErrorBoundary scope={scope} compact>
      {children}
    </ErrorBoundary>
  )
}
