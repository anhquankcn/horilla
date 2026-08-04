import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Context dùng chung cho việc cập nhật Service Worker — gọi useRegisterSW MỘT LẦN
// ở provider, chia sẻ cho UpdatePrompt (banner tự động) và nút "Cập nhật ứng dụng"
// trong modal Avatar (kiểm tra thủ công).

export type SwCheckResult = 'updated' | 'latest' | 'error'

interface SwUpdate {
  needRefresh: boolean
  setNeedRefresh: (v: boolean) => void
  updateNow: () => void                        // skipWaiting + reload sang bản mới
  checkNow: () => Promise<SwCheckResult>        // ép kiểm tra bản mới ngay
}

const Ctx = createContext<SwUpdate | null>(null)
const CHECK_INTERVAL_MS = 60 * 1000

export function SwUpdateProvider({ children }: { children: ReactNode }) {
  const regRef = useRef<ServiceWorkerRegistration | null>(null)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (!r) return
      regRef.current = r
      const check = () => { r.update().catch(() => { /* offline — bỏ qua */ }) }
      check()
      setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  const updateNow = () => updateServiceWorker(true)

  const checkNow = async (): Promise<SwCheckResult> => {
    const r = regRef.current
    if (!r) return 'error'
    try {
      await r.update()
    } catch {
      return 'error'
    }
    // Chờ ngắn để worker mới (nếu có) chuyển sang trạng thái "waiting".
    for (let i = 0; i < 6; i++) {
      if (r.waiting) return 'updated'
      await new Promise(res => setTimeout(res, 500))
    }
    return r.waiting ? 'updated' : 'latest'
  }

  return (
    <Ctx.Provider value={{ needRefresh, setNeedRefresh, updateNow, checkNow }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSwUpdate(): SwUpdate {
  const v = useContext(Ctx)
  if (!v) {
    // Fallback an toàn nếu dùng ngoài provider.
    return {
      needRefresh: false,
      setNeedRefresh: () => {},
      updateNow: () => window.location.reload(),
      checkNow: async () => 'error',
    }
  }
  return v
}
