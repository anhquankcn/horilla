import { useSwUpdate } from '../lib/swUpdate'
import { HNH } from '../lib/theme'
import { Icon } from './ui/Icon'

// Banner tự động khi có phiên bản app mới (SW mới đang chờ). Việc đăng ký SW +
// kiểm tra định kỳ/khi mở app do SwUpdateProvider (lib/swUpdate) đảm nhiệm.
export function UpdatePrompt() {
  const { needRefresh, setNeedRefresh, updateNow } = useSwUpdate()

  if (!needRefresh) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', left: 12, right: 12, zIndex: 10001,
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        background: HNH.navy, color: '#fff', borderRadius: 16,
        boxShadow: '0 10px 30px rgba(15,20,40,0.35)',
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
        maxWidth: 560, margin: '0 auto',
      }}
    >
      <div className="flex items-center justify-center shrink-0"
        style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.16)' }}>
        <Icon name="download" size={18} color="#fff" stroke={2.2} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>Đã có phiên bản mới</div>
        <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 1 }}>Cập nhật để dùng tính năng & sửa lỗi mới nhất.</div>
      </div>
      <button
        onClick={() => setNeedRefresh(false)}
        className="border-none cursor-pointer shrink-0"
        style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 12.5, fontWeight: 700, padding: '6px 8px' }}
      >
        Để sau
      </button>
      <button
        onClick={() => updateNow()}
        className="border-none cursor-pointer shrink-0"
        style={{ background: '#fff', color: HNH.navy, fontSize: 13, fontWeight: 800, borderRadius: 10, padding: '9px 14px' }}
      >
        Cập nhật ngay
      </button>
    </div>
  )
}
