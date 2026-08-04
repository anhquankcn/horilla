import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './components/ui/Toast'
import { SwUpdateProvider } from './lib/swUpdate'
import { App } from './App'
import './styles/globals.css'

// Việc cập nhật Service Worker giờ do UpdatePrompt (virtual:pwa-register/react)
// quản lý ở chế độ 'prompt': SW mới CHỜ, hiện banner cho người dùng bấm cập nhật,
// rồi updateServiceWorker(true) mới skipWaiting + reload. Không tự reload ngầm nữa.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <ToastProvider>
          <SwUpdateProvider>
            <App />
          </SwUpdateProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
