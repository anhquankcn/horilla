import { useEffect, useState } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from './ui/Icon'
import { useToast } from './ui/Toast'
import {
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed,
  PushError,
} from '../lib/push'

/**
 * Công tắc bật/tắt Thông báo đẩy ngay tại Top Bar Trang chủ.
 * Dùng luồng subscribe chuẩn (đăng ký lên server) — thay cho tick trong modal
 * Avatar và mục trong Cài đặt. Ẩn nếu thiết bị/trình duyệt không hỗ trợ push.
 */
export function PushToggle({ small }: { small?: boolean }) {
  const { toast: showToast } = useToast()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false)
      return
    }
    isPushSubscribed().then(setOn).catch(() => {})
  }, [])

  if (!supported) return null

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (on) {
        await unsubscribeFromPush()
        setOn(false)
        showToast('Đã tắt thông báo đẩy')
      } else {
        await subscribeToPush()
        setOn(true)
        showToast('Đã bật thông báo đẩy')
      }
    } catch (e) {
      const code = e instanceof PushError ? e.code : 'unknown'
      const msg =
        code === 'denied'
          ? 'Bạn chưa cho phép quyền thông báo cho ứng dụng.'
          : code === 'no_push'
            ? 'iPhone chỉ nhận thông báo khi đã Thêm ứng dụng vào Màn hình chính, rồi mở app từ biểu tượng đó.'
            : code === 'sw_timeout'
              ? 'Service Worker chưa sẵn sàng. Tải lại trang rồi thử lại.'
              : code === 'server'
                ? 'Máy chủ không lưu được đăng ký. Thử lại sau ít phút.'
                : 'Không bật được thông báo đẩy. Vui lòng thử lại.'
      showToast(msg)
    } finally {
      setBusy(false)
    }
  }

  const w = small ? 40 : 44
  const h = small ? 22 : 24
  const knob = h - 6

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={on ? 'Tắt thông báo đẩy' : 'Bật thông báo đẩy'}
      aria-label={on ? 'Tắt thông báo đẩy' : 'Bật thông báo đẩy'}
      style={{
        width: w, height: h, flexShrink: 0, padding: 0, position: 'relative',
        borderRadius: h / 2, border: 'none', cursor: busy ? 'default' : 'pointer',
        background: on ? HNH.success : HNH.ink4, opacity: busy ? 0.6 : 1,
        transition: 'background 0.15s',
      }}
    >
      <span
        style={{
          position: 'absolute', top: 3, left: on ? w - knob - 3 : 3,
          width: knob, height: knob, borderRadius: '50%', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}
      >
        <Icon name="bell" size={knob - 6} color={on ? HNH.success : HNH.ink3} stroke={2} />
      </span>
    </button>
  )
}
