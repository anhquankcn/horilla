/**
 * Shared profile tab components used by EmployeeProfile page
 * and the Employees directory DetailModal.
 */
import { useState, useEffect } from 'react'
import { HNH } from '../../lib/theme'
import { Icon } from '../ui/Icon'
import { api } from '../../lib/api'

/* ── Types ── */
export interface ProfileData {
  personal: {
    id: number; badge_id: string | null
    stt: number | null; attendance_code: string | null
    employee_code: string | null; accounting_code: string | null
    master_data_code: string | null; is_active: boolean
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

export type ProfileTab = 'overview' | 'contract' | 'leave' | 'account'

/* ── Helpers ── */
export function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`
}

export function fmtMoney(n: number): string {
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

export function statusColor(s: string): { bg: string; fg: string } {
  if (s === 'active') return { bg: HNH.success50, fg: HNH.success }
  if (s === 'expired') return { bg: '#eef0f4', fg: HNH.ink3 }
  if (s === 'terminated') return { bg: HNH.red50, fg: HNH.red }
  return { bg: HNH.warn50, fg: HNH.warn }
}

export function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: 'Nháp', active: 'Hiệu lực', expired: 'Hết hạn', terminated: 'Chấm dứt',
  }
  return map[s] || s
}

export function yearsFromDate(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const years = diff / (365.25 * 86400000)
  if (years < 1) {
    const months = Math.floor(years * 12)
    return months <= 0 ? '< 1 tháng' : `${months} tháng`
  }
  return `${years.toFixed(1)} năm`
}

/* ── Sub-components ── */
export function ProfileInfoRow({ icon, label, value, tone, last }: {
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
      style={{ padding: '11px 14px', borderBottom: last ? 'none' : `1px solid ${HNH.line}` }}
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

export function ProfileCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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

export function ProfileSectionTitle({ title }: { title: string }) {
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

function ProfileStatBox({ value, label, tone }: { value: string | number; label: string; tone: string }) {
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

function Benefit({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2" style={{ padding: '8px 10px', borderRadius: 10, background: HNH.cream }}>
      <Icon name={icon} size={13} color={HNH.ink3} stroke={1.8} />
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3 }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink }}>{value}</div>
      </div>
    </div>
  )
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

function PasswordResetInfo({ sentAt, sentBy }: { sentAt: string | null; sentBy: string | null }) {
  if (!sentAt) return (
    <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: HNH.ink3 }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: HNH.cream2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill={HNH.ink4}/></svg>
      </div>
      Chưa từng gửi đặt lại mật khẩu
    </div>
  )
  const d = new Date(sentAt)
  const label = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: HNH.ink2 }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: HNH.navy50,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={HNH.navy} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
        </svg>
      </div>
      <span>Gửi reset mật khẩu: <b>{label}</b>{sentBy ? ` (${sentBy})` : ''}</span>
    </div>
  )
}

/* ── Tab: Overview ── */
export function OverviewTab({ data }: { data: ProfileData }) {
  const p = data.personal
  const w = data.work
  const wl = data.work_level
  const fullAddr = [p.address, p.city, p.state, p.country, p.zip].filter(Boolean).join(', ')

  return (
    <>
      <ProfileSectionTitle title="Thông tin cá nhân" />
      <ProfileCard>
        <ProfileInfoRow icon="mail" label="Email" value={p.email} />
        <ProfileInfoRow icon="phone" label="Số điện thoại" value={p.phone} />
        <ProfileInfoRow icon="cal" label="Ngày sinh" value={fmtDate(p.dob)} />
        <ProfileInfoRow icon="users" label="Giới tính" value={genderLabel(p.gender)} />
        <ProfileInfoRow icon="star" label="Hôn nhân" value={maritalLabel(p.marital_status)} />
        {p.children > 0 && <ProfileInfoRow icon="users" label="Số con" value={String(p.children)} />}
        <ProfileInfoRow icon="globe" label="Địa chỉ" value={fullAddr || '—'} />
        <ProfileInfoRow icon="leaf" label="Trình độ" value={p.qualification} last />
      </ProfileCard>

      <ProfileSectionTitle title="Công việc" />
      <ProfileCard>
        <ProfileInfoRow icon="briefcase" label="Công ty" value={w.company} tone="navy" />
        <ProfileInfoRow icon="folder" label="Phòng ban" value={w.department} />
        <ProfileInfoRow icon="shield" label="Vị trí" value={w.job_position} />
        {w.job_role && <ProfileInfoRow icon="star" label="Vai trò" value={w.job_role} />}
        <ProfileInfoRow icon="clock" label="Ca làm việc" value={w.shift} />
        <ProfileInfoRow icon="doc" label="Hình thức" value={w.work_type} />
        <ProfileInfoRow icon="flag" label="Loại NV" value={w.employee_type} />
        <ProfileInfoRow icon="cal" label="Ngày vào làm" value={fmtDate(w.date_joining)} />
        <ProfileInfoRow icon="users" label="Quản lý" value={w.reporting_manager} last />
      </ProfileCard>

      {(p.badge_id || p.employee_code || p.master_data_code || p.accounting_code || p.attendance_code) && (
        <>
          <ProfileSectionTitle title="Mã hệ thống" />
          <ProfileCard>
            {p.badge_id && <ProfileInfoRow icon="shield" label="Mã HRM" value={p.badge_id} />}
            {p.master_data_code && <ProfileInfoRow icon="clock" label="Mã Chấm Công (MasterData)" value={p.master_data_code} />}
            {p.accounting_code && <ProfileInfoRow icon="doc" label="Mã Kế toán" value={p.accounting_code} />}
            {p.employee_code && <ProfileInfoRow icon="briefcase" label="Mã Nhân viên HRM" value={p.employee_code} />}
            {p.attendance_code && <ProfileInfoRow icon="doc" label="Mã công" value={p.attendance_code} />}
            {p.stt != null && <ProfileInfoRow icon="flag" label="STT" value={String(p.stt)} last />}
          </ProfileCard>
        </>
      )}

      {wl && (
        <>
          <ProfileSectionTitle title="Cấp bậc" />
          <ProfileCard>
            <div style={{ padding: '14px' }}>
              <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <div className="flex items-center justify-center" style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: wl.color + '20', border: `2px solid ${wl.color}`,
                }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: wl.color }}>L{wl.level_number}</span>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>{wl.name}</div>
                  {wl.description && <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>{wl.description}</div>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {wl.bhxh_salary > 0 && <Benefit icon="shield" label="Lương BHXH" value={`${fmtMoney(wl.bhxh_salary)}đ`} />}
                {wl.extra_leave_days > 0 && <Benefit icon="leaf" label="Phép thêm" value={`+${wl.extra_leave_days} ngày/năm`} />}
                {wl.wfh_days_per_week > 0 && <Benefit icon="monitor" label="WFH" value={`${wl.wfh_days_per_week} ngày/tuần`} />}
                {wl.life_insurance_annual > 0 && <Benefit icon="shield" label="BH Nhân thọ" value={`${fmtMoney(wl.life_insurance_annual)}đ/năm`} />}
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
          </ProfileCard>
        </>
      )}

      {p.emergency_contact_name && (
        <>
          <ProfileSectionTitle title="Liên hệ khẩn cấp" />
          <ProfileCard>
            <ProfileInfoRow icon="users" label="Người liên hệ" value={p.emergency_contact_name} />
            <ProfileInfoRow icon="star" label="Mối quan hệ" value={p.emergency_contact_relation} />
            <ProfileInfoRow icon="phone" label="Số điện thoại" value={p.emergency_contact} last />
          </ProfileCard>
        </>
      )}
    </>
  )
}

/* ── Tab: Contract ── */
export function ContractTab({ data }: { data: ProfileData }) {
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
          <ProfileCard key={`${c.type}-${c.id}`} style={{
            borderColor: isActive ? HNH.success + '50' : HNH.line,
            borderWidth: isActive ? 2 : 1,
          }}>
            <div style={{ padding: '14px 16px' }}>
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
              <div className="flex items-center gap-3" style={{ marginTop: 10, fontSize: 12, color: HNH.ink3 }}>
                <span className="flex items-center gap-1">
                  <Icon name="cal" size={12} color={HNH.ink3} stroke={2} />
                  {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                </span>
              </div>
              <div className="flex gap-2" style={{ marginTop: 10 }}>
                <div className="flex-1" style={{ padding: '10px 12px', borderRadius: 10, background: HNH.cream }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3 }}>Lương cơ bản</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: HNH.ink }}>{fmtMoney(c.wage)}đ</div>
                </div>
                {c.base_salary != null && c.base_salary > 0 && (
                  <div className="flex-1" style={{ padding: '10px 12px', borderRadius: 10, background: '#faf1d6' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#a87908' }}>Lương hiệu suất</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#a87908' }}>{fmtMoney(c.base_salary)}đ</div>
                  </div>
                )}
              </div>
              {c.type === 'trial' && c.probation_days != null && (
                <div className="flex gap-2" style={{ marginTop: 6 }}>
                  <div className="flex-1" style={{ padding: '8px 12px', borderRadius: 10, background: HNH.warn50 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.warn }}>Thời gian thử việc</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: HNH.warn }}>{c.probation_days} ngày</div>
                  </div>
                  {c.trial_wage_pct != null && (
                    <div className="flex-1" style={{ padding: '8px 12px', borderRadius: 10, background: HNH.navy50 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.navy }}>% lương thử việc</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: HNH.navy }}>{c.trial_wage_pct}%</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ProfileCard>
        )
      })}
    </div>
  )
}

/* ── Tab: Leave ── */
export function LeaveTab({ data }: { data: ProfileData }) {
  const l = data.leave
  return (
    <>
      <div className="flex gap-2" style={{ marginBottom: 14 }}>
        <ProfileStatBox value={l.pending} label="Chờ duyệt" tone="warn" />
        <ProfileStatBox value={l.approved_this_year} label="Đã duyệt năm nay" tone="success" />
        <ProfileStatBox value={data.attendance.this_month} label="Ngày công tháng" tone="navy" />
      </div>
      {l.balances.length > 0 ? (
        <>
          <ProfileSectionTitle title="Số dư phép" />
          <ProfileCard>
            {l.balances.map((b, i) => {
              const pct = b.total > 0 ? (b.available / b.total) * 100 : 0
              return (
                <div key={i} style={{
                  padding: '12px 14px',
                  borderBottom: i < l.balances.length - 1 ? `1px solid ${HNH.line}` : 'none',
                }}>
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
          </ProfileCard>
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
  required_actions?: string[]
  last_password_reset_sent_at?: string | null
  last_password_reset_sent_by_name?: string | null
}

function extractDept(desc?: string): string {
  if (!desc) return ''
  const parts = desc.split(' - ')
  return parts.length >= 2 ? parts[parts.length - 1].trim().toUpperCase() : ''
}

/* ── Đổi email / username đăng nhập (HRM + Keycloak) ── */

function IdField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: HNH.ink3, display: 'block', marginBottom: 5 }}>{label}</label>
      <input
        value={value} type={type} placeholder={placeholder}
        autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', borderRadius: 12, boxSizing: 'border-box',
          border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600, color: HNH.ink, outline: 'none' }}
        onFocus={e => { e.target.style.borderColor = HNH.navy }}
        onBlur={e => { e.target.style.borderColor = HNH.line }}
      />
    </div>
  )
}

interface IdentityAnalysis {
  old_email: string
  new_email: string
  new_username: string
  plan: 'rename' | 'link_existing' | 'create' | 'noop' | 'kc_unreachable'
  hrm_changes: { field: string; from: string; to: string }[]
  kc_old: { kc_id: string; username: string; email: string; enabled: boolean; federated: boolean } | null
  kc_new: { kc_id: string; username: string; email: string; enabled: boolean; federated: boolean } | null
  kc_error: string | null
  warnings: string[]
  errors: string[]
  can_apply: boolean
}

const PLAN_LABEL: Record<IdentityAnalysis['plan'], string> = {
  rename: 'Đổi tên tài khoản KC tại chỗ (giữ mật khẩu)',
  link_existing: 'Trỏ HRM sang tài khoản KC đã tồn tại + vô hiệu hóa tài khoản cũ',
  create: 'Tạo tài khoản KC mới (mật khẩu mặc định)',
  noop: 'Không thay đổi Keycloak',
  kc_unreachable: 'Không kết nối được Keycloak',
}

function IdentityChangeSection({ employeeId, currentEmail, onChanged }: {
  employeeId: number; currentEmail: string; onChanged: () => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [preview, setPreview] = useState<IdentityAnalysis | null>(null)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  const reset = () => {
    setNewEmail(''); setNewUsername(''); setPreview(null)
    setErr(''); setDone(''); setChecking(false); setApplying(false)
  }
  const close = () => { setOpen(false); reset() }

  const check = async () => {
    setChecking(true); setErr(''); setPreview(null); setDone('')
    try {
      const u = newUsername.trim()
      const url = `/api/employee/${employeeId}/kc-account/identity/?new_email=${encodeURIComponent(newEmail.trim())}`
        + (u ? `&new_username=${encodeURIComponent(u)}` : '')
      setPreview(await api.get<IdentityAnalysis>(url))
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Lỗi kiểm tra')
    } finally { setChecking(false) }
  }

  const apply = async () => {
    if (!preview) return
    setApplying(true); setErr('')
    try {
      const res = await api.post<{ message?: string }>(
        `/api/employee/${employeeId}/kc-account/identity/`,
        {
          new_email: newEmail.trim(),
          new_username: newUsername.trim() || undefined,
          expected_plan: preview.plan,
          disable_old: true,
        },
      )
      setDone(res.message || 'Đã đổi thành công')
      setPreview(null)
      await onChanged()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Lỗi áp dụng')
    } finally { setApplying(false) }
  }

  // email mới đổi → preview cũ không còn đúng
  const onEmailChange = (v: string) => { setNewEmail(v); setPreview(null); setDone('') }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
        style={{ padding: '12px 16px', background: '#fff', borderRadius: 14, border: `1px solid ${HNH.line}` }}
      >
        <div style={{ width: 34, height: 34, borderRadius: 10, background: HNH.red50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="mail" size={15} color={HNH.red} stroke={2} />
        </div>
        <div className="flex-1">
          <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>Đổi email / username đăng nhập</div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>Đồng bộ HRM + Keycloak, có bước kiểm tra trước</div>
        </div>
        <Icon name="chev-r" size={16} color={HNH.ink4} stroke={2} />
      </button>

      {open && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%',
            borderRadius: '20px 20px 0 0', maxWidth: 520, margin: '0 auto',
            padding: '20px 20px 32px', maxHeight: '88vh', overflowY: 'auto' }}>

            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: HNH.ink }}>Đổi email / username</span>
              <button onClick={close} className="border-none cursor-pointer" style={{ background: 'transparent' }}>
                <Icon name="x" size={20} color={HNH.ink3} />
              </button>
            </div>
            <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 16 }}>
              Email hiện tại: <strong style={{ color: HNH.ink }}>{currentEmail}</strong>
            </div>

            <IdField label="Email mới" value={newEmail} onChange={onEmailChange}
              placeholder="vd: ten.nv@hongngocha.com" type="email" />
            <IdField label="Username KC (tùy chọn — mặc định = email mới)" value={newUsername}
              onChange={(v: string) => { setNewUsername(v); setPreview(null) }}
              placeholder="để trống = dùng email mới" type="text" />

            <button onClick={check} disabled={checking || !newEmail.trim()}
              style={{ width: '100%', padding: '12px', borderRadius: 12, marginTop: 4,
                border: `1.5px solid ${HNH.navy}`, background: HNH.navy50, color: HNH.navy,
                fontSize: 14, fontWeight: 700, cursor: checking || !newEmail.trim() ? 'not-allowed' : 'pointer',
                opacity: checking || !newEmail.trim() ? 0.5 : 1 }}>
              {checking ? 'Đang kiểm tra...' : '1. Kiểm tra'}
            </button>

            {err && (
              <div style={{ background: HNH.red50, border: `1px solid ${HNH.red}`, borderRadius: 12,
                padding: '10px 14px', fontSize: 12.5, color: HNH.red, marginTop: 12 }}>{err}</div>
            )}
            {done && (
              <div style={{ background: HNH.success50, border: `1px solid ${HNH.success}`, borderRadius: 12,
                padding: '10px 14px', fontSize: 12.5, color: HNH.success, fontWeight: 600, marginTop: 12 }}>
                ✓ {done}
              </div>
            )}

            {preview && (
              <div style={{ marginTop: 14, border: `1px solid ${HNH.line}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: HNH.cream, borderBottom: `1px solid ${HNH.line}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase' }}>Kế hoạch Keycloak</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginTop: 2 }}>{PLAN_LABEL[preview.plan]}</div>
                </div>

                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${HNH.line}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', marginBottom: 6 }}>
                    HRM sẽ đổi ({preview.hrm_changes.length} cột)
                  </div>
                  {preview.hrm_changes.length === 0
                    ? <div style={{ fontSize: 12, color: HNH.ink3 }}>Không có cột HRM nào giữ email cũ.</div>
                    : preview.hrm_changes.map(c => (
                      <div key={c.field} style={{ fontSize: 12, color: HNH.ink2, marginBottom: 3 }}>
                        <code style={{ color: HNH.navy }}>{c.field}</code>: {c.from} → <strong style={{ color: HNH.ink }}>{c.to}</strong>
                      </div>
                    ))}
                </div>

                {(preview.kc_old || preview.kc_new) && (
                  <div style={{ padding: '10px 14px', borderBottom: `1px solid ${HNH.line}`, fontSize: 12, color: HNH.ink2 }}>
                    {preview.kc_old && <div>KC cũ: <strong>{preview.kc_old.username}</strong>{preview.kc_old.federated ? ' · Microsoft' : ''}{preview.kc_old.enabled ? '' : ' · đã tắt'}</div>}
                    {preview.kc_new && <div style={{ marginTop: 2 }}>KC mới: <strong>{preview.kc_new.username}</strong>{preview.kc_new.federated ? ' · Microsoft' : ''}</div>}
                  </div>
                )}

                {preview.warnings.map((w, i) => (
                  <div key={i} style={{ padding: '8px 14px', fontSize: 12, color: HNH.warn, background: HNH.warn50, borderBottom: `1px solid ${HNH.line}` }}>⚠️ {w}</div>
                ))}
                {preview.errors.map((e, i) => (
                  <div key={i} style={{ padding: '8px 14px', fontSize: 12, color: HNH.red, background: HNH.red50 }}>✕ {e}</div>
                ))}

                <button onClick={apply} disabled={applying || !preview.can_apply}
                  style={{ width: '100%', padding: '13px', border: 'none',
                    background: preview.can_apply ? HNH.red : HNH.ink4, color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: applying || !preview.can_apply ? 'not-allowed' : 'pointer',
                    opacity: applying ? 0.6 : 1 }}>
                  {applying ? 'Đang áp dụng...' : preview.can_apply ? '2. Áp dụng đổi email' : 'Không thể áp dụng'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export function AppAccountTab({ employeeId, employeeEmail, can_edit, department }: {
  employeeId: number; employeeEmail: string; can_edit: boolean; department?: string
}) {
  const [account, setAccount] = useState<KcAccount | null>(null)
  const [options, setOptions] = useState<KcOptions | null>(null)
  const [selRoles, setSelRoles] = useState<string[]>([])
  const [selGroups, setSelGroups] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const refreshAccount = async () => {
    const acc = await api.get<KcAccount>(`/api/employee/${employeeId}/kc-account/`)
    setAccount(acc)
    return acc
  }

  useEffect(() => {
    if (!employeeEmail) { setLoading(false); return }
    Promise.all([
      api.get<KcAccount>(`/api/employee/${employeeId}/kc-account/`),
      api.get<KcOptions>('/api/employee/kc-options/'),
    ]).then(([acc, opts]) => {
      setAccount(acc)
      setOptions(opts)
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
    setBusy(true); setErr(''); setSent(false); setMsg('')
    try {
      await api.post(`/api/employee/${employeeId}/kc-account/`, { roles: selRoles, groups: selGroups })
      setSent(true)
      await refreshAccount()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally { setBusy(false) }
  }

  const handleAction = async (action: string, payload?: object) => {
    setActionBusy(action); setErr(''); setMsg('')
    try {
      const res = await api.patch<{ success: boolean; message?: string; required_actions?: string[]; email_sent?: boolean }>(
        `/api/employee/${employeeId}/kc-account/`,
        { action, ...payload },
      )
      // Reset OK nhưng email lỗi (SMTP hỏng) → hiện cảnh báo thay vì báo thành công.
      if (res.email_sent === false) setErr(res.message || 'Đã reset nhưng gửi email thất bại')
      else if (res.message) setMsg(res.message)
      if (res.required_actions !== undefined && account) {
        setAccount({ ...account, required_actions: res.required_actions })
      } else if (action !== 'set_force_change') {
        await refreshAccount()
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally { setActionBusy(null) }
  }

  const forceChange = account?.required_actions?.includes('UPDATE_PASSWORD') ?? false

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
      <ProfileCard>
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
              <PasswordResetInfo
                sentAt={account.last_password_reset_sent_at ?? null}
                sentBy={account.last_password_reset_sent_by_name ?? null}
              />
            </div>
          )}
        </div>
      </ProfileCard>

      {(sent || msg) && (
        <div style={{
          background: HNH.success50, border: `1px solid ${HNH.success}`,
          borderRadius: 14, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="check" size={18} color={HNH.success} stroke={2.5} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.success }}>
              {sent ? 'Tạo tài khoản thành công!' : 'Thành công'}
            </div>
            <div style={{ fontSize: 12, color: HNH.success, opacity: 0.8, marginTop: 2 }}>
              {msg || `Email thông báo đã gửi tới ${employeeEmail} (CC: coo@hongngocha.com)`}
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

      {/* Action buttons when account EXISTS */}
      {account?.exists && can_edit && (
        <ProfileCard>
          <div style={{ padding: '4px 0' }}>
            {/* Resend welcome email */}
            <button
              onClick={() => handleAction('resend_welcome')}
              disabled={actionBusy !== null}
              className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
              style={{
                padding: '12px 16px', background: 'transparent',
                borderBottom: `1px solid ${HNH.line}`,
                opacity: actionBusy !== null ? 0.5 : 1,
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 10, background: HNH.navy50,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {actionBusy === 'resend_welcome'
                  ? <div style={{ width: 16, height: 16, border: `2px solid ${HNH.navy}40`, borderTopColor: HNH.navy, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  : <Icon name="send" size={15} color={HNH.navy} stroke={2} />
                }
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>Gửi lại email chào mừng</div>
                <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>Gửi thông tin đăng nhập hiện tại</div>
              </div>
            </button>

            {/* Reset password + resend email */}
            <button
              onClick={() => handleAction('reset_password')}
              disabled={actionBusy !== null}
              className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
              style={{
                padding: '12px 16px', background: 'transparent',
                borderBottom: `1px solid ${HNH.line}`,
                opacity: actionBusy !== null ? 0.5 : 1,
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 10, background: HNH.warn50,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {actionBusy === 'reset_password'
                  ? <div style={{ width: 16, height: 16, border: `2px solid ${HNH.warn}40`, borderTopColor: HNH.warn, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  : <Icon name="refresh" size={15} color={HNH.warn} stroke={2} />
                }
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>Reset mật khẩu về Hnh@1234</div>
                <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>Đặt lại mật khẩu mặc định và gửi email</div>
              </div>
            </button>

            {/* Toggle force password change */}
            <div
              className="flex items-center gap-3"
              style={{ padding: '12px 16px' }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: forceChange ? HNH.red50 : HNH.cream,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {actionBusy === 'set_force_change'
                  ? <div style={{ width: 16, height: 16, border: `2px solid ${HNH.ink3}40`, borderTopColor: HNH.ink3, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  : <Icon name="shield" size={15} color={forceChange ? HNH.red : HNH.ink3} stroke={2} />
                }
              </div>
              <div className="flex-1">
                <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>Yêu cầu đổi mật khẩu khi đăng nhập</div>
                <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>
                  {forceChange ? 'Đang bật — user phải đổi mật khẩu lần đăng nhập tiếp' : 'Đang tắt'}
                </div>
              </div>
              <button
                onClick={() => handleAction('set_force_change', { enabled: !forceChange })}
                disabled={actionBusy !== null}
                style={{
                  width: 44, height: 26, borderRadius: 13, border: 'none', cursor: actionBusy !== null ? 'not-allowed' : 'pointer',
                  background: forceChange ? HNH.red : HNH.ink4,
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  opacity: actionBusy !== null ? 0.5 : 1,
                }}
              >
                <div style={{
                  position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                  left: forceChange ? 21 : 3,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }} />
              </button>
            </div>
          </div>
        </ProfileCard>
      )}

      {account?.exists && can_edit && (
        <IdentityChangeSection employeeId={employeeId} currentEmail={employeeEmail} onChanged={refreshAccount} />
      )}

      {!account?.exists && options && (() => {
        const deptUpper = (department || '').toUpperCase()
        const filteredRoles = options.roles.filter(r => !r.name.startsWith('default-roles') && !r.name.startsWith('uma_') && !r.name.startsWith('offline_'))
        const deptRoles = deptUpper ? filteredRoles.filter(r => extractDept(r.description).includes(deptUpper)) : []
        const otherRoles = deptUpper ? filteredRoles.filter(r => !extractDept(r.description).includes(deptUpper)) : filteredRoles
        return <>
          <ProfileSectionTitle title={`Vai trò Keycloak (${selRoles.length} đã chọn)`} />
          <div style={{ maxHeight: 720, overflowY: 'auto', borderRadius: 14, border: `1px solid ${HNH.line}`, background: '#fff' }}>
          {deptRoles.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: HNH.navy, padding: '8px 16px 4px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {department} ({deptRoles.length} vai trò)
              </div>
              <ProfileCard>
                {deptRoles.map((r, i, arr) => (
                  <button key={r.id} onClick={() => toggleRole(r.id)}
                    className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                    style={{ padding: '11px 14px', background: 'transparent', borderBottom: i < arr.length - 1 ? `1px solid ${HNH.line}` : 'none' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: '2px solid', borderColor: selRoles.includes(r.id) ? HNH.navy : HNH.ink4, background: selRoles.includes(r.id) ? HNH.navy : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selRoles.includes(r.id) && <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink }}>{r.name}</div>
                      {r.description && <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>{r.description}</div>}
                    </div>
                  </button>
                ))}
              </ProfileCard>
            </>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, padding: '12px 16px 4px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Phòng ban khác ({otherRoles.length})
          </div>
          <ProfileCard>
            {otherRoles.map((r, i, arr) => (
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
          </ProfileCard>
          </div>

          <ProfileSectionTitle title={`Nhóm quyền HRM (${selGroups.length} đã chọn)`} />
          <ProfileCard>
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
          </ProfileCard>

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
      })()}
    </div>
  )
}

/* ── Tab bar (reusable) ── */
export const PROFILE_TABS: { id: ProfileTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'users' },
  { id: 'contract', label: 'Hợp đồng', icon: 'doc' },
  { id: 'leave', label: 'Phép & Công', icon: 'leaf' },
  { id: 'account', label: 'Tài khoản', icon: 'shield' },
]

export function ProfileTabBar({ tab, onTab, px = 16 }: {
  tab: ProfileTab; onTab: (t: ProfileTab) => void; px?: number
}) {
  return (
    <div className="flex" style={{ padding: `0 ${px}px 8px` }}>
      {PROFILE_TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onTab(t.id)}
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
  )
}

export function ProfileTabContent({ tab, data, canEdit }: {
  tab: ProfileTab; data: ProfileData; canEdit: boolean
}) {
  const p = data.personal
  return (
    <>
      {tab === 'overview' && <OverviewTab data={data} />}
      {tab === 'contract' && (
        canEdit ? <ContractTab data={data} /> : (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Icon name="doc" size={36} color={HNH.ink4} />
            <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>Thông tin Hợp đồng</div>
            <div style={{ fontSize: 13, color: HNH.ink3, marginTop: 8, lineHeight: 1.6 }}>
              Nội dung này đang được cập nhật và sẽ hiển thị sớm.
            </div>
            <div style={{
              marginTop: 16, padding: '10px 20px', borderRadius: 10,
              background: HNH.goldSoft, display: 'inline-block',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#a87908' }}>Sắp cập nhật</span>
            </div>
          </div>
        )
      )}
      {tab === 'leave' && <LeaveTab data={data} />}
      {tab === 'account' && (
        <AppAccountTab
          employeeId={p.id}
          employeeEmail={p.email}
          can_edit={canEdit}
          department={data.work?.department || ''}
        />
      )}
    </>
  )
}
