import { useState, useRef, useEffect } from 'react'
import { HNH } from '../../lib/theme'
import { Icon } from './Icon'

export interface EmpEntry {
  id: number
  name: string
  sub?: string
}

interface Props {
  employees: EmpEntry[]
  value: number | null
  onChange: (id: number | null) => void
  placeholder?: string
}

export function EmployeeSearchSelect({ employees, value, onChange, placeholder = 'Chọn nhân viên...' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = employees.find(e => e.id === value) ?? null

  const filtered = query.trim()
    ? employees.filter(e => {
        const q = query.toLowerCase()
        return (
          e.name.toLowerCase().includes(q) ||
          (e.sub ?? '').toLowerCase().includes(q)
        )
      })
    : employees

  useEffect(() => {
    function handleClick(ev: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleOpen = () => {
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleSelect = (id: number) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }

  const boxStyle: React.CSSProperties = {
    width: '100%', borderRadius: 10, border: `1.5px solid ${open ? HNH.navy : HNH.line}`,
    background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      {!open ? (
        <button
          type="button"
          onClick={handleOpen}
          className="flex items-center gap-2 w-full border-none cursor-pointer text-left"
          style={{ ...boxStyle, padding: '9px 12px' }}
        >
          <Icon name="search" size={14} color={HNH.ink3} stroke={2} />
          {selected ? (
            <div className="flex-1 min-w-0">
              <span style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink }}>{selected.name}</span>
              {selected.sub && (
                <span style={{ fontSize: 11.5, color: HNH.ink3, marginLeft: 6 }}>{selected.sub}</span>
              )}
            </div>
          ) : (
            <span style={{ flex: 1, fontSize: 13.5, color: HNH.ink3 }}>{placeholder}</span>
          )}
          {selected ? (
            <span onClick={handleClear} style={{ color: HNH.ink3, padding: '2px 4px', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>
              <Icon name="x" size={14} color={HNH.ink3} stroke={2.5} />
            </span>
          ) : (
            <Icon name="chev-d" size={14} color={HNH.ink3} stroke={2} />
          )}
        </button>
      ) : (
        <div style={{ ...boxStyle, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="search" size={14} color={HNH.navy} stroke={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Nhập tên hoặc mã nhân viên..."
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 13.5,
              color: HNH.ink, background: 'transparent', fontFamily: 'inherit',
            }}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="border-none cursor-pointer bg-transparent" style={{ padding: 0 }}>
              <Icon name="x" size={13} color={HNH.ink3} stroke={2.5} />
            </button>
          )}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', borderRadius: 10, border: `1.5px solid ${HNH.navy}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 240, overflowY: 'auto',
          marginTop: 4,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 13, color: HNH.ink3 }}>
              Không tìm thấy nhân viên
            </div>
          ) : (
            filtered.slice(0, 80).map((e, i) => (
              <button
                key={e.id}
                type="button"
                onClick={() => handleSelect(e.id)}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{
                  padding: '10px 14px',
                  background: value === e.id ? HNH.navy50 : '#fff',
                  borderBottom: i < Math.min(filtered.length, 80) - 1 ? `1px solid ${HNH.line}` : 'none',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${value === e.id ? HNH.navy : HNH.ink4}`,
                  background: value === e.id ? HNH.navy : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {value === e.id && <Icon name="check" size={10} color="#fff" stroke={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink }}>{e.name}</div>
                  {e.sub && (
                    <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>{e.sub}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
