import { Navigate, useSearchParams } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { LogoMark } from '../components/ui/Logo'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../lib/auth'

const ERROR_MESSAGES: Record<string, string> = {
  session_expired: 'Phiên đăng nhập hết hạn, vui lòng thử lại.',
  token_failed: 'Xác thực SSO thất bại, vui lòng thử lại.',
  login_failed: 'Không thể đăng nhập, liên hệ IT nếu lỗi tiếp tục.',
  server_error: 'Lỗi hệ thống, vui lòng thử lại sau.',
}

export function LoginPage() {
  const { loading, authenticated } = useAuth()
  const [searchParams] = useSearchParams()
  const errorCode = searchParams.get('error')
  const errorMsg = errorCode ? (ERROR_MESSAGES[errorCode] ?? 'Đã có lỗi xảy ra.') : null

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh]">
        <div className="animate-pulse" style={{ fontSize: 14, color: '#999' }}>Đang tải...</div>
      </div>
    )
  }

  if (authenticated) {
    return <Navigate to="/" replace />
  }

  const handleSSO = () => {
    window.location.href = '/bff/auth/login'
  }

  return (
    <div className="flex flex-col min-h-[100dvh]" style={{ background: '#fff' }}>
      {/* Hero band */}
      <div
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${HNH.navy} 0%, #0d1f4f 100%)`,
          padding: '60px 28px 48px',
        }}
      >
        <div
          className="absolute"
          style={{
            right: -80, top: -60, width: 260, height: 260,
            borderRadius: '50%', background: HNH.red, opacity: 0.18,
          }}
        />
        <div
          className="absolute"
          style={{
            left: -40, bottom: -30, width: 200, height: 60,
            borderRadius: '50%', background: HNH.gold, opacity: 0.15, filter: 'blur(8px)',
          }}
        />

        <div className="relative">
          <LogoMark size={68} />
          <div
            style={{
              marginTop: 22, color: '#fff',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 28, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.1,
            }}
          >
            Chào buổi sáng,<br />HNH Travel.
          </div>
          <div
            style={{
              marginTop: 10, color: 'rgba(255,255,255,0.75)',
              fontSize: 13.5, lineHeight: 1.5, maxWidth: 280,
            }}
          >
            Hệ thống nhân sự nội bộ — hướng đến những hành trình quý giá.
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col flex-1" style={{ padding: '28px 24px 24px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
          Tài khoản
        </div>

        {errorMsg && (
          <div
            className="flex items-center gap-2.5"
            style={{
              background: 'rgba(192,34,43,0.08)', border: `1px solid rgba(192,34,43,0.25)`,
              borderRadius: 12, padding: '12px 14px', marginBottom: 12,
            }}
          >
            <Icon name="alert" size={16} color={HNH.red} />
            <span style={{ fontSize: 13, color: HNH.red, fontWeight: 600, lineHeight: 1.35 }}>{errorMsg}</span>
          </div>
        )}

        <div
          className="flex items-center gap-3"
          style={{ background: HNH.cream2, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}
        >
          <Icon name="globe" size={18} color={HNH.ink3} />
          <div className="flex-1">
            <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600 }}>Email công ty</div>
            <div style={{ fontSize: 15, color: HNH.ink, fontWeight: 500 }}>ten.ban@hongngocha.com</div>
          </div>
        </div>

        <div
          className="flex items-center gap-3"
          style={{ background: HNH.cream2, borderRadius: 14, padding: '14px 16px' }}
        >
          <Icon name="shield" size={18} color={HNH.ink3} />
          <div className="flex-1">
            <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600 }}>Mật khẩu</div>
            <div style={{ fontSize: 15, color: HNH.ink, letterSpacing: 4 }}>••••••••</div>
          </div>
          <span style={{ fontSize: 12.5, color: HNH.red, fontWeight: 600 }}>Quên?</span>
        </div>

        <button
          className="border-none cursor-pointer"
          style={{
            marginTop: 22, height: 52, borderRadius: 14,
            background: HNH.red, color: '#fff', fontWeight: 700, fontSize: 15.5,
            letterSpacing: 0.2,
            boxShadow: '0 8px 18px rgba(192,34,43,0.28)',
          }}
        >
          Đăng nhập
        </button>

        <div
          className="flex items-center gap-2.5"
          style={{ margin: '18px 0', color: HNH.ink3, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.4 }}
        >
          <div className="flex-1" style={{ height: 1, background: HNH.line }} />
          HOẶC
          <div className="flex-1" style={{ height: 1, background: HNH.line }} />
        </div>

        <button
          onClick={handleSSO}
          className="flex items-center justify-center gap-2.5 cursor-pointer"
          style={{
            height: 50, borderRadius: 14, border: `1.5px solid ${HNH.navy}`,
            background: '#fff', color: HNH.navy, fontWeight: 700, fontSize: 14.5,
          }}
        >
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: HNH.navy, color: '#fff', fontSize: 10, fontWeight: 800,
            }}
          >
            SSO
          </span>
          Đăng nhập qua HNHSSO
        </button>

        <div
          className="mt-auto text-center"
          style={{ fontSize: 11.5, color: HNH.ink3, paddingTop: 24 }}
        >
          v2.4.1 · 185-187 Lê Thánh Tôn, P. Bến Thành, TP.HCM
        </div>
      </div>
    </div>
  )
}
