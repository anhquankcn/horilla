import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './components/ui/Toast'
import { App } from './App'
import './styles/globals.css'

// Auto-reload CHỈ khi là CẬP NHẬT THẬT của Service Worker.
// vite-plugin-pwa (registerType:'autoUpdate') dùng clientsClaim() → SW chiếm cả
// trang CHƯA có controller ở lần đầu và cũng bắn 'controllerchange' → reload →
// trang tải lại vẫn chưa có controller → lặp vô tận (~1 lần/giây). Guard
// hadController: bỏ qua lần claim đầu (chưa có controller), chỉ reload khi đã có
// controller từ trước (tức bản SW mới thay bản cũ).
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
