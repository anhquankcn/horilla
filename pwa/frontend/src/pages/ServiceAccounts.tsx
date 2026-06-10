import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

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

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  active:  { bg: HNH.success50, color: HNH.success },
  revoked: { bg: HNH.red50,     color: HNH.red },
}

/* ── Create Form ── */
function CreateForm({ scopes, onCreated, onCancel }: {
  scopes: Scope[]
  onCreated: (token: string) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [desc, setDesc] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const toggle = (code: string) => {
    const s = new Set(selected)
    s.has(code) ? s.delete(code) : s.add(code)
    setSelected(s)
  }

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) { toast.toast('Tên và slug bắt buộc', 'error'); return }
    if (selected.size === 0) { toast.toast('Chọn ít nhất 1 scope', 'error'); return }
    setCreating(true)
    try {
      const data = await api.post<{ token: string }>('/api/m2m/accounts/', {
        name: name.trim(), slug: slug.trim(), description: desc.trim(),
        scopes: Array.from(selected),
      })
      onCreated(data.token)
    } catch (e: any) {
      try { toast.toast(JSON.parse(e.message).error || 'Lỗi', 'error') } catch { toast.toast('Lỗi', 'error') }
    }
    setCreating(false)
  }

  const input = (hasErr = false) => ({
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: `1px solid ${hasErr ? HNH.red : HNH.line}`, fontSize: 13,
    background: '#fff', boxSizing: 'border-box' as const,
  })

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, border: `1px solid ${HNH.line}` }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginBottom: 12 }}>Tạo Service Account mới</p>

      <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 4, display: 'block' }}>Tên hệ thống *</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Arkon AI" style={{ ...input(), marginBottom: 10 }} />

      <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 4, display: 'block' }}>Slug *</label>
      <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="arkon-ai" style={{ ...input(), marginBottom: 10 }} />

      <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 4, display: 'block' }}>Mô tả</label>
      <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Hệ thống AI nội bộ" style={{ ...input(), marginBottom: 12 }} />

      <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 6, display: 'block' }}>Scopes *</label>
      <div className="flex flex-col gap-2" style={{ marginBottom: 14 }}>
        {scopes.map(s => (
          <label key={s.code} className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.has(s.code)} onChange={() => toggle(s.code)} />
            <code style={{ fontSize: 12, fontWeight: 700, color: HNH.navy }}>{s.code}</code>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>{s.description}</span>
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={handleCreate} disabled={creating}
          style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', background: creating ? HNH.ink4 : HNH.navy }}>
          {creating ? 'Đang tạo...' : 'Tạo'}
        </button>
        <button onClick={onCancel}
          style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`, background: '#fff', cursor: 'pointer', fontSize: 13, color: HNH.ink2 }}>
          Hủy
        </button>
      </div>
    </div>
  )
}

/* ── Token Display (one-time) ── */
function TokenDisplay({ token, onDone }: { token: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ background: HNH.warn50, borderRadius: 14, padding: 16, marginBottom: 16, border: `1px solid ${HNH.warn}40` }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <Icon name="alert-triangle" size={16} color={HNH.warn} />
        <span style={{ fontSize: 13, fontWeight: 700, color: HNH.warn }}>Token chỉ hiện 1 lần — copy ngay!</span>
      </div>
      <div style={{
        background: '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 10,
        fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', color: HNH.ink, lineHeight: 1.6,
        border: `1px solid ${HNH.line}`,
      }}>
        {token}
      </div>
      <div className="flex gap-2">
        <button onClick={copy}
          style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', background: copied ? HNH.success : HNH.navy }}>
          {copied ? 'Đã copy!' : 'Copy token'}
        </button>
        <button onClick={onDone}
          style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`, background: '#fff', cursor: 'pointer', fontSize: 13, color: HNH.ink2 }}>
          Xong
        </button>
      </div>
    </div>
  )
}

/* ── Detail Modal ── */
function DetailModal({ account, onClose, onUpdated }: {
  account: Account; onClose: () => void; onUpdated: () => void
}) {
  const toast = useToast()
  const [rotating, setRotating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const sc = STATUS_COLOR[account.status] || STATUS_COLOR.active

  const handleRotate = async () => {
    if (!confirm('Rotate token sẽ vô hiệu token cũ. Tiếp tục?')) return
    setRotating(true)
    try {
      const data = await api.post<{ token: string }>(`/api/m2m/accounts/${account.id}/rotate/`, {})
      setNewToken(data.token)
      onUpdated()
    } catch { toast.toast('Lỗi rotate', 'error') }
    setRotating(false)
  }

  const handleToggle = async () => {
    const newStatus = account.status === 'active' ? 'revoked' : 'active'
    try {
      await api.patch(`/api/m2m/accounts/${account.id}/`, { status: newStatus })
      toast.toast(newStatus === 'active' ? 'Đã kích hoạt' : 'Đã thu hồi')
      onClose(); onUpdated()
    } catch { toast.toast('Lỗi', 'error') }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '85vh', overflow: 'auto', padding: '20px 20px 32px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: HNH.ink }}>{account.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="x" size={20} color={HNH.ink3} />
          </button>
        </div>

        <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
          <code style={{ fontSize: 12, color: HNH.ink3 }}>{account.slug}</code>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: sc.bg, color: sc.color }}>{account.status}</span>
        </div>

        {account.description && <p style={{ fontSize: 13, color: HNH.ink2, marginBottom: 12 }}>{account.description}</p>}

        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: HNH.ink3 }}>Token prefix</span>
          <p style={{ fontFamily: 'monospace', fontSize: 13, color: HNH.ink, margin: '2px 0 0' }}>{account.token_prefix}...</p>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: HNH.ink3 }}>Scopes</span>
          <div className="flex flex-wrap gap-1" style={{ marginTop: 4 }}>
            {account.scopes.map(s => (
              <code key={s} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: HNH.navy50, color: HNH.navy, fontWeight: 600 }}>{s}</code>
            ))}
          </div>
        </div>

        {account.allowed_cidrs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>Allowed CIDRs</span>
            <div className="flex flex-wrap gap-1" style={{ marginTop: 4 }}>
              {account.allowed_cidrs.map(c => (
                <code key={c} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: HNH.cream2, color: HNH.ink2 }}>{c}</code>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>Tạo lúc</span>
            <p style={{ fontSize: 12, color: HNH.ink, margin: '2px 0 0' }}>{new Date(account.created_at).toLocaleString('vi-VN')}</p>
          </div>
          <div>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>Dùng lần cuối</span>
            <p style={{ fontSize: 12, color: HNH.ink, margin: '2px 0 0' }}>
              {account.last_used_at ? new Date(account.last_used_at).toLocaleString('vi-VN') : 'Chưa dùng'}
            </p>
          </div>
        </div>

        {account.last_used_ip && (
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>IP gần nhất</span>
            <code style={{ fontSize: 12, color: HNH.ink, display: 'block', marginTop: 2 }}>{account.last_used_ip}</code>
          </div>
        )}

        {newToken && <TokenDisplay token={newToken} onDone={() => setNewToken(null)} />}

        <div className="flex gap-2">
          <button onClick={handleRotate} disabled={rotating || account.status !== 'active'}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${HNH.navy}`, background: HNH.navy50, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: HNH.navy }}>
            {rotating ? 'Đang rotate...' : 'Rotate Token'}
          </button>
          <button onClick={handleToggle}
            style={{
              flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff',
              background: account.status === 'active' ? HNH.red : HNH.success,
            }}>
            {account.status === 'active' ? 'Thu hồi' : 'Kích hoạt'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Page ── */
export function ServiceAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [scopes, setScopes] = useState<Scope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [selected, setSelected] = useState<Account | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [accRes, scopeRes] = await Promise.all([
        fetch('/bff/api/m2m/accounts/', { credentials: 'include' }),
        fetch('/bff/api/m2m/scopes/', { credentials: 'include' }),
      ])
      if (!accRes.ok || !scopeRes.ok) {
        const t1 = await accRes.text().catch(() => '')
        const t2 = await scopeRes.text().catch(() => '')
        setError(`accounts: ${accRes.status} ${t1.slice(0,200)} | scopes: ${scopeRes.status} ${t2.slice(0,200)}`)
        return
      }
      const accData = await accRes.json()
      const scopeData = await scopeRes.json()
      setAccounts(accData.results)
      setScopes(scopeData.scopes)
    } catch (e: any) {
      setError(`Fetch lỗi: ${e.message || 'unknown'}`)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ flex: 1 }}>
      <TopBar title="Service Accounts (M2M)" />
      <PullToRefresh onRefresh={load}>
        <div style={{ padding: '16px 16px 100px' }}>
          {/* Info banner */}
          <div style={{ padding: '12px 14px', borderRadius: 12, background: HNH.navy50, marginBottom: 16, border: `1px solid ${HNH.navy}20` }}>
            <p style={{ fontSize: 12, color: HNH.navy, margin: 0, lineHeight: 1.5 }}>
              Quản lý kết nối M2M (machine-to-machine) cho hệ thống bên ngoài.
              Mỗi account có token riêng, giới hạn bởi scope và IP.
              Header: <code>X-HNH-Service-Token: hnh_sa_...</code>
            </p>
          </div>

          {newToken && <TokenDisplay token={newToken} onDone={() => { setNewToken(null); setShowCreate(false) }} />}

          {showCreate && !newToken ? (
            <CreateForm scopes={scopes} onCreated={t => { setNewToken(t); load() }} onCancel={() => setShowCreate(false)} />
          ) : !newToken && (
            <button onClick={() => setShowCreate(true)}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, marginBottom: 16,
                border: `1px dashed ${HNH.navy}`, background: HNH.navy50,
                cursor: 'pointer', fontSize: 13, fontWeight: 600, color: HNH.navy,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <Icon name="plus" size={16} color={HNH.navy} />
              Tạo Service Account mới
            </button>
          )}

          {error && (
            <div style={{ padding: '14px', borderRadius: 12, background: HNH.red50, border: `1px solid ${HNH.red}40`, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: HNH.red, margin: 0, wordBreak: 'break-all' }}>{error}</p>
              <button onClick={load} style={{ marginTop: 8, padding: '6px 16px', borderRadius: 8, border: 'none', background: HNH.red, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Thử lại
              </button>
            </div>
          )}

          {loading && accounts.length === 0 && !error && (
            <p style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 40 }}>Đang tải...</p>
          )}

          {accounts.map(a => {
            const sc = STATUS_COLOR[a.status] || STATUS_COLOR.active
            return (
              <div key={a.id} onClick={() => setSelected(a)} style={{
                background: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
                border: `1px solid ${HNH.line}`, cursor: 'pointer',
              }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{a.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: sc.bg, color: sc.color }}>{a.status}</span>
                </div>
                <code style={{ fontSize: 11, color: HNH.ink3 }}>{a.slug}</code>
                <div className="flex flex-wrap gap-1" style={{ marginTop: 6 }}>
                  {a.scopes.slice(0, 3).map(s => (
                    <code key={s} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: HNH.navy50, color: HNH.navy }}>{s}</code>
                  ))}
                  {a.scopes.length > 3 && <span style={{ fontSize: 10, color: HNH.ink3 }}>+{a.scopes.length - 3}</span>}
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
        </div>
      </PullToRefresh>

      {selected && <DetailModal account={selected} onClose={() => setSelected(null)} onUpdated={load} />}
    </div>
  )
}
