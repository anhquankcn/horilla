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

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  success: { label: 'Thành công', bg: '#dcfce7', color: '#15803d' },
  partial: { label: 'Một phần', bg: '#fef3c7', color: '#92400e' },
  error: { label: 'Lỗi', bg: '#fff1f2', color: '#be123c' },
  running: { label: 'Đang chạy', bg: '#dbeafe', color: '#2563eb' },
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function DbSyncPage() {
  const navigate = useNavigate()
  const { data, loading } = useApi<{ results: SyncLog[] }>('/api/base/standby-sync/logs/')
  const logs = data?.results ?? []

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Đồng bộ DB (Standby → Stage)" onBack={() => navigate('/apps')} />
      <div style={{ padding: '12px 16px 100px' }}>
        <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 12, lineHeight: 1.5 }}>
          Job tự động lúc <b>05:00</b> và <b>13:00</b> chuyển dữ liệu chấm công + nhân viên + ca
          từ Standby (bản sao Production) sang Stage, rồi đối chiếu số bản ghi.
        </div>

        {loading && <div style={{ fontSize: 13, color: HNH.ink3, textAlign: 'center', padding: 20 }}>Đang tải…</div>}
        {!loading && logs.length === 0 && (
          <div style={{ fontSize: 13, color: HNH.ink3, textAlign: 'center', padding: 20 }}>Chưa có lần đồng bộ nào.</div>
        )}

        {logs.map(l => {
          const st = STATUS_CFG[l.status] ?? STATUS_CFG.running
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
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: st.bg, color: st.color,
                }}>{st.label}</span>
              </div>

              {/* Đối chiếu */}
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
    </div>
  )
}
