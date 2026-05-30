import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'

const DEEPLINK_URL = '/deeplink/tasks/'

export function TaskWebViewPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      <div className="flex items-center gap-3 shrink-0" style={{
        padding: '8px 16px',
        background: '#fff',
        borderBottom: `1px solid ${HNH.line}`,
      }}>
        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center justify-center border-none cursor-pointer shrink-0"
          style={{ width: 34, height: 34, borderRadius: 10, background: HNH.cream }}
        >
          <svg width="9" height="16" viewBox="0 0 9 16">
            <path d="M7.5 1.5 1.5 8l6 6.5" stroke={HNH.ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>1StopShop</div>
          <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500 }}>task.hnhtravel.work</div>
        </div>
        <button
          onClick={() => window.open('https://task.hnhtravel.work', '_blank')}
          className="flex items-center justify-center border-none cursor-pointer shrink-0"
          style={{ width: 34, height: 34, borderRadius: 10, background: HNH.cream }}
          title="Mở trong trình duyệt"
        >
          <Icon name="globe" size={16} color={HNH.ink3} stroke={1.8} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center" style={{ padding: 40 }}>
          <div style={{ textAlign: 'center' }}>
            <div className="animate-spin" style={{
              width: 28, height: 28, border: `3px solid ${HNH.line}`,
              borderTopColor: HNH.navy, borderRadius: '50%', margin: '0 auto 12px',
            }} />
            <div style={{ fontSize: 13, color: HNH.ink3 }}>Đang kết nối 1StopShop...</div>
          </div>
        </div>
      )}

      <iframe
        src={DEEPLINK_URL}
        onLoad={() => setLoading(false)}
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
          display: loading ? 'none' : 'block',
        }}
        allow="clipboard-write"
        title="1StopShop Task System"
      />
    </div>
  )
}
