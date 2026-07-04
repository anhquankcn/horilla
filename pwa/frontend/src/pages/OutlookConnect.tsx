import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'

// App Feature riêng: Kết nối lịch Outlook (Microsoft Graph — Cách B, OAuth riêng).
// Đặt trong nhóm Hỗ trợ. Kết nối xong, lịch họp hiện trong màn Lịch (màu navy).

export function OutlookConnectPage() {
  const navigate = useNavigate()
  const [st, setSt] = useState<{ configured: boolean; connected: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    fetch('/bff/outlook/status', { credentials: 'include' })
      .then(r => r.json()).then(s => setSt({ configured: !!s.configured, connected: !!s.connected }))
      .catch(() => setSt({ configured: false, connected: false }))
  }
  useEffect(() => {
    load()
    // dọn query trả về từ consent
    const q = new URLSearchParams(window.location.search).get('outlook')
    if (q) window.history.replaceState({}, '', '/outlook')
  }, [])

  const disconnect = async () => {
    if (!confirm('Ngắt kết nối Outlook? Lịch họp sẽ không còn hiện trong app.')) return
    setBusy(true)
    try { await fetch('/bff/outlook/disconnect', { method: 'POST', credentials: 'include' }) } catch { /* noop */ }
    setBusy(false); load()
  }

  return (
    <div style={{ minHeight: '100dvh', background: HNH.cream }}>
      <TopBar title="Kết nối Outlook" />
      <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>

        <div style={{ background: '#fff', borderRadius: 16, padding: '18px', border: `1px solid ${HNH.line}`, marginBottom: 14 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <Icon name="mail" size={20} color={HNH.navy} />
            <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink }}>Lịch Outlook của bạn</div>
          </div>
          <div style={{ fontSize: 12.5, color: HNH.ink2, lineHeight: 1.55, marginBottom: 14 }}>
            Kết nối để <b>lịch họp Outlook</b> hiện chung với nghỉ phép, ngày lễ, sự kiện trong
            màn <b>Lịch</b> của app. App chỉ <b>đọc</b> lịch (Calendars.Read), không sửa gì.
          </div>

          {st === null ? (
            <div style={{ fontSize: 13, color: HNH.ink3 }}>Đang kiểm tra…</div>
          ) : !st.configured ? (
            <div style={{ fontSize: 13, color: '#c2410c', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10, padding: '10px 12px' }}>
              Tính năng chưa được bật trên máy chủ. Vui lòng liên hệ IT.
            </div>
          ) : st.connected ? (
            <>
              <div className="flex items-center gap-2" style={{ background: HNH.success50, border: `1px solid ${HNH.success}`, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                <Icon name="check" size={16} color={HNH.success} stroke={2.5} />
                <span style={{ fontSize: 13, color: HNH.ink, fontWeight: 600 }}>Đã kết nối Outlook</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => navigate('/calendar')} style={{ flex: 1, height: 46, borderRadius: 12, border: 'none', background: HNH.navy, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Xem lịch</button>
                <button onClick={disconnect} disabled={busy} style={{ height: 46, padding: '0 16px', borderRadius: 12, border: `1px solid ${HNH.line}`, background: '#fff', color: HNH.red, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Ngắt kết nối</button>
              </div>
            </>
          ) : (
            <a href="/bff/outlook/connect" className="flex items-center justify-center gap-2" style={{ height: 52, borderRadius: 14, background: HNH.navy, color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
              <Icon name="link" size={18} color="#fff" /> Kết nối Outlook
            </a>
          )}
        </div>

        <div style={{ fontSize: 11.5, color: HNH.ink3, lineHeight: 1.5, padding: '0 4px' }}>
          Sau khi bấm Kết nối, Microsoft sẽ hỏi cho phép đọc lịch — chọn Đồng ý. Lịch họp
          sẽ hiện màu xanh navy trong màn Lịch (làm mới sau vài phút).
        </div>
      </div>
    </div>
  )
}
