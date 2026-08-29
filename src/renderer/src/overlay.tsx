import { createRoot } from 'react-dom/client'
import { describe } from '@shared/errors'
import OverlayView from './OverlayView'
import './styles/overlay.css'

/**
 * Cua so overlay la mot tien trinh giao dien RIENG, khong dung chung luoi bat
 * loi voi cua so chinh. Loi o day ma khong bat thi khung lyric noi bien thanh
 * mot o trong suot khong noi gi - va vi no khong co vien, nguoi dung con khong
 * biet no van dang o do.
 *
 * Khong dung `report` cua cua so chinh: no keo theo ca kho zustand va he thong
 * toast, ma overlay khong co cai nao.
 */
function log(message: string, detail: unknown): void {
  try {
    window.api.log.write({
      level: 'error',
      scope: 'khung lyric noi',
      message,
      detail: detail instanceof Error ? detail.stack || detail.message : String(detail)
    })
  } catch {
    console.error(message, detail)
  }
}

window.addEventListener('error', (event) => {
  log(describe(event.error ?? event.message, 'Khung lyric nổi gặp lỗi.'), event.error)
})

window.addEventListener('unhandledrejection', (event) => {
  log(describe(event.reason, 'Khung lyric nổi gặp lỗi nền.'), event.reason)
})

const root = document.getElementById('root')
if (!root) {
  log('Khong tim thay the goc cua khung lyric noi', null)
} else {
  // Khong dung StrictMode: mount hai lan se dang ky trung listener IPC,
  // khien overlay nhan doi moi ban tin trong che do dev.
  createRoot(root).render(<OverlayView />)
}
