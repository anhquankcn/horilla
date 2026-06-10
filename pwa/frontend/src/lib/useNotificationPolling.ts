import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { playNotificationSound, warmUpAudio } from './notificationSound'

interface Summary { unread: number; total: number; announcements_unread: number }

const POLL_INTERVAL = 15_000

export function useNotificationPolling() {
  const prevUnread = useRef<number | null>(null)
  const [summary, setSummary] = useState<Summary>({ unread: 0, total: 0, announcements_unread: 0 })

  useEffect(() => {
    const handler = () => {
      warmUpAudio()
      document.removeEventListener('click', handler, true)
      document.removeEventListener('touchstart', handler, true)
    }
    document.addEventListener('click', handler, true)
    document.addEventListener('touchstart', handler, true)
    return () => {
      document.removeEventListener('click', handler, true)
      document.removeEventListener('touchstart', handler, true)
    }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    let mounted = true

    const check = async () => {
      try {
        const data = await api.get<Summary>('/api/notifications/summary/')
        if (!mounted) return
        const cur = data.unread
        if (prevUnread.current !== null && cur > prevUnread.current) {
          playNotificationSound()
        }
        prevUnread.current = cur
        setSummary(data)
        // Sync OS app badge
        if (cur === 0) {
          navigator.clearAppBadge?.()
        } else {
          navigator.setAppBadge?.(cur)
        }
      } catch {
        // ignore
      }
    }

    check()
    timer = setInterval(check, POLL_INTERVAL)

    // Check immediately when tab becomes visible again
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    // Listen for push messages forwarded by service worker
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        playNotificationSound()
        check()
      }
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)

    return () => {
      mounted = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker?.removeEventListener('message', onSwMessage)
    }
  }, [])

  return summary
}
