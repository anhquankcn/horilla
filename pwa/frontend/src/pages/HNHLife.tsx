import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'

type Tone = 'navy' | 'red' | 'gold' | 'success'

interface Feature {
  slug: string
  icon: string
  label: string
  desc: string
  path: string
  tone: Tone
}

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
}

const toneBg: Record<Tone, string> = {
  navy: HNH.navy50, red: HNH.red50, gold: '#faf1d6', success: HNH.success50,
}
const toneColor: Record<Tone, string> = {
  navy: HNH.navy, red: HNH.red, gold: '#a87908', success: HNH.success,
}

const FEATURES: Feature[] = [
  { slug: 'announcements',       icon: 'bell',   label: 'Tin nội bộ',       desc: 'Thông báo BGĐ, quy định, sự kiện',        path: '/announcements',       tone: 'red'     },
  { slug: 'attendance',          icon: 'clock',  label: 'Chấm công',        desc: 'Check-in, lịch sử, GPS',                  path: '/attendance',          tone: 'navy'    },
  { slug: 'leave',               icon: 'leaf',   label: 'Nghỉ phép',        desc: 'Số dư, lịch sử, gửi đơn',                 path: '/leave',               tone: 'success' },
  { slug: 'proposals',           icon: 'send',   label: 'Đề xuất',          desc: 'Nghỉ phép, đổi ca, ngày công',             path: '/proposals',           tone: 'success' },
  { slug: 'approvals',           icon: 'check',  label: 'Phê duyệt',        desc: 'Duyệt đề xuất nhân viên',                  path: '/approvals',           tone: 'gold'    },
  { slug: 'payslip',             icon: 'doc',    label: 'Phiếu lương',      desc: 'Chi tiết lương hàng tháng',                 path: '/payslip',             tone: 'gold'    },
  { slug: 'work-schedule',       icon: 'cal',    label: 'Lịch làm việc',    desc: 'Ca làm, giờ vào ra theo tuần',              path: '/work-schedule',       tone: 'navy'    },
  { slug: 'monthly-attendance',  icon: 'cal',    label: 'Công tháng',       desc: 'Lịch công HR xác nhận',                    path: '/attendance/monthly',  tone: 'navy'    },
  { slug: 'notifications',       icon: 'bell',   label: 'Thông báo',        desc: 'Xem thông báo hệ thống',                   path: '/notifications',       tone: 'navy'    },
  { slug: 'helpdesk',            icon: 'help',   label: 'Hỗ trợ IT',        desc: 'Gửi yêu cầu hỗ trợ',                      path: '/helpdesk',            tone: 'navy'    },
  { slug: 'documents',           icon: 'folder', label: 'Tài liệu',         desc: 'Giấy tờ, theo dõi trạng thái',             path: '/documents',           tone: 'navy'    },
  { slug: 'tasks',               icon: 'check',  label: 'Công việc',        desc: 'Tasks, deadline, phân công',                path: '/task-board',          tone: 'red'     },
  { slug: 'projects',            icon: 'folder', label: 'Dự án',            desc: 'Quản lý dự án, tiến độ',                   path: '/projects',            tone: 'gold'    },
  { slug: 'unified-calendar',    icon: 'cal',    label: 'Lịch tổng hợp',   desc: 'Nghỉ phép, deadline, tour, dự án',          path: '/unified-calendar',    tone: 'gold'    },
]

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

function FeedPreviewCard({ item, onClick }: { item: FeedItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 w-full border-none cursor-pointer text-left"
      style={{
        padding: '12px 14px', borderRadius: 14, background: '#fff',
        border: `1px solid ${!item.read ? HNH.red + '40' : HNH.line}`,
      }}
    >
      <div className="flex items-center justify-center shrink-0" style={{
        width: 34, height: 34, borderRadius: 10,
        background: item.pinned ? HNH.red50 : HNH.navy50,
      }}>
        <Icon name="bell" size={16} color={item.pinned ? HNH.red : HNH.navy} stroke={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {item.pinned && (
            <span style={{
              fontSize: 9.5, fontWeight: 800, color: HNH.red,
              background: HNH.red50, padding: '1px 6px', borderRadius: 4,
              textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0,
            }}>Ghim</span>
          )}
          <span style={{
            fontSize: 13, fontWeight: 700, color: HNH.ink,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>{item.title}</span>
          {!item.read && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: HNH.red, flexShrink: 0 }} />
          )}
        </div>
        <div style={{
          fontSize: 11.5, color: HNH.ink3, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.body}</div>
        <div className="flex items-center gap-2" style={{ marginTop: 5, fontSize: 10.5, color: HNH.ink3 }}>
          <span>{item.sender_name}</span>
          <span>·</span>
          <span>{relTime(item.created_at)}</span>
          <span>·</span>
          <span>👍 {item.like_count}</span>
        </div>
      </div>
    </button>
  )
}

function FeatureIcon({ f, iconBox, onTap }: { f: Feature; iconBox: number; onTap: () => void }) {
  const iconSize = iconBox >= 56 ? 26 : 20
  const radius = iconBox >= 56 ? 18 : 14
  return (
    <button
      onClick={onTap}
      className="flex flex-col items-center gap-1.5 border-none cursor-pointer bg-transparent"
      style={{ padding: 0, width: iconBox + 20 }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: iconBox, height: iconBox, borderRadius: radius,
          background: toneBg[f.tone],
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <Icon name={f.icon} size={iconSize} color={toneColor[f.tone]} stroke={2.2} />
      </div>
      <span
        className="text-center"
        style={{
          fontSize: iconBox >= 56 ? 11.5 : 10.5,
          fontWeight: 600, color: HNH.ink,
          lineHeight: 1.2, maxWidth: iconBox + 16,
          wordBreak: 'break-word',
        }}
      >
        {f.label}
      </span>
    </button>
  )
}

function FeatureRow({ f, onTap }: { f: Feature; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
      style={{ background: '#fff', borderRadius: 14, padding: '12px 14px' }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 38, height: 38, borderRadius: 11, background: toneBg[f.tone] }}
      >
        <Icon name={f.icon} size={18} color={toneColor[f.tone]} stroke={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{f.label}</div>
        <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>{f.desc}</div>
      </div>
      <Icon name="chev-r" size={14} color={HNH.ink3} stroke={1.8} />
    </button>
  )
}

type ViewMode = 'launcher' | 'list'

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex" style={{
      background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 3,
    }}>
      {(['launcher', 'list'] as const).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className="flex items-center justify-center border-none cursor-pointer"
          style={{
            width: 30, height: 26, borderRadius: 7,
            background: mode === m ? 'rgba(255,255,255,0.9)' : 'transparent',
          }}
        >
          <Icon
            name={m === 'launcher' ? 'grid' : 'doc'}
            size={13}
            color={mode === m ? HNH.ink : 'rgba(255,255,255,0.7)'}
            stroke={2}
          />
        </button>
      ))}
    </div>
  )
}

export function HNHLifePage() {
  const navigate = useNavigate()
  const isTablet = useTablet()
  const [mode, setMode] = useState<ViewMode>('launcher')
  const [allowedApps, setAllowedApps] = useState<Set<string> | null>(null)
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])

  useEffect(() => {
    api.get<{ allowed: string[] }>('/api/employee/my-apps/')
      .then(data => setAllowedApps(new Set(data.allowed)))
      .catch(() => setAllowedApps(null))

    api.get<{ results: FeedItem[] }>('/api/notifications/announcements/feed/?page_size=3')
      .then(data => setFeedItems(data.results ?? []))
      .catch(() => setFeedItems([]))
  }, [])

  const visible = allowedApps
    ? FEATURES.filter(f => allowedApps.has(f.slug))
    : FEATURES

  const iconBox = isTablet ? 56 : 48

  const today = new Date()
  const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
  const dateLabel = `${dayNames[today.getDay()]}, ${today.getDate()}/${today.getMonth() + 1}`

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <div style={{
        background: `linear-gradient(135deg, ${HNH.red} 0%, #8b1520 100%)`,
        padding: '14px 20px 20px',
      }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: -0.4 }}>HNH Life</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>{dateLabel}</div>
          </div>
          <ViewToggle mode={mode} onChange={setMode} />
        </div>

        {/* Quick 4-tile row */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {FEATURES.slice(0, 4).filter(f => !allowedApps || allowedApps.has(f.slug)).slice(0, 4).map(f => (
            <button
              key={f.slug}
              onClick={() => navigate(f.path)}
              className="flex flex-col items-center gap-1.5 border-none cursor-pointer"
              style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 14, padding: '10px 6px',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div
                className="flex items-center justify-center"
                style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,255,255,0.25)' }}
              >
                <Icon name={f.icon} size={18} color="#fff" stroke={2.2} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.2 }}>
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 100px' }}>
        {/* Tin nội bộ preview */}
        {feedItems.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                📢 Tin nội bộ
              </div>
              <button
                onClick={() => navigate('/announcements')}
                className="flex items-center gap-1 border-none cursor-pointer bg-transparent"
                style={{ fontSize: 12, fontWeight: 700, color: HNH.red, padding: 0 }}
              >
                Xem tất cả
                <Icon name="chev-r" size={12} color={HNH.red} stroke={2.5} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {feedItems.map(item => (
                <FeedPreviewCard
                  key={item.id}
                  item={item}
                  onClick={() => navigate('/announcements')}
                />
              ))}
            </div>
          </div>
        )}

        {/* All features */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
          Tất cả tính năng · {visible.length} ứng dụng
        </div>

        {mode === 'launcher' ? (
          <div style={{ background: '#fff', borderRadius: 18, padding: '16px 12px', border: `1px solid ${HNH.line}` }}>
            <div className="flex flex-wrap gap-4">
              {visible.map(f => (
                <FeatureIcon
                  key={f.slug + f.label}
                  f={f}
                  iconBox={iconBox}
                  onTap={() => navigate(f.path)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map(f => (
              <FeatureRow key={f.slug + f.label} f={f} onTap={() => navigate(f.path)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
