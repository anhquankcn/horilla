import { HNH } from '../../lib/theme'

interface IconProps {
  name: string
  size?: number
  color?: string
  stroke?: number
}

export function Icon({ name, size = 18, color = HNH.ink, stroke: sw = 1.8 }: IconProps) {
  const p = { stroke: color, strokeWidth: sw, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'bell': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7Z" {...p}/><path d="M10 19a2 2 0 0 0 4 0" {...p}/></svg>
    case 'search': return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" {...p}/><path d="m16 16 4 4" {...p}/></svg>
    case 'pin': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" {...p}/><circle cx="12" cy="9" r="2.5" {...p}/></svg>
    case 'clock': return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" {...p}/><path d="M12 7v5l3 2" {...p}/></svg>
    case 'plus': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" {...p}/></svg>
    case 'check': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m4 12 5 5L20 6" {...p}/></svg>
    case 'x': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" {...p}/></svg>
    case 'chev-r': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" {...p}/></svg>
    case 'chev-l': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" {...p}/></svg>
    case 'chev-d': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" {...p}/></svg>
    case 'chev-u': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m18 15-6-6-6 6" {...p}/></svg>
    case 'cal': return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2" {...p}/><path d="M3.5 10h17M8 3v4M16 3v4" {...p}/></svg>
    case 'arrow-up': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" {...p}/></svg>
    case 'arrow-r': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" {...p}/></svg>
    case 'logout': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M9 12h11" {...p}/></svg>
    case 'gear': return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" {...p}/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" {...p}/></svg>
    case 'doc': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z" {...p}/><path d="M13 3v7h7" {...p}/></svg>
    case 'money': return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2" {...p}/><circle cx="12" cy="12" r="2.5" {...p}/><path d="M6 9v.01M18 15v.01" {...p}/></svg>
    case 'bus': return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="14" rx="2" {...p}/><path d="M4 12h16M8 18v2M16 18v2" {...p}/><circle cx="8" cy="15" r="1" fill={color} stroke="none"/><circle cx="16" cy="15" r="1" fill={color} stroke="none"/></svg>
    case 'flag': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5" {...p}/></svg>
    case 'sparkle': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.5 2.5M16 16l2.5 2.5M5.5 18.5 8 16M16 8l2.5-2.5" {...p}/></svg>
    case 'palm': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 21V12M12 12c-3-4-7-3-8-1M12 12c3-4 7-3 8-1M12 12c-2-4 0-8 3-9M12 12c2-4 0-8-3-9" {...p}/></svg>
    case 'globe': return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" {...p}/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" {...p}/></svg>
    case 'phone': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2Z" {...p}/></svg>
    case 'star': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9L12 3Z" {...p}/></svg>
    case 'shield': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" {...p}/></svg>
    case 'leaf': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M11 20A7 7 0 0 1 9.8 6.1L13 2a4 4 0 0 1 7 4l-1.5 1.5C19 9 19 11 18 13c-1 2-3 4-5 5.5L11 20Z" {...p}/><path d="M2 22c2-8 7-12 14-13" {...p}/></svg>
    case 'home': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8Z" {...p}/></svg>
    case 'alert': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01" {...p}/><path d="M10.3 3.6 2.5 17.2a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" {...p}/></svg>
    case 'monitor': return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2" {...p}/><path d="M8 20h8M12 16v4" {...p}/></svg>
    case 'smartphone': return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="2" {...p}/><path d="M12 18h.01" {...p}/></svg>
    case 'camera': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" {...p}/><circle cx="12" cy="13" r="4" {...p}/></svg>
    case 'map': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m1 6 8-3 6 3 8-3v15l-8 3-6-3-8 3V6Z" {...p}/><path d="M9 3v15M15 6v15" {...p}/></svg>
    case 'grid': return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" {...p}/><rect x="14" y="3" width="7" height="7" rx="1.5" {...p}/><rect x="3" y="14" width="7" height="7" rx="1.5" {...p}/><rect x="14" y="14" width="7" height="7" rx="1.5" {...p}/></svg>
    case 'users': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" {...p}/><circle cx="9" cy="7" r="4" {...p}/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" {...p}/></svg>
    case 'folder': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" {...p}/></svg>
    case 'send': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4 20-7Z" {...p}/><path d="m22 2-11 11" {...p}/></svg>
    case 'edit': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" {...p}/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" {...p}/></svg>
    case 'refresh': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M1 4v6h6" {...p}/><path d="M23 20v-6h-6" {...p}/><path d="M20.5 9A9 9 0 0 0 5.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 0 1 3.5 15" {...p}/></svg>
    case 'link': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7" {...p}/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7" {...p}/></svg>
    case 'upload': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...p}/><path d="m17 8-5-5-5 5" {...p}/><path d="M12 3v12" {...p}/></svg>
    case 'trash': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...p}/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" {...p}/><path d="M10 11v6M14 11v6" {...p}/></svg>
    case 'briefcase': return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" {...p}/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" {...p}/><path d="M12 12v.01" {...p}/></svg>
    case 'trending-up': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m23 6-9.5 9.5-5-5L1 18" {...p}/><path d="M17 6h6v6" {...p}/></svg>
    case 'award': return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="8" r="6" {...p}/><path d="M15.5 14.5 17 21l-5-3-5 3 1.5-6.5" {...p}/></svg>
    case 'log-in': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" {...p}/></svg>
    case 'log-out': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" {...p}/></svg>
    case 'flash': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" {...p}/></svg>
    case 'checkmark-circle': return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" {...p}/><path d="m8 12 3 3 5-5" {...p}/></svg>
    case 'alert-circle': return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" {...p}/><path d="M12 8v4M12 16h.01" {...p}/></svg>
    case 'bot': return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="12" rx="3" {...p}/><path d="M12 8V5M8 14h.01M16 14h.01M9 17h6" {...p}/></svg>
    case 'layers': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m12 2 10 6-10 6L2 8l10-6Z" {...p}/><path d="m2 14 10 6 10-6" {...p}/><path d="m2 8 10 6 10-6" {...p}/></svg>
    case 'target': return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" {...p}/><circle cx="12" cy="12" r="6" {...p}/><circle cx="12" cy="12" r="2" {...p}/></svg>
    case 'bar-chart': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 20V10M18 20V4M6 20v-4" {...p}/></svg>
    case 'message': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...p}/></svg>
    case 'book': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" {...p}/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" {...p}/></svg>
    case 'graduation': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="m2 10 10-5 10 5-10 5-10-5Z" {...p}/><path d="M22 10v6" {...p}/><path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5" {...p}/></svg>
    case 'play': return <svg width={size} height={size} viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" {...p}/></svg>
    case 'sitemap': return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="5" rx="1" {...p}/><rect x="1" y="14" width="6" height="5" rx="1" {...p}/><rect x="9" y="14" width="6" height="5" rx="1" {...p}/><rect x="17" y="14" width="6" height="5" rx="1" {...p}/><path d="M12 7v4M12 11H4v3M12 11h8v3" {...p}/></svg>
    case 'pencil': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" {...p}/></svg>
    case 'trophy': return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" {...p}/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" {...p}/><path d="M4 22h16" {...p}/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" {...p}/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" {...p}/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" {...p}/></svg>
    case 'help': return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" {...p}/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" {...p}/><circle cx="12" cy="17" r="0.5" fill={color} stroke="none"/></svg>
    default: return null
  }
}
