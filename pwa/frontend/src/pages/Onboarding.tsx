import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { api } from '../lib/api'

/* ── Types ── */
type Tab = 'onboarding' | 'offboarding' | 'resignation'

interface OnbCandidate {
  id: number; name: string; recruitment: string | null
  tasks_done: number; tasks_total: number; end_date: string | null
}
interface OnbStage { id: number; title: string; is_final: boolean; sequence: number; candidates: OnbCandidate[] }
interface OnbData {
  tab: 'onboarding'; is_manager: boolean
  summary: { total: number; in_progress: number; completed: number }
  recruitments: { id: number; name: string }[]
  stages: OnbStage[]
}

interface OffEmp {
  id: number; emp_id: number; name: string; badge_id: string; department: string | null
  offboarding: string | null; notice_start: string | null; notice_end: string | null
  notice_days_left: number | null; tasks_done: number; tasks_total: number
}
interface OffStage { id: number; title: string; type: string; sequence: number; employees: OffEmp[] }
interface OffData {
  tab: 'offboarding'; is_manager: boolean
  summary: { total: number; notice_active: number; notice_expired: number }
  offboardings: { id: number; name: string; status: string }[]
  stages: OffStage[]
}

interface ResLetter {
  id: number; title: string; description: string | null
  planned_leave: string | null; status: string; created_at: string | null
}
interface ResManageLetter extends ResLetter {
  emp_id: number; name: string; badge_id: string; department: string | null
}
interface ResData {
  tab: 'resignation'; is_manager: boolean; view: string
  my_letters: ResLetter[]
  manage_letters: ResManageLetter[]
  manage_summary: { total: number; requested: number; approved: number; rejected: number }
}

/* ── Helpers ── */
const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  requested: { label: 'Chờ duyệt', bg: HNH.warn50, color: HNH.warn },
  approved: { label: 'Đã duyệt', bg: HNH.success50, color: HNH.success },
  rejected: { label: 'Từ chối', bg: HNH.red50, color: HNH.red },
}

const STAGE_TYPE_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
  notice_period: { bg: HNH.warn50, color: HNH.warn, icon: 'clock' },
  interview: { bg: '#ede7f6', color: '#5e35b1', icon: 'user' },
  handover: { bg: HNH.navy50, color: HNH.navy, icon: 'send' },
  fnf: { bg: '#fce4ec', color: '#c62828', icon: 'doc' },
  other: { bg: '#e8f5e9', color: '#2e7d32', icon: 'star' },
  archived: { bg: HNH.cream2, color: HNH.ink3, icon: 'folder' },
}

function Badge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || STATUS_MAP.requested
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  )
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0
  const color = pct === 100 ? HNH.success : pct >= 50 ? HNH.warn : HNH.red
  return (
    <div className="flex items-center gap-1.5">
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: `conic-gradient(${color} ${pct * 3.6}deg, ${HNH.cream2} 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 800, color,
        }}>{pct}%</div>
      </div>
      <span style={{ fontSize: 11, color: HNH.ink3 }}>{done}/{total}</span>
    </div>
  )
}

/* ── Tab: Onboarding ── */
function OnboardingTab({ data, search, onSearch, recruitFilter, onRecruitFilter }: {
  data: OnbData; search: string; onSearch: (v: string) => void
  recruitFilter: string; onRecruitFilter: (v: string) => void
}) {
  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2" style={{ marginTop: 12 }}>
        {[
          { label: 'Tổng', value: data.summary.total, bg: HNH.navy50, color: HNH.navy },
          { label: 'Đang xử lý', value: data.summary.in_progress, bg: HNH.warn50, color: HNH.warn },
          { label: 'Hoàn tất', value: data.summary.completed, bg: HNH.success50, color: HNH.success },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', borderRadius: 14, padding: '12px 10px',
            textAlign: 'center', border: `1px solid ${HNH.line}`,
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <SearchBox value={search} onChange={onSearch} placeholder="Tìm ứng viên..." />

      {/* Recruitment filter */}
      {data.recruitments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto" style={{ marginTop: 10, paddingBottom: 4 }}>
          <Chip active={!recruitFilter} onClick={() => onRecruitFilter('')}>Tất cả</Chip>
          {data.recruitments.map(r => (
            <Chip key={r.id} active={recruitFilter === String(r.id)}
              onClick={() => onRecruitFilter(String(r.id))}>{r.name}</Chip>
          ))}
        </div>
      )}

      {/* Stages */}
      <div className="flex flex-col gap-3" style={{ marginTop: 14 }}>
        {data.stages.length === 0 ? (
          <EmptyState icon="users" text="Không có ứng viên onboarding" />
        ) : data.stages.map(stage => (
          <StageCard key={stage.id} title={stage.title}
            badge={stage.is_final ? 'Hoàn tất' : undefined}
            count={stage.candidates.length}
            accentColor={stage.is_final ? HNH.success : HNH.navy}
            accentBg={stage.is_final ? HNH.success50 : HNH.navy50}>
            {stage.candidates.map(c => (
              <div key={c.id} className="flex items-center gap-3" style={{
                padding: '10px 12px', borderRadius: 12, background: HNH.cream,
                border: `1px solid ${HNH.line}`,
              }}>
                <div className="flex items-center justify-center shrink-0" style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: c.end_date ? HNH.success50 : HNH.navy50,
                }}>
                  <Icon name="user" size={14} color={c.end_date ? HNH.success : HNH.navy} stroke={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }} className="truncate">{c.name}</div>
                  {c.recruitment && (
                    <div style={{ fontSize: 11, color: HNH.ink3 }}>{c.recruitment}</div>
                  )}
                </div>
                {c.tasks_total > 0 && <ProgressRing done={c.tasks_done} total={c.tasks_total} />}
              </div>
            ))}
          </StageCard>
        ))}
      </div>
    </>
  )
}

/* ── Tab: Offboarding ── */
function OffboardingTab({ data, search, onSearch, offFilter, onOffFilter }: {
  data: OffData; search: string; onSearch: (v: string) => void
  offFilter: string; onOffFilter: (v: string) => void
}) {
  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2" style={{ marginTop: 12 }}>
        {[
          { label: 'Tổng', value: data.summary.total, bg: HNH.navy50, color: HNH.navy },
          { label: 'Notice còn', value: data.summary.notice_active, bg: HNH.warn50, color: HNH.warn },
          { label: 'Notice hết', value: data.summary.notice_expired, bg: HNH.red50, color: HNH.red },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', borderRadius: 14, padding: '12px 10px',
            textAlign: 'center', border: `1px solid ${HNH.line}`,
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <SearchBox value={search} onChange={onSearch} placeholder="Tìm nhân viên..." />

      {data.offboardings.length > 0 && (
        <div className="flex gap-2 overflow-x-auto" style={{ marginTop: 10, paddingBottom: 4 }}>
          <Chip active={!offFilter} onClick={() => onOffFilter('')}>Tất cả</Chip>
          {data.offboardings.map(o => (
            <Chip key={o.id} active={offFilter === String(o.id)}
              onClick={() => onOffFilter(String(o.id))}>{o.name}</Chip>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3" style={{ marginTop: 14 }}>
        {data.stages.length === 0 ? (
          <EmptyState icon="users" text="Không có nhân viên offboarding" />
        ) : data.stages.map(stage => {
          const stc = STAGE_TYPE_COLORS[stage.type] || STAGE_TYPE_COLORS.other
          return (
            <StageCard key={stage.id} title={stage.title}
              count={stage.employees.length}
              accentColor={stc.color} accentBg={stc.bg}
              icon={stc.icon}>
              {stage.employees.map(e => (
                <div key={e.id} style={{
                  padding: '12px', borderRadius: 12, background: '#fff',
                  border: `1px solid ${HNH.line}`,
                }}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center shrink-0" style={{
                      width: 32, height: 32, borderRadius: 10, background: stc.bg,
                    }}>
                      <Icon name="user" size={14} color={stc.color} stroke={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }} className="truncate">{e.name}</div>
                      <div style={{ fontSize: 11, color: HNH.ink3 }}>
                        {e.badge_id}{e.department ? ` • ${e.department}` : ''}
                      </div>
                    </div>
                    {e.tasks_total > 0 && <ProgressRing done={e.tasks_done} total={e.tasks_total} />}
                  </div>
                  {/* Notice period */}
                  {(e.notice_start || e.notice_end) && (
                    <div className="flex items-center gap-3 flex-wrap" style={{
                      marginTop: 8, padding: '8px 10px', borderRadius: 10,
                      background: e.notice_days_left !== null && e.notice_days_left <= 0 ? HNH.red50 : HNH.warn50,
                    }}>
                      <Icon name="clock" size={13} color={
                        e.notice_days_left !== null && e.notice_days_left <= 0 ? HNH.red : HNH.warn
                      } stroke={2} />
                      <span style={{ fontSize: 11, color: HNH.ink2 }}>
                        {e.notice_start} → {e.notice_end}
                      </span>
                      {e.notice_days_left !== null && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, marginLeft: 'auto',
                          color: e.notice_days_left <= 0 ? HNH.red : HNH.warn,
                        }}>
                          {e.notice_days_left <= 0 ? 'Đã hết hạn' : `Còn ${e.notice_days_left} ngày`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </StageCard>
          )
        })}
      </div>
    </>
  )
}

/* ── Tab: Resignation ── */
function ResignationTab({ data, isManager, resView, onResView, search, onSearch, onSubmit, submitting }: {
  data: ResData; isManager: boolean; resView: 'my' | 'manage'
  onResView: (v: 'my' | 'manage') => void
  search: string; onSearch: (v: string) => void
  onSubmit: (title: string, desc: string, date: string) => void; submitting: boolean
}) {
  const [showForm, setShowForm] = useState(false)
  const [fTitle, setFTitle] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fDate, setFDate] = useState('')

  const handleSubmit = () => {
    if (!fTitle.trim() || !fDate) return
    onSubmit(fTitle.trim(), fDesc.trim(), fDate)
    setShowForm(false); setFTitle(''); setFDesc(''); setFDate('')
  }

  return (
    <>
      {/* View toggle */}
      {isManager && (
        <div className="flex gap-2" style={{ marginTop: 12 }}>
          {(['my', 'manage'] as const).map(v => (
            <button key={v}
              onClick={() => onResView(v)}
              className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
              style={{
                padding: '10px 0', borderRadius: 14, fontSize: 13, fontWeight: 700,
                background: resView === v ? HNH.navy : '#fff',
                color: resView === v ? '#fff' : HNH.ink2,
                border: `1.5px solid ${resView === v ? HNH.navy : HNH.line}`,
              }}>
              <Icon name={v === 'my' ? 'user' : 'users'} size={14}
                color={resView === v ? '#fff' : HNH.ink3} stroke={2} />
              {v === 'my' ? 'Đơn của tôi' : 'Quản lý'}
            </button>
          ))}
        </div>
      )}

      {/* My letters */}
      {resView === 'my' && (
        <>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center justify-center gap-2 border-none cursor-pointer"
            style={{
              marginTop: 14, width: '100%', padding: '12px 0', borderRadius: 14,
              background: `linear-gradient(135deg, ${HNH.red} 0%, ${HNH.redDark} 100%)`,
              color: '#fff', fontSize: 14, fontWeight: 700,
            }}>
            <Icon name="send" size={16} color="#fff" stroke={2} />
            Gửi đơn nghỉ việc
          </button>

          {showForm && (
            <div style={{
              marginTop: 10, padding: 16, borderRadius: 16,
              background: '#fff', border: `1.5px solid ${HNH.line}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginBottom: 10 }}>
                Đơn nghỉ việc mới
              </div>
              <input value={fTitle} onChange={e => setFTitle(e.target.value)}
                placeholder="Tiêu đề *"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 12,
                  border: `1.5px solid ${HNH.line}`, fontSize: 13,
                  outline: 'none', boxSizing: 'border-box', marginBottom: 8,
                }} />
              <textarea value={fDesc} onChange={e => setFDesc(e.target.value)}
                placeholder="Lý do nghỉ việc (tùy chọn)"
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 12,
                  border: `1.5px solid ${HNH.line}`, fontSize: 13,
                  outline: 'none', boxSizing: 'border-box', resize: 'none', marginBottom: 8,
                  fontFamily: 'inherit',
                }} />
              <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 4 }}>Ngày dự kiến nghỉ *</div>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 12,
                  border: `1.5px solid ${HNH.line}`, fontSize: 13,
                  outline: 'none', boxSizing: 'border-box', marginBottom: 12,
                }} />
              <button onClick={handleSubmit} disabled={submitting || !fTitle.trim() || !fDate}
                className="border-none cursor-pointer"
                style={{
                  width: '100%', padding: '11px 0', borderRadius: 12,
                  background: fTitle.trim() && fDate
                    ? `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`
                    : HNH.cream2,
                  color: fTitle.trim() && fDate ? '#fff' : HNH.ink3,
                  fontSize: 13, fontWeight: 700, opacity: submitting ? 0.6 : 1,
                }}>
                {submitting ? 'Đang gửi...' : 'Gửi đơn'}
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3" style={{ marginTop: 14 }}>
            {data.my_letters.length === 0 ? (
              <EmptyState icon="doc" text="Bạn chưa gửi đơn nghỉ việc nào" />
            ) : data.my_letters.map(rl => (
              <div key={rl.id} style={{
                background: '#fff', borderRadius: 16, padding: '14px 16px',
                border: `1.5px solid ${HNH.line}`,
              }}>
                <div className="flex items-center justify-between">
                  <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{rl.title}</div>
                  <Badge status={rl.status} />
                </div>
                {rl.description && (
                  <p style={{ fontSize: 12, color: HNH.ink2, margin: '8px 0 0', lineHeight: 1.5 }}>
                    {rl.description}
                  </p>
                )}
                <div className="flex items-center gap-3" style={{ marginTop: 8 }}>
                  <Icon name="cal" size={13} color={HNH.ink3} stroke={2} />
                  <span style={{ fontSize: 12, color: HNH.ink2 }}>
                    Nghỉ: {rl.planned_leave}
                  </span>
                  {rl.created_at && (
                    <span style={{ fontSize: 11, color: HNH.ink3, marginLeft: 'auto' }}>
                      {rl.created_at.slice(0, 10)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Manage view */}
      {resView === 'manage' && isManager && (
        <>
          {data.manage_summary.total > 0 && (
            <div className="grid grid-cols-4 gap-2" style={{ marginTop: 12 }}>
              {[
                { label: 'Tổng', value: data.manage_summary.total, color: HNH.navy },
                { label: 'Chờ', value: data.manage_summary.requested, color: HNH.warn },
                { label: 'Duyệt', value: data.manage_summary.approved, color: HNH.success },
                { label: 'Từ chối', value: data.manage_summary.rejected, color: HNH.red },
              ].map(s => (
                <div key={s.label} style={{
                  background: '#fff', borderRadius: 12, padding: '10px 6px',
                  textAlign: 'center', border: `1px solid ${HNH.line}`,
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: HNH.ink3, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <SearchBox value={search} onChange={onSearch} placeholder="Tìm đơn nghỉ việc..." />

          <div className="flex flex-col gap-3" style={{ marginTop: 14 }}>
            {data.manage_letters.length === 0 ? (
              <EmptyState icon="doc" text="Không có đơn nghỉ việc nào" />
            ) : data.manage_letters.map(rl => (
              <div key={rl.id} style={{
                background: '#fff', borderRadius: 16, padding: '14px 16px',
                border: `1.5px solid ${rl.status === 'requested' ? HNH.warn : HNH.line}`,
              }}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center shrink-0" style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: rl.status === 'approved' ? HNH.success50 : rl.status === 'rejected' ? HNH.red50 : HNH.warn50,
                  }}>
                    <Icon name="user" size={15}
                      color={rl.status === 'approved' ? HNH.success : rl.status === 'rejected' ? HNH.red : HNH.warn}
                      stroke={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }} className="truncate">{rl.name}</div>
                    <div style={{ fontSize: 11, color: HNH.ink3 }}>
                      {rl.badge_id}{rl.department ? ` • ${rl.department}` : ''}
                    </div>
                  </div>
                  <Badge status={rl.status} />
                </div>
                <div style={{
                  marginTop: 10, padding: '10px 12px', borderRadius: 12, background: HNH.cream,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{rl.title}</div>
                  {rl.description && (
                    <p style={{ fontSize: 12, color: HNH.ink2, margin: '4px 0 0', lineHeight: 1.4 }}>
                      {rl.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3" style={{ marginTop: 8 }}>
                  <Icon name="cal" size={13} color={HNH.ink3} stroke={2} />
                  <span style={{ fontSize: 12, color: HNH.ink2 }}>Nghỉ: {rl.planned_leave}</span>
                  {rl.created_at && (
                    <span style={{ fontSize: 11, color: HNH.ink3, marginLeft: 'auto' }}>
                      {rl.created_at.slice(0, 10)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/* ── Shared UI ── */
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative" style={{ marginTop: 12 }}>
      <div style={{ position: 'absolute', left: 14, top: 12, pointerEvents: 'none' }}>
        <Icon name="search" size={16} color={HNH.ink3} stroke={2} />
      </div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 14px 10px 38px', borderRadius: 14,
          border: `1.5px solid ${HNH.line}`, fontSize: 13, background: '#fff',
          outline: 'none', boxSizing: 'border-box',
        }} />
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="border-none cursor-pointer shrink-0"
      style={{
        padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
        background: active ? HNH.navy : '#fff', color: active ? '#fff' : HNH.ink2,
        border: `1.5px solid ${active ? HNH.navy : HNH.line}`,
      }}>{children}</button>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center" style={{ padding: '50px 0' }}>
      <Icon name={icon} size={40} color={HNH.ink3} stroke={1.5} />
      <div style={{ fontSize: 14, color: HNH.ink3, marginTop: 12 }}>{text}</div>
    </div>
  )
}

function StageCard({ title, count, accentColor, accentBg, badge, icon, children }: {
  title: string; count: number; accentColor: string; accentBg: string
  badge?: string; icon?: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1.5px solid ${HNH.line}`, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 border-none cursor-pointer text-left"
        style={{ padding: '14px 16px', background: 'transparent' }}>
        <div className="flex items-center justify-center shrink-0" style={{
          width: 36, height: 36, borderRadius: 12, background: accentBg,
        }}>
          <Icon name={icon || 'folder'} size={17} color={accentColor} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{title}</div>
          <div style={{ fontSize: 11, color: HNH.ink3 }}>{count} người</div>
        </div>
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: HNH.success50, color: HNH.success,
          }}>{badge}</span>
        )}
        <Icon name={open ? 'up' : 'down'} size={16} color={HNH.ink3} stroke={2} />
      </button>
      {open && (
        <div className="flex flex-col gap-2" style={{ padding: '0 12px 14px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Main Page ── */
export function OnboardingPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('onboarding')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [recruitFilter, setRecruitFilter] = useState('')
  const [offFilter, setOffFilter] = useState('')
  const [resView, setResView] = useState<'my' | 'manage'>('my')
  const [submitting, setSubmitting] = useState(false)

  const [onbData, setOnbData] = useState<OnbData | null>(null)
  const [offData, setOffData] = useState<OffData | null>(null)
  const [resData, setResData] = useState<ResData | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab, search })
      if (tab === 'onboarding' && recruitFilter) params.set('recruitment', recruitFilter)
      if (tab === 'offboarding' && offFilter) params.set('offboarding', offFilter)
      if (tab === 'resignation') params.set('view', resView)
      const res = await api.get<OnbData | OffData | ResData>(`/api/employee/onboarding-offboarding/?${params}`)
      if (res.tab === 'onboarding') setOnbData(res as OnbData)
      else if (res.tab === 'offboarding') setOffData(res as OffData)
      else setResData(res as ResData)
    } catch { /* ignore */ }
    setLoading(false)
  }, [tab, search, recruitFilter, offFilter, resView])

  useEffect(() => { fetchData() }, [fetchData])

  const handleResSubmit = async (title: string, desc: string, date: string) => {
    setSubmitting(true)
    try {
      await api.post('/api/employee/onboarding-offboarding/', {
        title, description: desc, planned_leave: date,
      })
      setTab('resignation')
      setResView('my')
      await fetchData()
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  const switchTab = (t: Tab) => {
    setTab(t); setSearch(''); setRecruitFilter(''); setOffFilter('')
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'onboarding', label: 'Onboarding', icon: 'star' },
    { key: 'offboarding', label: 'Offboarding', icon: 'send' },
    { key: 'resignation', label: 'Nghỉ việc', icon: 'doc' },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: HNH.cream }}>
      <TopBar onBack={() => navigate(-1)} title="Onboarding / Offboarding" />

      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: '0 16px 100px' }}>

          {/* Tab bar */}
          <div className="flex gap-1" style={{
            marginTop: 12, padding: 3, borderRadius: 16,
            background: '#fff', border: `1.5px solid ${HNH.line}`,
          }}>
            {TABS.map(t => (
              <button key={t.key}
                onClick={() => switchTab(t.key)}
                className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
                style={{
                  padding: '9px 0', borderRadius: 13, fontSize: 12, fontWeight: 700,
                  background: tab === t.key
                    ? `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`
                    : 'transparent',
                  color: tab === t.key ? '#fff' : HNH.ink3,
                }}>
                <Icon name={t.icon} size={13} color={tab === t.key ? '#fff' : HNH.ink3} stroke={2} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center" style={{ padding: '60px 0' }}>
              <div style={{
                width: 28, height: 28, border: `3px solid ${HNH.line}`,
                borderTopColor: HNH.navy, borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
              }} />
            </div>
          )}

          {!loading && tab === 'onboarding' && onbData && (
            <OnboardingTab data={onbData} search={search} onSearch={setSearch}
              recruitFilter={recruitFilter} onRecruitFilter={setRecruitFilter} />
          )}

          {!loading && tab === 'offboarding' && offData && (
            <OffboardingTab data={offData} search={search} onSearch={setSearch}
              offFilter={offFilter} onOffFilter={setOffFilter} />
          )}

          {!loading && tab === 'resignation' && resData && (
            <ResignationTab data={resData} isManager={resData.is_manager}
              resView={resView} onResView={setResView}
              search={search} onSearch={setSearch}
              onSubmit={handleResSubmit} submitting={submitting} />
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
