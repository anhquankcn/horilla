import { useState } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { LogoMark } from '../components/ui/Logo'

const ARKON_URL = 'https://arkon.hnhtravel.work'

export function RubyPage() {
  const [loading, setLoading] = useState(true)

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      {/* Mini header */}
      <div className="flex items-center gap-3 shrink-0" style={{
        padding: '8px 16px',
        background: `linear-gradient(135deg, #1a1530 0%, ${HNH.navy} 100%)`,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `linear-gradient(135deg, ${HNH.red} 0%, ${HNH.redDark} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <LogoMark size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: -0.2 }}>Ruby AI</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>arkon.hnhtravel.work</div>
        </div>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.gold, flexShrink: 0 }} />
        <button
          onClick={() => window.open(ARKON_URL, '_blank')}
          className="flex items-center justify-center border-none cursor-pointer shrink-0"
          style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.12)' }}
          title="Mở trong trình duyệt"
        >
          <Icon name="globe" size={15} color="rgba(255,255,255,0.7)" stroke={1.8} />
        </button>
      </div>

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
