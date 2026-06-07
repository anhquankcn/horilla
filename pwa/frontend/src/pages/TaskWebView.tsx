import { useState } from 'react'
import { HNH } from '../lib/theme'

const DEEPLINK_URL = '/deeplink/tasks/'

export function TaskWebViewPage() {
  const [loading, setLoading] = useState(true)

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      {loading && (
        <div className="flex items-center justify-center" style={{ flex: 1, padding: 40 }}>
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
