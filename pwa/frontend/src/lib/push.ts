import { api, apiFetch } from './api'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const reg = await navigator.serviceWorker.ready

  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    await sendSubscriptionToServer(existing)
    return true
  }

  const { public_key } = await api.get<{ public_key: string }>('/api/notifications/push/vapid-key/')
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(public_key).buffer as ArrayBuffer,
  })

  await sendSubscriptionToServer(sub)
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
