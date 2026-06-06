import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'

const DEEPLINK_URL = '/deeplink/labelday/'

export function LabelDayWebViewPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      {/* TopBar */}
      <div className="flex items-center gap-3 shrink-0" style={{
        padding: '8px 16px',
        background: HNH.navy,
        borderBottom: `1px solid ${HNH.navy2}`,
      }}>
        <button
          onClick={() => navigate('/apps')}
          className="flex items-center justify-center border-none cursor-pointer shrink-0"
          style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.12)' }}
        >
          <svg width="9" height="16" viewBox="0 0 9 16">
            <path d="M7.5 1.5 1.5 8l6 6.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>📅 Gán lịch bận</div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>hrm-wds-labelday</div>
        </div>
        <button
          onClick={() => window.open('/eoffice/labelday/', '_blank')}
          className="flex items-center justify-center border-none cursor-pointer shrink-0"
          style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.12)' }}
          title="Mở tab mới"
        >
          <Icon name="globe" size={16} color="rgba(255,255,255,0.8)" stroke={1.8} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center" style={{ flex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 28, height: 28, border: `3px solid ${HNH.line}`,
              borderTopColor: HNH.navy, borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }} />
            <div style={{ fontSize: 13, color: HNH.ink3 }}>Đang tải Gán lịch bận...</div>
          </div>
        </div>
      )}

      <iframe
        src={DEEPLINK_URL}
        onLoad={() => setLoading(false)}
        style={{
          flex: 1, width: '100%', border: 'none',
          display: loading ? 'none' : 'block',
        }}
        title="Gán lịch bận"
      />
    </div>
  )
}
