import { useRef, useState, useCallback, type ReactNode, type TouchEvent } from 'react'
import { HNH } from '../../lib/theme'

interface Props {
  onRefresh: () => Promise<void>
  children: ReactNode
}

const THRESHOLD = 60
const MAX_PULL = 100

export function PullToRefresh({ onRefresh, children }: Props) {
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const pulling = useRef(false)

  const onTouchStart = useCallback((e: TouchEvent) => {
    const scroller = e.currentTarget as HTMLElement
    if (scroller.scrollTop > 0 || refreshing) return
    startY.current = e.touches[0].clientY
    pulling.current = true
  }, [refreshing])

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current) return
    const dy = e.touches[0].clientY - startY.current
    if (dy < 0) { pulling.current = false; setPullY(0); return }
    const dampened = Math.min(dy * 0.45, MAX_PULL)
    setPullY(dampened)
  }, [])

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return
    pulling.current = false
    if (pullY >= THRESHOLD) {
      setRefreshing(true)
      setPullY(THRESHOLD * 0.6)
      try { await onRefresh() } finally {
        setRefreshing(false)
        setPullY(0)
      }
    } else {
      setPullY(0)
    }
  }, [pullY, onRefresh])

  const progress = Math.min(pullY / THRESHOLD, 1)

  return (
    <div
      style={{ position: 'relative', minHeight: '100%', overflow: 'auto' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Indicator */}
      <div
        className="flex items-center justify-center"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: pullY,
          overflow: 'hidden',
          transition: pulling.current ? 'none' : 'height 0.25s ease-out',
        }}
      >
        {pullY > 8 && (
          <div
            style={{
              width: 28, height: 28, borderRadius: '50%',
              border: `2.5px solid ${HNH.line}`,
              borderTopColor: refreshing ? HNH.navy : (progress >= 1 ? HNH.navy : HNH.ink3),
              animation: refreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
              transform: `rotate(${progress * 360}deg)`,
              transition: refreshing ? 'none' : 'transform 0.1s ease-out',
            }}
          />
        )}
      </div>

      {/* Content */}
      <div style={{
        transform: `translateY(${pullY}px)`,
        transition: pulling.current ? 'none' : 'transform 0.25s ease-out',
      }}>
        {children}
      </div>
    </div>
  )
}
