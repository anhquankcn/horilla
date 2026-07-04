import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

// Đồng bộ lịch HRM (nghỉ phép duyệt + ngày lễ + sự kiện) vào Outlook/Google/Apple
// qua feed .ics cá nhân (subscribe). Xem PA1 trong thiết kế tích hợp lịch.

interface TokenResp { token: string; feed_path: string }

const GUIDE: { os: string; steps: string[] }[] = [
  { os: 'Outlook trên máy tính', steps: [
    'Mở Outlook → Lịch (Calendar).',
    'Chọn "Add calendar" → "Subscribe from web".',
    'Dán đường link bên trên → đặt tên "HNH Nhân sự" → Import.',
  ]},
  { os: 'Outlook / Lịch trên iPhone', steps: [
    'Cài đặt iPhone → Lịch → Tài khoản → Thêm tài khoản → Khác.',
    'Chọn "Thêm lịch đăng ký" (Add Subscribed Calendar).',
    'Dán đường link bên trên → Tiếp → Lưu.',
  ]},
  { os: 'Lịch trên Android / Google', steps: [
    'Mở Google Calendar trên trình duyệt máy tính (calendar.google.com).',
    'Bên trái: "Lịch khác" → dấu + → "Từ URL".',
    'Dán đường link → Thêm lịch. Lịch sẽ đồng bộ về app Android.',
  ]},
]

export function CalendarSyncPage() {
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [openGuide, setOpenGuide] = useState<number | null>(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<TokenResp>('/api/calendar/token/')
      setFeedUrl(window.location.origin + r.feed_path)
    } catch { setFeedUrl(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const copy = async () => {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard bị chặn — user tự chọn text */ }
  }

  const regenerate = async () => {
    if (!confirm('Tạo link mới sẽ làm link cũ NGỪNG hoạt động. Bạn phải đăng ký lại lịch. Tiếp tục?')) return
    setBusy(true)
    try {
      const r = await api.post<TokenResp>('/api/calendar/token/', {})
      setFeedUrl(window.location.origin + r.feed_path)
    } catch { /* noop */ } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100dvh', background: HNH.cream }}>
      <TopBar title="Đồng bộ lịch" />
      <div style={{ padding: '16px', maxWidth: 560, margin: '0 auto' }}>

        <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: `1px solid ${HNH.line}`, marginBottom: 14 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <Icon name="cal" size={18} color={HNH.red} />
            <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink }}>Lịch nhân sự của bạn</div>
          </div>
          <div style={{ fontSize: 12.5, color: HNH.ink2, lineHeight: 1.5, marginBottom: 12 }}>
            Đăng ký một lần để <b>nghỉ phép đã duyệt</b>, <b>ngày lễ</b> và <b>sự kiện công ty</b>
            tự hiện trong lịch Outlook / Google / Apple của bạn. Lịch tự cập nhật (Outlook làm mới sau vài giờ).
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: HNH.ink3 }}>Đang tải link…</div>
          ) : feedUrl ? (
            <>
              <div style={{
                fontSize: 12, color: HNH.ink, background: HNH.cream2, border: `1px solid ${HNH.line}`,
                borderRadius: 10, padding: '10px 12px', wordBreak: 'break-all', fontFamily: 'monospace',
              }}>{feedUrl}</div>
              <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
                <button onClick={copy} style={{
                  flex: 1, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: copied ? HNH.success : HNH.red, color: '#fff', fontWeight: 700, fontSize: 14,
                }}>{copied ? '✓ Đã sao chép' : 'Sao chép link'}</button>
                <button onClick={regenerate} disabled={busy} title="Tạo link mới (thu hồi link cũ)" style={{
                  width: 44, height: 44, borderRadius: 12, border: `1px solid ${HNH.line}`,
                  background: '#fff', cursor: 'pointer', opacity: busy ? 0.6 : 1,
                }}><Icon name="refresh" size={18} color={HNH.ink2} /></button>
              </div>
              <div style={{ fontSize: 10.5, color: HNH.ink3, marginTop: 8, lineHeight: 1.4 }}>
                Link riêng của bạn — không chia sẻ cho người khác. Nếu lỡ lộ, bấm nút làm mới để thu hồi.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: HNH.red }}>Không tải được link. Thử lại sau.</div>
          )}
        </div>

        {/* Hướng dẫn */}
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
          {GUIDE.map((g, i) => (
            <div key={g.os} style={{ borderTop: i ? `1px solid ${HNH.line}` : 'none' }}>
              <button onClick={() => setOpenGuide(openGuide === i ? null : i)} className="flex items-center justify-between w-full" style={{
                padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{g.os}</span>
                <Icon name={openGuide === i ? 'chev-u' : 'chev-d'} size={16} color={HNH.ink3} />
              </button>
              {openGuide === i && (
                <ol style={{ margin: 0, padding: '0 16px 14px 34px', color: HNH.ink2, fontSize: 12.5, lineHeight: 1.7 }}>
                  {g.steps.map((s, k) => <li key={k}>{s}</li>)}
                </ol>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
