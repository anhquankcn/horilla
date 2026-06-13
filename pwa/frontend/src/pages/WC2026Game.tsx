import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'

const F = (url: string, opts?: RequestInit) => fetch(url, { credentials: 'include', ...opts })
const J = (url: string, body: unknown) => F(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

interface Match {
  id: number; match_number: number
  team_a: string; team_b: string; team_a_code: string; team_b_code: string
  round: string; round_display: string; group_name: string
  match_time: string; score_a: number | null; score_b: number | null
  status: string; points_pool: number
  my_prediction: string | null; prediction_count: number; can_predict: boolean
}
interface LeaderRow {
  rank: number; nickname: string; total_points: number
  correct_count: number; total_predictions: number
  is_me: boolean; highlight: string | null
}
interface Profile {
  registered: boolean
  player?: { nickname: string; total_points: number; rank: number; correct_count: number; total_predictions: number }
  predictions?: {
    match_number: number; team_a: string; team_b: string; team_a_code: string; team_b_code: string
    prediction: string; prediction_display: string; is_correct: boolean | null
    points_earned: number; match_status: string; match_time: string; score_a: number | null; score_b: number | null
  }[]
}

function codeToFlag(code: string): string {
  if (!code || code.length < 2) return ''
  const c = code.toUpperCase().slice(0, 2)
  return String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65))
}

const ROUND_COLORS: Record<string, string> = {
  group: HNH.navy, round32: '#0891b2', round16: '#7c3aed', quarter: '#c2410c', semi: '#dc2626', final: '#d4a017',
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  const vn = new Date(d.getTime() + 7 * 3600000)
  const dd = String(vn.getUTCDate()).padStart(2, '0')
  const mm = String(vn.getUTCMonth() + 1).padStart(2, '0')
  const hh = String(vn.getUTCHours()).padStart(2, '0')
  const mi = String(vn.getUTCMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${mi}`
}

type Tab = 'matches' | 'predict' | 'leaderboard' | 'profile'

export function WC2026GamePage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('matches')
  const [matches, setMatches] = useState<Match[]>([])
  const [leaders, setLeaders] = useState<LeaderRow[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [myRank, setMyRank] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [nickname, setNickname] = useState('')
  const [msg, setMsg] = useState('')
  const [matchFilter, setMatchFilter] = useState('upcoming')
  const [predicting, setPredicting] = useState<number | null>(null)
  const [initError, setInitError] = useState('')
  const [batchPreds, setBatchPreds] = useState<Record<number, string>>({})

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const loadMatches = useCallback(async () => {
    setLoading(true)
    try {
      const url = matchFilter ? `/bff/api/wc2026/matches/?status=${matchFilter}` : '/bff/api/wc2026/matches/'
      const r = await F(url)
      if (!r.ok) { setInitError(`Matches API ${r.status}`); setLoading(false); return }
      const d = await r.json()
      setMatches(d.results || [])
    } catch (e: unknown) { setInitError(String(e)) }
    setLoading(false)
  }, [matchFilter])

  const loadLeaderboard = useCallback(async () => {
    setLoading(true)
    try {
      const r = await F('/bff/api/wc2026/leaderboard/')
      if (!r.ok) { setInitError(`Leaderboard API ${r.status}`); setLoading(false); return }
      const d = await r.json()
      setLeaders(d.results || []); setTotalPlayers(d.total_players || 0); setMyRank(d.my_rank)
    } catch (e: unknown) { setInitError(String(e)) }
    setLoading(false)
  }, [])

  const loadProfile = useCallback(async () => {
    setLoading(true)
    try {
      const r = await F('/bff/api/wc2026/me/')
      if (!r.ok) { setInitError(`Profile API ${r.status}`); setLoading(false); return }
      const d = await r.json()
      setProfile(d)
    } catch (e: unknown) { setInitError(String(e)) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'matches' || tab === 'predict') loadMatches()
    else if (tab === 'leaderboard') loadLeaderboard()
    else loadProfile()
  }, [tab, loadMatches, loadLeaderboard, loadProfile])

  useEffect(() => {
    if (tab === 'predict' && matches.length > 0) {
      const init: Record<number, string> = {}
      for (const m of matches) {
        if (m.my_prediction) init[m.id] = m.my_prediction
      }
      setBatchPreds(init)
    }
  }, [tab, matches])

  const handleRegister = async () => {
    if (!nickname.trim()) return
    const r = await J('/bff/api/wc2026/register/', { nickname: nickname.trim() })
    const d = await r.json()
    if (!r.ok) { flash(d.error || 'Lỗi'); return }
    flash(`Chào mừng ${d.nickname}!`)
    setNickname(''); loadProfile()
  }

  const handlePredict = async (matchId: number, pred: string) => {
    setPredicting(matchId)
    const r = await J('/bff/api/wc2026/predict/', { match_id: matchId, prediction: pred })
    const d = await r.json()
    if (!r.ok) { flash(d.error || 'Lỗi'); setPredicting(null); return }
    flash(d.updated ? 'Đã đổi dự đoán' : 'Đã dự đoán')
    setPredicting(null); loadMatches()
  }

  const handleQuickPredict = async (matchId: number, pred: string) => {
    setBatchPreds(prev => ({ ...prev, [matchId]: pred }))
    try {
      const r = await J('/bff/api/wc2026/predict/', { match_id: matchId, prediction: pred })
      const d = await r.json()
      if (!r.ok) { flash(d.error || 'Lỗi'); return }
      const m = matches.find(x => x.id === matchId)
      const label = pred === 'win_a' ? m?.team_a : pred === 'win_b' ? m?.team_b : 'Hòa'
      flash(`✓ ${label} — đã lưu`)
    } catch { flash('Lỗi kết nối') }
  }

  const HIGHLIGHT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    top5: { bg: '#fef3c7', color: '#b45309', label: '' },
    middle: { bg: '#dbeafe', color: '#1d4ed8', label: 'Trung bình' },
    penultimate: { bg: '#fce7f3', color: '#be185d', label: 'Áp chót' },
  }
  const RANK_ICONS = ['', '🥇', '🥈', '🥉', '4️⃣', '5️⃣']

  return (
    <div style={{ flex: 1, background: HNH.cream }}>
      <TopBar onBack={() => navigate(-1)} title="World Cup 2026" sub="DỰ ĐOÁN KẾT QUẢ" />

      <div style={{ padding: '0 16px 100px' }}>
        {initError && <div style={{ padding: 10, borderRadius: 10, background: HNH.red50, marginBottom: 10, fontSize: 11, fontWeight: 600, color: HNH.red }}>Debug: {initError}</div>}
        {msg && <div style={{ padding: 10, borderRadius: 10, background: HNH.success50, marginBottom: 10, fontSize: 12, fontWeight: 600, color: HNH.success }}>{msg}</div>}

        {/* Tabs */}
        <div className="flex gap-1" style={{ marginBottom: 12, background: '#fff', borderRadius: 12, padding: 3, border: `1px solid ${HNH.line}` }}>
          {([
            { id: 'matches' as Tab, label: 'Trận đấu', icon: 'target' },
            { id: 'predict' as Tab, label: 'Dự đoán', icon: 'check' },
            { id: 'leaderboard' as Tab, label: 'BXH', icon: 'trophy' },
            { id: 'profile' as Tab, label: 'Của tôi', icon: 'users' },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 flex items-center justify-center gap-1 border-none cursor-pointer"
              style={{ padding: '9px 0', borderRadius: 10, background: tab === t.id ? HNH.navy : 'transparent', color: tab === t.id ? '#fff' : HNH.ink3, fontSize: 12, fontWeight: 700 }}>
              <Icon name={t.icon} size={13} color={tab === t.id ? '#fff' : HNH.ink3} stroke={2} />
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>}

        {/* === MATCHES TAB === */}
        {!loading && tab === 'matches' && (
          <>
            <div className="flex gap-2" style={{ overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
              {[{ v: '', l: 'Tất cả' }, { v: 'upcoming', l: 'Sắp tới' }, { v: 'live', l: 'Đang diễn ra' }, { v: 'finished', l: 'Kết thúc' }].map(f => (
                <button key={f.v} onClick={() => setMatchFilter(f.v)} style={{
                  padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0,
                  background: matchFilter === f.v ? HNH.navy : '#fff', color: matchFilter === f.v ? '#fff' : HNH.ink,
                  boxShadow: matchFilter === f.v ? `0 2px 8px ${HNH.navy}30` : `0 1px 3px rgba(0,0,0,0.06)`,
                }}>{f.l}</button>
              ))}
            </div>

            {matches.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Chưa có trận đấu nào</div>}

            {matches.map(m => {
              const rc = ROUND_COLORS[m.round] || HNH.navy
              const finished = m.status === 'finished'
              return (
                <div key={m.id} style={{ background: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden', border: `1px solid ${HNH.line}` }}>
                  {/* Round header */}
                  <div className="flex items-center justify-between" style={{ padding: '6px 14px', background: rc + '12' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: rc, letterSpacing: 0.3 }}>
                      #{m.match_number} · {m.round_display}{m.group_name ? ` ${m.group_name}` : ''}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: HNH.ink3 }}>{fmtTime(m.match_time)}</span>
                  </div>

                  {/* Teams + Score */}
                  <div className="flex items-center" style={{ padding: '12px 14px' }}>
                    <div className="flex-1 text-center">
                      <div style={{ fontSize: 28, lineHeight: 1 }}>{codeToFlag(m.team_a_code)}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink, marginTop: 4 }}>{m.team_a}</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 70 }}>
                      {finished ? (
                        <div style={{ fontSize: 26, fontWeight: 900, color: HNH.ink }}>{m.score_a} - {m.score_b}</div>
                      ) : m.status === 'live' ? (
                        <div style={{ fontSize: 13, fontWeight: 800, color: HNH.red, animation: 'blink 1s infinite' }}>LIVE</div>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink3 }}>VS</div>
                      )}
                      <div style={{ fontSize: 9, fontWeight: 700, color: rc, marginTop: 4 }}>{m.points_pool} điểm</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div style={{ fontSize: 28, lineHeight: 1 }}>{codeToFlag(m.team_b_code)}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink, marginTop: 4 }}>{m.team_b}</div>
                    </div>
                  </div>

                  {/* Prediction buttons */}
                  <div className="flex gap-2" style={{ padding: '0 14px 12px' }}>
                    {(['win_a', 'draw', 'win_b'] as const).map(pred => {
                      const active = m.my_prediction === pred
                      const correct = finished && active && m.score_a !== null && m.score_b !== null && (
                        (pred === 'win_a' && m.score_a > m.score_b) ||
                        (pred === 'draw' && m.score_a === m.score_b) ||
                        (pred === 'win_b' && m.score_b > m.score_a)
                      )
                      const wrong = finished && active && !correct
                      const label = pred === 'win_a' ? m.team_a : pred === 'win_b' ? m.team_b : 'Hòa'
                      return (
                        <button key={pred}
                          onClick={() => m.can_predict && handlePredict(m.id, pred)}
                          disabled={!m.can_predict || predicting === m.id}
                          style={{
                            flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: m.can_predict ? 'pointer' : 'default',
                            fontSize: 11, fontWeight: 700,
                            background: correct ? HNH.success : wrong ? HNH.red50 : active ? HNH.navy : HNH.cream2,
                            color: correct ? '#fff' : wrong ? HNH.red : active ? '#fff' : HNH.ink,
                            opacity: m.can_predict ? 1 : 0.7,
                          }}>
                          {correct ? '✓ ' : wrong ? '✗ ' : ''}{label.length > 8 ? label.slice(0, 7) + '…' : label}
                        </button>
                      )
                    })}
                  </div>

                  {m.prediction_count > 0 && (
                    <div style={{ padding: '0 14px 8px', fontSize: 10, color: HNH.ink4 }}>{m.prediction_count} lượt dự đoán</div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* === PREDICT TAB === */}
        {!loading && tab === 'predict' && (
          <>
            {matches.filter(m => m.can_predict).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Không có trận nào để dự đoán lúc này</div>
            ) : (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3, marginBottom: 10 }}>
                  Bấm chọn kết quả — tự động lưu ngay
                </div>
                {matches.filter(m => m.can_predict).map(m => {
                  const rc = ROUND_COLORS[m.round] || HNH.navy
                  const sel = batchPreds[m.id]
                  return (
                    <div key={m.id} style={{ background: '#fff', borderRadius: 14, marginBottom: 8, overflow: 'hidden', border: `1px solid ${sel ? HNH.navy + '30' : HNH.line}` }}>
                      <div className="flex items-center justify-between" style={{ padding: '5px 12px', background: rc + '10' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: rc }}>#{m.match_number} · {m.round_display} {m.group_name}</span>
                        <span style={{ fontSize: 9, color: HNH.ink3 }}>{fmtTime(m.match_time)}</span>
                      </div>
                      <div className="flex items-center" style={{ padding: '8px 12px' }}>
                        <div className="flex-1 text-center">
                          <div style={{ fontSize: 22, lineHeight: 1 }}>{codeToFlag(m.team_a_code)}</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: HNH.ink, marginTop: 2 }}>{m.team_a}</div>
                        </div>
                        <div style={{ minWidth: 50, textAlign: 'center', fontSize: 11, fontWeight: 700, color: HNH.ink3 }}>VS</div>
                        <div className="flex-1 text-center">
                          <div style={{ fontSize: 22, lineHeight: 1 }}>{codeToFlag(m.team_b_code)}</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: HNH.ink, marginTop: 2 }}>{m.team_b}</div>
                        </div>
                      </div>
                      <div className="flex gap-1" style={{ padding: '0 10px 10px' }}>
                        {([
                          { key: 'win_a', label: `${m.team_a.length > 6 ? m.team_a.slice(0,5) + '…' : m.team_a} Thắng`, color: '#2563eb' },
                          { key: 'draw', label: 'Hòa', color: '#6b7280' },
                          { key: 'win_b', label: `${m.team_b.length > 6 ? m.team_b.slice(0,5) + '…' : m.team_b} Thắng`, color: '#dc2626' },
                        ]).map(opt => {
                          const active = sel === opt.key
                          return (
                            <button key={opt.key}
                              onClick={() => handleQuickPredict(m.id, opt.key)}
                              style={{
                                flex: 1, padding: '8px 2px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                fontSize: 10, fontWeight: 700,
                                background: active ? opt.color : HNH.cream2,
                                color: active ? '#fff' : HNH.ink,
                                transition: 'all 0.15s',
                              }}>
                              {active ? '✓ ' : ''}{opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 11, color: HNH.ink4 }}>
                  Đã chọn {Object.values(batchPreds).filter(v => v).length} / {matches.filter(m => m.can_predict).length} trận
                </div>
              </>
            )}
          </>
        )}

        {/* === LEADERBOARD TAB === */}
        {!loading && tab === 'leaderboard' && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3, marginBottom: 10 }}>{totalPlayers} người chơi{myRank ? ` · Bạn hạng ${myRank}` : ''}</div>

            {leaders.map(p => {
              const hl = p.highlight ? HIGHLIGHT_STYLE[p.highlight] : null
              return (
                <div key={p.rank} className="flex items-center gap-3" style={{
                  padding: '10px 14px', borderRadius: 14, marginBottom: 4,
                  background: p.is_me ? HNH.navy50 : hl ? hl.bg : '#fff',
                  border: `1.5px solid ${p.is_me ? HNH.navy + '40' : hl ? hl.color + '30' : HNH.line}`,
                }}>
                  <div style={{ width: 30, textAlign: 'center', fontSize: p.rank <= 5 ? 18 : 13, fontWeight: 800, color: hl ? hl.color : HNH.ink }}>
                    {RANK_ICONS[p.rank] || p.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 700, color: p.is_me ? HNH.navy : HNH.ink }}>
                      {p.nickname}{p.is_me ? ' (bạn)' : ''}
                    </div>
                    <div style={{ fontSize: 10, color: HNH.ink3, marginTop: 1 }}>
                      {p.correct_count}/{p.total_predictions} đúng
                      {hl?.label ? <span style={{ color: hl.color, fontWeight: 700 }}> · {hl.label}</span> : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: p.rank <= 3 ? '#b45309' : HNH.ink }}>{p.total_points}</div>
                </div>
              )
            })}
          </>
        )}

        {/* === PROFILE TAB === */}
        {!loading && tab === 'profile' && profile && (
          <>
            {!profile.registered ? (
              <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: `1px solid ${HNH.line}` }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink, marginBottom: 6 }}>Đăng ký chơi</div>
                <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 14, lineHeight: 1.5 }}>
                  Chọn nickname hiển thị trên bảng xếp hạng. Không thể đổi sau khi đăng ký.
                </div>
                <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Nickname (2-30 ký tự)..."
                  style={{ width: '100%', padding: '12px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
                <button onClick={handleRegister} disabled={!nickname.trim()}
                  style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: nickname.trim() ? HNH.navy : HNH.ink4, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Tham gia
                </button>
              </div>
            ) : (
              <>
                {/* Stats card */}
                <div style={{ background: `linear-gradient(135deg, ${HNH.navy} 0%, #1a3a7a 100%)`, borderRadius: 18, padding: 20, color: '#fff', marginBottom: 14 }}>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{profile.player?.nickname}</div>
                  <div className="flex gap-4" style={{ marginTop: 14 }}>
                    {[
                      { label: 'Điểm', value: profile.player?.total_points || 0 },
                      { label: 'Hạng', value: `#${profile.player?.rank || '-'}` },
                      { label: 'Đúng', value: `${profile.player?.correct_count || 0}/${profile.player?.total_predictions || 0}` },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 900 }}>{s.value}</div>
                        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Prediction history */}
                <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>Lịch sử dự đoán</div>
                {(profile.predictions || []).map(p => (
                  <div key={p.match_number} className="flex items-center gap-3" style={{
                    background: '#fff', borderRadius: 12, padding: '10px 12px', marginBottom: 4, border: `1px solid ${HNH.line}`,
                  }}>
                    <div style={{ fontSize: 18, lineHeight: 1 }}>{codeToFlag(p.team_a_code)}</div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink }}>{p.team_a} vs {p.team_b}</div>
                      <div style={{ fontSize: 10, color: HNH.ink3, marginTop: 1 }}>
                        Dự đoán: {p.prediction_display}
                        {p.score_a !== null ? ` · KQ: ${p.score_a}-${p.score_b}` : ''}
                      </div>
                    </div>
                    {p.is_correct === true && <span style={{ fontSize: 11, fontWeight: 800, color: HNH.success }}>+{p.points_earned}</span>}
                    {p.is_correct === false && <span style={{ fontSize: 11, fontWeight: 700, color: HNH.red }}>0</span>}
                    {p.is_correct === null && <span style={{ fontSize: 10, fontWeight: 600, color: HNH.ink4 }}>Chờ</span>}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
