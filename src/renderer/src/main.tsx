import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installGlobalErrorHandlers, logToMain } from './lib/report'
import './styles/global.css'

// Cai truoc khi dung hinh: loi ngay trong lan dung hinh dau tien cung phai
// duoc ghi lai
installGlobalErrorHandlers()

const root = document.getElementById('root')
if (!root) {
  // Khong the co, nhung neu co that thi man hinh trang tron khong mot loi giai
  // thich - it ra cung noi duoc mot cau
  logToMain('error', 'khởi động', 'Không tìm thấy thẻ gốc để dựng giao diện')
  document.body.textContent = 'Lyra không dựng được giao diện. Xin khởi động lại app.'
} else {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary scope="giao diện">
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
}
