import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

/* ── Types ── */
interface Notification {
  id: number
  level: string
  unread: boolean
  verb: string
  description: string | null
  timestamp: string
  deleted: boolean
  data: Record<string, unknown> | string | null
  actor_name: string | null
}

interface Paginated<T> { count: number; next: string | null; results: T[] }

/* ── Helpers ── */
type NotifTone = 'success' | 'red' | 'warn' | 'navy' | 'gold' | 'ink'

function notifMeta(verb: string, level: string): { initials: string; bg: string; tone: NotifTone; icon: string } {
  const v = verb.toLowerCase()
  if (v.includes('duyệt') || v.includes('approved'))
    return { initials: 'OK', bg: HNH.success, tone: 'success', icon: 'check' }
  if (v.includes('từ chối') || v.includes('rejected'))
    return { initials: '!', bg: HNH.red, tone: 'red', icon: 'x' }
  if (v.includes('nghỉ phép') || v.includes('leave') || v.includes('đề xuất'))
    return { initials: 'NP', bg: HNH.navy, tone: 'navy', icon: 'send' }
  if (v.includes('chấm công') || v.includes('attendance'))
    return { initials: 'CC', bg: HNH.warn, tone: 'warn', icon: 'clock' }
  if (v.includes('lương') || v.includes('payroll'))
    return { initials: 'KT', bg: '#a87908', tone: 'gold', icon: 'doc' }
  if (v.includes('tour') || v.includes('schedule'))
    return { initials: 'ĐH', bg: HNH.navy, tone: 'navy', icon: 'briefcase' }
  if (level === 'warning')
    return { initials: '!', bg: HNH.warn, tone: 'warn', icon: 'bell' }
  if (level === 'error')
    return { initials: '!', bg: HNH.red, tone: 'red', icon: 'x' }
  return { initials: 'TB', bg: HNH.ink2, tone: 'ink', icon: 'bell' }
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ngày trước`
  const d = new Date(ts)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function fullTime(ts: string): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} · ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function dateGroup(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const notifDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.floor((today.getTime() - notifDay.getTime()) / 86400000)
  if (diff === 0) return 'Hôm nay'
  if (diff === 1) return 'Hôm qua'
  if (diff < 7) return 'Tuần này'
  if (diff < 30) return 'Tháng này'
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`
}

/** Parse the data field and return an action route + label if applicable. */
function parseNotifAction(n: Notification): { route: string; label: string } | null {
  if (!n.data) return null
  let d: Record<string, unknown>
  if (typeof n.data === 'string') {
    try { d = JSON.parse(n.data) } catch { return null }
  } else {
    d = n.data
  }

  const redirect = (d?.redirect as string) ?? ''
  const icon = (d?.icon as string) ?? ''

  if (!redirect && !icon) return null

  const r = redirect.toLowerCase()

  // Announcements
  if (icon === 'chatbubbles' || r === '/' || r === '')
    return { route: '/announcements', label: 'Xem tin nội bộ' }

  // Approver views: leave request, allocation, attendance request-view
  if (
    (r.includes('/leave/request-view') && !r.includes('/user-request-view')) ||
    r.includes('/leave/leave-allocation-request-view') ||
    (r.includes('/attendance') && r.includes('request-view'))
  ) return { route: '/approvals', label: 'Duyệt ngay' }

  // Employee's own leave requests
  if (r.includes('/leave/user-request-view') || r.includes('/leave'))
    return { route: '/proposals/leave', label: 'Xem đơn của tôi' }

  // Employee attendance
  if (r.includes('/attendance/view-my-attendance') || r.includes('/attendance'))
    return { route: '/attendance', label: 'Xem chấm công' }

  return null
}

type Filter = 'all' | 'unread'

/* ── Notification Detail Sheet ── */
function NotifDetailSheet({
  n,
  onClose,
  onRead,
}: {
  n: Notification
  onClose: () => void
  onRead: () => void
}) {
  const navigate = useNavigate()
  const meta = notifMeta(n.verb, n.level)
  const action = parseNotifAction(n)

  useEffect(() => {
    if (n.unread) onRead()
  }, [n.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = () => {
    if (!action) return
    onClose()
    navigate(action.route)
  }

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
          maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: HNH.line }} />
        </div>

        {/* Header */}
        <div className="flex items-start gap-3" style={{ padding: '14px 20px 0' }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 46, height: 46, borderRadius: 14,
              background: `${meta.bg}18`,
            }}
          >
            <Icon name={meta.icon} size={20} color={meta.bg} stroke={2} />
          </div>
          <div className="flex-1 min-w-0" style={{ paddingTop: 2 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink, lineHeight: 1.4 }}>
              {n.verb}
            </div>
            {n.actor_name && (
              <div style={{ fontSize: 12, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
                {n.actor_name}
              </div>
            )}
          </div>
          <button onClick={onClose} className="border-none cursor-pointer bg-transparent shrink-0" style={{ padding: 4 }}>
            <Icon name="x" size={18} color={HNH.ink3} stroke={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
          {n.description && (
            <div style={{
              padding: '14px 16px', background: HNH.cream, borderRadius: 14,
              fontSize: 14, color: HNH.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            }}>
              {n.description}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 10 }}>
            {fullTime(n.timestamp)}
          </div>
        </div>

        {/* CTA */}
        <div style={{ padding: '8px 20px calc(32px + env(safe-area-inset-bottom, 0px))' }}>
          {action ? (
            <button
              onClick={handleAction}
              className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
              style={{
                height: 50, borderRadius: 16, fontSize: 15, fontWeight: 800,
                background: `linear-gradient(135deg, ${HNH.navy} 0%, #0a1e3d 100%)`,
                color: '#fff',
              }}
            >
              <Icon name="send" size={16} color="#fff" stroke={2.2} />
              {action.label}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex items-center justify-center w-full border-none cursor-pointer"
              style={{
                height: 46, borderRadius: 14, fontSize: 14, fontWeight: 700,
                background: HNH.cream2, color: HNH.ink2,
                border: `1.5px solid ${HNH.line}`,
              }}
            >
              Đóng
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Notification Card ── */
function NotifCard({ n, onOpen, onDelete }: {
  n: Notification
  onOpen: () => void
  onDelete: () => void
}) {
  const meta = notifMeta(n.verb, n.level)
  const time = relativeTime(n.timestamp)

  return (
    <div
      className="flex items-start gap-3"
      style={{
        padding: '13px 14px',
        background: n.unread ? `${HNH.navy}08` : 'transparent',
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={onOpen}
    >
      {/* Icon avatar */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 40, height: 40, borderRadius: 12,
          background: `${meta.bg}18`,
        }}
      >
        <Icon name={meta.icon} size={18} color={meta.bg} stroke={2} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div style={{
              fontSize: 13, fontWeight: n.unread ? 700 : 600, color: HNH.ink,
              lineHeight: 1.4,
            }}>
              {n.verb}
            </div>
            {n.description && (
              <div style={{
                fontSize: 12, color: HNH.ink3, fontWeight: 500, marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              } as React.CSSProperties}>
                {n.description}
              </div>
            )}
            {n.actor_name && (
              <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
                {n.actor_name}
              </div>
            )}
          </div>
          {n.unread && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: HNH.red, flexShrink: 0, marginTop: 4,
            }} />
          )}
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
          <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500 }}>{time}</span>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="flex items-center justify-center border-none cursor-pointer"
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'transparent', padding: 0,
            }}
          >
            <Icon name="x" size={12} color={HNH.ink3} stroke={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main ── */
export function NotificationsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [nextPage, setNextPage] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [detail, setDetail] = useState<Notification | null>(null)

  const fetchNotifications = useCallback(async (f: Filter) => {
    setLoading(true)
    try {
      const type = f === 'unread' ? 'unread' : 'all'
      const data = await api.get<Paginated<Notification>>(
        `/api/notifications/list/${type}?page_size=50`
      )
      setNotifications(data.results)
      setTotal(data.count)
      setNextPage(data.next)
    } catch { setNotifications([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchNotifications(filter) }, [filter, fetchNotifications])

  const loadMore = async () => {
    if (!nextPage || loadingMore) return
    setLoadingMore(true)
    try {
      const url = nextPage.replace(/^.*\/bff/, '')
      const data = await api.get<Paginated<Notification>>(url)
      setNotifications(prev => [...prev, ...data.results])
      setNextPage(data.next)
    } catch { /* ignore */ } finally { setLoadingMore(false) }
  }

  const markRead = async (id: number) => {
    await api.post(`/api/notifications/${id}/`, {})
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, unread: false } : n)
      const remaining = updated.filter(n => n.unread).length
      if (remaining === 0) navigator.clearAppBadge?.()
      else navigator.setAppBadge?.(remaining)
      return updated
    })
  }

  const deleteNotif = async (id: number) => {
    await api.del(`/api/notifications/${id}/`)
    setNotifications(prev => prev.filter(n => n.id !== id))
    setTotal(prev => prev - 1)
    if (detail?.id === id) setDetail(null)
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    try {
      await api.post('/api/notifications/bulk-read/', {})
      setNotifications(prev => prev.map(n => ({ ...n, unread: false })))
      navigator.clearAppBadge?.()
      toast('Đã đọc tất cả thông báo')
    } finally { setMarkingAll(false) }
  }

  const handleRefresh = useCallback(async () => {
    await fetchNotifications(filter)
  }, [filter, fetchNotifications])

  const unreadCount = notifications.filter(n => n.unread).length

  // Group by date
  const grouped: { label: string; items: Notification[] }[] = []
  for (const n of notifications) {
    const label = dateGroup(n.timestamp)
    const last = grouped[grouped.length - 1]
    if (last && last.label === label) {
      last.items.push(n)
    } else {
      grouped.push({ label, items: [n] })
    }
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Thông báo"
        onBack={() => navigate(-1)}
        trailing={
          unreadCount > 0 ? (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="border-none cursor-pointer"
              style={{
                fontSize: 11.5, fontWeight: 700, color: HNH.navy,
                background: HNH.navy50, borderRadius: 8, padding: '5px 10px',
                opacity: markingAll ? 0.5 : 1,
              }}
            >
              Đọc tất cả
            </button>
          ) : undefined
        }
      />

      <PullToRefresh onRefresh={handleRefresh}>
      <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>
        {/* Filters + count */}
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="flex gap-2">
            {([
              { key: 'all' as Filter, label: 'Tất cả' },
              { key: 'unread' as Filter, label: 'Chưa đọc' },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="border-none cursor-pointer"
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: filter === f.key ? HNH.navy : '#fff',
                  color: filter === f.key ? '#fff' : HNH.ink2,
                  fontSize: 12, fontWeight: 700,
                  border: `1.5px solid ${filter === f.key ? HNH.navy : HNH.line}`,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: HNH.ink3 }}>
            {total} thông báo
          </span>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Đang tải...
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Icon name="bell" size={36} color={HNH.ink3} stroke={1.5} />
            <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
              {filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo'}
            </div>
            <div style={{ fontSize: 12.5, color: HNH.ink3, marginTop: 4 }}>
              Thông báo mới sẽ hiển thị tại đây
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.map(g => (
              <div key={g.label}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: HNH.ink3,
                  letterSpacing: 0.3, textTransform: 'uppercase',
                  padding: '4px 2px 6px',
                }}>
                  {g.label}
                </div>
                <div style={{
                  background: '#fff', borderRadius: 16,
                  border: `1px solid ${HNH.line}`, overflow: 'hidden',
                }}>
                  {g.items.map((n, i) => (
                    <div key={n.id} style={{
                      borderBottom: i < g.items.length - 1 ? `1px solid ${HNH.line}` : 'none',
                    }}>
                      <NotifCard
                        n={n}
                        onOpen={() => setDetail(n)}
                        onDelete={() => deleteNotif(n.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Load more */}
            {nextPage && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full border-none cursor-pointer"
                style={{
                  padding: '12px', borderRadius: 12,
                  background: '#fff', color: HNH.navy,
                  fontSize: 13, fontWeight: 700,
                  border: `1.5px solid ${HNH.line}`,
                  opacity: loadingMore ? 0.6 : 1,
                }}
              >
                {loadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            )}
          </div>
        )}
      </div>
      </PullToRefresh>

      {detail && (
        <NotifDetailSheet
          n={detail}
          onClose={() => setDetail(null)}
          onRead={() => markRead(detail.id)}
        />
      )}
    </div>
  )
}
