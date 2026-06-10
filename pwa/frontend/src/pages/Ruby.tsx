import { useState, useEffect } from 'react'
import { HNH } from '../lib/theme'
import { LogoMark } from '../components/ui/Logo'
import { api } from '../lib/api'

export function RubyPage() {
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<{ url: string }>('/bff/arkon/embed-url?to=/pwa')
      .then(data => {
        if (!cancelled) setIframeUrl(data.url)
      })
      .catch(() => {
        if (!cancelled) setError('Không thể kết nối Ruby AI. Thử lại sau.')
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      {(loading || !iframeUrl) && !error && (
        <div className="flex flex-col items-center justify-center" style={{ flex: 1, gap: 16, padding: 40 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: `linear-gradient(135deg, ${HNH.red} 0%, ${HNH.redDark} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(192,34,43,0.3)',
          }}>
            <LogoMark size={40} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Ruby AI đang khởi động...</div>
            <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 4 }}>Đăng nhập tự động qua HNH SSO</div>
          </div>
          <div style={{
            width: 32, height: 32, border: `3px solid ${HNH.line}`,
            borderTopColor: HNH.red, borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center" style={{ flex: 1, gap: 12, padding: 40 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: HNH.red, textAlign: 'center' }}>{error}</div>
          <button
            onClick={() => { setError(null); setLoading(true); window.location.reload() }}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: HNH.red, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
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
            flex: 1,
            width: '100%',
            border: 'none',
            display: loading ? 'none' : 'block',
          }}
          allow="clipboard-write; fullscreen; microphone"
          title="Ruby AI — Arkon"
        />
      )}
    </div>
  )
}
