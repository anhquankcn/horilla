import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { EmployeeSearchSelect, type EmpEntry } from '../components/ui/EmployeeSearchSelect'
import { useApi } from '../lib/useApi'
import { api } from '../lib/api'

// ── App Feature "Chấm công chưa khớp" (C&B) — trước đây các User ID trên máy
//    chấm công vân tay không map được sang badge_id phải sửa tay file
//    badge_map.json trên máy gateway (qua SSH). Giờ Horilla là nguồn map DUY
//    NHẤT: lượt chấm chưa khớp được lưu tạm (BiometricPendingPunch), C&B chọn
//    đúng nhân viên ở đây — hệ thống tự tạo lại các lượt chấm còn tồn đọng và
//    nhớ map cho lần sau.

interface PendingRow {
  device_sn: string
  device_user_id: string
  count: number
  first_seen: string
  last_seen: string
}
interface CandidateMeta {
  results: EmpEntry[]
}

function fmtDT(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function PendingCard({ row, employees, onDone }: {
  row: PendingRow
  employees: EmpEntry[]
  onDone: (msg: string) => void
}) {
  const [empId, setEmpId] = useState<number | null>(null)
  const [busy, setBusy] = useState<'map' | 'ignore' | null>(null)

  const submit = async (ignore: boolean) => {
    if (!ignore && !empId) return
    setBusy(ignore ? 'ignore' : 'map')
    try {
      const r = await api.post<{ created: number; skipped_dup: number; pending_processed: number }>(
        '/api/attendance/biometric-pending/map/',
        { device_sn: row.device_sn, device_user_id: row.device_user_id, employee_id: empId, ignore }
      )
      onDone(
        ignore
          ? `Đã bỏ qua ID ${row.device_user_id}`
          : `Đã map ID ${row.device_user_id} — tạo ${r.created} lượt, trùng ${r.skipped_dup} lượt (${r.pending_processed} lượt tồn đọng)`
      )
    } catch {
      onDone(`Lỗi xử lý ID ${row.device_user_id}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${HNH.line}`, padding: 12, marginBottom: 8 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: HNH.ink }}>User ID {row.device_user_id}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: HNH.warn, background: HNH.warn50, borderRadius: 7, padding: '2px 8px' }}>
          {row.count} lượt tồn đọng
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: HNH.ink3, marginBottom: 10 }}>
        Máy {row.device_sn} · Sớm nhất {fmtDT(row.first_seen)} · Muộn nhất {fmtDT(row.last_seen)}
      </div>
      <EmployeeSearchSelect
        employees={employees}
        value={empId}
        onChange={setEmpId}
        placeholder="Chọn nhân viên đúng cho ID này..."
      />
      <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
        <button onClick={() => submit(false)} disabled={!empId || busy !== null}
          className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
          style={{ height: 38, borderRadius: 10, background: !empId ? HNH.ink4 : HNH.success, color: '#fff', fontWeight: 700, fontSize: 13 }}>
          <Icon name="check" size={15} color="#fff" stroke={2.4} />
          {busy === 'map' ? 'Đang xử lý...' : 'Map & tạo lượt chấm'}
        </button>
        <button onClick={() => submit(true)} disabled={busy !== null}
          className="border-none cursor-pointer" style={{ height: 38, padding: '0 14px', borderRadius: 10, background: HNH.cream2, color: HNH.ink3, fontWeight: 700, fontSize: 13 }}>
          {busy === 'ignore' ? '...' : 'Bỏ qua'}
        </button>
      </div>
    </div>
  )
}

export function BiometricPendingPage() {
  const navigate = useNavigate()
  const { data, loading, refresh } = useApi<{ results: PendingRow[] }>('/api/attendance/biometric-pending/')
  const { data: meta } = useApi<CandidateMeta>('/api/leave/select-candidates/')
  const [toast, setToast] = useState('')

  const rows = data?.results ?? []
  const employees = meta?.results ?? []

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }
  const handleDone = (msg: string) => { showToast(msg); refresh() }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Chấm công chưa khớp" sub="C&B · Máy chấm công vân tay" onBack={() => navigate('/apps')} />

      <div style={{ padding: '12px 16px 100px' }}>
        <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 12, lineHeight: 1.5 }}>
          User ID trên máy chấm công vân tay chưa gán được nhân viên nào. Chọn đúng
          nhân viên rồi bấm <b>Map & tạo lượt chấm</b> — hệ thống tự tạo lại các lượt
          chấm đang tồn đọng và nhớ luôn, lần sau ID này tự khớp không cần làm lại.
          <b> Bỏ qua</b> dùng cho ID rác (vân tay test, không phải nhân viên thật).
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải…</div>}
        {!loading && rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
            Không có lượt chấm nào đang chờ map. 🎉
          </div>
        )}
        {rows.map(r => (
          <PendingCard key={`${r.device_sn}:${r.device_user_id}`} row={r} employees={employees} onDone={handleDone} />
        ))}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: HNH.ink, color: '#fff', padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, zIndex: 60, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', maxWidth: '90%', textAlign: 'center' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
