import { useEffect, useRef } from 'react'
import { api } from './api'
import { playNotificationSound } from './notificationSound'

interface Summary { unread: number; total: number }

const POLL_INTERVAL = 30_000

export function useNotificationPolling() {
  const prevUnread = useRef<number | null>(null)

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
      } catch {
        // ignore
      }
    }

    check()
    timer = setInterval(check, POLL_INTERVAL)

    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])
}
