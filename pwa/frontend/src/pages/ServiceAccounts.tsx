import { useNavigate } from 'react-router-dom'
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

interface Integration {
  id: number
  system: string
  label: string
  token: string
  token_set: boolean
  scopes: string[]
  base_url: string
  enabled: boolean
  notes: string
  updated_at: string | null
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:  { bg: HNH.success50, color: HNH.success },
  revoked: { bg: HNH.red50,     color: HNH.red },
}

const SYSTEM_ICONS: Record<string, { icon: string; color: string }> = {
  arkon:     { icon: 'cpu',    color: HNH.red },
  eoffice:   { icon: 'file-text', color: HNH.navy },
  '1stopshop': { icon: 'shopping-bag', color: HNH.gold },
  iam:       { icon: 'shield', color: '#7c3aed' },
  appvmb:    { icon: 'smartphone', color: HNH.success },
}

const SCOPE_TEMPLATES: Record<string, string[]> = {
  arkon:     ['embed:login', 'employee:read'],
  eoffice:   ['task:read', 'task:write', 'approval:read'],
  '1stopshop': ['order:read', 'customer:read'],
  iam:       ['user:read', 'user:write', 'role:read'],
  appvmb:    ['notification:send', 'employee:read'],
}

type Tab = 'accounts' | 'integrations'

function IntegrationsTab({ integrations, onUpdated, onError }: {
  integrations: Integration[]
  onUpdated: () => void
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [formToken, setFormToken] = useState('')
  const [formScopes, setFormScopes] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const startEdit = (ig: Integration) => {
    setEditing(ig.system)
    setFormToken(ig.token_set ? '' : '')
    setFormScopes(JSON.stringify(ig.scopes, null, 2))
    setFormUrl(ig.base_url)
    setFormNotes(ig.notes)
  }

  const handleSave = async (system: string) => {
    let parsedScopes: string[]
    try {
      parsedScopes = JSON.parse(formScopes || '[]')
      if (!Array.isArray(parsedScopes)) throw new Error()
    } catch {
      onError('Scopes phải là JSON array, vd: ["embed:login"]')
      return
    }
    setSaving(true)
    onError('')
    const body: Record<string, unknown> = { scopes: parsedScopes, base_url: formUrl, notes: formNotes }
    if (formToken.trim()) body.token = formToken.trim()
    try {
      const res = await fetch(`/bff/api/m2m/integrations/${system}/`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        onError(d.error || `Lỗi ${res.status}`)
      } else {
        setEditing(null)
        onUpdated()
      }
    } catch (e: any) { onError(e.message) }
    setSaving(false)
  }

  const handleToggle = async (ig: Integration) => {
    await fetch(`/bff/api/m2m/integrations/${ig.system}/`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !ig.enabled }),
    })
    onUpdated()
  }

  const inp = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: `1px solid ${HNH.line}`, fontSize: 13,
    background: '#fff', boxSizing: 'border-box' as const,
  }

  return (
    <>
      {integrations.map(ig => {
        const meta = SYSTEM_ICONS[ig.system] || { icon: 'globe', color: HNH.ink2 }
        const isEditing = editing === ig.system
        const templates = SCOPE_TEMPLATES[ig.system] || []

        return (
          <div key={ig.system} style={{
            background: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
            border: `1px solid ${ig.enabled ? HNH.success + '40' : HNH.line}`,
          }}>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div className="flex items-center gap-3">
                <div style={{
                  width: 36, height: 36, borderRadius: 10, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: meta.color + '15',
                }}>
                  <Icon name={meta.icon} size={18} color={meta.color} />
                </div>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{ig.label}</span>
                  <code style={{ fontSize: 11, color: HNH.ink3, display: 'block' }}>{ig.system}</code>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleToggle(ig)} style={{
                  padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700,
                  background: ig.enabled ? HNH.success50 : HNH.cream2,
                  color: ig.enabled ? HNH.success : HNH.ink3,
                }}>
                  {ig.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* Token status */}
            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <Icon name={ig.token_set ? 'check' : 'x'} size={12} color={ig.token_set ? HNH.success : HNH.red} />
              <span style={{ fontSize: 12, color: ig.token_set ? HNH.success : HNH.red }}>
                {ig.token_set ? `Token: ${ig.token}` : 'Chưa nhập token'}
              </span>
            </div>

            {/* Scopes display */}
            {ig.scopes.length > 0 && (
              <div className="flex flex-wrap gap-1" style={{ marginBottom: 8 }}>
                {ig.scopes.map(s => (
                  <code key={s} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: HNH.navy50, color: HNH.navy }}>{s}</code>
                ))}
              </div>
            )}

            {ig.base_url && (
              <div style={{ marginBottom: 8 }}>
                <code style={{ fontSize: 11, color: HNH.ink3 }}>{ig.base_url}</code>
              </div>
            )}

            {/* Edit form */}
            {isEditing ? (
              <div style={{ marginTop: 10, padding: '12px', borderRadius: 10, background: HNH.cream, border: `1px solid ${HNH.line}` }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 4 }}>
                  Token {ig.token_set && <span style={{ fontWeight: 400, color: HNH.ink3 }}>(để trống = giữ cũ)</span>}
                </label>
                <input
                  type="password"
                  value={formToken}
                  onChange={e => setFormToken(e.target.value)}
                  placeholder={ig.token_set ? '••••••••' : 'Nhập token từ hệ thống'}
                  style={{ ...inp, marginBottom: 10 }}
                />

                <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 4 }}>
                  Base URL
                </label>
                <input
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder="http://100.x.x.x:5166"
                  style={{ ...inp, marginBottom: 10 }}
                />

                <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 4 }}>
                  Scopes (JSON array)
                </label>
                <textarea
                  rows={3}
                  value={formScopes}
                  onChange={e => setFormScopes(e.target.value)}
                  style={{ ...inp, fontFamily: 'monospace', fontSize: 12, marginBottom: 4, resize: 'vertical' }}
                />
                {templates.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: HNH.ink3 }}>Mẫu: </span>
                    <button onClick={() => setFormScopes(JSON.stringify(templates, null, 2))}
                      style={{ fontSize: 11, color: HNH.navy, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      {JSON.stringify(templates)}
                    </button>
                  </div>
                )}

                <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 4 }}>Ghi chú</label>
                <input value={formNotes} onChange={e => setFormNotes(e.target.value)} style={{ ...inp, marginBottom: 12 }} />

                <div className="flex gap-2">
                  <button onClick={() => handleSave(ig.system)} disabled={saving} style={{
                    flex: 1, padding: 10, borderRadius: 10, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700, color: '#fff', background: saving ? HNH.ink4 : HNH.navy,
                  }}>
                    {saving ? 'Đang lưu...' : 'Lưu'}
                  </button>
                  <button onClick={() => setEditing(null)} style={{
                    padding: '10px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`,
                    background: '#fff', cursor: 'pointer', fontSize: 13, color: HNH.ink2,
                  }}>
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => startEdit(ig)} style={{
                width: '100%', padding: 10, borderRadius: 10, marginTop: 6,
                border: `1px solid ${HNH.line}`, background: '#fff', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, color: HNH.ink2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Icon name="edit" size={14} color={HNH.ink3} />
                Cấu hình
              </button>
            )}
          </div>
        )
      })}

      {integrations.length === 0 && (
        <p style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 20 }}>Đang tải...</p>
      )}
    </>
  )
}

export function ServiceAccountsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('accounts')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [scopes, setScopes] = useState<Scope[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
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
      const [r1, r2, r3] = await Promise.all([
        fetch('/bff/api/m2m/accounts/', { credentials: 'include' }),
        fetch('/bff/api/m2m/scopes/', { credentials: 'include' }),
        fetch('/bff/api/m2m/integrations/', { credentials: 'include' }),
      ])
      if (!r1.ok) { setError(`Accounts: ${r1.status}`); setLoading(false); return }
      if (!r2.ok) { setError(`Scopes: ${r2.status}`); setLoading(false); return }
      const d1 = await r1.json()
      const d2 = await r2.json()
      setAccounts(d1.results || [])
      setScopes(d2.scopes || [])
      if (r3.ok) {
        const d3 = await r3.json()
        setIntegrations(d3.results || [])
      }
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
      <TopBar onBack={() => navigate(-1)} title="Service Accounts (M2M)" />

      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: `2px solid ${HNH.line}`, margin: '0 16px' }}>
        {([['accounts', 'Service Accounts'], ['integrations', 'Tích hợp']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setTab(key); setMode('list'); setSelected(null); setError('') }}
            style={{
              flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, background: 'transparent',
              color: tab === key ? HNH.navy : HNH.ink3,
              borderBottom: tab === key ? `2px solid ${HNH.navy}` : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 16px 100px' }}>

        {/* Info (accounts tab) */}
        {tab === 'accounts' && (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: HNH.navy50, marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: HNH.navy, margin: 0, lineHeight: 1.5 }}>
              Quản lý token inbound — hệ thống ngoài gọi vào HNH Core.
              Header: <code style={{ background: '#fff', padding: '1px 4px', borderRadius: 4 }}>X-HNH-Service-Token: hnh_sa_...</code>
            </p>
          </div>
        )}

        {/* Info (integrations tab) */}
        {tab === 'integrations' && (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: HNH.goldSoft, marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: '#a87908', margin: 0, lineHeight: 1.5 }}>
              Cấu hình token outbound — HNH gọi đi hệ thống ngoài.
              Nhập token + scopes được cấp bởi từng hệ thống.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: 12, borderRadius: 10, background: HNH.red50, marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: HNH.red, margin: 0, wordBreak: 'break-all' }}>{error}</p>
          </div>
        )}

        {/* ═══ ACCOUNTS TAB ═══ */}
        {tab === 'accounts' && <>

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

        </>}

        {/* ═══ INTEGRATIONS TAB ═══ */}
        {tab === 'integrations' && (
          <IntegrationsTab integrations={integrations} onUpdated={load} onError={setError} />
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
