import { useState, useEffect, useRef } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [frameH, setFrameH] = useState(0)

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setFrameH(rect.height)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    const t = setTimeout(measure, 100)
    return () => { window.removeEventListener('resize', measure); clearTimeout(t) }
  }, [])

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
    <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
      {(loading || !iframeUrl) && !error && (
        <div className="flex flex-col items-center justify-center" style={{ height: '100%', gap: 16, padding: 40 }}>
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
        <div className="flex flex-col items-center justify-center" style={{ height: '100%', gap: 16, padding: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: HNH.red50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="alert" size={30} color={HNH.red} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink, marginBottom: 6 }}>
              Chưa kết nối được {title}
            </div>
            <div style={{ fontSize: 13, color: HNH.ink3, lineHeight: 1.5 }}>
              Hệ thống đang bảo trì hoặc tạm gián đoạn.
              <br />Vui lòng thử lại sau ít phút.
            </div>
          </div>
          <button
            onClick={() => { setError(null); setLoading(true); window.location.reload() }}
            style={{
              padding: '12px 32px', borderRadius: 12, border: 'none',
              background: color, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: `0 4px 12px ${color}30`,
            }}
          >
            Thử lại
          </button>
          <div style={{ fontSize: 11, color: HNH.ink4, marginTop: 4 }}>
            Nếu lỗi kéo dài, liên hệ bộ phận CNTT
          </div>
        </div>
      )}

      {iframeUrl && (
        <iframe
          src={iframeUrl}
          onLoad={() => setLoading(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: frameH > 0 ? frameH : '100%',
            border: 'none',
            display: loading ? 'none' : 'block',
          }}
          allow="clipboard-write; fullscreen; microphone"
          title={title}
        />
      )}
    </div>
  )
}
