import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { TopBar } from '../components/layout/TopBar'
import { useApi } from '../lib/useApi'
import { api } from '../lib/api'

interface Notification {
  id: number
  level: string
  unread: boolean
  verb: string
  timestamp: string
  deleted: boolean
  data: string | null
}

interface Paginated<T> { count: number; results: T[] }

function notifMeta(verb: string, level: string): { avatar: string; bg: string; tone: 'red' | 'navy' | 'gold' | 'success' | 'warn' | 'ink' } {
  const v = verb.toLowerCase()
  if (v.includes('approved') || v.includes('duyệt')) return { avatar: 'HR', bg: HNH.success, tone: 'success' }
  if (v.includes('rejected') || v.includes('từ chối')) return { avatar: 'HR', bg: HNH.red, tone: 'red' }
  if (v.includes('leave') || v.includes('nghỉ')) return { avatar: 'HR', bg: HNH.red, tone: 'red' }
  if (v.includes('attendance') || v.includes('chấm công')) return { avatar: 'CC', bg: HNH.warn, tone: 'warn' }
  if (v.includes('payroll') || v.includes('lương')) return { avatar: 'KT', bg: '#a87908', tone: 'gold' }
  if (v.includes('tour') || v.includes('schedule')) return { avatar: 'ĐH', bg: HNH.navy, tone: 'navy' }
  if (level === 'warning') return { avatar: 'HT', bg: HNH.warn, tone: 'warn' }
  return { avatar: 'HT', bg: HNH.ink2, tone: 'ink' }
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins} phút`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} giờ`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} ngày`
  return `${Math.floor(days / 30)} tháng`
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const { data: resp, refresh } = useApi<Paginated<Notification>>('/api/notifications/list/all')
  const [markingAll, setMarkingAll] = useState(false)

  const notifications = resp?.results ?? []
  const unreadCount = notifications.filter(n => n.unread).length

  const markRead = useCallback(async (id: number) => {
    await api.post(`/api/notifications/${id}/`, {})
    refresh()
  }, [refresh])

  const markAllRead = useCallback(async () => {
    setMarkingAll(true)
    try {
      await api.post('/api/notifications/bulk-read/', {})
      refresh()
    } finally {
      setMarkingAll(false)
    }
  }, [refresh])

  return (
    <div className="flex flex-col min-h-[100dvh]" style={{ background: HNH.cream }}>
      <TopBar
        title="Thông báo"
        onBack={() => navigate(-1)}
        trailing={
          unreadCount > 0 ? (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="border-none bg-transparent cursor-pointer"
              style={{ fontSize: 12, color: HNH.red, fontWeight: 600, opacity: markingAll ? 0.5 : 1 }}
            >
              Đọc tất cả
            </button>
          ) : undefined
        }
      />

      <div style={{ padding: '0 20px 20px' }}>
        {notifications.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}`, padding: 32, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
            Chưa có thông báo
          </div>
        )}

        {notifications.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
            {notifications.map((n, i) => {
              const meta = notifMeta(n.verb, n.level)
              const time = relativeTime(n.timestamp)
              return (
                <div
                  key={n.id}
                  onClick={() => n.unread && markRead(n.id)}
                  className="flex items-start gap-3"
                  style={{
                    padding: '14px 14px',
                    borderBottom: i === notifications.length - 1 ? 'none' : `1px solid ${HNH.line}`,
                    background: n.unread ? HNH.red50 : 'transparent',
                    cursor: n.unread ? 'pointer' : 'default',
                  }}
                >
                  <Avatar initials={meta.avatar} size={36} bg={meta.bg} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink }}>{n.verb}</span>
                      {n.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.red, flexShrink: 0 }} />}
                    </div>
                    <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                      <Badge tone={meta.tone} size="s">{time} trước</Badge>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
