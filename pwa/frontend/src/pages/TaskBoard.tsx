import { useState } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'

const TASK_URL = 'https://task.hnhtravel.work'

export function TaskBoardPage() {
  const [loading, setLoading] = useState(true)

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      {/* Mini header */}
      <div className="flex items-center gap-3 shrink-0" style={{
        padding: '8px 16px',
        background: HNH.navy,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="check" size={14} color="#fff" stroke={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: -0.2 }}>Công việc</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>task.hnhtravel.work</div>
        </div>
        <button
          onClick={() => window.open(TASK_URL, '_blank')}
          className="flex items-center justify-center border-none cursor-pointer shrink-0"
          style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.15)' }}
          title="Mở trong trình duyệt"
        >
          <Icon name="globe" size={15} color="rgba(255,255,255,0.8)" stroke={1.8} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center" style={{ padding: 48, flex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 32, height: 32, border: `3px solid ${HNH.line}`,
              borderTopColor: HNH.navy, borderRadius: '50%',
              margin: '0 auto 12px', animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 13, color: HNH.ink3 }}>Đang kết nối...</div>
          </div>
        </div>
      )}

      <iframe
        src={TASK_URL}
        onLoad={() => setLoading(false)}
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
          display: loading ? 'none' : 'block',
        }}
        allow="clipboard-write; fullscreen"
        title="HNH Task Board"
      />
    </div>
  )
}
