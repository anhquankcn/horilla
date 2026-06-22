import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

/* ── Types ── */
interface FeedItem {
  id: number
  title: string
  body: string
  pinned: boolean
  sender_name: string
  created_at: string
  like_count: number
  my_like: boolean
  read: boolean
  read_at: string | null
}

interface FeedResponse {
  count: number
  page: number
  page_size: number
  results: FeedItem[]
}

interface Department {
  id: number
  department: string
}

/* ── Helpers ── */
function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} ngày trước`
  return new Date(ts).toLocaleDateString('vi-VN')
}

/* ── Feed Card ── */
function FeedCard({
  item,
  onLike,
  onClick,
}: {
  item: FeedItem
  onLike: () => void
  onClick: () => void
}) {
  return (
    <div
      style={{
        background: '#fff', borderRadius: 16,
        border: `1px solid ${item.pinned ? HNH.red + '30' : HNH.line}`,
        boxShadow: item.pinned ? `0 2px 12px ${HNH.red}15` : 'none',
        overflow: 'hidden',
      }}
    >
      {item.pinned && (
        <div style={{
          background: `linear-gradient(90deg, ${HNH.red}18 0%, transparent 100%)`,
          padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 5,
          borderBottom: `1px solid ${HNH.red}20`,
        }}>
          <Icon name="pin" size={12} color={HNH.red} stroke={2.5} />
          <span style={{ fontSize: 10.5, fontWeight: 800, color: HNH.red, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Ghim
          </span>
        </div>
      )}

      <button
        onClick={onClick}
        className="w-full border-none cursor-pointer text-left bg-transparent"
        style={{ padding: '14px 14px 10px' }}
      >
        <div className="flex items-start gap-2.5">
          <div className="flex items-center justify-center shrink-0" style={{
            width: 36, height: 36, borderRadius: 11,
            background: item.pinned ? HNH.red50 : HNH.navy50,
            marginTop: 1,
          }}>
            <Icon
              name="bell"
              size={17}
              color={item.pinned ? HNH.red : HNH.navy}
              stroke={2}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span style={{
                fontSize: 14, fontWeight: 700, color: HNH.ink, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.title}</span>
              {!item.read && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: HNH.red, flexShrink: 0 }} />
              )}
            </div>
            <div style={{
              fontSize: 13, color: HNH.ink2, marginTop: 4, lineHeight: 1.5,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {item.body}
            </div>
            <div className="flex items-center gap-2" style={{ marginTop: 8, fontSize: 11.5, color: HNH.ink3 }}>
              <span style={{ fontWeight: 600 }}>{item.sender_name}</span>
              <span>·</span>
              <span>{relTime(item.created_at)}</span>
            </div>
          </div>
        </div>
      </button>

      {/* Like bar */}
      <div
        style={{
          padding: '8px 14px 12px',
          borderTop: `1px solid ${HNH.line}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <button
          onClick={onLike}
          className="flex items-center gap-1.5 border-none cursor-pointer bg-transparent"
          style={{ padding: '4px 10px', borderRadius: 20,
            background: item.my_like ? HNH.red50 : HNH.cream2,
          }}
        >
          <span style={{ fontSize: 15 }}>{item.my_like ? '❤️' : '🤍'}</span>
          <span style={{
            fontSize: 12.5, fontWeight: 700,
            color: item.my_like ? HNH.red : HNH.ink3,
          }}>
            {item.like_count > 0 ? item.like_count : 'Thích'}
          </span>
        </button>
      </div>
    </div>
  )
}

/* ── Detail Modal ── */
function DetailModal({
  item,
  onClose,
  onRead,
}: {
  item: FeedItem
  onClose: () => void
  onRead: (id: number) => void
}) {
  useEffect(() => {
    // Mark as read via detail endpoint — this decrements announcements_unread badge
    if (!item.read) {
      api.get(`/api/notifications/announcements/${item.id}/`)
        .then(() => onRead(item.id))
        .catch(() => {})
    }
  }, [item.id, item.read, onRead])

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 100, background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '24px 24px 0 0', width: '100%',
          maxWidth: 600, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="flex items-center justify-between" style={{ padding: '18px 20px 0' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: HNH.ink, flex: 1, paddingRight: 12 }}>
            {item.title}
          </div>
          <button onClick={onClose} className="border-none cursor-pointer bg-transparent" style={{ padding: 4 }}>
            <Icon name="x" size={20} color={HNH.ink3} stroke={2} />
          </button>
        </div>

        <div style={{ padding: '0 20px calc(32px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto', flex: 1 }}>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
            {item.pinned && (
              <span style={{
                fontSize: 10.5, fontWeight: 800, padding: '3px 10px', borderRadius: 8,
                background: HNH.red50, color: HNH.red, textTransform: 'uppercase',
              }}>Ghim</span>
            )}
            <span style={{ fontSize: 11, color: HNH.ink3 }}>
              {item.sender_name} · {relTime(item.created_at)}
            </span>
          </div>

          <div style={{
            marginTop: 16, padding: '16px 18px', background: HNH.cream,
            borderRadius: 14, fontSize: 14, color: HNH.ink, lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
          }}>
            {item.body}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Compose Modal ── */
function ComposeModal({
  onClose,
  onSent,
}: {
  onClose: () => void
  onSent: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [targetType, setTargetType] = useState<'company' | 'department'>('company')
  const [deptId, setDeptId] = useState<number | ''>('')
  const [pinned, setPinned] = useState(false)
  const [sending, setSending] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])

  useEffect(() => {
    api.get<{ departments: Department[] }>('/api/notifications/announcements/targets/')
      .then(d => setDepartments(d.departments ?? []))
      .catch(() => {})
  }, [])

  const canSend = title.trim().length > 0 && body.trim().length > 0 &&
    (targetType === 'company' || (targetType === 'department' && deptId !== ''))

  const handleSend = async () => {
    if (!canSend || sending) return
    setSending(true)
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        target_type: targetType,
        pinned,
      }
      if (targetType === 'department' && deptId !== '') {
        payload.department_id = deptId
      }
      await api.post('/api/notifications/announcements/', payload)
      toast('Đã gửi tin nội bộ')
      onSent()
      onClose()
    } catch {
      toast('Không thể gửi tin. Vui lòng thử lại.')
    } finally {
      setSending(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 12, border: `1.5px solid ${HNH.line}`,
    padding: '10px 12px', fontSize: 14, color: HNH.ink,
    background: '#fff', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 110, background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '24px 24px 0 0', width: '100%',
          maxWidth: 600, maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '18px 20px 14px' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: HNH.ink }}>Tạo tin nội bộ</div>
          <button onClick={onClose} className="border-none cursor-pointer bg-transparent" style={{ padding: 4 }}>
            <Icon name="x" size={20} color={HNH.ink3} stroke={2} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '0 20px 8px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Title */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Tiêu đề *
            </div>
            <input
              style={inputStyle}
              placeholder="Tiêu đề thông báo..."
              maxLength={200}
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Body */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Nội dung *
            </div>
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
              placeholder="Nhập nội dung thông báo..."
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          {/* Target type */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Gửi đến
            </div>
            <div className="flex gap-2">
              {(['company', 'department'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTargetType(t)}
                  className="flex items-center gap-1.5 border-none cursor-pointer"
                  style={{
                    padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: targetType === t ? HNH.red : HNH.cream2,
                    color: targetType === t ? '#fff' : HNH.ink2,
                    border: targetType === t ? `1.5px solid ${HNH.red}` : `1.5px solid ${HNH.line}`,
                  }}
                >
                  {t === 'company' ? 'Toàn công ty' : 'Phòng ban'}
                </button>
              ))}
            </div>

            {targetType === 'department' && (
              <select
                style={{ ...inputStyle, marginTop: 10, appearance: 'none' }}
                value={deptId}
                onChange={e => setDeptId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">-- Chọn phòng ban --</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.department}</option>
                ))}
              </select>
            )}
          </div>

          {/* Pinned toggle */}
          <button
            onClick={() => setPinned(p => !p)}
            className="flex items-center gap-3 border-none cursor-pointer text-left"
            style={{
              background: pinned ? HNH.red50 : HNH.cream2,
              borderRadius: 12, padding: '10px 14px',
              border: `1.5px solid ${pinned ? HNH.red + '60' : HNH.line}`,
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 6, border: `2px solid ${pinned ? HNH.red : HNH.ink3}`,
              background: pinned ? HNH.red : 'transparent', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {pinned && <Icon name="check" size={12} color="#fff" stroke={3} />}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: pinned ? HNH.red : HNH.ink }}>
                Ghim thông báo
              </div>
              <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>
                Hiển thị nổi bật trên đầu feed
              </div>
            </div>
          </button>
        </div>

        {/* Send button */}
        <div style={{ padding: '12px 20px calc(32px + env(safe-area-inset-bottom, 0px))' }}>
          <button
            onClick={handleSend}
            disabled={!canSend || sending}
            className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
            style={{
              height: 50, borderRadius: 16, fontSize: 15, fontWeight: 800,
              background: canSend && !sending ? `linear-gradient(135deg, ${HNH.red} 0%, #8b1520 100%)` : HNH.line,
              color: canSend && !sending ? '#fff' : HNH.ink3,
            }}
          >
            <Icon name="send" size={16} color={canSend && !sending ? '#fff' : HNH.ink3} stroke={2.2} />
            {sending ? 'Đang gửi...' : 'Gửi thông báo'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ── */
export function AnnouncementFeedPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [detail, setDetail] = useState<FeedItem | null>(null)
  const [isStaff, setIsStaff] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)

  useEffect(() => {
    api.get<{ is_staff?: boolean }>('/api/employee/my-apps/')
      .then(d => setIsStaff(d.is_staff ?? false))
      .catch(() => {})
  }, [])

  const loadFeed = useCallback(async (p: number, replace: boolean) => {
    if (p === 1) setLoading(true); else setLoadingMore(true)
    try {
      const data = await api.get<FeedResponse>(
        `/api/notifications/announcements/feed/?page=${p}&page_size=20`
      )
      const next = data.results ?? []
      setItems(prev => replace ? next : [...prev, ...next])
      setHasMore((data.count ?? 0) > p * 20)
      setPage(p)
    } catch {
      toast('Không thể tải tin nội bộ')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [toast])

  useEffect(() => { loadFeed(1, true) }, [loadFeed])

  const handleRead = (id: number) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, read: true } : it))
  }

  const handleLike = async (id: number) => {
    setItems(prev => prev.map(it =>
      it.id !== id ? it : {
        ...it,
        my_like: !it.my_like,
        like_count: it.my_like ? it.like_count - 1 : it.like_count + 1,
      }
    ))
    try {
      await api.post(`/api/notifications/announcements/${id}/like/`, {})
    } catch {
      setItems(prev => prev.map(it =>
        it.id !== id ? it : {
          ...it,
          my_like: !it.my_like,
          like_count: it.my_like ? it.like_count - 1 : it.like_count + 1,
        }
      ))
    }
  }

  const pinned = items.filter(i => i.pinned)
  const recent = items.filter(i => !i.pinned)

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Tin nội bộ" onBack={() => navigate(-1)} />

      <PullToRefresh onRefresh={async () => loadFeed(1, true)}>
        <div style={{ padding: '12px 16px 100px', maxWidth: 600, margin: '0 auto' }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3 }}>
              <div style={{
                width: 28, height: 28, border: `3px solid ${HNH.line}`,
                borderTopColor: HNH.red, borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
              }} />
              Đang tải...
            </div>
          )}

          {!loading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Icon name="bell" size={44} color={HNH.ink4} stroke={1.5} />
              <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink, marginTop: 14 }}>
                Chưa có tin nội bộ
              </div>
              <div style={{ fontSize: 13, color: HNH.ink3, marginTop: 6 }}>
                HR sẽ gửi thông báo tới đây
              </div>
            </div>
          )}

          {!loading && pinned.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: HNH.ink3,
                textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
              }}>
                📌 Ghim
              </div>
              <div className="flex flex-col gap-3">
                {pinned.map(item => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    onLike={() => handleLike(item.id)}
                    onClick={() => setDetail(item)}
                  />
                ))}
              </div>
            </div>
          )}

          {!loading && recent.length > 0 && (
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: HNH.ink3,
                textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
              }}>
                Gần đây
              </div>
              <div className="flex flex-col gap-3">
                {recent.map(item => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    onLike={() => handleLike(item.id)}
                    onClick={() => setDetail(item)}
                  />
                ))}
              </div>
            </div>
          )}

          {hasMore && (
            <button
              onClick={() => loadFeed(page + 1, false)}
              disabled={loadingMore}
              className="flex items-center justify-center w-full border-none cursor-pointer"
              style={{
                marginTop: 16, height: 44, borderRadius: 14, fontWeight: 700, fontSize: 13,
                background: '#fff', color: HNH.navy, border: `1.5px solid ${HNH.line}`,
              }}
            >
              {loadingMore ? 'Đang tải...' : 'Xem thêm'}
            </button>
          )}
        </div>
      </PullToRefresh>

      {/* Staff-only FAB */}
      {isStaff && (
        <button
          onClick={() => setComposeOpen(true)}
          className="flex items-center justify-center border-none cursor-pointer"
          style={{
            position: 'fixed', bottom: 88, right: 20, zIndex: 50,
            width: 52, height: 52, borderRadius: '50%',
            background: `linear-gradient(135deg, ${HNH.red} 0%, #8b1520 100%)`,
            boxShadow: `0 4px 16px ${HNH.red}55`,
          }}
        >
          <Icon name="plus" size={24} color="#fff" stroke={2.5} />
        </button>
      )}

      {detail && (
        <DetailModal item={detail} onClose={() => setDetail(null)} onRead={handleRead} />
      )}

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSent={() => loadFeed(1, true)}
        />
      )}
    </div>
  )
}
