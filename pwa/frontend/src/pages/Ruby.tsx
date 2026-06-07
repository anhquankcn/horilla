import { useState } from 'react'
import { HNH } from '../lib/theme'
import { LogoMark } from '../components/ui/Logo'

const ARKON_URL = 'https://arkon.hnhtravel.work'

export function RubyPage() {
  const [loading, setLoading] = useState(true)

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      {loading && (
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

      <iframe
        src={ARKON_URL}
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
    </div>
  )
}
