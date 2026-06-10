import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useToast } from '../components/ui/Toast'
import { apiFetch } from '../lib/api'

const CATEGORIES = [
  { value: 'tool',      label: 'Công cụ, dụng cụ',  icon: 'wrench' },
  { value: 'transport',  label: 'Di chuyển, công tác', icon: 'car' },
  { value: 'license',   label: 'License phần mềm',   icon: 'file-text' },
  { value: 'other',     label: 'Khác',               icon: 'package' },
]

export function ExpenseSubmitPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [category, setCategory] = useState('')
  const [dateIncurred, setDateIncurred] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
      toast.success('Đã gửi yêu cầu chi phí')
      navigate('/expenses')
    } catch (e: any) {
      try {
        const data = JSON.parse(e.message)
        if (data.errors) setErrors(data.errors)
        else if (data.error) toast.error(data.error)
        else toast.error('Có lỗi xảy ra')
      } catch { toast.error('Có lỗi xảy ra') }
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
          Chứng từ/Hóa đơn *
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            border: `1px dashed ${errors.receipt ? HNH.red : HNH.line}`,
            background: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            color: HNH.ink2, fontSize: 13, marginBottom: 8,
          }}
        >
          <Icon name="camera" size={18} color={HNH.ink3} />
          {file ? file.name : 'Chụp hoặc chọn ảnh chứng từ'}
        </button>
        {errors.receipt && <p style={{ color: HNH.red, fontSize: 12, margin: '0 0 8px' }}>{errors.receipt}</p>}

        {file && (
          <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', border: `1px solid ${HNH.line}` }}>
            {file.type.startsWith('image/') ? (
              <img src={URL.createObjectURL(file)} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
            ) : (
              <div style={{ padding: 16, textAlign: 'center', color: HNH.ink2, fontSize: 13 }}>
                <Icon name="file-text" size={24} color={HNH.ink3} />
                <p style={{ margin: '4px 0 0' }}>{file.name}</p>
              </div>
            )}
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', padding: '14px', borderRadius: 14,
            background: submitting ? HNH.ink4 : HNH.red,
            color: '#fff', border: 'none', cursor: submitting ? 'default' : 'pointer',
            fontSize: 15, fontWeight: 700,
          }}
        >
          {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
        </button>
      </div>
    </div>
  )
}
