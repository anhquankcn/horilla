import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'

/* ── Types ── */
interface ProfileData {
  personal: {
    id: number; badge_id: string | null
    first_name: string; last_name: string; email: string; phone: string
    gender: string; dob: string | null; marital_status: string
    children: number; address: string; city: string; state: string
    country: string; zip: string; qualification: string; experience: number
    profile: string | null
    emergency_contact_name: string | null
    emergency_contact_relation: string | null
    emergency_contact: string | null
  }
  work: {
    company: string | null; department: string | null; job_position: string | null
    job_role: string | null; shift: string | null; work_type: string | null
    employee_type: string | null; date_joining: string | null
    reporting_manager: string | null
  }
  work_level: {
    level_number: number; name: string; color: string; description: string | null
    bhxh_salary: number; income_min: number; income_max: number
    wfh_days_per_week: number; life_insurance_annual: number
    family_health_insurance: boolean; extra_leave_days: number
    allowance_position: boolean; allowance_housing: boolean; allowance_transport: boolean
  } | null
  contracts: {
    id: number; type: string; name: string; start_date: string
    end_date: string | null; status: string; wage: number
    probation_days?: number; trial_wage_pct?: number; base_salary?: number
  }[]
  attendance: { this_month: number; total: number }
  leave: {
    balances: { type: string; available: number; total: number; carryforward: number }[]
    pending: number; approved_this_year: number
  }
  is_self: boolean
  is_manager_of: boolean
  can_edit_work_info: boolean
  work_info_id: number | null
}

type Tab = 'overview' | 'contract' | 'leave' | 'account'

/* ── Helpers ── */
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`
}

function fmtMoney(n: number): string {
  if (n === 0) return '—'
  return new Intl.NumberFormat('vi-VN').format(n)
}

function genderLabel(g: string): string {
  if (g === 'male') return 'Nam'
  if (g === 'female') return 'Nữ'
  return g || '—'
}

function maritalLabel(m: string): string {
  if (m === 'single') return 'Độc thân'
  if (m === 'married') return 'Đã kết hôn'
  if (m === 'divorced') return 'Đã ly hôn'
  return m || '—'
}

function contractTypeLabel(t: string): string {
  if (t === 'trial') return 'HĐ Thử việc'
  if (t === 'official') return 'HĐ Chính thức'
  if (t === 'performance') return 'HĐ Hiệu suất'
  return t
}

function statusColor(s: string): { bg: string; fg: string } {
  if (s === 'active') return { bg: HNH.success50, fg: HNH.success }
  if (s === 'expired') return { bg: '#eef0f4', fg: HNH.ink3 }
  if (s === 'terminated') return { bg: HNH.red50, fg: HNH.red }
  return { bg: HNH.warn50, fg: HNH.warn }
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: 'Nháp', active: 'Hiệu lực', expired: 'Hết hạn', terminated: 'Chấm dứt',
  }
  return map[s] || s
}

function yearsFromDate(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const years = diff / (365.25 * 86400000)
  if (years < 1) {
    const months = Math.floor(years * 12)
    return months <= 0 ? '< 1 tháng' : `${months} tháng`
  }
  return `${years.toFixed(1)} năm`
}

/* ── Components ── */
function InfoRow({ icon, label, value, tone, last }: {
  icon: string; label: string; value?: string | null
  tone?: 'ink' | 'red' | 'navy' | 'gold' | 'success'; last?: boolean
}) {
  const t = tone ?? 'ink'
  const iconColor: Record<string, string> = {
    ink: HNH.ink2, red: HNH.red, navy: HNH.navy, gold: '#a87908', success: HNH.success,
  }
  const iconBg: Record<string, string> = {
    ink: HNH.cream, red: HNH.red50, navy: HNH.navy50, gold: '#faf1d6', success: HNH.success50,
  }
  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: '11px 14px',
        borderBottom: last ? 'none' : `1px solid ${HNH.line}`,
      }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 30, height: 30, borderRadius: 9, background: iconBg[t] }}
      >
        <Icon name={icon} size={14} color={iconColor[t]} stroke={1.9} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3 }}>{label}</div>
        <div style={{
          fontSize: 13.5, fontWeight: 600,
          color: t === 'red' ? HNH.red : HNH.ink,
          marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value || '—'}
        </div>
      </div>
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 18,
      border: `1px solid ${HNH.line}`, overflow: 'hidden',
      marginBottom: 14, ...style,
    }}>
      {children}
    </div>
  )
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

function StatBox({ value, label, tone }: { value: string | number; label: string; tone: string }) {
  const colors: Record<string, string> = { navy: HNH.navy, red: HNH.red, success: HNH.success, gold: '#a87908', warn: HNH.warn }
  return (
    <div className="flex-1 text-center" style={{
      background: '#fff', borderRadius: 14, padding: '12px 8px',
      border: `1px solid ${HNH.line}`,
    }}>
      <div style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: 22, fontWeight: 800, color: colors[tone] ?? HNH.ink,
      }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3, marginTop: 2 }}>{label}</div>
    </div>
  )
}

/* ── Tab: Overview ── */
function OverviewTab({ data }: { data: ProfileData }) {
  const p = data.personal
  const w = data.work
  const wl = data.work_level
  const fullAddr = [p.address, p.city, p.state, p.country, p.zip].filter(Boolean).join(', ')

  return (
    <>
      <SectionTitle title="Thông tin cá nhân" />
      <Card>
        <InfoRow icon="mail" label="Email" value={p.email} />
        <InfoRow icon="phone" label="Số điện thoại" value={p.phone} />
        <InfoRow icon="cal" label="Ngày sinh" value={fmtDate(p.dob)} />
        <InfoRow icon="users" label="Giới tính" value={genderLabel(p.gender)} />
        <InfoRow icon="star" label="Hôn nhân" value={maritalLabel(p.marital_status)} />
        {p.children > 0 && <InfoRow icon="users" label="Số con" value={String(p.children)} />}
        <InfoRow icon="globe" label="Địa chỉ" value={fullAddr || '—'} />
        <InfoRow icon="leaf" label="Trình độ" value={p.qualification} last />
      </Card>

      <SectionTitle title="Công việc" />
      <Card>
        <InfoRow icon="briefcase" label="Công ty" value={w.company} tone="navy" />
        <InfoRow icon="folder" label="Phòng ban" value={w.department} />
        <InfoRow icon="shield" label="Vị trí" value={w.job_position} />
        {w.job_role && <InfoRow icon="star" label="Vai trò" value={w.job_role} />}
        <InfoRow icon="clock" label="Ca làm việc" value={w.shift} />
        <InfoRow icon="doc" label="Hình thức" value={w.work_type} />
        <InfoRow icon="flag" label="Loại NV" value={w.employee_type} />
        <InfoRow icon="cal" label="Ngày vào làm" value={fmtDate(w.date_joining)} />
        <InfoRow icon="users" label="Quản lý" value={w.reporting_manager} last />
      </Card>

      {wl && (
        <>
          <SectionTitle title="Cấp bậc" />
          <Card>
            <div style={{ padding: '14px' }}>
              <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: wl.color + '20', border: `2px solid ${wl.color}`,
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 800, color: wl.color }}>L{wl.level_number}</span>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>{wl.name}</div>
                  {wl.description && (
                    <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>{wl.description}</div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {wl.bhxh_salary > 0 && (
                  <Benefit icon="shield" label="Lương BHXH" value={`${fmtMoney(wl.bhxh_salary)}đ`} />
                )}
                {wl.extra_leave_days > 0 && (
                  <Benefit icon="leaf" label="Phép thêm" value={`+${wl.extra_leave_days} ngày/năm`} />
                )}
                {wl.wfh_days_per_week > 0 && (
                  <Benefit icon="monitor" label="WFH" value={`${wl.wfh_days_per_week} ngày/tuần`} />
                )}
                {wl.life_insurance_annual > 0 && (
                  <Benefit icon="shield" label="BH Nhân thọ" value={`${fmtMoney(wl.life_insurance_annual)}đ/năm`} />
                )}
                {wl.allowance_position && <Benefit icon="star" label="PC Chức vụ" value="Có" />}
                {wl.allowance_housing && <Benefit icon="home" label="PC Nhà ở" value="Có" />}
                {wl.allowance_transport && <Benefit icon="pin" label="PC Di chuyển" value="Có" />}
                {wl.family_health_insurance && <Benefit icon="users" label="BHYT Gia đình" value="Có" />}
              </div>

              {(wl.income_min > 0 || wl.income_max > 0) && (
                <div style={{
                  marginTop: 10, padding: '10px 12px', borderRadius: 10,
                  background: '#faf1d6', fontSize: 12, fontWeight: 600, color: '#a87908',
                }}>
                  Thu nhập năm: {fmtMoney(wl.income_min)}đ — {fmtMoney(wl.income_max)}đ
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {p.emergency_contact_name && (
        <>
          <SectionTitle title="Liên hệ khẩn cấp" />
          <Card>
            <InfoRow icon="users" label="Người liên hệ" value={p.emergency_contact_name} />
            <InfoRow icon="star" label="Mối quan hệ" value={p.emergency_contact_relation} />
            <InfoRow icon="phone" label="Số điện thoại" value={p.emergency_contact} last />
          </Card>
        </>
      )}
    </>
  )
}

function Benefit({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2" style={{
      padding: '8px 10px', borderRadius: 10, background: HNH.cream,
    }}>
      <Icon name={icon} size={13} color={HNH.ink3} stroke={1.8} />
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3 }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink }}>{value}</div>
      </div>
    </div>
  )
}

/* ── Tab: Contract ── */
function ContractTab({ data }: { data: ProfileData }) {
  if (data.contracts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3 }}>
        <Icon name="doc" size={36} color={HNH.ink4} stroke={1.5} />
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>Chưa có hợp đồng</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {data.contracts.map(c => {
        const sc = statusColor(c.status)
        const isActive = c.status === 'active'
        return (
          <Card key={`${c.type}-${c.id}`} style={{
            borderColor: isActive ? HNH.success + '50' : HNH.line,
            borderWidth: isActive ? 2 : 1,
          }}>
            <div style={{ padding: '14px 16px' }}>
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{c.name}</div>
                  <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      background: HNH.navy50, color: HNH.navy,
                    }}>{contractTypeLabel(c.type)}</span>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      background: sc.bg, color: sc.fg,
                    }}>{statusLabel(c.status)}</span>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="flex items-center gap-3" style={{ marginTop: 10, fontSize: 12, color: HNH.ink3 }}>
                <span className="flex items-center gap-1">
                  <Icon name="cal" size={12} color={HNH.ink3} stroke={2} />
                  {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                </span>
              </div>

              {/* Salary info */}
              <div className="flex gap-2" style={{ marginTop: 10 }}>
                <div className="flex-1" style={{
                  padding: '10px 12px', borderRadius: 10, background: HNH.cream,
                }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3 }}>Lương cơ bản</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: HNH.ink }}>{fmtMoney(c.wage)}đ</div>
                </div>
                {c.base_salary != null && c.base_salary > 0 && (
                  <div className="flex-1" style={{
                    padding: '10px 12px', borderRadius: 10, background: '#faf1d6',
                  }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#a87908' }}>Lương hiệu suất</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#a87908' }}>{fmtMoney(c.base_salary)}đ</div>
                  </div>
                )}
              </div>

              {/* Extra info for trial */}
              {c.type === 'trial' && c.probation_days != null && (
                <div className="flex gap-2" style={{ marginTop: 6 }}>
                  <div className="flex-1" style={{
                    padding: '8px 12px', borderRadius: 10, background: HNH.warn50,
                  }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.warn }}>Thời gian thử việc</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: HNH.warn }}>{c.probation_days} ngày</div>
                  </div>
                  {c.trial_wage_pct != null && (
                    <div className="flex-1" style={{
                      padding: '8px 12px', borderRadius: 10, background: HNH.navy50,
                    }}>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.navy }}>% lương thử việc</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: HNH.navy }}>{c.trial_wage_pct}%</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* ── Tab: Leave ── */
function LeaveTab({ data }: { data: ProfileData }) {
  const l = data.leave
  return (
    <>
      <div className="flex gap-2" style={{ marginBottom: 14 }}>
        <StatBox value={l.pending} label="Chờ duyệt" tone="warn" />
        <StatBox value={l.approved_this_year} label="Đã duyệt năm nay" tone="success" />
        <StatBox value={data.attendance.this_month} label="Ngày công tháng" tone="navy" />
      </div>

      {l.balances.length > 0 ? (
        <>
          <SectionTitle title="Số dư phép" />
          <Card>
            {l.balances.map((b, i) => {
              const pct = b.total > 0 ? (b.available / b.total) * 100 : 0
              return (
                <div
                  key={i}
                  style={{
                    padding: '12px 14px',
                    borderBottom: i < l.balances.length - 1 ? `1px solid ${HNH.line}` : 'none',
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{b.type}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: HNH.success }}>
                      {b.available}<span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600 }}>/{b.total}</span>
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: HNH.cream2 }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${Math.min(pct, 100)}%`,
                      background: pct > 50 ? HNH.success : pct > 20 ? HNH.warn : HNH.red,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  {b.carryforward > 0 && (
                    <div style={{ fontSize: 10.5, color: HNH.ink3, marginTop: 4 }}>
                      Chuyển tiếp: {b.carryforward} ngày
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3 }}>
          <Icon name="leaf" size={36} color={HNH.ink4} stroke={1.5} />
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>Chưa có dữ liệu phép</div>
        </div>
      )}
    </>
  )
}

/* ── Tab: AppAccount ── */
interface KcRole { id: string; name: string; description?: string }
interface KcGroup { id: string; name: string }
interface KcOptions { roles: KcRole[]; groups: KcGroup[] }
interface KcAccount {
  exists: boolean; kc_id: string | null; username: string | null
  enabled?: boolean; roles: string[]; groups: string[]
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: ok ? HNH.success : HNH.ink3 }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: ok ? HNH.success50 : HNH.cream2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {ok
          ? <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke={HNH.success} strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
          : <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill={HNH.ink4}/></svg>
        }
      </div>
      {label}
    </div>
  )
}

function AppAccountTab({ employeeId, employeeEmail, can_edit }: {
  employeeId: number; employeeEmail: string; can_edit: boolean
}) {
  const [account, setAccount] = useState<KcAccount | null>(null)
  const [options, setOptions] = useState<KcOptions | null>(null)
  const [selRoles, setSelRoles] = useState<string[]>([])
  const [selGroups, setSelGroups] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!employeeEmail) { setLoading(false); return }
    Promise.all([
      api.get<KcAccount>(`/api/employee/${employeeId}/kc-account/`),
      api.get<KcOptions>('/api/employee/kc-options/'),
    ]).then(([acc, opts]) => {
      setAccount(acc)
      setOptions(opts)
      // Pre-select "no-otp" group by default for new accounts
      if (!acc.exists) {
        const noOtp = opts.groups.find(g => g.name === 'no-otp')
        if (noOtp) setSelGroups([noOtp.id])
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [employeeId, employeeEmail])

  const toggleRole = (id: string) =>
    setSelRoles(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id])
  const toggleGroup = (id: string) =>
    setSelGroups(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])

  const handleCreate = async () => {
    setBusy(true); setErr(''); setSent(false)
    try {
      await api.post(`/api/employee/${employeeId}/kc-account/`, { roles: selRoles, groups: selGroups })
      setSent(true)
      const acc = await api.get<KcAccount>(`/api/employee/${employeeId}/kc-account/`)
      setAccount(acc)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally { setBusy(false) }
  }

  if (!can_edit) return (
    <div style={{ textAlign: 'center', padding: 48, color: HNH.ink3 }}>
      <Icon name="shield" size={32} color={HNH.ink4} stroke={1.5} />
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>Không có quyền truy cập</div>
    </div>
  )

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 48, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
  )

  if (!employeeEmail) return (
    <div style={{ textAlign: 'center', padding: 48 }}>
      <Icon name="mail" size={32} color={HNH.warn} stroke={1.5} />
      <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginTop: 10 }}>Nhân viên chưa có email</div>
      <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 4 }}>Thêm email trước khi tạo tài khoản</div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Status card */}
      <Card>
        <div style={{ padding: '14px 16px' }}>
          <div className="flex items-center gap-3">
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: account?.exists ? HNH.success50 : HNH.red50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={account?.exists ? 'check' : 'x'} size={18}
                color={account?.exists ? HNH.success : HNH.red} stroke={2.5} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>
                {account?.exists ? 'Tài khoản SSO đã tồn tại' : 'Chưa có tài khoản SSO'}
              </div>
              <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>
                {account?.exists ? `Username: ${account.username}` : employeeEmail}
              </div>
            </div>
          </div>
          {account?.exists && (
            <div className="flex flex-col gap-1.5" style={{ marginTop: 12 }}>
              <CheckItem ok={account.enabled !== false} label="Tài khoản đang hoạt động" />
              <CheckItem ok={account.roles.length > 0} label={`Vai trò: ${account.roles.filter(r => r !== 'default-roles-hnh').join(', ') || 'Chưa gán'}`} />
              <CheckItem ok={account.groups.length > 0} label={`Nhóm: ${account.groups.join(', ') || 'Chưa gán'}`} />
            </div>
          )}
        </div>
      </Card>

      {sent && (
        <div style={{
          background: HNH.success50, border: `1px solid ${HNH.success}`,
          borderRadius: 14, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="check" size={18} color={HNH.success} stroke={2.5} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.success }}>Tạo tài khoản thành công!</div>
            <div style={{ fontSize: 12, color: HNH.success, opacity: 0.8, marginTop: 2 }}>
              Email thông báo đã gửi tới {employeeEmail} (CC: coo@hongngocha.com)
            </div>
          </div>
        </div>
      )}

      {err && (
        <div style={{
          background: HNH.red50, border: `1px solid ${HNH.red}`,
          borderRadius: 14, padding: '12px 16px', fontSize: 13, color: HNH.red,
        }}>
          {err}
        </div>
      )}

      {/* Create form — only show if account doesn't exist yet */}
      {!account?.exists && options && (
        <>
          {/* Role picker */}
          <SectionTitle title={`Vai trò Keycloak (${selRoles.length} đã chọn)`} />
          <Card>
            {options.roles.filter(r => !r.name.startsWith('default-roles')).map((r, i, arr) => (
              <button
                key={r.id}
                onClick={() => toggleRole(r.id)}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{
                  padding: '11px 14px', background: 'transparent',
                  borderBottom: i < arr.length - 1 ? `1px solid ${HNH.line}` : 'none',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 6, border: `2px solid`,
                  borderColor: selRoles.includes(r.id) ? HNH.navy : HNH.ink4,
                  background: selRoles.includes(r.id) ? HNH.navy : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {selRoles.includes(r.id) && (
                    <svg width="10" height="10" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink }}>{r.name}</div>
                  {r.description && <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>{r.description}</div>}
                </div>
              </button>
            ))}
          </Card>

          {/* Group picker */}
          <SectionTitle title={`Nhóm quyền HRM (${selGroups.length} đã chọn)`} />
          <Card>
            {options.groups.map((g, i) => (
              <button
                key={g.id}
                onClick={() => toggleGroup(g.id)}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{
                  padding: '11px 14px', background: 'transparent',
                  borderBottom: i < options.groups.length - 1 ? `1px solid ${HNH.line}` : 'none',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 6, border: `2px solid`,
                  borderColor: selGroups.includes(g.id) ? HNH.red : HNH.ink4,
                  background: selGroups.includes(g.id) ? HNH.red : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {selGroups.includes(g.id) && (
                    <svg width="10" height="10" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
                    </svg>
                  )}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink }}>{g.name}</div>
              </button>
            ))}
          </Card>

          {/* Summary before confirm */}
          <div style={{
            background: HNH.navy50, borderRadius: 14, padding: '12px 16px',
            border: `1px solid ${HNH.navy}30`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: HNH.navy, marginBottom: 6 }}>Xác nhận tạo tài khoản</div>
            <div style={{ fontSize: 12, color: HNH.ink3, lineHeight: 1.7 }}>
              • Username: <strong style={{ color: HNH.ink }}>{employeeEmail}</strong><br />
              • Mật khẩu mặc định: <strong style={{ color: HNH.ink }}>Hnh@1234</strong><br />
              • Email thông báo gửi tới user, CC: <strong style={{ color: HNH.ink }}>coo@hongngocha.com</strong>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={busy}
            style={{
              background: busy ? HNH.ink4 : HNH.navy,
              color: '#fff', border: 'none', borderRadius: 14,
              padding: '14px', fontSize: 14, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {busy ? (
              <><div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Đang tạo...</>
            ) : (
              <><Icon name="send" size={16} color="#fff" stroke={2} /> Tạo tài khoản & Gửi email</>
            )}
          </button>
        </>
      )}
    </div>
  )
}

/* ── Main Page ── */
export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isTablet = useTablet()
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')

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

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Tổng quan', icon: 'users' },
    { id: 'contract', label: 'Hợp đồng', icon: 'doc' },
    { id: 'leave', label: 'Phép & Công', icon: 'leaf' },
    { id: 'account', label: 'Tài khoản', icon: 'shield' },
  ]

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

          {/* Mini stats */}
          <div
            className="relative flex"
            style={{ marginTop: 16, background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '12px 4px' }}
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
        <div className="flex" style={{ padding: `0 ${px}px 8px` }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
              style={{
                padding: '10px 0', background: 'transparent',
                borderBottom: tab === t.id ? `2.5px solid ${HNH.navy}` : '2.5px solid transparent',
                fontSize: 12.5, fontWeight: tab === t.id ? 700 : 600,
                color: tab === t.id ? HNH.navy : HNH.ink3,
              }}
            >
              <Icon name={t.icon} size={14} color={tab === t.id ? HNH.navy : HNH.ink3} stroke={2} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: `0 ${px}px 32px` }}>
          {tab === 'overview' && <OverviewTab data={data} />}
          {tab === 'contract' && <ContractTab data={data} />}
          {tab === 'leave' && <LeaveTab data={data} />}
          {tab === 'account' && (
            <AppAccountTab
              employeeId={p.id}
              employeeEmail={p.email}
              can_edit={data.can_edit_work_info || !data.is_self}
            />
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
