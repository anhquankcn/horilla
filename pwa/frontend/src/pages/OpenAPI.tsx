import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

interface ServiceAccount {
  id: number
  username: string
  description: string
  is_active: boolean
  date_joined: string
}

interface CreateResult extends ServiceAccount {
  access_token: string
  token_note: string
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: HNH.ink3,
      letterSpacing: 0.6, textTransform: 'uppercase',
      padding: '0 4px 6px',
    }}>
      {title}
    </div>
  )
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: HNH.navy50, borderRadius: 14,
      border: `1px solid ${HNH.navy}22`,
      padding: '12px 14px', marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

function TokenModal({ result, onClose }: { result: CreateResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(result.access_token)
      setCopied(true)
      toast('Đã copy token')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Không copy được — hãy chọn và copy thủ công')
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, padding: '24px 20px',
        maxWidth: 480, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: HNH.success50, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="check" size={20} color={HNH.success} stroke={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>
              Tài khoản đã tạo
            </div>
            <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 1 }}>
              {result.username}
            </div>
          </div>
        </div>

        <div style={{
          background: HNH.cream, borderRadius: 12, padding: 14,
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Access Token
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 11.5,
            color: HNH.ink, wordBreak: 'break-all', lineHeight: 1.5,
            maxHeight: 120, overflowY: 'auto',
          }}>
            {result.access_token}
          </div>
        </div>

        <div style={{
          background: '#fff8e1', borderRadius: 10, padding: '10px 12px',
          border: '1px solid #f0c040', marginBottom: 16,
          fontSize: 12, color: '#7a5000',
        }}>
          <Icon name="alert" size={13} color="#c08000" stroke={2} />
          {' '}{result.token_note}
        </div>

        <div className="flex gap-2">
          <button
            onClick={copyToken}
            style={{
              flex: 1, height: 44, borderRadius: 12, border: 'none',
              background: copied ? HNH.success : HNH.navy,
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', transition: 'background 0.2s',
            }}
          >
            {copied ? 'Đã copy!' : 'Copy Token'}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 44, borderRadius: 12,
              border: `1.5px solid ${HNH.line}`,
              background: 'transparent', color: HNH.ink,
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateForm({ onCreated }: { onCreated: (r: CreateResult) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleCreate = async () => {
    if (!name.trim()) { toast('Nhập tên hệ thống'); return }
    setLoading(true)
    try {
      const result = await api.post<CreateResult>('/api/base/service-accounts/', {
        name: name.trim(),
        description: description.trim(),
      })
      setName('')
      setDescription('')
      onCreated(result)
    } catch {
      toast('Lỗi khi tạo tài khoản')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 18,
      border: `1px solid ${HNH.line}`,
      padding: '16px 14px', marginBottom: 14,
    }}>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
          Tên hệ thống *
        </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="vd: Arkon AI, PMS TOUR, Zalo OA"
          style={{
            width: '100%', height: 40, borderRadius: 10,
            border: `1.5px solid ${HNH.line}`, padding: '0 12px',
            fontSize: 14, color: HNH.ink, background: HNH.cream,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
          Mô tả (tuỳ chọn)
        </label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="vd: AI assistant nội bộ, đọc danh bạ nhân sự"
          style={{
            width: '100%', height: 40, borderRadius: 10,
            border: `1.5px solid ${HNH.line}`, padding: '0 12px',
            fontSize: 14, color: HNH.ink, background: HNH.cream,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
      <button
        onClick={handleCreate}
        disabled={loading}
        style={{
          width: '100%', height: 44, borderRadius: 12, border: 'none',
          background: loading ? HNH.ink4 : HNH.navy,
          color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Đang tạo...' : 'Tạo tài khoản API'}
      </button>
    </div>
  )
}

function AccountCard({
  account,
  onToggle,
  onRotate,
}: {
  account: ServiceAccount
  onToggle: (id: number, val: boolean) => void
  onRotate: (id: number) => void
}) {
  const joinDate = new Date(account.date_joined).toLocaleDateString('vi-VN')

  return (
    <div style={{
      background: '#fff', borderRadius: 16,
      border: `1px solid ${HNH.line}`,
      padding: '12px 14px', marginBottom: 8,
      opacity: account.is_active ? 1 : 0.6,
    }}>
      <div className="flex items-start gap-3">
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: account.is_active ? HNH.navy50 : HNH.cream2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon
            name="shield"
            size={17}
            color={account.is_active ? HNH.navy : HNH.ink4}
            stroke={2}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>
              {account.description || account.username}
            </span>
            <span style={{
              fontSize: 9.5, fontWeight: 700, borderRadius: 6,
              padding: '2px 7px',
              background: account.is_active ? HNH.success50 : HNH.cream2,
              color: account.is_active ? HNH.success : HNH.ink4,
            }}>
              {account.is_active ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 2, fontFamily: 'monospace' }}>
            {account.username}
          </div>
          <div style={{ fontSize: 11, color: HNH.ink4, marginTop: 2 }}>
            Tạo: {joinDate}
          </div>
        </div>
      </div>

      <div className="flex gap-2" style={{ marginTop: 10 }}>
        <button
          onClick={() => onRotate(account.id)}
          disabled={!account.is_active}
          style={{
            flex: 1, height: 34, borderRadius: 9,
            border: `1.5px solid ${HNH.navy}`,
            background: 'transparent', color: HNH.navy,
            fontSize: 12, fontWeight: 600, cursor: account.is_active ? 'pointer' : 'not-allowed',
            opacity: account.is_active ? 1 : 0.4,
          }}
        >
          Lấy token mới
        </button>
        <button
          onClick={() => onToggle(account.id, !account.is_active)}
          style={{
            flex: 1, height: 34, borderRadius: 9,
            border: `1.5px solid ${account.is_active ? HNH.red : HNH.success}`,
            background: 'transparent',
            color: account.is_active ? HNH.red : HNH.success,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {account.is_active ? 'Vô hiệu hoá' : 'Kích hoạt lại'}
        </button>
      </div>
    </div>
  )
}

export function OpenAPIPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<ServiceAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [tokenModal, setTokenModal] = useState<CreateResult | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<ServiceAccount[]>('/api/base/service-accounts/')
      setAccounts(data)
    } catch {
      toast('Không có quyền hoặc lỗi tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleCreated = (result: CreateResult) => {
    setTokenModal(result)
    setShowCreate(false)
    load()
  }

  const handleToggle = async (id: number, val: boolean) => {
    try {
      await api.patch(`/api/base/service-accounts/${id}/`, { is_active: val })
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, is_active: val } : a))
      toast(val ? 'Đã kích hoạt lại' : 'Đã vô hiệu hoá')
    } catch {
      toast('Lỗi khi cập nhật')
    }
  }

  const handleRotate = async (id: number) => {
    try {
      const result = await api.post<{ access_token: string; token_note: string }>(
        `/api/base/service-accounts/${id}/rotate-token/`, {}
      )
      const account = accounts.find(a => a.id === id)!
      setTokenModal({ ...account, ...result })
    } catch {
      toast('Lỗi khi lấy token')
    }
  }

  const BASE_URL = `${window.location.origin}/api`
  const AUTH_ENDPOINT = `${window.location.origin}/api/auth/login/`

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Open API" onBack={() => navigate(-1)} />

      <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>

        {/* Hướng dẫn tích hợp */}
        <SectionTitle title="Hướng dẫn tích hợp" />
        <InfoBox>
          <div style={{ fontSize: 13, fontWeight: 700, color: HNH.navy, marginBottom: 8 }}>
            Base URL
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 12.5,
            background: '#fff', borderRadius: 8, padding: '6px 10px',
            color: HNH.ink, marginBottom: 12, wordBreak: 'break-all',
          }}>
            {BASE_URL}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: HNH.navy, marginBottom: 8 }}>
            Lấy Bearer Token
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 11,
            background: '#fff', borderRadius: 8, padding: '8px 10px',
            color: HNH.ink, marginBottom: 8, lineHeight: 1.7,
          }}>
            <span style={{ color: '#d04000' }}>POST</span>{' '}{AUTH_ENDPOINT}<br />
            <span style={{ color: HNH.ink3 }}>{'{'}</span><br />
            {'  '}<span style={{ color: '#0070c0' }}>"username"</span>: <span style={{ color: '#006600' }}>"svc_xxx"</span>,<br />
            {'  '}<span style={{ color: '#0070c0' }}>"password"</span>: <span style={{ color: '#006600' }}>"..."</span><br />
            <span style={{ color: HNH.ink3 }}>{'}'}</span>
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink2, lineHeight: 1.5 }}>
            Response có trường <code style={{ background: HNH.cream2, borderRadius: 4, padding: '1px 5px' }}>access</code>{' '}
            — dùng làm <code style={{ background: HNH.cream2, borderRadius: 4, padding: '1px 5px' }}>Authorization: Bearer &lt;token&gt;</code>{' '}
            cho mọi request. Token hết hạn sau <strong>30 ngày</strong>.
          </div>
        </InfoBox>

        {/* Danh sách tài khoản */}
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <SectionTitle title={`Tài khoản API (${accounts.length})`} />
          <button
            onClick={() => setShowCreate(v => !v)}
            style={{
              height: 30, borderRadius: 9, border: 'none',
              background: HNH.navy, color: '#fff',
              fontSize: 12, fontWeight: 700, padding: '0 14px',
              cursor: 'pointer',
            }}
          >
            {showCreate ? 'Huỷ' : '+ Tạo mới'}
          </button>
        </div>

        {showCreate && (
          <CreateForm onCreated={handleCreated} />
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: HNH.ink3, fontSize: 14 }}>
            Đang tải...
          </div>
        ) : accounts.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 16px',
            color: HNH.ink3, fontSize: 14,
          }}>
            <Icon name="shield" size={36} color={HNH.ink4} stroke={1.5} />
            <div style={{ marginTop: 10 }}>Chưa có tài khoản API nào.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Nhấn "+ Tạo mới" để thêm.</div>
          </div>
        ) : (
          <>
            {accounts.filter(a => a.is_active).map(a => (
              <AccountCard key={a.id} account={a} onToggle={handleToggle} onRotate={handleRotate} />
            ))}
            {accounts.some(a => !a.is_active) && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink4, margin: '10px 4px 6px' }}>
                  Không hoạt động
                </div>
                {accounts.filter(a => !a.is_active).map(a => (
                  <AccountCard key={a.id} account={a} onToggle={handleToggle} onRotate={handleRotate} />
                ))}
              </>
            )}
          </>
        )}

        {/* Endpoints tham khảo */}
        <div style={{ marginTop: 20 }}>
          <SectionTitle title="Endpoints tham khảo" />
          <div style={{
            background: '#fff', borderRadius: 16,
            border: `1px solid ${HNH.line}`,
            overflow: 'hidden',
          }}>
            {[
              ['GET', '/api/employee/departments/', 'Danh sách phòng ban'],
              ['GET', '/api/employee/directory/?department={id}', 'NV theo phòng ban'],
              ['GET', '/api/employee/employees/by-email/?email={email}', 'NV theo email'],
              ['GET', '/api/employee/{id}/public-info/', 'Thông tin NV theo ID'],
            ].map(([method, path, label], i, arr) => (
              <div
                key={path}
                style={{
                  padding: '10px 14px',
                  borderBottom: i < arr.length - 1 ? `1px solid ${HNH.line}` : 'none',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 800, borderRadius: 5, padding: '2px 6px',
                  background: method === 'GET' ? '#e8f4ea' : '#fde8e8',
                  color: method === 'GET' ? '#1a7a30' : '#c0222b',
                  flexShrink: 0, marginTop: 1,
                }}>
                  {method}
                </span>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: HNH.ink, lineHeight: 1.3 }}>
                    {path}
                  </div>
                  <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 2 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {tokenModal && (
        <TokenModal result={tokenModal} onClose={() => setTokenModal(null)} />
      )}
    </div>
  )
}
