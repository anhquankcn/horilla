export const HNH = {
  red: '#c0222b',
  redDark: '#9a1a21',
  red50: '#fdecee',
  red100: '#fad6da',
  navy: '#142B6F',
  navy2: '#1f3d8a',
  navy50: '#eef1fa',
  cream: '#faf7f2',
  cream2: '#f4efe7',
  ink: '#0f1428',
  ink2: '#4a5170',
  ink3: '#8a8fa6',
  ink4: '#bfc2d1',
  line: '#ece8e0',
  line2: '#e3ddd1',
  white: '#ffffff',
  gold: '#d4a017',
  goldSoft: '#f7e7b7',
  success: '#1f8a5b',
  success50: '#e6f4ec',
  warn: '#c97a16',
  warn50: '#fdf2dc',
} as const

export type ToneName = 'red' | 'navy' | 'gold' | 'success' | 'warn' | 'ink'

export const TONES: Record<ToneName, { color: string; bg: string; solidBg: string; solidFg: string }> = {
  red:     { color: HNH.red,     bg: HNH.red50,    solidBg: HNH.red,     solidFg: '#fff' },
  navy:    { color: HNH.navy,    bg: HNH.navy50,   solidBg: HNH.navy,    solidFg: '#fff' },
  gold:    { color: '#a87908',   bg: '#faf1d6',     solidBg: HNH.gold,    solidFg: '#fff' },
  success: { color: HNH.success, bg: HNH.success50, solidBg: HNH.success, solidFg: '#fff' },
  warn:    { color: HNH.warn,    bg: HNH.warn50,    solidBg: HNH.warn,    solidFg: '#fff' },
  ink:     { color: HNH.ink2,    bg: '#eef0f4',     solidBg: HNH.ink,     solidFg: '#fff' },
}
