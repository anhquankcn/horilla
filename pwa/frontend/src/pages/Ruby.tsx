import { HNH } from '../lib/theme'
import { LogoMark } from '../components/ui/Logo'
import { Icon } from '../components/ui/Icon'

export function RubyPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full" style={{ padding: '40px 24px', background: HNH.cream }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: 80, height: 80, borderRadius: 22,
          background: `linear-gradient(135deg, ${HNH.red} 0%, ${HNH.redDark} 100%)`,
          boxShadow: '0 12px 28px rgba(192,34,43,0.3)',
          marginBottom: 20,
        }}
      >
        <LogoMark size={52} />
      </div>

      <div style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: 24, fontWeight: 800, color: HNH.ink, letterSpacing: -0.5,
        textAlign: 'center',
      }}>
        Ruby AI
      </div>
      <div style={{ fontSize: 13.5, color: HNH.ink3, marginTop: 8, textAlign: 'center', lineHeight: 1.5, maxWidth: 280 }}>
        Trợ lý AI thông minh của HNH Travel — giúp bạn tra cứu thông tin, tạo báo cáo, và hỗ trợ nghiệp vụ.
      </div>

      <div
        className="flex items-center gap-3 w-full"
        style={{
          marginTop: 28, background: '#fff', borderRadius: 16,
          border: `1px solid ${HNH.line}`, padding: '14px 16px',
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 34, height: 34, borderRadius: 10, background: HNH.red50 }}
        >
          <Icon name="sparkle" size={18} color={HNH.red} stroke={1.9} />
        </div>
        <div className="flex-1" style={{ fontSize: 14, color: HNH.ink3, fontWeight: 500 }}>
          Hỏi Ruby bất cứ điều gì...
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full" style={{ marginTop: 14 }}>
        {[
          'Còn bao nhiêu ngày phép?',
          'Lương tháng này bao nhiêu?',
          'Tour sắp tới của tôi?',
          'Ai đang nghỉ hôm nay?',
        ].map((q, i) => (
          <button
            key={i}
            className="border-none cursor-pointer text-left"
            style={{
              background: '#fff', borderRadius: 12, padding: '10px 12px',
              border: `1px solid ${HNH.line}`,
              fontSize: 12, color: HNH.ink2, fontWeight: 500, lineHeight: 1.35,
            }}
          >
            {q}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 32, fontSize: 11, color: HNH.ink4, fontWeight: 500 }}>
        Powered by Ruby AI · v1.0 beta
      </div>
    </div>
  )
}
