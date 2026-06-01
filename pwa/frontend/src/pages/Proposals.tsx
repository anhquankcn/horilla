import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'

interface ProposalType {
  id: string
  icon: string
  label: string
  desc: string
  path: string | null
  tone: 'navy' | 'success' | 'gold' | 'red'
}

const proposals: ProposalType[] = [
  { id: 'leave', icon: 'palm', label: 'Nghỉ phép', desc: 'Xin nghỉ phép, nghỉ theo giờ', path: '/proposals/leave', tone: 'navy' },
  { id: 'shift', icon: 'clock', label: 'Đổi Ca', desc: 'Đề xuất đổi ca làm việc', path: null, tone: 'gold' },
  { id: 'workday', icon: 'cal', label: 'Ngày Công', desc: 'Điều chỉnh ngày công', path: null, tone: 'success' },
  { id: 'worktype', icon: 'briefcase', label: 'Loại Hình LV', desc: 'Thay đổi loại hình làm việc', path: null, tone: 'navy' },
  { id: 'asset', icon: 'monitor', label: 'Tài sản Công cụ', desc: 'Yêu cầu cấp tài sản, công cụ', path: null, tone: 'red' },
]

const toneBg: Record<string, string> = {
  navy: HNH.navy50, gold: '#faf1d6', success: HNH.success50, red: HNH.red50,
}
const toneColor: Record<string, string> = {
  navy: HNH.navy, gold: '#a87908', success: HNH.success, red: HNH.red,
}

export function ProposalsPage() {
  const navigate = useNavigate()

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Đề xuất" />

      <div style={{ padding: '8px 16px 32px', maxWidth: 600, margin: '0 auto' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: HNH.ink3, marginBottom: 12 }}>
          Chọn loại đề xuất bạn muốn tạo
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {proposals.map(p => {
            const available = !!p.path
            return (
              <button
                key={p.id}
                onClick={() => p.path && navigate(p.path)}
                disabled={!available}
                className="flex items-center gap-4 w-full border-none cursor-pointer text-left"
                style={{
                  background: '#fff', borderRadius: 16, padding: '14px 16px',
                  border: `1px solid ${HNH.line}`,
                  opacity: available ? 1 : 0.55,
                  boxShadow: available ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                }}
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 44, height: 44, borderRadius: 14,
                    background: toneBg[p.tone],
                  }}
                >
                  <Icon name={p.icon} size={22} color={toneColor[p.tone]} stroke={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{p.label}</span>
                    {!available && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, color: HNH.ink3,
                        background: HNH.cream2, borderRadius: 6, padding: '2px 7px',
                        textTransform: 'uppercase', letterSpacing: 0.3,
                      }}>
                        Sắp ra mắt
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
                    {p.desc}
                  </div>
                </div>
                {available && <Icon name="chev-r" size={16} color={HNH.ink3} stroke={1.8} />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
