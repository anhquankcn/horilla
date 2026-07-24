import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

interface Company { id: number; name: string; address?: string }
interface Dept { id: number; name: string; company_ids: number[] }
interface Position { id: number; name: string; department: string }
interface Enum { key: string; label: string; values: string[] }
interface Resp { companies: Company[]; departments: Dept[]; positions: Position[]; enums: Enum[] }

export function DanhMucPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<string | null>('companies')

  useEffect(() => {
    api.get<Resp>('/api/employee/hr-categories/')
      .then(setData).catch(() => setErr('Không tải được danh mục (cần quyền HR/C&B)')).finally(() => setLoading(false))
  }, [])

  const Section = ({ id, title, icon, count, children }: { id: string; title: string; icon: string; count: number; children: React.ReactNode }) => (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${HNH.line}`, marginBottom: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpen(open === id ? null : id)} className="flex items-center gap-3 w-full border-none cursor-pointer" style={{ padding: '13px 15px', background: open === id ? HNH.navy50 : '#fff' }}>
        <div className="flex items-center justify-center shrink-0" style={{ width: 34, height: 34, borderRadius: 10, background: HNH.navy50 }}>
          <Icon name={icon} size={17} color={HNH.navy} stroke={2} />
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{title}</div>
          <div style={{ fontSize: 11.5, color: HNH.ink3 }}>{count} mục</div>
        </div>
        <Icon name={open === id ? 'chev-u' : 'chev-d'} size={16} color={HNH.ink3} stroke={2} />
      </button>
      {open === id && <div style={{ padding: '4px 15px 14px' }}>{children}</div>}
    </div>
  )

  const Chip = ({ children }: { children: React.ReactNode }) => (
    <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 600, color: HNH.ink2, background: HNH.cream, border: `1px solid ${HNH.line}`, borderRadius: 8, padding: '5px 10px', margin: '0 6px 6px 0' }}>{children}</span>
  )

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Danh mục" sub="Dữ liệu nền" onBack={() => navigate(-1)} />
      <div style={{ padding: '10px 16px 40px', maxWidth: 640, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải…</div>
        ) : err ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, textAlign: 'center', color: HNH.red, fontSize: 13, border: `1px solid ${HNH.line}` }}>{err}</div>
        ) : data && (<>
          <Section id="companies" title="Công ty / Chi nhánh" icon="briefcase" count={data.companies.length}>
            {data.companies.map(c => (
              <div key={c.id} style={{ padding: '8px 0', borderBottom: `1px solid ${HNH.line}` }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{c.name}</div>
                {c.address && <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>{c.address}</div>}
              </div>
            ))}
          </Section>

          <Section id="departments" title="Phòng ban" icon="grid" count={data.departments.length}>
            {data.departments.map(d => (
              <div key={d.id} style={{ padding: '7px 0', borderBottom: `1px solid ${HNH.line}`, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{d.name}</span>
                <span style={{ fontSize: 11, color: HNH.ink3, flexShrink: 0 }}>
                  {d.company_ids.map(cid => data.companies.find(c => c.id === cid)?.name).filter(Boolean).join(', ')}
                </span>
              </div>
            ))}
          </Section>

          <Section id="positions" title="Chức danh / Vị trí" icon="users" count={data.positions.length}>
            {data.positions.length === 0 ? <div style={{ fontSize: 12.5, color: HNH.ink4, padding: '6px 0' }}>Chưa có dữ liệu</div> :
              data.positions.map(p => (
                <div key={p.id} style={{ padding: '6px 0', borderBottom: `1px solid ${HNH.line}`, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{p.name}</span>
                  {p.department && <span style={{ fontSize: 11, color: HNH.ink3, flexShrink: 0 }}>{p.department}</span>}
                </div>
              ))}
          </Section>

          <div style={{ fontSize: 11.5, fontWeight: 800, color: HNH.ink3, letterSpacing: 0.4, margin: '14px 4px 8px', textTransform: 'uppercase' }}>Danh mục lựa chọn</div>
          {data.enums.map(e => (
            <Section key={e.key} id={e.key} title={e.label} icon="folder" count={e.values.length}>
              <div style={{ paddingTop: 4 }}>{e.values.map(v => <Chip key={v}>{v}</Chip>)}</div>
            </Section>
          ))}
        </>)}
      </div>
    </div>
  )
}
