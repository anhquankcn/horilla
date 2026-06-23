import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/layout/TopBar'
import { HNH } from '../lib/theme'
import { useApi } from '../lib/useApi'

interface SyncLog {
  id: number
  started_at: string | null
  finished_at: string | null
  duration_seconds: number | null
  trigger: string
  status: string
  tables: Record<string, number>
  reconciliation: {
    prod_attendance?: number
    stage_attendance?: number
    prod_activity?: number
    stage_activity?: number
    match?: boolean
  }
  message: string
}

interface HealthLog {
  id: number
  check_type: string
  checked_at: string
  status: string
  details: Record<string, unknown>
  message: string
}

const SYNC_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  success: { label: 'Thành công', bg: '#dcfce7', color: '#15803d' },
  partial: { label: 'Một phần', bg: '#fef3c7', color: '#92400e' },
  error: { label: 'Lỗi', bg: '#fff1f2', color: '#be123c' },
  running: { label: 'Đang chạy', bg: '#dbeafe', color: '#2563eb' },
}

const HEALTH_STATUS: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  ok: { label: 'Bình thường', bg: '#dcfce7', color: '#15803d', dot: '#22c55e' },
  warn: { label: 'Cảnh báo', bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
  error: { label: 'Lỗi', bg: '#fff1f2', color: '#be123c', dot: '#ef4444' },
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function StatusBadge({ status, cfg }: { status: string; cfg: typeof SYNC_STATUS }) {
  const s = cfg[status] ?? cfg['running'] ?? { label: status, bg: '#f3f4f6', color: '#374151' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  )
}

function SyncTab() {
  const { data, loading } = useApi<{ results: SyncLog[] }>('/api/base/standby-sync/logs/')
  const logs = data?.results ?? []
  return (
    <div>
      <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 12, lineHeight: 1.5 }}>
        Job tự động lúc <b>05:00</b> và <b>13:00</b> chuyển dữ liệu chấm công + nhân viên + ca
        từ Standby (bản sao Production) sang Stage, rồi đối chiếu số bản ghi.
      </div>
      {loading && <div style={{ fontSize: 13, color: HNH.ink3, textAlign: 'center', padding: 20 }}>Đang tải…</div>}
      {!loading && logs.length === 0 && (
        <div style={{ fontSize: 13, color: HNH.ink3, textAlign: 'center', padding: 20 }}>Chưa có lần đồng bộ nào.</div>
      )}
      {logs.map(l => {
        const r = l.reconciliation || {}
        return (
          <div key={l.id} style={{
            background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10,
            border: `1px solid ${HNH.line}`,
          }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                {fmt(l.started_at)}
                <span style={{ fontSize: 11, fontWeight: 500, color: HNH.ink3, marginLeft: 6 }}>
                  {l.trigger === 'manual' ? 'Thủ công' : 'Theo lịch'}
                  {l.duration_seconds != null ? ` · ${l.duration_seconds}s` : ''}
                </span>
              </div>
              <StatusBadge status={l.status} cfg={SYNC_STATUS} />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: r.match ? '#f0fdf4' : '#fff7ed',
              border: `1px solid ${r.match ? '#bbf7d0' : '#fdba74'}`,
              borderRadius: 10, padding: '8px 10px', fontSize: 12,
            }}>
              <span style={{ fontWeight: 700, color: r.match ? '#15803d' : '#c2410c' }}>
                {r.match ? '✓ Khớp' : '⚠ Lệch'}
              </span>
              <span style={{ color: HNH.ink2 }}>
                Chấm công {r.prod_attendance ?? '?'}→{r.stage_attendance ?? '?'} · Hoạt động {r.prod_activity ?? '?'}→{r.stage_activity ?? '?'}
              </span>
            </div>
            {l.tables && Object.keys(l.tables).length > 0 && (
              <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 6, lineHeight: 1.5 }}>
                {Object.entries(l.tables).map(([t, n]) => `${t.replace(/^.*_/, '')}: ${n}`).join(' · ')}
              </div>
            )}
            {l.message && <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 4, fontStyle: 'italic' }}>{l.message}</div>}
          </div>
        )
      })}
    </div>
  )
}

function ReplicationTab() {
  const { data, loading } = useApi<{ results: HealthLog[] }>('/api/base/system-health/?type=prod_standby')
  const logs = data?.results ?? []
  return (
    <div>
      <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 12, lineHeight: 1.5 }}>
        Kiểm tra mỗi <b>1 giờ</b>: độ trễ replication Prod→Standby và số bản ghi khớp nhau.
      </div>
      {loading && <div style={{ fontSize: 13, color: HNH.ink3, textAlign: 'center', padding: 20 }}>Đang tải…</div>}
      {!loading && logs.length === 0 && (
        <div style={{ fontSize: 13, color: HNH.ink3, textAlign: 'center', padding: 20 }}>Chưa có dữ liệu. Kiểm tra lần đầu sẽ chạy vào đầu giờ tiếp theo.</div>
      )}
      {logs.map(l => {
        const d = l.details as {
          lag_seconds?: number; last_replay?: string; is_standby?: string
          standby_attendance?: number; prod_attendance?: number
          standby_employee?: number; prod_employee?: number
        }
        const hs = HEALTH_STATUS[l.status] ?? HEALTH_STATUS.warn
        const lag = d.lag_seconds ?? null
        return (
          <div key={l.id} style={{
            background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10,
            border: `1px solid ${HNH.line}`,
          }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                {fmt(l.checked_at)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: hs.dot }} />
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: hs.bg, color: hs.color,
                }}>{hs.label}</span>
              </div>
            </div>

            {/* Lag */}
            <div style={{
              display: 'flex', gap: 12, background: '#f8fafc', borderRadius: 10,
              padding: '8px 12px', fontSize: 12, marginBottom: 6,
            }}>
              <div>
                <div style={{ color: HNH.ink3, fontSize: 11 }}>Độ trễ</div>
                <div style={{ fontWeight: 700, color: lag != null && lag > 60 ? '#c2410c' : '#15803d' }}>
                  {lag != null ? `${lag}s` : '—'}
                </div>
              </div>
              <div style={{ width: 1, background: HNH.line }} />
              <div>
                <div style={{ color: HNH.ink3, fontSize: 11 }}>Chấm công (prod/stby)</div>
                <div style={{ fontWeight: 600 }}>
                  {d.prod_attendance ?? '?'} / {d.standby_attendance ?? '?'}
                </div>
              </div>
              <div style={{ width: 1, background: HNH.line }} />
              <div>
                <div style={{ color: HNH.ink3, fontSize: 11 }}>Nhân viên (prod/stby)</div>
                <div style={{ fontWeight: 600 }}>
                  {d.prod_employee ?? '?'} / {d.standby_employee ?? '?'}
                </div>
              </div>
            </div>

            {l.message && <div style={{ fontSize: 11, color: HNH.ink3, fontStyle: 'italic' }}>{l.message}</div>}
          </div>
        )
      })}
    </div>
  )
}

function SsoBackupTab() {
  const { data, loading } = useApi<{ results: HealthLog[] }>('/api/base/system-health/?type=sso_backup')
  const logs = data?.results ?? []
  return (
    <div>
      <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 12, lineHeight: 1.5 }}>
        Kiểm tra mỗi <b>1 giờ</b>: tuổi của bản backup SSO mới nhất và đã sync về Stage chưa.
      </div>
      {loading && <div style={{ fontSize: 13, color: HNH.ink3, textAlign: 'center', padding: 20 }}>Đang tải…</div>}
      {!loading && logs.length === 0 && (
        <div style={{ fontSize: 13, color: HNH.ink3, textAlign: 'center', padding: 20 }}>Chưa có dữ liệu. Kiểm tra lần đầu sẽ chạy vào đầu giờ tiếp theo.</div>
      )}
      {logs.map(l => {
        const d = l.details as {
          stage_latest?: string; prod_latest?: string; stage_count?: number
          backup_age_hours?: number; stage_synced?: boolean
        }
        const hs = HEALTH_STATUS[l.status] ?? HEALTH_STATUS.warn
        const age = d.backup_age_hours ?? null
        return (
          <div key={l.id} style={{
            background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10,
            border: `1px solid ${HNH.line}`,
          }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                {fmt(l.checked_at)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: hs.dot }} />
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: hs.bg, color: hs.color,
                }}>{hs.label}</span>
              </div>
            </div>

            <div style={{
              display: 'flex', gap: 12, background: '#f8fafc', borderRadius: 10,
              padding: '8px 12px', fontSize: 12, marginBottom: 6, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ color: HNH.ink3, fontSize: 11 }}>Tuổi backup</div>
                <div style={{ fontWeight: 700, color: age != null && age > 26 ? '#c2410c' : '#15803d' }}>
                  {age != null ? `${age}h` : '—'}
                </div>
              </div>
              <div style={{ width: 1, background: HNH.line }} />
              <div>
                <div style={{ color: HNH.ink3, fontSize: 11 }}>Đã sync Stage</div>
                <div style={{ fontWeight: 700, color: d.stage_synced ? '#15803d' : '#c2410c' }}>
                  {d.stage_synced ? '✓ Có' : '✗ Chưa'}
                </div>
              </div>
              <div style={{ width: 1, background: HNH.line }} />
              <div>
                <div style={{ color: HNH.ink3, fontSize: 11 }}>Bản sao trên Stage</div>
                <div style={{ fontWeight: 600 }}>{d.stage_count ?? '?'}</div>
              </div>
            </div>

            {d.stage_latest && (
              <div style={{ fontSize: 11, color: HNH.ink3, marginBottom: 2 }}>
                Stage mới nhất: <b>{d.stage_latest}</b>
                {d.prod_latest && d.prod_latest !== 'SSH_ERROR' && ` · Prod: ${d.prod_latest}`}
              </div>
            )}
            {l.message && <div style={{ fontSize: 11, color: HNH.ink3, fontStyle: 'italic' }}>{l.message}</div>}
          </div>
        )
      })}
    </div>
  )
}

const TABS = [
  { key: 'sync', label: 'Đồng bộ DB' },
  { key: 'replication', label: 'Prod↔Standby' },
  { key: 'sso', label: 'Backup SSO' },
]

export function DbSyncPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'sync' | 'replication' | 'sso'>('sync')

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Đồng bộ & Giám sát Hệ thống" onBack={() => navigate('/apps')} />

      {/* Tab bar */}
      <div style={{
        display: 'flex', background: '#fff', borderBottom: `1px solid ${HNH.line}`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)} style={{
            flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
            color: tab === t.key ? HNH.red : HNH.ink3,
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.key ? `2px solid ${HNH.red}` : '2px solid transparent',
            transition: 'color 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: '12px 16px 100px' }}>
        {tab === 'sync' && <SyncTab />}
        {tab === 'replication' && <ReplicationTab />}
        {tab === 'sso' && <SsoBackupTab />}
      </div>
    </div>
  )
}
