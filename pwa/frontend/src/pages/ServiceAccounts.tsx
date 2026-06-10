import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'

interface Account {
  id: number
  name: string
  slug: string
  description: string
  token_prefix: string
  scopes: string[]
  allowed_cidrs: string[]
  status: string
  created_at: string
  last_used_at: string | null
  last_used_ip: string | null
}

interface Scope { code: string; description: string }

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:  { bg: HNH.success50, color: HNH.success },
  revoked: { bg: HNH.red50,     color: HNH.red },
}

export function ServiceAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [scopes, setScopes] = useState<Scope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'list' | 'create' | 'token' | 'detail'>('list')
  const [newToken, setNewToken] = useState('')
  const [selected, setSelected] = useState<Account | null>(null)
  const [copied, setCopied] = useState(false)

  // Create form
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formScopes, setFormScopes] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [r1, r2] = await Promise.all([
        fetch('/bff/api/m2m/accounts/', { credentials: 'include' }),
        fetch('/bff/api/m2m/scopes/', { credentials: 'include' }),
      ])
      if (!r1.ok) { setError(`Accounts: ${r1.status}`); setLoading(false); return }
      if (!r2.ok) { setError(`Scopes: ${r2.status}`); setLoading(false); return }
      const d1 = await r1.json()
      const d2 = await r2.json()
      setAccounts(d1.results || [])
      setScopes(d2.scopes || [])
    } catch (e: any) {
      setError(e.message || 'Network error')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleScope = (code: string) => {
    const s = new Set(formScopes)
    s.has(code) ? s.delete(code) : s.add(code)
    setFormScopes(s)
  }

  const handleCreate = async () => {
    if (!formName.trim() || !formSlug.trim()) { setError('Tên và slug bắt buộc'); return }
    if (formScopes.size === 0) { setError('Chọn ít nhất 1 scope'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/bff/api/m2m/accounts/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          slug: formSlug.trim(),
          description: formDesc.trim(),
          scopes: Array.from(formScopes),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || `Lỗi ${res.status}`)
        setSubmitting(false)
        return
      }
      const data = await res.json()
      setNewToken(data.token)
      setMode('token')
      setFormName(''); setFormSlug(''); setFormDesc(''); setFormScopes(new Set())
      load()
    } catch (e: any) {
      setError(e.message || 'Lỗi')
    }
    setSubmitting(false)
  }

  const handleToggle = async (acc: Account) => {
    const next = acc.status === 'active' ? 'revoked' : 'active'
    await fetch(`/bff/api/m2m/accounts/${acc.id}/`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    load()
    setSelected(null)
  }

  const handleRotate = async (acc: Account) => {
    if (!confirm('Rotate token sẽ vô hiệu token cũ. Tiếp tục?')) return
    const res = await fetch(`/bff/api/m2m/accounts/${acc.id}/rotate/`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (res.ok) {
      const data = await res.json()
      setNewToken(data.token)
      setMode('token')
      setSelected(null)
      load()
    }
  }

  const copyToken = () => {
    navigator.clipboard.writeText(newToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inp = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: `1px solid ${HNH.line}`, fontSize: 13,
    background: '#fff', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ flex: 1 }}>
      <TopBar title="Service Accounts (M2M)" />
      <div style={{ padding: '16px 16px 100px' }}>

        {/* Info */}
        <div style={{ padding: '12px 14px', borderRadius: 12, background: HNH.navy50, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: HNH.navy, margin: 0, lineHeight: 1.5 }}>
            Quản lý kết nối M2M cho hệ thống bên ngoài.
            Header: <code style={{ background: '#fff', padding: '1px 4px', borderRadius: 4 }}>X-HNH-Service-Token: hnh_sa_...</code>
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: 12, borderRadius: 10, background: HNH.red50, marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: HNH.red, margin: 0, wordBreak: 'break-all' }}>{error}</p>
          </div>
        )}

        {/* Token display (one-time) */}
        {mode === 'token' && newToken && (
          <div style={{ padding: 16, borderRadius: 14, background: HNH.warn50, marginBottom: 16, border: `1px solid ${HNH.warn}40` }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: HNH.warn, margin: '0 0 8px' }}>
              Token chỉ hiện 1 lần — copy ngay!
            </p>
            <div style={{
              background: '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 10,
              fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: HNH.ink,
              border: `1px solid ${HNH.line}`,
            }}>
              {newToken}
            </div>
            <div className="flex gap-2">
              <button onClick={copyToken} style={{
                flex: 1, padding: 10, borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: '#fff',
                background: copied ? HNH.success : HNH.navy,
              }}>
                {copied ? 'Đã copy!' : 'Copy token'}
              </button>
              <button onClick={() => { setMode('list'); setNewToken('') }} style={{
                padding: '10px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`,
                background: '#fff', cursor: 'pointer', fontSize: 13, color: HNH.ink2,
              }}>
                Xong
              </button>
            </div>
          </div>
        )}

        {/* Create form */}
        {mode === 'create' && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, border: `1px solid ${HNH.line}` }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginBottom: 12 }}>Tạo Service Account</p>

            <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 4 }}>Tên *</label>
            <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Arkon AI" style={{ ...inp, marginBottom: 10 }} />

            <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 4 }}>Slug *</label>
            <input value={formSlug} onChange={e => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="arkon-ai" style={{ ...inp, marginBottom: 10 }} />

            <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 4 }}>Mô tả</label>
            <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="" style={{ ...inp, marginBottom: 12 }} />

            <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 6 }}>Scopes *</label>
            {scopes.map(s => (
              <label key={s.code} className="flex items-center gap-2" style={{ marginBottom: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={formScopes.has(s.code)} onChange={() => toggleScope(s.code)} />
                <code style={{ fontSize: 12, fontWeight: 700, color: HNH.navy }}>{s.code}</code>
                <span style={{ fontSize: 11, color: HNH.ink3 }}>{s.description}</span>
              </label>
            ))}

            <div className="flex gap-2" style={{ marginTop: 14 }}>
              <button onClick={handleCreate} disabled={submitting} style={{
                flex: 1, padding: 10, borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: '#fff', background: submitting ? HNH.ink4 : HNH.navy,
              }}>
                {submitting ? 'Đang tạo...' : 'Tạo'}
              </button>
              <button onClick={() => setMode('list')} style={{
                padding: '10px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`,
                background: '#fff', cursor: 'pointer', fontSize: 13, color: HNH.ink2,
              }}>
                Hủy
              </button>
            </div>
          </div>
        )}

        {/* Create button */}
        {mode === 'list' && (
          <button onClick={() => setMode('create')} style={{
            width: '100%', padding: 12, borderRadius: 12, marginBottom: 16,
            border: `1px dashed ${HNH.navy}`, background: HNH.navy50,
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: HNH.navy,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Icon name="plus" size={16} color={HNH.navy} />
            Tạo Service Account mới
          </button>
        )}

        {/* Loading */}
        {loading && <p style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 40 }}>Đang tải...</p>}

        {/* Account list */}
        {!loading && accounts.map(a => {
          const sc = STATUS_STYLE[a.status] || STATUS_STYLE.active
          return (
            <div key={a.id} onClick={() => { setSelected(a); setMode('detail') }} style={{
              background: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
              border: `1px solid ${HNH.line}`, cursor: 'pointer',
            }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{a.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: sc.bg, color: sc.color }}>{a.status}</span>
              </div>
              <code style={{ fontSize: 11, color: HNH.ink3 }}>{a.slug}</code>
              <div className="flex flex-wrap gap-1" style={{ marginTop: 6 }}>
                {a.scopes.map(s => (
                  <code key={s} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: HNH.navy50, color: HNH.navy }}>{s}</code>
                ))}
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                <code style={{ fontSize: 11, color: HNH.ink3 }}>{a.token_prefix}...</code>
                <span style={{ fontSize: 11, color: HNH.ink3 }}>
                  {a.last_used_at ? new Date(a.last_used_at).toLocaleDateString('vi-VN') : 'Chưa dùng'}
                </span>
              </div>
            </div>
          )
        })}

        {!loading && accounts.length === 0 && !error && mode === 'list' && (
          <p style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 20 }}>Chưa có service account</p>
        )}

        {/* Detail modal */}
        {mode === 'detail' && selected && (
          <div onClick={() => { setSelected(null); setMode('list') }} style={{
            position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: '#fff', borderRadius: '20px 20px 0 0', width: '100%',
              maxWidth: 480, maxHeight: '85vh', overflow: 'auto', padding: '20px 20px 32px',
            }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: HNH.ink }}>{selected.name}</span>
                <button onClick={() => { setSelected(null); setMode('list') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <Icon name="x" size={20} color={HNH.ink3} />
                </button>
              </div>

              <code style={{ fontSize: 12, color: HNH.ink3, display: 'block', marginBottom: 12 }}>{selected.slug}</code>
              {selected.description && <p style={{ fontSize: 13, color: HNH.ink2, marginBottom: 12 }}>{selected.description}</p>}

              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: HNH.ink3 }}>Token prefix</span>
                <code style={{ fontSize: 13, color: HNH.ink, display: 'block', marginTop: 2 }}>{selected.token_prefix}...</code>
              </div>

              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: HNH.ink3 }}>Scopes</span>
                <div className="flex flex-wrap gap-1" style={{ marginTop: 4 }}>
                  {selected.scopes.map(s => (
                    <code key={s} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: HNH.navy50, color: HNH.navy, fontWeight: 600 }}>{s}</code>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: 11, color: HNH.ink3 }}>Tạo lúc</span>
                  <p style={{ fontSize: 12, color: HNH.ink, margin: '2px 0 0' }}>{new Date(selected.created_at).toLocaleString('vi-VN')}</p>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: HNH.ink3 }}>Dùng lần cuối</span>
                  <p style={{ fontSize: 12, color: HNH.ink, margin: '2px 0 0' }}>
                    {selected.last_used_at ? new Date(selected.last_used_at).toLocaleString('vi-VN') : 'Chưa dùng'}
                  </p>
                </div>
              </div>

              {selected.last_used_ip && (
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: 11, color: HNH.ink3 }}>IP gần nhất</span>
                  <code style={{ fontSize: 12, color: HNH.ink, display: 'block', marginTop: 2 }}>{selected.last_used_ip}</code>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => handleRotate(selected)} disabled={selected.status !== 'active'} style={{
                  flex: 1, padding: 10, borderRadius: 10, border: `1px solid ${HNH.navy}`,
                  background: HNH.navy50, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: HNH.navy,
                }}>
                  Rotate Token
                </button>
                <button onClick={() => handleToggle(selected)} style={{
                  flex: 1, padding: 10, borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, color: '#fff',
                  background: selected.status === 'active' ? HNH.red : HNH.success,
                }}>
                  {selected.status === 'active' ? 'Thu hồi' : 'Kích hoạt'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
