import { useState, useEffect } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'

interface EmbedPageProps {
  system: string
  title: string
  icon: string
  color: string
  to?: string
}

export function EmbedPage({ system, title, icon, color, to = '/pwa' }: EmbedPageProps) {
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/bff/embed/${system}/url?to=${encodeURIComponent(to)}`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then(data => { if (!cancelled) setIframeUrl(data.url) })
      .catch(e => { if (!cancelled) setError(e.message || 'Không thể kết nối') })
    return () => { cancelled = true }
  }, [system, to])

  return (
    <div className="flex flex-col" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {(loading || !iframeUrl) && !error && (
        <div className="flex flex-col items-center justify-center" style={{ flex: 1, gap: 16, padding: 40 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 8px 20px ${color}30`,
          }}>
            <Icon name={icon} size={28} color="#fff" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>{title} đang khởi động...</div>
            <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 4 }}>Đăng nhập tự động qua HNH SSO</div>
          </div>
          <div style={{
            width: 32, height: 32, border: `3px solid ${HNH.line}`,
            borderTopColor: color, borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center" style={{ flex: 1, gap: 12, padding: 40 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: HNH.red, textAlign: 'center' }}>{error}</div>
          <p style={{ fontSize: 12, color: HNH.ink3, textAlign: 'center' }}>
            Kiểm tra cấu hình tại Quản trị HT → Tích hợp → {title}
          </p>
          <button
            onClick={() => { setError(null); setLoading(true); window.location.reload() }}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: color, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Thử lại
          </button>
        </div>
      )}

      {iframeUrl && (
        <iframe
          src={iframeUrl}
          onLoad={() => setLoading(false)}
          style={{
            flex: 1, width: '100%', border: 'none',
            display: loading ? 'none' : 'block',
          }}
          allow="clipboard-write; fullscreen; microphone"
          title={title}
        />
      )}
    </div>
  )
}
