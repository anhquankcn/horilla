import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { api } from '../lib/api'
import { WC2026_ENABLED } from '../lib/flags'

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

const FEATURES: Feature[] = [
  { slug: 'attendance',          icon: 'clock',  label: 'Chấm công',        desc: 'Check-in, lịch sử, GPS',                  path: '/attendance',          tone: 'navy'    },
  { slug: 'leave',               icon: 'leaf',   label: 'Nghỉ phép',        desc: 'Số dư, lịch sử, gửi đơn',                 path: '/leave',               tone: 'success' },
  { slug: 'proposals',           icon: 'send',   label: 'Đề xuất',          desc: 'Nghỉ phép, đổi ca, ngày công',             path: '/proposals',           tone: 'success' },
  { slug: 'approvals',           icon: 'check',  label: 'Phê duyệt',        desc: 'Duyệt đề xuất nhân viên',                  path: '/approvals',           tone: 'gold'    },
  { slug: 'announcements',       icon: 'bell',   label: 'Tin nội bộ',       desc: 'Thông báo BGĐ, quy định, sự kiện',        path: '/announcements',       tone: 'red'     },
  { slug: 'payslip',             icon: 'doc',    label: 'Phiếu lương',      desc: 'Chi tiết lương hàng tháng',                 path: '/payslip',             tone: 'gold'    },
  { slug: 'work-schedule',       icon: 'cal',    label: 'Lịch làm việc',    desc: 'Ca làm, giờ vào ra theo tuần',              path: '/work-schedule',       tone: 'navy'    },
  { slug: 'monthly-attendance',  icon: 'cal',    label: 'Công tháng',       desc: 'Lịch công HR xác nhận',                    path: '/attendance/monthly',  tone: 'navy'    },
  { slug: 'notifications',       icon: 'bell',   label: 'Thông báo',        desc: 'Xem thông báo hệ thống',                   path: '/notifications',       tone: 'navy'    },
  { slug: 'helpdesk',            icon: 'help',   label: 'Hỗ trợ IT',        desc: 'Gửi yêu cầu hỗ trợ',                      path: '/helpdesk',            tone: 'navy'    },
  { slug: 'documents',           icon: 'folder', label: 'Tài liệu',         desc: 'Giấy tờ, theo dõi trạng thái',             path: '/documents',           tone: 'navy'    },
  { slug: 'tasks',               icon: 'check',  label: 'Công việc',        desc: 'Tasks, deadline, phân công',                path: '/task-board',          tone: 'red'     },
  { slug: 'projects',            icon: 'folder', label: 'Dự án',            desc: 'Quản lý dự án, tiến độ',                   path: '/projects',            tone: 'gold'    },
  { slug: 'unified-calendar',    icon: 'cal',    label: 'Lịch tổng hợp',   desc: 'Nghỉ phép, deadline, tour, dự án',          path: '/unified-calendar',    tone: 'gold'    },
  { slug: 'expenses',            icon: 'doc',    label: 'Chi phí',          desc: 'Yêu cầu thanh toán chi phí tự mua',        path: '/expenses',            tone: 'gold'    },
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

export function HNHLifePage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'news' | 'announce'>('news')
  const [allowedApps, setAllowedApps] = useState<Set<string> | null>(null)
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedLoaded, setFeedLoaded] = useState(false)

  useEffect(() => {
    api.get<{ allowed: string[] }>('/api/employee/my-apps/')
      .then(data => setAllowedApps(new Set(data.allowed)))
      .catch(() => setAllowedApps(null))

    api.get<{ results: FeedItem[] }>('/api/notifications/announcements/feed/?page_size=10')
      .then(data => setFeedItems(data.results ?? []))
      .catch(() => setFeedItems([]))
      .finally(() => setFeedLoaded(true))
  }, [])

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
          <button onClick={() => navigate('/announcements')} className="border-none cursor-pointer" style={{
            background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '5px 12px',
            fontSize: 11, fontWeight: 700, color: '#fff',
          }}>
            Xem tất cả TB
          </button>
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

      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: `2px solid ${HNH.line}`, background: '#fff' }}>
        {([['news', 'Tin tức'], ['announce', 'Thông báo']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex-1 border-none cursor-pointer"
            style={{
              padding: '12px 0', background: 'transparent',
              fontSize: 14, fontWeight: 700,
              color: activeTab === key ? HNH.red : HNH.ink3,
              borderBottom: activeTab === key ? `2px solid ${HNH.red}` : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 16px 100px' }}>
        {/* Tab: Tin tức */}
        {activeTab === 'news' && (
          <div>
            {/* World Cup 2026 Game Card — staging-only via VITE_WC2026_ENABLED */}
            {WC2026_ENABLED && (
            <button
              onClick={() => navigate('/wc2026')}
              className="w-full border-none cursor-pointer text-left"
              style={{
                background: 'linear-gradient(135deg, #1a472a 0%, #2d6a4f 50%, #d4a017 100%)',
                borderRadius: 18, padding: '16px 18px', marginBottom: 16,
                boxShadow: '0 6px 20px rgba(45,106,79,0.25)',
              }}
            >
              <div className="flex items-center gap-3">
                <div style={{ fontSize: 36, lineHeight: 1 }}>⚽</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: -0.3 }}>World Cup 2026</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>Dự đoán kết quả · Giành điểm thưởng</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#d4a017', background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '4px 10px' }}>Chơi ngay</div>
              </div>
            </button>
            )}

            <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 16, lineHeight: 1.5 }}>
              Tin tức mới nhất từ Hồng Ngọc Hà Travel
            </div>

            {/* Facebook page link card */}
            <a
              href="https://www.facebook.com/HongNgocHaTravel/?locale=vi_VN"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-4 no-underline"
              style={{
                background: '#fff', borderRadius: 16, padding: '16px 18px',
                border: `1px solid ${HNH.line}`, marginBottom: 12,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14, background: '#1877F2',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div className="flex-1">
                <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Hồng Ngọc Hà Travel</div>
                <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>Xem tin tức mới nhất trên Facebook</div>
              </div>
              <Icon name="chev-r" size={16} color={HNH.ink3} />
            </a>

            {/* Website link */}
            <a
              href="https://hongngocha.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-4 no-underline"
              style={{
                background: '#fff', borderRadius: 16, padding: '16px 18px',
                border: `1px solid ${HNH.line}`, marginBottom: 12,
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `linear-gradient(135deg, ${HNH.red} 0%, ${HNH.redDark} 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name="globe" size={24} color="#fff" />
              </div>
              <div className="flex-1">
                <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>hongngocha.com</div>
                <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>Website chính thức HNH Travel</div>
              </div>
              <Icon name="chev-r" size={16} color={HNH.ink3} />
            </a>

            {/* Tin nội bộ preview (from announcements) */}
            {feedLoaded && feedItems.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
                  Tin nội bộ mới nhất
                </div>
                <div className="flex flex-col gap-2">
                  {feedItems.slice(0, 3).map(item => (
                    <FeedPreviewCard key={item.id} item={item} onClick={() => navigate('/announcements')} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Thông báo — Announcement feed */}
        {activeTab === 'announce' && (
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: HNH.ink3 }}>
                Thông báo chính thức từ Hành chính
              </div>
              <button
                onClick={() => navigate('/announcements')}
                className="flex items-center gap-1 border-none cursor-pointer bg-transparent"
                style={{ fontSize: 12, fontWeight: 700, color: HNH.red, padding: 0 }}
              >
                Tất cả
                <Icon name="chev-r" size={12} color={HNH.red} stroke={2.5} />
              </button>
            </div>

            {!feedLoaded && (
              <div>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ height: 72, borderRadius: 14, background: HNH.line, marginBottom: 8, opacity: 0.5 }} />
                ))}
              </div>
            )}

            {feedLoaded && feedItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3 }}>
                <Icon name="bell" size={36} color={HNH.ink4} />
                <div style={{ fontSize: 13, marginTop: 12 }}>Chưa có thông báo</div>
              </div>
            )}

            {feedLoaded && feedItems.length > 0 && (
              <div className="flex flex-col gap-2">
                {feedItems.map(item => (
                  <FeedPreviewCard
                    key={item.id}
                    item={item}
                    onClick={() => navigate('/announcements')}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
