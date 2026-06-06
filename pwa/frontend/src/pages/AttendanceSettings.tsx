import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

interface HRMConfigData {
  geo_approval_required: boolean
  is_hr: boolean
}

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

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
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

export function AttendanceSettingsPage() {
  const navigate = useNavigate()
  const { toast: showToast } = useToast()
  const [hrmConfig, setHrmConfig] = useState<HRMConfigData | null>(null)
  const [hrmSaving, setHrmSaving] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<HRMConfigData>('/api/base/hrm-config/')
      .then(data => { setHrmConfig(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const patchHRMConfig = async (key: string, value: boolean) => {
    if (!hrmConfig) return
    setHrmSaving(key)
    try {
      await api.patch('/api/base/hrm-config/', { [key]: value })
      setHrmConfig(prev => prev ? { ...prev, [key]: value } : prev)
      showToast('Đã lưu cấu hình')
    } catch {
      showToast('Lỗi khi lưu cấu hình')
    } finally {
      setHrmSaving(null)
    }
  }

  if (loading) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Cài đặt Chấm công" onBack={() => navigate(-1)} />
        <div className="flex items-center justify-center" style={{ paddingTop: 80 }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${HNH.line}`, borderTopColor: HNH.navy, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      </div>
    )
  }

  if (!hrmConfig?.is_hr) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Cài đặt Chấm công" onBack={() => navigate(-1)} />
        <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 80, padding: '80px 32px 0' }}>
          <Icon name="shield" size={40} color={HNH.ink4} stroke={1.5} />
          <div style={{ fontSize: 14, color: HNH.ink3, fontWeight: 600, textAlign: 'center' }}>
            Bạn không có quyền truy cập trang cài đặt này
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Cài đặt Chấm công" onBack={() => navigate(-1)} />

      <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>

        <SectionTitle title="Geofence & Phê duyệt" />
        <SettingCard>
          <SettingRow
            icon="shield"
            label="Duyệt khi chấm công ngoài VP"
            detail={
              hrmConfig.geo_approval_required
                ? 'Bật — check-in ngoài VP cần quản lý duyệt'
                : 'Tắt — chấm công ngoài VP được tự động hợp lệ'
            }
            tone={hrmConfig.geo_approval_required ? 'warn' : 'success'}
            last
            trailing={
              <Toggle
                value={hrmConfig.geo_approval_required}
                onChange={v => patchHRMConfig('geo_approval_required', v)}
                disabled={hrmSaving === 'geo_approval_required'}
              />
            }
          />
        </SettingCard>

        <SectionTitle title="Thông tin" />
        <SettingCard>
          <SettingRow
            icon="info"
            label="Module"
            detail="HRM · Chấm công (hrm-att-setting)"
            last
          />
        </SettingCard>

      </div>
    </div>
  )
}
