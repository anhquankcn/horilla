import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { HNH } from '../../lib/theme'
import { Icon } from './Icon'

type ToastType = 'success' | 'error' | 'info'

interface ToastState {
  message: string
  type: ToastType
  id: number
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void
}

const Ctx = createContext<ToastCtx>({ toast: () => {} })

export const useToast = () => useContext(Ctx)

const ICON_MAP: Record<ToastType, { name: string; color: string }> = {
  success: { name: 'check', color: HNH.success },
  error: { name: 'x', color: HNH.red },
  info: { name: 'bell', color: HNH.navy },
}

const BG_MAP: Record<ToastType, string> = {
  success: HNH.ink,
  error: '#5c1118',
  info: HNH.navy,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastState[]>([])
  const idRef = useRef(0)

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++idRef.current
    setItems(prev => [...prev, { message, type, id }])
    setTimeout(() => {
      setItems(prev => prev.filter(t => t.id !== id))
    }, 2800)
  }, [])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="fixed flex flex-col items-center gap-2"
        style={{
          bottom: 90, left: 0, right: 0,
          pointerEvents: 'none', zIndex: 9990,
        }}
      >
        {items.map(t => {
          const icon = ICON_MAP[t.type]
          return (
            <div
              key={t.id}
              className="flex items-center gap-2"
              style={{
                background: BG_MAP[t.type],
                color: '#fff',
                borderRadius: 14,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                pointerEvents: 'auto',
                animation: 'toast-in 0.25s ease-out',
                maxWidth: 'calc(100vw - 48px)',
              }}
            >
              <Icon name={icon.name} size={14} color={icon.color} stroke={2.5} />
              {t.message}
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
