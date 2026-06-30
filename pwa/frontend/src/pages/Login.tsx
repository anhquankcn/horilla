import { useEffect, useState } from 'react'
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

// Lỗi SSO TẠM THỜI (mất phiên / token hỏng) → tự động đăng nhập lại qua Keycloak.
// 'login_failed' (KC ok nhưng không có tài khoản Horilla) KHÔNG nằm đây vì
// re-auth không giải quyết được — phải liên hệ IT.
const RETRYABLE_ERRORS = new Set(['session_expired', 'token_failed', 'server_error'])
const RETRY_GUARD = 'hnh_sso_retry'
const SSO_LOGIN_URL = '/bff/auth/login'

export function LoginPage() {
  const { loading, authenticated } = useAuth()
  const [searchParams] = useSearchParams()
  const errorCode = searchParams.get('error')

  // Sẽ tự thử lại nếu: lỗi tạm thời + chưa thử lại lần nào (tránh lặp vô hạn).
  const willAutoRetry =
    !!errorCode && RETRYABLE_ERRORS.has(errorCode) &&
    sessionStorage.getItem(RETRY_GUARD) !== '1'

  // redirecting: đang chuyển sang Keycloak (bấm login HOẶC tự thử lại) → hiện
  // màn loading, chặn bấm tiếp.
  const [redirecting, setRedirecting] = useState(willAutoRetry)

  const goToSSO = () => {
    if (redirecting) return
    setRedirecting(true)
    window.location.href = SSO_LOGIN_URL
  }

  // #3 — tự fallback về đăng nhập KC khi gặp lỗi tạm thời (1 lần).
  useEffect(() => {
    if (!errorCode) {
      sessionStorage.removeItem(RETRY_GUARD)
      return
    }
    if (willAutoRetry) {
      sessionStorage.setItem(RETRY_GUARD, '1')
      window.location.replace(SSO_LOGIN_URL)
    } else {
      // Đã thử lại mà vẫn lỗi → reset để lần sự cố sau còn tự thử lại được,
      // và hiển thị thông báo lỗi cho user.
      sessionStorage.removeItem(RETRY_GUARD)
    }
  }, [errorCode, willAutoRetry])

  // Đăng nhập thành công → xoá cờ retry.
  useEffect(() => {
    if (authenticated) sessionStorage.removeItem(RETRY_GUARD)
  }, [authenticated])

  // Chỉ hiện thông báo lỗi khi KHÔNG đang tự chuyển hướng (tránh nháy lỗi).
  const errorMsg = errorCode && !redirecting
    ? (ERROR_MESSAGES[errorCode] ?? 'Đã có lỗi xảy ra.')
    : null

  if (loading || redirecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh]" style={{
        background: `linear-gradient(180deg, #0d1f4f 0%, ${HNH.navy} 40%, #1a3a7a 100%)`,
      }}>
        <style>{`
          @keyframes hnh-fly { 0%{transform:translateX(-60px) translateY(20px) scale(0.9);opacity:0} 30%{opacity:1} 100%{transform:translateX(60px) translateY(-20px) scale(1.1);opacity:0} }
          @keyframes hnh-fade-in { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
          @keyframes hnh-pulse-glow { 0%,100%{box-shadow:0 0 20px rgba(212,160,23,0.15)} 50%{box-shadow:0 0 40px rgba(212,160,23,0.35)} }
        `}</style>
        <div style={{
          position: 'relative', width: 220, height: 220,
          animation: 'hnh-fade-in 0.8s ease-out',
        }}>
          <img src="/hnh30.jpg" alt="30 Năm HNH Travel" style={{
            width: '100%', height: '100%', objectFit: 'contain',
            filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))',
          }} />
          <div style={{
            position: 'absolute', top: '15%', right: '-10%',
            fontSize: 24, lineHeight: 1,
            animation: 'hnh-fly 2.5s ease-in-out infinite',
          }}>
          </div>
        </div>
        <div style={{
          marginTop: 24, color: '#fff', fontSize: 18, fontWeight: 800,
          letterSpacing: -0.3, textAlign: 'center',
          animation: 'hnh-fade-in 1s ease-out 0.3s both',
        }}>
          HNH Travel
        </div>
        <div style={{
          marginTop: 6, color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600,
          letterSpacing: 0.5, textTransform: 'uppercase',
          animation: 'hnh-fade-in 1s ease-out 0.5s both',
        }}>
          Hệ thống Nhân sự
        </div>
        <div style={{
          marginTop: 28, width: 36, height: 36, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.15)', borderTopColor: HNH.gold,
          animation: 'spin 0.8s linear infinite, hnh-pulse-glow 2s ease-in-out infinite',
        }} />
        {redirecting && (
          <div style={{
            marginTop: 18, color: 'rgba(255,255,255,0.85)', fontSize: 13.5,
            fontWeight: 600, letterSpacing: 0.2,
          }}>
            Đang chuyển đến trang đăng nhập…
          </div>
        )}
      </div>
    )
  }

  if (authenticated) {
    return <Navigate to="/" replace />
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
          onClick={goToSSO}
          disabled={redirecting}
          className="flex items-center justify-center gap-3 cursor-pointer border-none"
          style={{
            height: 54, borderRadius: 14,
            background: HNH.red, color: '#fff', fontWeight: 700, fontSize: 15.5,
            letterSpacing: 0.2,
            boxShadow: '0 8px 18px rgba(192,34,43,0.28)',
            opacity: redirecting ? 0.7 : 1,
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
