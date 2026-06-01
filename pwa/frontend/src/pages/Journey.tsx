import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { HNH } from '../lib/theme'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { Icon } from '../components/ui/Icon'

interface EmpRow {
  id: number | string
  name: string
  badge_id: string | null
  department: string | null
  position: string | null
  company: string | null
  avatar: string | null
  joining_date: string | null
  stage?: string | null
  is_candidate?: boolean
  trial_days?: number
  days_elapsed?: number
  trial_pct?: number
  off_type?: string
  progress?: string
  has_objectives?: boolean
}

interface Phase {
  id: string
  title: string
  icon: string
  color: string
  count: number
  employees: EmpRow[]
}

interface JourneyData {
  phases: Phase[]
  my_phase: string | null
  total_employees: number
  can_view: boolean
}

const PHASE_META: Record<string, { bg: string; emoji: string }> = {
  rec:    { bg: '#e0f2fe', emoji: '🔍' },
  onb:    { bg: '#f3e8ff', emoji: '🚀' },
  prob:   { bg: '#fef3c7', emoji: '⏱️' },
  active: { bg: '#d1fae5', emoji: '💼' },
  perf:   { bg: '#fce7f3', emoji: '📊' },
  growth: { bg: '#ede9fe', emoji: '🌟' },
  off:    { bg: '#fee2e2', emoji: '👋' },
}

export function JourneyPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<JourneyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const phaseBarRef = useRef<HTMLDivElement>(null)

  const fetch_ = useCallback(async () => {
    try {
      const d = await apiFetch<JourneyData>('/api/employee/employee-journey/')
      setData(d)
      if (!selectedPhase && d.my_phase) {
        setSelectedPhase(d.my_phase)
      } else if (!selectedPhase && d.phases.length) {
        const first = d.phases.find(p => p.count > 0) || d.phases[0]
        setSelectedPhase(first.id)
      }
    } finally {
      setLoading(false)
    }
  }, [selectedPhase])

  useEffect(() => { fetch_() }, [])

  const phases = data?.phases || []
  const active = phases.find(p => p.id === selectedPhase)
  const employees = active?.employees || []
  const filtered = search
    ? employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.badge_id && e.badge_id.toLowerCase().includes(search.toLowerCase())) ||
        (e.department && e.department.toLowerCase().includes(search.toLowerCase()))
      )
    : employees

  const totalCount = phases.reduce((s, p) => s + p.count, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: HNH.cream }}>
      <TopBar title="Hành trình Nhân viên" onBack={() => navigate(-1)} />

      <PullToRefresh onRefresh={fetch_}>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 0 100px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3 }}>Đang tải...</div>
          ) : !data?.can_view ? (
            <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3 }}>
              Bạn không có quyền xem hành trình nhân viên.
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div style={{ padding: '16px 16px 0' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
                }}>
                  <StatBox label="Tổng NV" value={totalCount} color={HNH.navy} />
                  <StatBox
                    label="Đang làm việc"
                    value={phases.find(p => p.id === 'active')?.count || 0}
                    color={HNH.success}
                  />
                  <StatBox
                    label="Offboarding"
                    value={phases.find(p => p.id === 'off')?.count || 0}
                    color={HNH.red}
                  />
                </div>
              </div>

              {/* Phase journey bar */}
              <div style={{ padding: '16px 0 0' }}>
                <div style={{ padding: '0 16px 8px', fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                  Giai đoạn vòng đời
                </div>
                <div
                  ref={phaseBarRef}
                  style={{
                    display: 'flex', gap: 0, overflowX: 'auto', padding: '0 16px 12px',
                    scrollbarWidth: 'none',
                  }}
                >
                  {phases.map((p, i) => {
                    const meta = PHASE_META[p.id] || { bg: '#f3f4f6', emoji: '📋' }
                    const sel = selectedPhase === p.id
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                        <button
                          onClick={() => setSelectedPhase(p.id)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            minWidth: 72, padding: '10px 6px 8px',
                            background: sel ? p.color : meta.bg,
                            border: sel ? `2px solid ${p.color}` : '2px solid transparent',
                            borderRadius: 14,
                            cursor: 'pointer',
                            transition: 'all .2s',
                            position: 'relative',
                          }}
                        >
                          <span style={{ fontSize: 22 }}>{meta.emoji}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, marginTop: 4,
                            color: sel ? '#fff' : p.color,
                            lineHeight: 1.2, textAlign: 'center',
                          }}>
                            {p.title}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 800, marginTop: 3,
                            color: sel ? '#fff' : HNH.ink,
                            background: sel ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                            borderRadius: 8, padding: '1px 8px',
                          }}>
                            {p.count}
                          </span>
                          {data?.my_phase === p.id && (
                            <div style={{
                              position: 'absolute', top: -4, right: -4,
                              width: 10, height: 10, borderRadius: '50%',
                              background: HNH.gold, border: '2px solid #fff',
                            }} />
                          )}
                        </button>
                        {i < phases.length - 1 && (
                          <div style={{
                            width: 16, height: 2, background: HNH.line2,
                            flexShrink: 0,
                          }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Journey flow visual */}
              <div style={{
                margin: '0 16px 12px', padding: 14, borderRadius: 14,
                background: '#fff', border: `1px solid ${HNH.line}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ color: HNH.navy }}><Icon name="layers" size={16} color={HNH.navy} /></div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: HNH.ink }}>Luồng vòng đời</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                  {phases.map((p, i) => {
                    const sel = selectedPhase === p.id
                    const meta = PHASE_META[p.id] || { emoji: '📋' }
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                        <span
                          onClick={() => setSelectedPhase(p.id)}
                          style={{
                            fontSize: 11, fontWeight: sel ? 800 : 600,
                            color: sel ? '#fff' : p.color,
                            background: sel ? p.color : meta.bg + '80',
                            padding: '3px 8px', borderRadius: 8,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          {meta.emoji} {p.title}
                        </span>
                        {i < phases.length - 1 && (
                          <span style={{ fontSize: 10, color: HNH.ink4, margin: '0 2px' }}>→</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Selected phase header + search */}
              {active && (
                <div style={{ padding: '0 16px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: active.color, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name={active.icon} size={18} color="#fff" />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink }}>{active.title}</div>
                      <div style={{ fontSize: 12, color: HNH.ink3 }}>
                        {active.count} {active.count === 1 ? 'người' : 'người'}
                      </div>
                    </div>
                  </div>

                  {active.count > 3 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: '#fff', borderRadius: 10, padding: '8px 12px',
                      border: `1px solid ${HNH.line}`, marginBottom: 12,
                    }}>
                      <Icon name="search" size={16} color={HNH.ink3} />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Tìm nhân viên..."
                        style={{
                          border: 'none', outline: 'none', flex: 1, fontSize: 13,
                          background: 'transparent', color: HNH.ink,
                        }}
                      />
                      {search && (
                        <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                          <Icon name="x" size={14} color={HNH.ink3} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Employee cards */}
                  {filtered.length === 0 ? (
                    <div style={{
                      textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13,
                    }}>
                      {search ? 'Không tìm thấy kết quả' : 'Chưa có nhân viên trong giai đoạn này'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {filtered.map(emp => (
                        <EmployeeCard
                          key={String(emp.id)}
                          emp={emp}
                          phaseId={active.id}
                          phaseColor={active.color}
                          onTap={() => {
                            if (!emp.is_candidate && typeof emp.id === 'number') {
                              navigate(`/employees/${emp.id}`)
                            }
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </PullToRefresh>

      {/* AI Assistant FAB */}
      <a
        href="https://arkon.hnhtravel.work"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed', bottom: 80, right: 16,
          width: 52, height: 52, borderRadius: '50%',
          background: `linear-gradient(135deg, ${HNH.navy}, ${HNH.navy2})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(20,43,111,0.35)',
          textDecoration: 'none', zIndex: 50,
        }}
      >
        <Icon name="bot" size={24} color="#fff" />
      </a>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '12px 10px',
      border: `1px solid ${HNH.line}`, textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function EmployeeCard({
  emp, phaseId, phaseColor, onTap,
}: {
  emp: EmpRow; phaseId: string; phaseColor: string; onTap: () => void
}) {
  const initials = emp.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#fff', borderRadius: 12, padding: 12,
        border: `1px solid ${HNH.line}`, cursor: emp.is_candidate ? 'default' : 'pointer',
      }}
    >
      {emp.avatar ? (
        <img
          src={emp.avatar}
          alt={emp.name}
          style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: phaseColor + '18', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: phaseColor,
        }}>
          {initials}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: HNH.ink,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {emp.name}
          {emp.is_candidate && (
            <span style={{
              fontSize: 9, fontWeight: 600, color: '#7c3aed',
              background: '#f3e8ff', padding: '1px 6px', borderRadius: 6,
              marginLeft: 6,
            }}>
              Ứng viên
            </span>
          )}
        </div>
        <div style={{
          fontSize: 11, color: HNH.ink3, marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {emp.badge_id && <span>{emp.badge_id} · </span>}
          {emp.department || emp.position || 'N/A'}
        </div>

        {/* Phase-specific info */}
        {phaseId === 'prob' && emp.trial_pct !== undefined && (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                flex: 1, height: 5, borderRadius: 3, background: HNH.line,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  background: emp.trial_pct >= 100 ? HNH.red : '#d97706',
                  width: `${Math.min(100, emp.trial_pct)}%`,
                  transition: 'width .3s',
                }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706' }}>
                {emp.days_elapsed}/{emp.trial_days}d
              </span>
            </div>
          </div>
        )}

        {phaseId === 'onb' && emp.progress && (
          <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600, marginTop: 3 }}>
            Tasks: {emp.progress}
          </div>
        )}

        {phaseId === 'off' && emp.off_type && (
          <span style={{
            fontSize: 9, fontWeight: 600, marginTop: 3, display: 'inline-block',
            color: emp.off_type === 'resignation' ? HNH.warn : HNH.red,
            background: emp.off_type === 'resignation' ? HNH.warn50 : HNH.red50,
            padding: '1px 6px', borderRadius: 6,
          }}>
            {emp.off_type === 'resignation' ? 'Đơn nghỉ việc' : emp.stage || 'Offboarding'}
          </span>
        )}

        {emp.stage && phaseId === 'rec' && (
          <span style={{
            fontSize: 9, fontWeight: 600, marginTop: 3, display: 'inline-block',
            color: '#0284c7', background: '#e0f2fe',
            padding: '1px 6px', borderRadius: 6,
          }}>
            {emp.stage}
          </span>
        )}
      </div>

      {!emp.is_candidate && (
        <div style={{ color: HNH.ink4, flexShrink: 0 }}>
          <Icon name="chev-r" size={16} color={HNH.ink4} />
        </div>
      )}
    </div>
  )
}
