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
            Chào mừng,<br />HNH Travel.
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
        <div style={{ fontSize: 11.5, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 16 }}>
          Đăng nhập
        </div>

        {errorMsg && (
          <div
            className="flex items-center gap-2.5"
            style={{
              background: 'rgba(192,34,43,0.08)', border: `1px solid rgba(192,34,43,0.25)`,
              borderRadius: 12, padding: '12px 14px', marginBottom: 14,
            }}
          >
            <Icon name="alert" size={16} color={HNH.red} />
            <span style={{ fontSize: 13, color: HNH.red, fontWeight: 600, lineHeight: 1.35 }}>{errorMsg}</span>
          </div>
        )}

        {/* SSO — primary action */}
        <button
          onClick={handleSSO}
          className="flex items-center justify-center gap-3 cursor-pointer border-none"
          style={{
            height: 54, borderRadius: 14,
            background: HNH.red, color: '#fff', fontWeight: 700, fontSize: 15.5,
            letterSpacing: 0.2,
            boxShadow: '0 8px 18px rgba(192,34,43,0.28)',
          }}
        >
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 22, height: 22, borderRadius: 6,
              background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 9, fontWeight: 800,
            }}
          >
            SSO
          </span>
          Đăng nhập qua HNHSSO
        </button>

        {/* Info card */}
        <div
          className="flex items-start gap-3"
          style={{ marginTop: 20, background: HNH.cream2, borderRadius: 14, padding: '14px 16px' }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(20,43,111,0.08)' }}
          >
            <Icon name="shield" size={18} color={HNH.navy} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginBottom: 3 }}>Single Sign-On</div>
            <div style={{ fontSize: 12.5, color: HNH.ink2, lineHeight: 1.5 }}>
              Bảo vệ bởi xác thực OTP qua tài khoản công ty.<br />
              Dùng email <strong style={{ color: HNH.ink }}>@hongngocha.com</strong> để đăng nhập.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="mt-auto text-center"
          style={{ fontSize: 11.5, color: HNH.ink3, paddingTop: 28, lineHeight: 1.6 }}
        >
          185-187 Lê Thánh Tôn, Phường Bến Thành, TP. HCM<br />
          <a href="https://hongngocha.com" target="_blank" rel="noopener noreferrer"
            style={{ color: HNH.navy, textDecoration: 'none', fontWeight: 600 }}>
            hongngocha.com
          </a>
        </div>
      </div>
    </div>
  )
}
