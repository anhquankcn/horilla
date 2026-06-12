import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { api, apiFetch } from '../lib/api'

/* ── Types ── */
interface DocRow {
  id: number
  title: string
  request_title: string | null
  format: string
  max_size_mb: number | null
  description: string | null
  status: 'requested' | 'approved' | 'rejected'
  has_file: boolean
  file_url: string | null
  file_name: string | null
  issue_date: string | null
  expiry_date: string | null
  reject_reason: string | null
  created_at: string | null
}

interface ManageEmployee {
  doc_id: number
  emp_id: number
  name: string
  badge_id: string
  department: string | null
  status: string
  has_file: boolean
  file_name: string | null
}

interface ManageRow {
  id: number
  title: string
  format: string
  max_size_mb: number | null
  description: string | null
  total: number
  uploaded: number
  approved: number
  pending: number
  rejected: number
  employees: ManageEmployee[]
}

interface Department { id: number; name: string }

interface MyData {
  view: 'my'
  is_manager: boolean
  summary: { total: number; uploaded: number; approved: number; pending: number; rejected: number }
  rows: DocRow[]
}

interface ManageData {
  view: 'manage'
  is_manager: boolean
  summary: { total: number; uploaded: number; approved: number; pending: number; rejected: number; requests: number }
  departments: Department[]
  rows: ManageRow[]
}

type ViewMode = 'my' | 'manage'

/* ── Helpers ── */
const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  requested: { label: 'Chờ duyệt', bg: HNH.warn50, color: HNH.warn },
  approved: { label: 'Đã duyệt', bg: HNH.success50, color: HNH.success },
  rejected: { label: 'Từ chối', bg: HNH.red50, color: HNH.red },
}

const FORMAT_LABELS: Record<string, string> = {
  any: 'Mọi định dạng', pdf: 'PDF', txt: 'TXT', docx: 'DOCX',
  xlsx: 'XLSX', jpg: 'JPG', png: 'PNG', jpeg: 'JPEG',
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || STATUS_MAP.requested
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

/* ── My Document Card ── */
function DocCard({ doc, onUpload }: { doc: DocRow; onUpload: (id: number, file: File) => void }) {
  const [expanded, setExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const accept = doc.format === 'any' ? undefined : `.${doc.format}`

  return (
    <div style={{
      background: '#fff', borderRadius: 18,
      border: `1.5px solid ${doc.status === 'rejected' ? HNH.red : HNH.line}`,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 border-none cursor-pointer text-left"
        style={{ padding: '14px 16px', background: 'transparent' }}
      >
        <div className="flex items-center justify-center shrink-0" style={{
          width: 38, height: 38, borderRadius: 12,
          background: doc.has_file ? HNH.success50 : HNH.navy50,
        }}>
          <Icon name={doc.has_file ? 'check' : 'doc'} size={18}
            color={doc.has_file ? HNH.success : HNH.navy} stroke={2} />
        </div>

        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }} className="truncate">
            {doc.request_title || doc.title}
          </div>
          <div className="flex items-center gap-2" style={{ marginTop: 3 }}>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>
              {FORMAT_LABELS[doc.format] || doc.format.toUpperCase()}
            </span>
            {doc.max_size_mb && (
              <span style={{ fontSize: 11, color: HNH.ink3 }}>• Max {doc.max_size_mb}MB</span>
            )}
          </div>
        </div>

        <StatusBadge status={doc.status} />
        <Icon name={expanded ? 'up' : 'down'} size={16} color={HNH.ink3} stroke={2} />
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${HNH.line}` }}>
          {doc.description && (
            <p style={{ fontSize: 12, color: HNH.ink2, margin: '12px 0 0', lineHeight: 1.5 }}>
              {doc.description}
            </p>
          )}

          {doc.has_file && (
            <div className="flex items-center gap-2" style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 12,
              background: HNH.success50,
            }}>
              <Icon name="doc" size={14} color={HNH.success} stroke={2} />
              <span style={{ fontSize: 12, fontWeight: 600, color: HNH.success, flex: 1 }} className="truncate">
                {doc.file_name}
              </span>
              {doc.file_url && (
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, fontWeight: 700, color: HNH.navy, textDecoration: 'none' }}>
                  Xem
                </a>
              )}
            </div>
          )}

          {doc.reject_reason && (
            <div style={{
              marginTop: 10, padding: '10px 12px', borderRadius: 12,
              background: HNH.red50,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HNH.red, marginBottom: 3 }}>
                Lý do từ chối:
              </div>
              <div style={{ fontSize: 12, color: HNH.ink2 }}>{doc.reject_reason}</div>
            </div>
          )}

          {(doc.issue_date || doc.expiry_date) && (
            <div className="flex gap-4" style={{ marginTop: 10 }}>
              {doc.issue_date && (
                <div>
                  <span style={{ fontSize: 11, color: HNH.ink3 }}>Ngày cấp: </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: HNH.ink }}>{doc.issue_date}</span>
                </div>
              )}
              {doc.expiry_date && (
                <div>
                  <span style={{ fontSize: 11, color: HNH.ink3 }}>Hết hạn: </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: HNH.ink }}>{doc.expiry_date}</span>
                </div>
              )}
            </div>
          )}

          {doc.status !== 'approved' && (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 border-none cursor-pointer"
              style={{
                marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 12,
                background: `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
                color: '#fff', fontSize: 13, fontWeight: 700,
              }}
            >
              <Icon name="up" size={14} color="#fff" stroke={2.5} />
              {doc.has_file ? 'Tải lại' : 'Tải lên'}
            </button>
          )}
          <input ref={fileRef} type="file" accept={accept} style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onUpload(doc.id, f)
              e.target.value = ''
            }} />
        </div>
      )}
    </div>
  )
}

/* ── Manage: Request Card ── */
function RequestCard({ row }: { row: ManageRow }) {
  const [expanded, setExpanded] = useState(false)
  const pct = row.total > 0 ? Math.round(row.uploaded / row.total * 100) : 0

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1.5px solid ${HNH.line}`, overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 border-none cursor-pointer text-left"
        style={{ padding: '14px 16px', background: 'transparent' }}
      >
        <div className="flex items-center justify-center shrink-0" style={{
          width: 38, height: 38, borderRadius: 12, background: HNH.navy50,
        }}>
          <Icon name="folder" size={18} color={HNH.navy} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }} className="truncate">
            {row.title}
          </div>
          <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>
              {row.uploaded}/{row.total} đã nộp
            </span>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>
              • {FORMAT_LABELS[row.format] || row.format.toUpperCase()}
            </span>
          </div>
        </div>
        <div style={{
          fontSize: 14, fontWeight: 800,
          color: pct === 100 ? HNH.success : pct >= 50 ? HNH.warn : HNH.red,
        }}>
          {pct}%
        </div>
        <Icon name={expanded ? 'up' : 'down'} size={16} color={HNH.ink3} stroke={2} />
      </button>

      {/* Progress bar */}
      <div style={{ padding: '0 16px', marginTop: -6, marginBottom: 10 }}>
        <div style={{ height: 5, borderRadius: 3, background: HNH.cream2 }}>
          <div style={{
            height: '100%', borderRadius: 3, width: `${pct}%`,
            background: pct === 100
              ? `linear-gradient(90deg, ${HNH.success}, #34d399)`
              : `linear-gradient(90deg, ${HNH.navy}, ${HNH.navy2})`,
            transition: 'width .3s',
          }} />
        </div>
      </div>

      {/* Mini stat chips */}
      <div className="flex gap-2" style={{ padding: '0 16px 12px', flexWrap: 'wrap' }}>
        {[
          { label: 'Đã duyệt', n: row.approved, bg: HNH.success50, color: HNH.success },
          { label: 'Chờ duyệt', n: row.pending, bg: HNH.warn50, color: HNH.warn },
          { label: 'Từ chối', n: row.rejected, bg: HNH.red50, color: HNH.red },
        ].filter(c => c.n > 0).map(c => (
          <span key={c.label} style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: c.bg, color: c.color,
          }}>
            {c.label}: {c.n}
          </span>
        ))}
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${HNH.line}` }}>
          {row.description && (
            <p style={{ fontSize: 12, color: HNH.ink2, margin: 0, padding: '12px 16px 0', lineHeight: 1.5 }}>
              {row.description}
            </p>
          )}
          <div style={{ padding: '8px 16px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>
              Danh sách nhân viên ({row.employees.length})
            </div>
            <div className="flex flex-col gap-2">
              {row.employees.map(e => (
                <div key={e.doc_id} className="flex items-center gap-3" style={{
                  padding: '10px 12px', borderRadius: 12,
                  background: e.has_file ? HNH.success50 : HNH.cream,
                  border: `1px solid ${e.has_file ? 'transparent' : HNH.line}`,
                }}>
                  <div className="flex items-center justify-center shrink-0" style={{
                    width: 30, height: 30, borderRadius: 10,
                    background: e.has_file ? HNH.success : HNH.cream2,
                  }}>
                    <Icon name={e.has_file ? 'check' : 'user'} size={14}
                      color={e.has_file ? '#fff' : HNH.ink3} stroke={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }} className="truncate">
                      {e.name}
                    </div>
                    <div style={{ fontSize: 11, color: HNH.ink3 }}>
                      {e.badge_id}{e.department ? ` • ${e.department}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main Page ── */
export function DocumentsPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<ViewMode>('my')
  const [isManager, setIsManager] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [uploading, setUploading] = useState<number | null>(null)

  const [myData, setMyData] = useState<MyData | null>(null)
  const [manageData, setManageData] = useState<ManageData | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ view, search })
      if (view === 'manage') {
        if (deptFilter) params.set('department', deptFilter)
        if (statusFilter) params.set('status', statusFilter)
      }
      const res = await api.get<MyData | ManageData>(`/api/employee/documents-pwa/?${params}`)
      if (res.view === 'my') {
        setMyData(res as MyData)
        setIsManager((res as MyData).is_manager || false)
      } else {
        setManageData(res as ManageData)
        setIsManager(true)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [view, search, deptFilter, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleUpload = async (docId: number, file: File) => {
    setUploading(docId)
    try {
      const fd = new FormData()
      fd.append('doc_id', String(docId))
      fd.append('file', file)
      await apiFetch('/api/employee/documents-pwa/', {
        method: 'POST',
        body: fd,
      })
      await fetchData()
    } catch { /* ignore */ }
    setUploading(null)
  }

  const summary = view === 'my' ? myData?.summary : manageData?.summary
  const departments = manageData?.departments || []

  return (
    <div className="flex flex-col h-full" style={{ background: HNH.cream }}>
      <TopBar onBack={() => navigate(-1)} title="Tài liệu / Giấy tờ" />

      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: '0 16px 100px' }}>

          {/* View toggle */}
          {isManager && (
            <div className="flex gap-2" style={{ marginTop: 14, marginBottom: 6 }}>
              {(['my', 'manage'] as ViewMode[]).map(v => (
                <button key={v}
                  onClick={() => { setView(v); setSearch(''); setDeptFilter(''); setStatusFilter('') }}
                  className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
                  style={{
                    padding: '10px 0', borderRadius: 14, fontSize: 13, fontWeight: 700,
                    background: view === v ? HNH.navy : '#fff',
                    color: view === v ? '#fff' : HNH.ink2,
                    border: `1.5px solid ${view === v ? HNH.navy : HNH.line}`,
                  }}>
                  <Icon name={v === 'my' ? 'user' : 'users'} size={14}
                    color={view === v ? '#fff' : HNH.ink3} stroke={2} />
                  {v === 'my' ? 'Của tôi' : 'Quản lý'}
                </button>
              ))}
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div className="grid grid-cols-3 gap-2" style={{ marginTop: 12 }}>
              {[
                { label: 'Tổng', value: summary.total, bg: HNH.navy50, color: HNH.navy },
                { label: 'Đã nộp', value: summary.uploaded, bg: HNH.success50, color: HNH.success },
                { label: 'Đã duyệt', value: summary.approved, bg: '#e8f5e9', color: '#2e7d32' },
                { label: 'Chờ duyệt', value: summary.pending, bg: HNH.warn50, color: HNH.warn },
                { label: 'Từ chối', value: summary.rejected, bg: HNH.red50, color: HNH.red },
                ...(view === 'manage' && manageData
                  ? [{ label: 'Yêu cầu', value: (manageData.summary as ManageData['summary']).requests, bg: '#ede7f6', color: '#5e35b1' }]
                  : [{ label: 'Thiếu', value: summary.total - summary.uploaded, bg: HNH.cream2, color: HNH.ink3 }]),
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
          )}

          {/* Search */}
          <div className="relative" style={{ marginTop: 14 }}>
            <div style={{ position: 'absolute', left: 14, top: 12, pointerEvents: 'none' }}>
              <Icon name="search" size={16} color={HNH.ink3} stroke={2} />
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm tài liệu..."
              style={{
                width: '100%', padding: '10px 14px 10px 38px', borderRadius: 14,
                border: `1.5px solid ${HNH.line}`, fontSize: 13, background: '#fff',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Manage filters */}
          {view === 'manage' && (
            <div style={{ marginTop: 10 }}>
              {/* Department chips */}
              {departments.length > 0 && (
                <div className="flex gap-2 overflow-x-auto" style={{ paddingBottom: 6 }}>
                  <button
                    onClick={() => setDeptFilter('')}
                    className="border-none cursor-pointer shrink-0"
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      background: !deptFilter ? HNH.navy : '#fff',
                      color: !deptFilter ? '#fff' : HNH.ink2,
                      border: `1.5px solid ${!deptFilter ? HNH.navy : HNH.line}`,
                    }}>
                    Tất cả
                  </button>
                  {departments.map(d => (
                    <button key={d.id}
                      onClick={() => setDeptFilter(String(d.id))}
                      className="border-none cursor-pointer shrink-0"
                      style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                        background: deptFilter === String(d.id) ? HNH.navy : '#fff',
                        color: deptFilter === String(d.id) ? '#fff' : HNH.ink2,
                        border: `1.5px solid ${deptFilter === String(d.id) ? HNH.navy : HNH.line}`,
                      }}>
                      {d.name}
                    </button>
                  ))}
                </div>
              )}
              {/* Status chips */}
              <div className="flex gap-2 overflow-x-auto" style={{ marginTop: 6 }}>
                {[
                  { val: '', label: 'Tất cả' },
                  { val: 'missing', label: 'Chưa nộp' },
                  { val: 'uploaded', label: 'Đã nộp' },
                  { val: 'approved', label: 'Đã duyệt' },
                  { val: 'rejected', label: 'Từ chối' },
                ].map(c => (
                  <button key={c.val}
                    onClick={() => setStatusFilter(c.val)}
                    className="border-none cursor-pointer shrink-0"
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      background: statusFilter === c.val ? HNH.red : '#fff',
                      color: statusFilter === c.val ? '#fff' : HNH.ink2,
                      border: `1.5px solid ${statusFilter === c.val ? HNH.red : HNH.line}`,
                    }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

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

          {/* My docs */}
          {!loading && view === 'my' && myData && (
            <div className="flex flex-col gap-3" style={{ marginTop: 14 }}>
              {myData.rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center" style={{ padding: '50px 0' }}>
                  <Icon name="doc" size={40} color={HNH.ink3} stroke={1.5} />
                  <div style={{ fontSize: 14, color: HNH.ink3, marginTop: 12 }}>
                    Không có tài liệu nào được yêu cầu
                  </div>
                </div>
              ) : (
                myData.rows.map(doc => (
                  <div key={doc.id} style={{ position: 'relative' }}>
                    <DocCard doc={doc} onUpload={handleUpload} />
                    {uploading === doc.id && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{
                        background: 'rgba(255,255,255,0.7)', borderRadius: 18,
                      }}>
                        <div style={{
                          width: 24, height: 24, border: `3px solid ${HNH.line}`,
                          borderTopColor: HNH.navy, borderRadius: '50%',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Manage view */}
          {!loading && view === 'manage' && manageData && (
            <div className="flex flex-col gap-3" style={{ marginTop: 14 }}>
              {manageData.rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center" style={{ padding: '50px 0' }}>
                  <Icon name="folder" size={40} color={HNH.ink3} stroke={1.5} />
                  <div style={{ fontSize: 14, color: HNH.ink3, marginTop: 12 }}>
                    Không có yêu cầu tài liệu nào
                  </div>
                </div>
              ) : (
                manageData.rows.map(row => (
                  <RequestCard key={row.id} row={row} />
                ))
              )}
            </div>
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
