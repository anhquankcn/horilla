import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewRow {
  row: number
  badge_id: string
  name: string
  annual_before: number
  annual_after: number
  bu_before: number
  bu_after: number
  carry_before: number
  carry_after: number
  changed: boolean
}

interface ImportResult {
  dry_run: boolean
  rows_processed: number
  updated: number
  skipped: number
  errors: { row: number; badge_id: string; message: string }[]
  preview: PreviewRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n === 0 ? '0' : n % 1 === 0 ? String(n) : n.toFixed(2)
}

function DiffCell({ before, after }: { before: number; after: number }) {
  const changed = before !== after
  return (
    <span style={{ color: changed ? HNH.red : HNH.ink3, fontWeight: changed ? 700 : 400 }}>
      {changed ? `${fmt(before)}→${fmt(after)}` : fmt(after)}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Step = 'select' | 'preview' | 'done'

export function LeaveImportPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [step, setStep] = useState<Step>('select')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [filterChanged, setFilterChanged] = useState(false)

  async function downloadTemplate() {
    setDownloadingTemplate(true)
    try {
      const resp = await fetch(`/api/leave/hnh-leave-import/template/?year=${year}`, { credentials: 'include' })
      if (!resp.ok) throw new Error('Lỗi tải file')
      const blob = await resp.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `MauNhapPhep_${year}.xlsx`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      setError('Không thể tải file mẫu. Vui lòng thử lại.')
    } finally {
      setDownloadingTemplate(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError(null)
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', f)
      const resp = await fetch('/api/leave/hnh-leave-import/?dry_run=true', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const data: ImportResult = await resp.json()
      if (!resp.ok) {
        setError((data as any).detail || 'Lỗi xử lý file')
        return
      }
      setResult(data)
      setStep('preview')
    } catch {
      setError('Không thể đọc file. Đảm bảo file đúng định dạng .xlsx từ mẫu.')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const resp = await fetch('/api/leave/hnh-leave-import/', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const data: ImportResult = await resp.json()
      if (!resp.ok) {
        setError((data as any).detail || 'Lỗi nhập dữ liệu')
        return
      }
      setResult(data)
      setStep('done')
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  function resetFlow() {
    setStep('select')
    setFile(null)
    setResult(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const changedCount = result?.preview.filter(r => r.changed).length ?? 0
  const displayRows = filterChanged
    ? (result?.preview ?? []).filter(r => r.changed)
    : (result?.preview ?? [])

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        onBack={() => navigate(-1)}
        title="Nhập Dữ Liệu Nghỉ Phép"
        sub="C&B · CẬP NHẬT SỐ NGÀY PHÉP"
      />

      <div style={{ padding: '16px 16px 100px' }}>

        {/* ── Step 1: Select file ── */}
        {step === 'select' && (
          <>
            {/* Year selector */}
            <div style={{
              background: '#fff', borderRadius: 16, padding: '14px 16px',
              border: `1px solid ${HNH.line}`, marginBottom: 14,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, marginBottom: 8 }}>NĂM</div>
              <div className="flex gap-2">
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                  <button
                    key={y}
                    onClick={() => setYear(y)}
                    style={{
                      flex: 1, height: 36, borderRadius: 10, fontSize: 13, fontWeight: 700,
                      border: `1.5px solid ${year === y ? HNH.red : HNH.line}`,
                      background: year === y ? HNH.red50 : '#fff',
                      color: year === y ? HNH.red : HNH.ink2, cursor: 'pointer',
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            {/* Download template */}
            <div style={{
              background: '#fff', borderRadius: 16, padding: '16px',
              border: `1px solid ${HNH.line}`, marginBottom: 14,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginBottom: 4 }}>
                Bước 1 — Tải file mẫu
              </div>
              <div style={{ fontSize: 12.5, color: HNH.ink3, marginBottom: 12, lineHeight: 1.5 }}>
                File mẫu chứa danh sách toàn bộ nhân viên và số ngày phép hiện tại.
                Điền vào các ô vàng: <strong>Phép đầu năm</strong>, <strong>Phép bù</strong>, <strong>Phép tồn</strong>.
              </div>
              <button
                onClick={downloadTemplate}
                disabled={downloadingTemplate}
                style={{
                  width: '100%', height: 44, borderRadius: 12, fontSize: 14, fontWeight: 700,
                  border: `1.5px solid ${HNH.line}`, background: '#fff', color: HNH.ink,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: downloadingTemplate ? 0.6 : 1,
                }}
              >
                <Icon name="download" size={18} color={HNH.ink} stroke={2} />
                {downloadingTemplate ? 'Đang tải...' : `Tải file mẫu ${year}`}
              </button>
            </div>

            {/* Upload file */}
            <div style={{
              background: '#fff', borderRadius: 16, padding: '16px',
              border: `1px solid ${HNH.line}`, marginBottom: 14,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginBottom: 4 }}>
                Bước 2 — Tải file lên
              </div>
              <div style={{ fontSize: 12.5, color: HNH.ink3, marginBottom: 12, lineHeight: 1.5 }}>
                Sau khi điền xong, chọn file .xlsx để xem trước trước khi nhập.
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '12px 0', color: HNH.ink3, fontSize: 13 }}>
                  Đang đọc file...
                </div>
              ) : (
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  width: '100%', height: 44, borderRadius: 12, fontSize: 14, fontWeight: 700,
                  border: `2px dashed ${HNH.red}60`, background: HNH.red50,
                  color: HNH.red, cursor: 'pointer',
                }}>
                  <Icon name="upload" size={18} color={HNH.red} stroke={2} />
                  Chọn file .xlsx
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>

            {error && (
              <div style={{
                background: HNH.red50, border: `1px solid ${HNH.red}40`, borderRadius: 12,
                padding: '10px 14px', fontSize: 13, color: HNH.red,
              }}>
                {error}
              </div>
            )}
          </>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 'preview' && result && (
          <>
            {/* Summary bar */}
            <div style={{
              background: '#fff', borderRadius: 16, padding: '14px 16px',
              border: `1px solid ${HNH.line}`, marginBottom: 14,
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
            }}>
              {[
                { label: 'Sẽ cập nhật', value: changedCount, color: HNH.red },
                { label: 'Không đổi', value: result.updated - changedCount, color: HNH.ink3 },
                { label: 'Lỗi', value: result.errors.length, color: result.errors.length > 0 ? '#d97706' : HNH.ink3 },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div style={{
                background: '#fffbeb', border: `1px solid #fde68a`, borderRadius: 12,
                padding: '10px 14px', marginBottom: 14,
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                  {result.errors.length} dòng lỗi (đã bỏ qua):
                </div>
                {result.errors.map(e => (
                  <div key={e.row} style={{ fontSize: 11.5, color: '#92400e', marginBottom: 2 }}>
                    Dòng {e.row} · {e.badge_id}: {e.message}
                  </div>
                ))}
              </div>
            )}

            {/* Filter toggle */}
            {changedCount > 0 && (
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <button
                  onClick={() => setFilterChanged(false)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${!filterChanged ? HNH.red : HNH.line}`,
                    background: !filterChanged ? HNH.red50 : '#fff',
                    color: !filterChanged ? HNH.red : HNH.ink3,
                  }}
                >
                  Tất cả ({result.updated})
                </button>
                <button
                  onClick={() => setFilterChanged(true)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${filterChanged ? HNH.red : HNH.line}`,
                    background: filterChanged ? HNH.red50 : '#fff',
                    color: filterChanged ? HNH.red : HNH.ink3,
                  }}
                >
                  Thay đổi ({changedCount})
                </button>
              </div>
            )}

            {/* Preview table */}
            <div style={{
              background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`,
              marginBottom: 80, overflow: 'hidden',
            }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '3fr 1.8fr 1.8fr 1.8fr',
                padding: '8px 12px',
                background: HNH.cream,
                borderBottom: `1px solid ${HNH.line}`,
              }}>
                {['Nhân viên', 'Phép năm', 'Phép bù', 'Phép tồn'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: HNH.ink3 }}>{h}</div>
                ))}
              </div>

              {displayRows.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
                  Không có bản ghi nào thay đổi
                </div>
              ) : (
                displayRows.map((row, i) => (
                  <div
                    key={row.badge_id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '3fr 1.8fr 1.8fr 1.8fr',
                      padding: '10px 12px',
                      borderBottom: i < displayRows.length - 1 ? `1px solid ${HNH.line}` : 'none',
                      background: row.changed ? '#fffbf0' : '#fff',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink }}>{row.name.split(' ').slice(-1)[0]}</div>
                      <div style={{ fontSize: 10.5, color: HNH.ink3 }}>{row.name.split(' ').slice(0, -1).join(' ')}</div>
                      <div style={{ fontSize: 10, color: HNH.ink4, fontWeight: 600 }}>{row.badge_id}</div>
                    </div>
                    <div style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>
                      <DiffCell before={row.annual_before} after={row.annual_after} />
                    </div>
                    <div style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>
                      <DiffCell before={row.bu_before} after={row.bu_after} />
                    </div>
                    <div style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>
                      <DiffCell before={row.carry_before} after={row.carry_after} />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Error message if any */}
            {error && (
              <div style={{
                background: HNH.red50, border: `1px solid ${HNH.red}40`, borderRadius: 12,
                padding: '10px 14px', fontSize: 13, color: HNH.red, marginBottom: 12,
              }}>
                {error}
              </div>
            )}

            {/* Action buttons — sticky bottom */}
            <div
              style={{
                position: 'fixed', bottom: 72, left: 0, right: 0,
                padding: '12px 16px', background: '#fff',
                borderTop: `1px solid ${HNH.line}`, zIndex: 10,
                display: 'flex', gap: 10,
              }}
            >
              <button
                onClick={resetFlow}
                style={{
                  flex: 1, height: 48, borderRadius: 14, fontSize: 14, fontWeight: 700,
                  border: `1.5px solid ${HNH.line}`, background: '#fff', color: HNH.ink2, cursor: 'pointer',
                }}
              >
                Chọn lại
              </button>
              <button
                onClick={handleImport}
                disabled={loading || changedCount === 0}
                style={{
                  flex: 2, height: 48, borderRadius: 14, fontSize: 14, fontWeight: 700,
                  border: 'none',
                  background: changedCount > 0 ? HNH.red : HNH.cream2,
                  color: changedCount > 0 ? '#fff' : HNH.ink3,
                  cursor: changedCount > 0 ? 'pointer' : 'not-allowed',
                  opacity: loading ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {loading ? 'Đang nhập...' : `Xác nhận nhập ${changedCount} bản ghi`}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Done ── */}
        {step === 'done' && result && (
          <div style={{
            background: '#fff', borderRadius: 20, padding: '32px 20px',
            border: `1px solid ${HNH.line}`, textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: HNH.ink, marginBottom: 8 }}>
              Nhập dữ liệu thành công
            </div>
            <div style={{ fontSize: 14, color: HNH.ink2, marginBottom: 6 }}>
              Đã cập nhật <strong style={{ color: HNH.red }}>{result.updated}</strong> bản ghi
            </div>
            {result.skipped > 0 && (
              <div style={{ fontSize: 13, color: HNH.ink3, marginBottom: 6 }}>
                Bỏ qua: {result.skipped} bản ghi
              </div>
            )}
            {result.errors.length > 0 && (
              <div style={{ fontSize: 13, color: '#d97706', marginBottom: 16 }}>
                Lỗi: {result.errors.length} dòng không nhập được
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={resetFlow}
                style={{
                  flex: 1, height: 44, borderRadius: 12, fontSize: 13, fontWeight: 700,
                  border: `1.5px solid ${HNH.line}`, background: '#fff', color: HNH.ink2, cursor: 'pointer',
                }}
              >
                Nhập tiếp
              </button>
              <button
                onClick={() => navigate(-1)}
                style={{
                  flex: 1, height: 44, borderRadius: 12, fontSize: 13, fontWeight: 700,
                  border: 'none', background: HNH.red, color: '#fff', cursor: 'pointer',
                }}
              >
                Xong
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
