import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'

export function ServicesPage() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <div style={{
        width: 80, height: 80, borderRadius: 24,
        background: `linear-gradient(135deg, ${HNH.gold} 0%, #e8b82e 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 12px 30px ${HNH.gold}40`,
        marginBottom: 24,
      }}>
        <Icon name="star" size={40} color="#fff" />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: HNH.ink, margin: '0 0 8px', letterSpacing: -0.3 }}>
        Dịch vụ HNH
      </h2>
      <p style={{ fontSize: 14, color: HNH.ink2, lineHeight: 1.6, maxWidth: 280, margin: '0 0 20px' }}>
        Các dịch vụ nội bộ dành cho nhân viên HNH Travel đang trong giai đoạn phát triển.
      </p>
      <div style={{
        padding: '14px 24px', borderRadius: 14,
        background: HNH.goldSoft, border: `1px solid ${HNH.gold}40`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#a87908' }}>
          Sắp ra mắt
        </div>
        <div style={{ fontSize: 11, color: '#a87908', marginTop: 4, opacity: 0.8 }}>
          Chúng tôi đang nỗ lực để Go-Live sớm nhất
        </div>
      </div>

      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
        {[
          { icon: 'car', label: 'Đặt xe công tác', status: 'Đang phát triển' },
          { icon: 'doc', label: 'Yêu cầu văn phòng phẩm', status: 'Đang phát triển' },
          { icon: 'globe', label: 'Đặt phòng họp', status: 'Đang phát triển' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-3" style={{
            padding: '12px 16px', borderRadius: 12, background: '#fff',
            border: `1px solid ${HNH.line}`,
          }}>
            <Icon name={s.icon} size={18} color={HNH.ink3} />
            <div className="flex-1">
              <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{s.label}</div>
              <div style={{ fontSize: 10, color: HNH.ink3 }}>{s.status}</div>
            </div>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: HNH.gold }} />
          </div>
        ))}
      </div>
    </div>
  )
}
