import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'

const WELCOME_KEY = 'hnh_welcome_v3'

interface Step {
  emoji: string
  title: string
  desc: string
  note?: string
  color: string
  action: string | null
  actionLabel: string | null
}

const STEPS: Step[] = [
  {
    emoji: '👋',
    title: 'Chào mừng đến HNH HRM!',
    desc: 'Hệ thống quản lý nhân sự nội bộ của Hồng Ngọc Hà Travel. Tất cả thông tin ca làm, lương, nghỉ phép đều ở đây.',
    color: HNH.navy,
    action: null,
    actionLabel: null,
  },
  {
    emoji: '📍',
    title: 'Cấp quyền Camera & Vị trí',
    desc: 'Để chấm công, ứng dụng cần:\n📸  Camera — chụp ảnh xác nhận danh tính\n📍  Vị trí GPS — xác nhận đang ở văn phòng\n\nBấm nút bên dưới, chọn Cho phép khi hệ thống hỏi.',
    note: 'Không thấy hộp thoại? Vào Cài đặt → Quyền riêng tư & Bảo mật → Camera & Dịch vụ Định vị → bật cho Safari.',
    color: HNH.red,
    action: 'permissions',
    actionLabel: 'Cấp quyền ngay',
  },
  {
    emoji: '🔔',
    title: 'Bật thông báo đẩy',
    desc: 'Nhận ngay thông báo khi đề xuất nghỉ phép được duyệt, có thông báo lương, hoặc yêu cầu phê duyệt từ nhân viên.',
    color: '#7c3aed',
    action: 'push',
    actionLabel: 'Bật thông báo',
  },
  {
    emoji: '📋',
    title: 'Hoàn thiện hồ sơ',
    desc: 'Cập nhật số điện thoại, địa chỉ, tài khoản ngân hàng và liên hệ khẩn cấp để HR xử lý hồ sơ lương đúng hạn.',
    color: '#e07b10',
    action: 'profile',
    actionLabel: 'Vào hồ sơ ngay',
  },
  {
    emoji: '✅',
    title: 'Check-in hàng ngày',
    desc: 'Mỗi sáng vào mục Chấm công để check-in. Ứng dụng dùng GPS xác nhận vị trí và Camera chụp ảnh xác danh.',
    color: HNH.success,
    action: 'attendance',
    actionLabel: 'Xem hướng dẫn chấm công',
  },
]

export function WelcomeWizard() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [pushRequested, setPushRequested] = useState(false)
  const [permStatus, setPermStatus] = useState<'idle' | 'requesting' | 'done'>('idle')

  useEffect(() => {
    if (!localStorage.getItem(WELCOME_KEY)) {
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [])

  if (!visible) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  const dismiss = (dontShowAgain = true) => {
    if (dontShowAgain) localStorage.setItem(WELCOME_KEY, '1')
    setVisible(false)
  }

  const handleAction = async () => {
    if (current.action === 'permissions') {
      setPermStatus('requesting')
      // Camera permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        stream.getTracks().forEach(t => t.stop())
      } catch {}
      // Location permission
      await new Promise<void>(resolve => {
        navigator.geolocation.getCurrentPosition(() => resolve(), () => resolve(), { timeout: 6000 })
      })
      setPermStatus('done')
      setTimeout(() => setStep(s => s + 1), 800)
      return
    }
    if (current.action === 'push') {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      setPushRequested(true)
      setStep(s => s + 1)
      return
    }
    if (current.action === 'profile') {
      dismiss()
      navigate('/profile')
      return
    }
    if (current.action === 'attendance') {
      dismiss()
      navigate('/attendance')
      return
    }
    setStep(s => s + 1)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: HNH.white, borderRadius: '20px 20px 0 0', width: '100%', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>

        {/* Close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 16px 0' }}>
          <button onClick={() => dismiss()} style={{ background: '#f0f0f0', border: 'none', borderRadius: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="x" size={12} color={HNH.ink3} stroke={2} />
          </button>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '8px 0 4px' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ width: i === step ? 20 : 8, height: 8, borderRadius: 4, background: i === step ? current.color : '#e0e0e0', transition: 'all 0.2s' }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '16px 24px 0' }}>
          <div style={{ fontSize: 44, textAlign: 'center', marginBottom: 14, lineHeight: 1 }}>{current.emoji}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: HNH.ink, textAlign: 'center', marginBottom: 10, letterSpacing: -0.3 }}>
            {current.title}
          </div>
          <div style={{ fontSize: 14, color: HNH.ink2, lineHeight: 1.65, textAlign: 'center', marginBottom: 12, whiteSpace: 'pre-line' }}>
            {current.desc}
          </div>

          {/* Permission status */}
          {current.action === 'permissions' && permStatus === 'requesting' && (
            <div style={{ background: HNH.navy50, borderRadius: 10, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: HNH.navy, textAlign: 'center', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div style={{ width: 14, height: 14, border: `2px solid ${HNH.navy}40`, borderTopColor: HNH.navy, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              Đang yêu cầu quyền...
            </div>
          )}
          {current.action === 'permissions' && permStatus === 'done' && (
            <div style={{ background: HNH.success50, borderRadius: 10, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: HNH.success, textAlign: 'center', marginBottom: 8 }}>
              ✓ Đã xử lý quyền — tiếp tục
            </div>
          )}

          {/* iOS note */}
          {current.note && permStatus === 'idle' && (
            <div style={{ background: HNH.cream2, borderRadius: 10, padding: '8px 12px', fontSize: 11.5, color: HNH.ink3, lineHeight: 1.55, textAlign: 'left', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: HNH.ink2 }}>Không thấy hộp thoại? </span>
              {current.note}
            </div>
          )}

          {/* Push status */}
          {current.action === 'push' && pushRequested && (
            <div style={{ background: HNH.success50, borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: HNH.success, textAlign: 'center', marginBottom: 12 }}>
              ✓ Đã gửi yêu cầu thông báo
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {current.actionLabel && permStatus !== 'done' && (
            <button
              onClick={handleAction}
              disabled={permStatus === 'requesting'}
              style={{ width: '100%', padding: '13px', borderRadius: 12, background: current.color, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: permStatus === 'requesting' ? 'not-allowed' : 'pointer', opacity: permStatus === 'requesting' ? 0.7 : 1 }}
            >
              {current.actionLabel}
            </button>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                style={{ flex: 1, padding: '11px', borderRadius: 12, border: `1px solid ${HNH.line}`, background: HNH.white, fontSize: 13, fontWeight: 600, color: HNH.ink2, cursor: 'pointer' }}>
                ← Quay lại
              </button>
            )}
            {!isLast ? (
              <button onClick={() => setStep(s => s + 1)}
                style={{ flex: 2, padding: '11px', borderRadius: 12, border: `1px solid ${HNH.line}`, background: HNH.white, fontSize: 13, fontWeight: 600, color: HNH.ink2, cursor: 'pointer' }}>
                Bỏ qua →
              </button>
            ) : (
              <button onClick={() => dismiss()}
                style={{ flex: 2, padding: '11px', borderRadius: 12, background: HNH.red, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Bắt đầu sử dụng 🚀
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
