import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useToast } from '../components/ui/Toast'
import { apiFetch } from '../lib/api'

const MAX_SIZE = 2 * 1024 * 1024 // 2MB

const CATEGORIES = [
  { value: 'tool',      label: 'Công cụ, dụng cụ',  icon: 'wrench' },
  { value: 'transport',  label: 'Di chuyển, công tác', icon: 'car' },
  { value: 'license',   label: 'License phần mềm',   icon: 'file-text' },
  { value: 'other',     label: 'Khác',               icon: 'package' },
]

function compressImage(file: File, maxBytes: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      const MAX_DIM = 1920
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      let quality = 0.8
      const tryCompress = () => {
        canvas.toBlob(
          blob => {
            if (!blob) { reject(new Error('Nén ảnh thất bại')); return }
            if (blob.size <= maxBytes || quality <= 0.2) {
              const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })
              resolve(compressed)
            } else {
              quality -= 0.15
              tryCompress()
            }
          },
          'image/jpeg',
          quality,
        )
      }
      tryCompress()
    }
    img.onerror = () => reject(new Error('Không đọc được ảnh'))
    img.src = URL.createObjectURL(file)
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ExpenseSubmitPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [category, setCategory] = useState('')
  const [dateIncurred, setDateIncurred] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [compressed, setCompressed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleFileChange = async (picked: File | null) => {
    if (!picked) { setFile(null); setCompressed(false); return }
    setCompressed(false)
    setErrors(prev => { const { receipt, ...rest } = prev; return rest })

    if (picked.type === 'application/pdf') {
      if (picked.size > MAX_SIZE) {
        setErrors(prev => ({ ...prev, receipt: `PDF tối đa 2MB (file này ${formatSize(picked.size)}). Vui lòng nén file trước khi tải lên.` }))
        setFile(null)
        return
      }
      setFile(picked)
      return
    }

    if (picked.type.startsWith('image/')) {
      if (picked.size <= MAX_SIZE) {
        setFile(picked)
        return
      }
      setCompressing(true)
      try {
        const result = await compressImage(picked, MAX_SIZE)
        setFile(result)
        setCompressed(true)
        toast.toast(`Ảnh đã nén: ${formatSize(picked.size)} → ${formatSize(result.size)}`, 'info')
      } catch {
        setErrors(prev => ({ ...prev, receipt: 'Không thể nén ảnh. Vui lòng chọn ảnh nhỏ hơn 2MB.' }))
        setFile(null)
      }
      setCompressing(false)
      return
    }

    setErrors(prev => ({ ...prev, receipt: 'Chỉ chấp nhận ảnh hoặc PDF' }))
    setFile(null)
  }

  const handleSubmit = async () => {
    const errs: Record<string, string> = {}
    if (!category) errs.category = 'Chọn danh mục'
    if (!dateIncurred) errs.date_incurred = 'Chọn ngày'
    if (!description.trim()) errs.description = 'Nhập mô tả'
    const amt = parseInt(amount)
    if (!amount || isNaN(amt) || amt <= 0) errs.amount = 'Nhập số tiền hợp lệ'
    if (!file) errs.receipt = 'Đính kèm chứng từ'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSubmitting(true)
    setErrors({})
    const form = new FormData()
    form.append('date_incurred', dateIncurred)
    form.append('category', category)
    form.append('description', description.trim())
    form.append('amount', String(amt))
    form.append('receipt', file!)

    try {
      await apiFetch('/api/expenses/requests/', { method: 'POST', body: form })
      toast.toast('Đã gửi yêu cầu chi phí')
      navigate('/expenses')
    } catch (e: any) {
      try {
        const data = JSON.parse(e.message)
        if (data.errors) setErrors(data.errors)
        else if (data.error) toast.toast(data.error, 'error')
        else toast.toast('Có lỗi xảy ra', 'error')
      } catch { toast.toast('Có lỗi xảy ra', 'error') }
    }
    setSubmitting(false)
  }

  const inputStyle = (hasError: boolean) => ({
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${hasError ? HNH.red : HNH.line}`,
    fontSize: 14,
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box' as const,
  })

  return (
    <div style={{ flex: 1 }}>
      <TopBar title="Tạo yêu cầu chi phí" />
      <div style={{ padding: '16px 16px 120px' }}>
        {/* Category */}
        <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 6, display: 'block' }}>
          Danh mục *
        </label>
        <div className="flex gap-2 flex-wrap" style={{ marginBottom: 16 }}>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              style={{
                padding: '8px 14px', borderRadius: 10,
                border: category === c.value ? `2px solid ${HNH.red}` : `1px solid ${HNH.line}`,
                background: category === c.value ? HNH.red50 : '#fff',
                color: category === c.value ? HNH.red : HNH.ink2,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Icon name={c.icon} size={14} color={category === c.value ? HNH.red : HNH.ink3} />
              {c.label}
            </button>
          ))}
        </div>
        {errors.category && <p style={{ color: HNH.red, fontSize: 12, margin: '-8px 0 8px' }}>{errors.category}</p>}

        {/* Date */}
        <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 6, display: 'block' }}>
          Ngày phát sinh *
        </label>
        <input
          type="date"
          value={dateIncurred}
          onChange={e => setDateIncurred(e.target.value)}
          style={{ ...inputStyle(!!errors.date_incurred), marginBottom: 16 }}
        />

        {/* Amount */}
        <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 6, display: 'block' }}>
          Số tiền (VND) *
        </label>
        <input
          type="number"
          inputMode="numeric"
          placeholder="500000"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{ ...inputStyle(!!errors.amount), marginBottom: 16 }}
        />
        {errors.amount && <p style={{ color: HNH.red, fontSize: 12, margin: '-8px 0 8px' }}>{errors.amount}</p>}

        {/* Description */}
        <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 6, display: 'block' }}>
          Mô tả chi tiết *
        </label>
        <textarea
          rows={3}
          placeholder="Mô tả mục đích chi phí..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{ ...inputStyle(!!errors.description), marginBottom: 16, resize: 'vertical' }}
        />
        {errors.description && <p style={{ color: HNH.red, fontSize: 12, margin: '-8px 0 8px' }}>{errors.description}</p>}

        {/* Receipt upload */}
        <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 6, display: 'block' }}>
          Chứng từ/Hóa đơn * <span style={{ fontWeight: 400, color: HNH.ink3 }}>(tối đa 2MB, ảnh lớn sẽ tự nén)</span>
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          onChange={e => handleFileChange(e.target.files?.[0] || null)}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={compressing}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            border: `1px dashed ${errors.receipt ? HNH.red : HNH.line}`,
            background: '#fff', cursor: compressing ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            color: HNH.ink2, fontSize: 13, marginBottom: 8,
          }}
        >
          {compressing ? (
            <>
              <span className="animate-spin" style={{ width: 16, height: 16, border: `2px solid ${HNH.ink4}`, borderTopColor: HNH.red, borderRadius: '50%', display: 'inline-block' }} />
              Đang nén ảnh...
            </>
          ) : (
            <>
              <Icon name="camera" size={18} color={HNH.ink3} />
              {file ? file.name : 'Chụp hoặc chọn ảnh chứng từ'}
            </>
          )}
        </button>
        {errors.receipt && <p style={{ color: HNH.red, fontSize: 12, margin: '0 0 8px' }}>{errors.receipt}</p>}

        {file && (
          <div style={{ marginBottom: 16 }}>
            {compressed && (
              <div className="flex items-center gap-2" style={{ marginBottom: 6, padding: '6px 10px', borderRadius: 8, background: HNH.success50 }}>
                <Icon name="check" size={12} color={HNH.success} />
                <span style={{ fontSize: 11, color: HNH.success, fontWeight: 600 }}>
                  Đã nén — {formatSize(file.size)}
                </span>
              </div>
            )}
            <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${HNH.line}` }}>
              {file.type.startsWith('image/') ? (
                <img src={URL.createObjectURL(file)} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: HNH.ink2, fontSize: 13 }}>
                  <Icon name="file-text" size={24} color={HNH.ink3} />
                  <p style={{ margin: '4px 0 0' }}>{file.name} ({formatSize(file.size)})</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={submitting || compressing}
          style={{
            width: '100%', padding: '14px', borderRadius: 14,
            background: (submitting || compressing) ? HNH.ink4 : HNH.red,
            color: '#fff', border: 'none', cursor: (submitting || compressing) ? 'default' : 'pointer',
            fontSize: 15, fontWeight: 700,
          }}
        >
          {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
        </button>
      </div>
    </div>
  )
}
