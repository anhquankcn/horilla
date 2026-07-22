import { api, apiFetch } from './api'

export type PushErrorCode = 'no_push' | 'denied' | 'sw_timeout' | 'server' | 'unknown'

/** Lỗi bật push có mã theo từng bước → Settings hiện đúng câu, không đoán mò. */
export class PushError extends Error {
  code: PushErrorCode
  constructor(code: PushErrorCode, message: string) {
    super(message)
    this.name = 'PushError'
    this.code = code
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function subscribeToPush(): Promise<boolean> {
  // iOS ẩn hẳn 2 API này khi mở trong Safari thường (chưa cài PWA vào MH chính).
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    throw new PushError('no_push', 'Trình duyệt/thiết bị chưa hỗ trợ thông báo đẩy')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted')
    throw new PushError('denied', 'Chưa cấp quyền thông báo')

  // serviceWorker.ready có thể treo nếu SW chưa active → chặn bằng timeout.
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new PushError('sw_timeout', 'Service Worker chưa sẵn sàng')), 10000),
    ),
  ])

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { public_key } = await api.get<{ public_key: string }>('/api/notifications/push/vapid-key/')
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key).buffer as ArrayBuffer,
    })
  }

  try {
    await sendSubscriptionToServer(sub)
  } catch {
    throw new PushError('server', 'Máy chủ không lưu được đăng ký')
  }
  return true
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return true

  await sub.unsubscribe()
  await apiFetch('/api/notifications/push/subscribe/', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: sub.endpoint }),
    headers: { 'Content-Type': 'application/json' },
  })
  return true
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

/**
 * Giữ push "dính" BẬT: iOS/Android định kỳ thu hồi subscription khi app đóng —
 * nếu SW không kịp bắt 'pushsubscriptionchange', lần mở app kế tiếp browser mất
 * sub → công tắc hiện TẮT. Hàm này chạy khi mở app: nếu ĐÃ cấp quyền thông báo
 * mà thiếu sub thì tự đăng ký lại âm thầm; nếu còn sub thì đồng bộ lại lên server
 * (phòng khi server mất bản ghi). Trả về true nếu cuối cùng có sub hợp lệ.
 * Không tự xin quyền — chỉ tái lập cái user đã bật trước đó.
 */
export async function ensurePushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  if (Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const { public_key } = await api.get<{ public_key: string }>('/api/notifications/push/vapid-key/')
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key).buffer as ArrayBuffer,
      })
    }
    await sendSubscriptionToServer(sub)
    return true
  } catch {
    return false
  }
}

function arrayBufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendSubscriptionToServer(sub: PushSubscription) {
  const key = sub.getKey('p256dh')
  const auth = sub.getKey('auth')
  if (!key || !auth) return

  await api.post('/api/notifications/push/subscribe/', {
    endpoint: sub.endpoint,
    keys: {
      p256dh: arrayBufferToBase64url(key),
      auth: arrayBufferToBase64url(auth),
    },
  })
}
