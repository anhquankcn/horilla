import { useState, useEffect } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from './ui/Icon'

const DISMISS_KEY = 'hnh_pwa_install_dismissed'
const DISMISS_DAYS = 30

function wasDismissed(): boolean {
  const val = localStorage.getItem(DISMISS_KEY)
  if (!val) return false
  return Date.now() - parseInt(val, 10) < DISMISS_DAYS * 86_400_000
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function detectIOSSafari(): boolean {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && /^((?!chrome|android).)*safari/i.test(ua)
}

export function PWAInstallBanner() {
  const [visible, setVisible] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [prompt, setPrompt] = useState<{ prompt(): void; userChoice: Promise<{ outcome: string }> } | null>(null)

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return

    if (detectIOSSafari()) {
      setIsIos(true)
      setVisible(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as unknown as typeof prompt)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setVisible(false)
    setPrompt(null)
  }

  if (!visible) return null

  const iconSrc = `${import.meta.env.BASE_URL}icons/icon-192.png`

  return (
    <div
      style={{
        flexShrink: 0,
        background: HNH.navy,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        boxShadow: '0 -2px 12px rgba(20,43,111,0.22)',
      }}
    >
      {/* App icon */}
      <img
        src={iconSrc}
        alt="HNH HRM"
        style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
          {isIos ? 'Thêm vào màn hình chính' : 'Cài app HNH HRM'}
        </div>
        {isIos ? (
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span>Nhấn</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.2)', borderRadius: 5,
              width: 18, height: 18, flexShrink: 0,
            }}>
              <Icon name="arrow-up" size={11} color="#fff" stroke={2.5} />
            </span>
            <span>rồi "Thêm vào MH chính"</span>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
            Dùng như app thật, không cần mở trình duyệt
          </div>
        )}
      </div>

      {/* Install button — Android only */}
      {!isIos && (
        <button
          onClick={install}
          style={{
            background: '#fff', color: HNH.navy,
            fontSize: 12.5, fontWeight: 700,
            border: 'none', borderRadius: 10,
            padding: '8px 14px',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          Cài app
        </button>
      )}

      {/* Dismiss */}
      <button
        onClick={dismiss}
        style={{
          background: 'rgba(255,255,255,0.15)',
          border: 'none', borderRadius: 8,
          width: 28, height: 28, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Icon name="x" size={14} color="rgba(255,255,255,0.85)" stroke={2.5} />
      </button>
    </div>
  )
}
