import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'
import {
  ProfileData, ProfileTab,
  ProfileTabBar, ProfileTabContent,
  statusLabel, yearsFromDate,
} from '../components/employee/ProfileTabs'

export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isTablet = useTablet()
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ProfileTab>('overview')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const d = await api.get<ProfileData>(`/api/employee/${id}/profile/`)
      setData(d)
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const px = isTablet ? 28 : 16

  if (loading) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Hồ sơ nhân viên" onBack={() => navigate(-1)} />
        <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Hồ sơ nhân viên" onBack={() => navigate(-1)} />
        <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3 }}>
          <Icon name="x" size={36} color={HNH.ink4} stroke={1.5} />
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>Không tìm thấy</div>
        </div>
      </div>
    )
  }

  const p = data.personal
  const w = data.work
  const fullName = `${p.first_name} ${p.last_name}`.trim()
  const initials = `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase()
  const tenure = yearsFromDate(w.date_joining)
  const activeContract = data.contracts.find(c => c.status === 'active')

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Hồ sơ nhân viên" onBack={() => navigate(-1)} />

      <PullToRefresh onRefresh={load}>
        {/* Profile header */}
        <div
          className="relative overflow-hidden"
          style={{
            margin: `0 ${px}px`, borderRadius: 24,
            background: `linear-gradient(180deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
            padding: '22px 20px 18px', color: '#fff',
          }}
        >
          <div className="absolute" style={{
            right: -40, top: -50, width: 160, height: 160,
            borderRadius: '50%', background: HNH.red, opacity: 0.2,
          }} />

          <div className="relative flex items-center gap-3.5">
            {p.profile ? (
              <img
                src={p.profile}
                alt={fullName}
                className="rounded-full shrink-0 object-cover"
                style={{ width: 62, height: 62, border: '3px solid rgba(255,255,255,0.2)' }}
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-full shrink-0"
                style={{
                  width: 62, height: 62, background: HNH.red,
                  fontSize: 22, fontWeight: 700, border: '3px solid rgba(255,255,255,0.2)',
                }}
              >
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>{fullName}</div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                {[w.job_position, p.badge_id].filter(Boolean).join(' · ')}
              </div>
              <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 8 }}>
                {data.work_level && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: data.work_level.color + '30', color: '#fff',
                  }}>L{data.work_level.level_number} {data.work_level.name}</span>
                )}
                {w.department && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: 'rgba(192,34,43,0.3)', color: '#fff',
                  }}>{w.department}</span>
                )}
              </div>
            </div>
          </div>

          {/* Status + Codes */}
          <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: p.is_active ? 'rgba(31,138,91,0.3)' : 'rgba(192,34,43,0.4)',
              color: '#fff',
            }}>
              {p.is_active ? 'Đang làm việc' : 'Đã nghỉ'}
            </span>
            {p.stt && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>STT: {p.stt}</span>}
            {p.attendance_code && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>CC: {p.attendance_code}</span>}
            {p.employee_code && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>HRM: {p.employee_code}</span>}
            {p.accounting_code && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>KT: {p.accounting_code}</span>}
            {p.master_data_code && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>MD: {p.master_data_code}</span>}
          </div>

          {/* Mini stats */}
          <div
            className="relative flex"
            style={{ marginTop: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '12px 4px' }}
          >
            {[
              { v: tenure, l: 'thâm niên' },
              { v: `${data.attendance.this_month}`, l: 'ngày công tháng' },
              { v: activeContract ? statusLabel(activeContract.status) : 'Không HĐ', l: 'hợp đồng' },
            ].map((s, i) => (
              <div key={i} className="flex-1 text-center" style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.15)' : 'none' }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{s.v}</div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick contact + edit */}
        <div className="flex gap-2" style={{ padding: `10px ${px}px` }}>
          {p.phone && (
            <a href={`tel:${p.phone}`} className="flex items-center gap-2 flex-1 no-underline" style={{
              background: '#fff', borderRadius: 12, padding: '10px 14px',
              border: `1px solid ${HNH.line}`,
            }}>
              <Icon name="phone" size={16} color={HNH.navy} stroke={2} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: HNH.navy }}>{p.phone}</span>
            </a>
          )}
          {p.email && (
            <a href={`mailto:${p.email}`} className="flex items-center gap-2 flex-1 no-underline" style={{
              background: '#fff', borderRadius: 12, padding: '10px 14px',
              border: `1px solid ${HNH.line}`,
            }}>
              <Icon name="send" size={16} color={HNH.red} stroke={2} />
              <span className="truncate" style={{ fontSize: 12.5, fontWeight: 700, color: HNH.red }}>{p.email}</span>
            </a>
          )}
          {data.can_edit_work_info && (
            <button
              onClick={() => navigate(`/employees/${p.id}/work-info-edit`)}
              style={{
                background: HNH.navy50, border: `1px solid ${HNH.navy}`,
                borderRadius: 12, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 6,
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <Icon name="edit" size={15} color={HNH.navy} stroke={2} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: HNH.navy }}>Sửa</span>
            </button>
          )}
        </div>

        {/* Tabs */}
        <ProfileTabBar tab={tab} onTab={setTab} px={px} />

        {/* Tab content */}
        <div style={{ padding: `0 ${px}px 32px` }}>
          <ProfileTabContent
            tab={tab}
            data={data}
            canEdit={data.can_edit_work_info || !data.is_self}
          />
        </div>
      </PullToRefresh>
    </div>
  )
}
