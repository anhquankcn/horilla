import { useEffect, useState } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from './ui/Icon'

const DISMISS_KEY = 'hnh_ios_install_hint_dismissed'

/** Phát hiện iPhone/iPad (kể cả iPad iOS 13+ báo là Mac có cảm ứng). */
function isIos(): boolean {
  const ua = navigator.userAgent || ''
  if (/iphone|ipad|ipod/i.test(ua)) return true
  // iPadOS 13+ giả dạng MacIntel nhưng có cảm ứng
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** Đã cài PWA (mở từ Màn hình chính) → không cần nhắc. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS đặt cờ riêng
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/**
 * Dải nhắc cài PWA vào Màn hình chính — CHỈ hiện với iPhone/iPad chưa cài và
 * chưa tự tắt. iOS chỉ cho Web Push khi app đã "Thêm vào Màn hình chính".
 */
export function IosInstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return
    } catch { /* ignore */ }
    if (isIos() && !isStandalone()) setShow(true)
  }, [])

  if (!show) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setShow(false)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: HNH.red50, border: `1px solid ${HNH.red}33`,
      borderRadius: 14, padding: '11px 12px', margin: '0 0 12px',
    }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        <Icon name="phone" size={20} color={HNH.red} stroke={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: HNH.red, marginBottom: 3 }}>
          Bật thông báo trên iPhone
        </div>
        <div style={{ fontSize: 12, color: HNH.ink2, lineHeight: 1.5 }}>
          Để nhận thông báo (đơn cần duyệt, tin nội bộ…) trên màn hình khóa: mở bằng
          <strong> Safari</strong>, bấm <strong>Chia sẻ</strong> (ô vuông + mũi tên) →
          <strong> Thêm vào Màn hình chính</strong>, rồi mở <strong>HNH Travel</strong> từ
          biểu tượng vừa tạo và vào Cài đặt bật thông báo.
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Đóng"
        style={{
          flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer',
          padding: 2, color: HNH.ink3, lineHeight: 0,
        }}
      >
        <Icon name="x" size={18} color={HNH.ink3} stroke={2} />
      </button>
    </div>
  )
}
