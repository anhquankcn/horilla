import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useToast } from '../components/ui/Toast'
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '../lib/push'
import { api } from '../lib/api'

/* ── Helpers ── */
type PushState = 'on' | 'off' | 'denied' | 'unsupported' | 'loading'

function pushLabel(s: PushState): string {
  if (s === 'on') return 'Đã bật'
  if (s === 'denied') return 'Đã chặn (mở trong cài đặt trình duyệt)'
  if (s === 'unsupported') return 'Trình duyệt không hỗ trợ'
  if (s === 'loading') return 'Đang xử lý...'
  return 'Chưa bật — nhấn để bật'
}

function pushTone(s: PushState): 'success' | 'red' | 'warn' {
  if (s === 'on') return 'success'
  if (s === 'denied') return 'red'
  return 'warn'
}

async function estimateStorage(): Promise<string> {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate()
    const used = est.usage ?? 0
    if (used > 1_048_576) return `${(used / 1_048_576).toFixed(1)} MB`
    if (used > 1024) return `${Math.round(used / 1024)} KB`
    return `${used} B`
  }
  return '—'
}

/* ── Components ── */
function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: HNH.ink3,
      letterSpacing: 0.6, textTransform: 'uppercase',
      padding: '0 6px 6px',
    }}>
      {title}
    </div>
  )
}

function SettingCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 18,
      border: `1px solid ${HNH.line}`, overflow: 'hidden',
      marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

function SettingRow({ icon, label, detail, tone, last, onClick, trailing }: {
  icon: string
  label: string
  detail?: string
  tone?: 'ink' | 'red' | 'success' | 'warn' | 'navy'
  last?: boolean
  onClick?: () => void
  trailing?: React.ReactNode
}) {
  const t = tone ?? 'ink'
  const iconColor = t === 'red' ? HNH.red : t === 'success' ? HNH.success : t === 'warn' ? HNH.warn : t === 'navy' ? HNH.navy : HNH.ink2
  const iconBg = t === 'red' ? HNH.red50 : t === 'success' ? HNH.success50 : t === 'warn' ? HNH.warn50 : t === 'navy' ? HNH.navy50 : HNH.cream

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex items-center gap-3 w-full text-left border-none ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        padding: '12px 14px',
        borderBottom: last ? 'none' : `1px solid ${HNH.line}`,
        background: 'transparent',
      }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 32, height: 32, borderRadius: 10, background: iconBg }}
      >
        <Icon name={icon} size={15} color={iconColor} stroke={1.9} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14, fontWeight: 600, color: t === 'red' ? HNH.red : HNH.ink }}>{label}</div>
        {detail && (
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>{detail}</div>
        )}
      </div>
      {trailing}
      {onClick && !trailing && <Icon name="chev-r" size={16} color={HNH.ink4} stroke={2} />}
    </button>
  )
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); !disabled && onChange(!value) }}
      style={{
        width: 44, height: 26, borderRadius: 13, border: 'none',
        background: value ? HNH.success : HNH.ink4,
        position: 'relative', transition: 'background 0.2s',
        cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        left: value ? 21 : 3, boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

function StatusDot({ tone }: { tone: 'success' | 'red' | 'warn' }) {
  const color = tone === 'success' ? HNH.success : tone === 'red' ? HNH.red : HNH.warn
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, marginRight: 6,
    }} />
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const [pushState, setPushState] = useState<PushState>('loading')
  const [storageUsed, setStorageUsed] = useState('—')
  const [clearing, setClearing] = useState(false)
  const { toast: showToast } = useToast()
  const [swStatus, setSwStatus] = useState<'active' | 'waiting' | 'none'>('none')
  const [autoClockOut, setAutoClockOut] = useState(true)
  const [autoClockOutSaving, setAutoClockOutSaving] = useState(false)

  const loadPreferences = useCallback(async () => {
    try {
      const data = await api.get<{ pwa_auto_clock_out: boolean }>('/api/base/my-preferences/')
      setAutoClockOut(data.pwa_auto_clock_out)
    } catch { /* giữ default true */ }
  }, [])

  useEffect(() => {
    estimateStorage().then(setStorageUsed)
    if (!('Notification' in window) || !('PushManager' in window)) {
      setPushState('unsupported')
    } else if (Notification.permission === 'denied') {
      setPushState('denied')
    } else {
      isPushSubscribed().then(ok => setPushState(ok ? 'on' : 'off'))
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg?.active) setSwStatus(reg.waiting ? 'waiting' : 'active')
      })
    }
    loadPreferences()
  }, [loadPreferences])

  const togglePush = async () => {
    if (pushState === 'unsupported' || pushState === 'denied' || pushState === 'loading') return
    setPushState('loading')
    try {
      if (pushState === 'on') {
        await unsubscribeFromPush()
        setPushState('off')
        showToast('Đã tắt thông báo đẩy')
      } else {
        const ok = await subscribeToPush()
        if (ok) {
          setPushState('on')
          showToast('Thông báo đẩy đã bật')
        } else {
          setPushState(Notification.permission === 'denied' ? 'denied' : 'off')
          if (Notification.permission === 'denied') {
            showToast('Quyền thông báo bị chặn')
          }
        }
      }
    } catch {
      setPushState('off')
      showToast('Lỗi khi cài đặt thông báo đẩy')
    }
  }

  const clearCache = async () => {
    setClearing(true)
    try {
      if ('caches' in window) {
        const names = await caches.keys()
        await Promise.all(names.map(n => caches.delete(n)))
      }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) await reg.unregister()
      }
      showToast('Đã xóa bộ nhớ cache')
      setStorageUsed('0 B')
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      showToast('Lỗi khi xóa cache')
    } finally {
      setClearing(false)
    }
  }

  const checkUpdate = async () => {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        await reg.update()
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
          showToast('Đang cập nhật phiên bản mới...')
          setTimeout(() => window.location.reload(), 1000)
        } else {
          showToast('Đang dùng phiên bản mới nhất')
        }
      }
    }
  }

  const toggleAutoClockOut = async (val: boolean) => {
    setAutoClockOutSaving(true)
    try {
      await api.patch('/api/base/my-preferences/', { pwa_auto_clock_out: val })
      setAutoClockOut(val)
      showToast(val ? 'Đã bật tự động clock out' : 'Đã tắt tự động clock out')
    } catch {
      showToast('Lỗi khi lưu cài đặt')
    } finally {
      setAutoClockOutSaving(false)
    }
  }

  const handleLogout = () => {
    window.location.href = '/bff/auth/logout'
  }

  const isPWA = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Cài đặt" onBack={() => navigate(-1)} />

      <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>

        {/* Notifications */}
        <SectionTitle title="Thông báo" />
        <SettingCard>
          <SettingRow
            icon="bell"
            label="Thông báo đẩy"
            detail={pushLabel(pushState)}
            tone={pushState === 'on' ? 'success' : pushState === 'denied' ? 'red' : 'warn'}
            onClick={pushState !== 'unsupported' && pushState !== 'denied' && pushState !== 'loading' ? togglePush : undefined}
            trailing={
              <StatusDot tone={pushTone(pushState)} />
            }
            last
          />
        </SettingCard>

        {/* App */}
        <SectionTitle title="Ứng dụng" />
        <SettingCard>
          <SettingRow
            icon="star"
            label="Kiểm tra cập nhật"
            detail={swStatus === 'waiting' ? 'Có phiên bản mới' : 'Service Worker ' + (swStatus === 'active' ? 'hoạt động' : '—')}
            tone={swStatus === 'waiting' ? 'warn' : 'navy'}
            onClick={checkUpdate}
          />
          <SettingRow
            icon="x"
            label={clearing ? 'Đang xóa...' : 'Xóa bộ nhớ cache'}
            detail={`Đang dùng: ${storageUsed}`}
            onClick={!clearing ? clearCache : undefined}
          />
          <SettingRow
            icon="globe"
            label="Giao diện Desktop"
            detail="Mở Horilla HRM trên trình duyệt"
            onClick={() => { window.location.href = '/' }}
          />
          <SettingRow
            icon="clock"
            label="Tự động clock out khi hết ca"
            detail={autoClockOut
              ? 'Bật — hệ thống tự clock out sau khi hết giờ ca + grace time'
              : 'Tắt — bạn tự chủ động clock out thủ công'}
            tone={autoClockOut ? 'success' : 'warn'}
            last
            trailing={
              <Toggle
                value={autoClockOut}
                onChange={toggleAutoClockOut}
                disabled={autoClockOutSaving}
              />
            }
          />
        </SettingCard>

        {/* Info */}
        <SectionTitle title="Thông tin" />
        <SettingCard>
          <SettingRow
            icon="doc"
            label="Phiên bản"
            detail="HNH HRM PWA v1.0.0"
            trailing={
              <span style={{
                fontSize: 10, fontWeight: 700, color: HNH.navy,
                background: HNH.navy50, borderRadius: 6, padding: '3px 8px',
              }}>
                {isPWA ? 'PWA' : 'WEB'}
              </span>
            }
          />
          <SettingRow
            icon="briefcase"
            label="Công ty"
            detail="Công ty Du lịch Hồng Ngọc Hà"
          />
          <SettingRow
            icon="shield"
            label="Bảo mật"
            detail="Xác thực qua HNHSSO (Keycloak OIDC)"
            last
          />
        </SettingCard>

        {/* Account */}
        <SectionTitle title="Tài khoản" />
        <SettingCard>
          <SettingRow
            icon="logout"
            label="Đăng xuất"
            detail="Thoát tài khoản HNH HRM"
            tone="red"
            onClick={handleLogout}
            last
          />
        </SettingCard>
      </div>

    </div>
  )
}
