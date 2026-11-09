import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const REFRESH_MS = 5000

const STATUS_COLOR = {
  '가동':  { bg: '#dcfce7', border: '#16a34a', text: '#15803d', dot: '#16a34a' },
  '비가동': { bg: '#fee2e2', border: '#dc2626', text: '#dc2626', dot: '#dc2626' },
  '대기':  { bg: '#f1f5f9', border: '#cbd5e1', text: '#64748b', dot: '#94a3b8' },
}

const ANDON_COLOR = {
  '품질이상': '#dc2626',
  '설비고장': '#ea580c',
  '재료부족': '#d97706',
  '안전':    '#7c3aed',
  '도움요청': '#2563eb',
}

function OeeGauge({ value }) {
  const color = value >= 85 ? '#16a34a' : value >= 70 ? '#d97706' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: `conic-gradient(${color} ${value * 3.6}deg, #e5e7eb 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color,
        }}>{value}%</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: '#64748b' }}>OEE</div>
      </div>
    </div>
  )
}

function MachineCard({ m, onAndon }) {
  const sc = STATUS_COLOR[m.status] || STATUS_COLOR['대기']
  const isDown = m.status === '비가동'
  const pct = Math.min(m.achievement_pct || 0, 100)
  const barColor = pct >= 100 ? '#16a34a' : pct >= 70 ? '#3b82f6' : '#dc2626'

  return (
    <div style={{
      border: `2px solid ${sc.border}`,
      borderRadius: 10,
      background: sc.bg,
      padding: '14px 16px',
      position: 'relative',
      animation: isDown ? 'pulse-border 1.5s infinite' : undefined,
      cursor: 'default',
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: sc.text }}>{m.machine_name}</div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: sc.border, color: '#fff', letterSpacing: 0.5,
        }}>{m.status}</span>
      </div>

      {m.status !== '대기' ? (
        <>
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.part_name || '-'}
          </div>
          {/* 생산 현황 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>양품 <strong>{(m.good_qty || 0).toLocaleString()}</strong> / {(m.target_qty || 0).toLocaleString()}</span>
            <span style={{ fontWeight: 700, color: barColor }}>{(m.achievement_pct || 0).toFixed(0)}%</span>
          </div>
          <div style={{ height: 5, background: '#e5e7eb', borderRadius: 3, marginBottom: 8 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <OeeGauge value={m.oee || 0} />
            <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
              <div>작업자: <strong>{m.worker_id || '-'}</strong></div>
              {isDown && <div style={{ color: '#dc2626', fontWeight: 700 }}>⚠ {m.downtime_reason || '비가동'}</div>}
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>대기중</div>
      )}

      {/* 안돈 호출 버튼 */}
      {m.status !== '대기' && (
        <button
          onClick={() => onAndon(m)}
          style={{
            position: 'absolute', bottom: 10, right: 10,
            fontSize: 10, padding: '3px 8px', borderRadius: 6,
            border: '1px solid #dc2626', background: '#fff', color: '#dc2626',
            cursor: 'pointer', fontWeight: 700,
          }}
        >안돈</button>
      )}
    </div>
  )
}

export default function MesDashboard() {
  const [machines, setMachines] = useState([])
  const [andons, setAndons] = useState([])
  const [loading, setLoading] = useState(true)
  const [andonModal, setAndonModal] = useState(null) // { machine_id, machine_name }
  const [andonForm, setAndonForm] = useState({ caller_id: '', andon_type: '품질이상', note: '' })
  const [lastUpdated, setLastUpdated] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [dash, andon] = await Promise.all([
        api.get('/mes-floor/dashboard'),
        api.get('/mes-floor/andon/active'),
      ])
      setMachines(dash.data)
      setAndons(andon.data)
      setLastUpdated(new Date())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  const submitAndon = async () => {
    if (!andonForm.caller_id) return alert('호출자 ID를 입력하세요')
    try {
      await api.post('/mes-floor/andon/call', {
        machine_id: andonModal.machine_id,
        caller_id: andonForm.caller_id,
        andon_type: andonForm.andon_type,
        note: andonForm.note || null,
      })
      setAndonModal(null)
      setAndonForm({ caller_id: '', andon_type: '품질이상', note: '' })
      refresh()
    } catch (e) {
      alert('안돈 호출 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  const resolveAndon = async (id) => {
    const by = prompt('해결자 ID를 입력하세요')
    if (!by) return
    try {
      await api.post(`/mes-floor/andon/${id}/resolve?resolved_by=${encodeURIComponent(by)}`)
      refresh()
    } catch {}
  }

  // Summary
  const running = machines.filter(m => m.status === '가동').length
  const down = machines.filter(m => m.status === '비가동').length
  const activeMachines = machines.filter(m => m.status !== '대기')
  const avgOEE = activeMachines.length > 0
    ? (activeMachines.reduce((s, m) => s + (m.oee || 0), 0) / activeMachines.length).toFixed(1)
    : '—'
  const totalGood = machines.reduce((s, m) => s + (m.good_qty || 0), 0)
  const totalTarget = machines.reduce((s, m) => s + (m.target_qty || 0), 0)
  const overallPct = totalTarget > 0 ? Math.round(totalGood / totalTarget * 100) : 0

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-xs)' }}>로딩 중...</div>

  return (
    <div style={{ padding: '16px 20px' }}>
      <style>{`
        @keyframes pulse-border { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.4) } 50% { box-shadow: 0 0 0 6px rgba(220,38,38,0) } }
        @keyframes blink-dot { 0%,100% { opacity: 1 } 50% { opacity: 0.2 } }
      `}</style>

      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>NEXGEM — 안돈 보드</h2>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            갱신: {lastUpdated ? lastUpdated.toLocaleTimeString('ko-KR') : '-'} · {REFRESH_MS / 1000}초 자동갱신
          </div>
        </div>
        <button className="btn btn-outline" onClick={refresh} style={{ fontSize: 12 }}>↻ 새로고침</button>
      </div>

      {/* KPI 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: '가동 호기', value: running, color: '#16a34a', unit: '대' },
          { label: '비가동', value: down, color: down > 0 ? '#dc2626' : '#16a34a', unit: '대' },
          { label: '평균 OEE', value: avgOEE, color: parseFloat(avgOEE) >= 85 ? '#16a34a' : parseFloat(avgOEE) >= 70 ? '#d97706' : '#dc2626', unit: '%' },
          { label: '총 양품', value: totalGood.toLocaleString(), color: '#1d4ed8', unit: '개' },
          { label: '목표달성률', value: overallPct, color: overallPct >= 100 ? '#16a34a' : '#d97706', unit: '%' },
        ].map(k => (
          <div key={k.label} style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            padding: '12px 14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}<span style={{ fontSize: 12 }}>{k.unit}</span></div>
          </div>
        ))}
      </div>

      {/* 활성 안돈 경보 */}
      {andons.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
            🚨 미해결 안돈 ({andons.length}건)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {andons.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fff', border: `1.5px solid ${ANDON_COLOR[a.andon_type] || '#dc2626'}`,
                borderRadius: 8, padding: '8px 12px', fontSize: 12,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: ANDON_COLOR[a.andon_type] || '#dc2626',
                  animation: 'blink-dot 1.5s infinite',
                }} />
                <span><strong>{a.machine_name}</strong> · {a.andon_type}</span>
                <span style={{ color: '#94a3b8' }}>{a.elapsed_min}분 경과</span>
                {a.note && <span style={{ color: '#475569' }}>"{a.note}"</span>}
                <button
                  onClick={() => resolveAndon(a.id)}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid #16a34a', background: '#fff', color: '#16a34a', cursor: 'pointer' }}
                >해제</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 호기 그리드 — Toyota 안돈 보드 */}
      {machines.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          등록된 호기가 없습니다. 기준정보에서 호기를 먼저 등록하세요.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {machines.map(m => (
            <MachineCard
              key={m.machine_id}
              m={m}
              onAndon={(machine) => setAndonModal({ machine_id: machine.machine_id, machine_name: machine.machine_name })}
            />
          ))}
        </div>
      )}

      {/* 안돈 호출 모달 */}
      {andonModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, minWidth: 320 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
              🚨 안돈 호출 — {andonModal.machine_name}
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>이상 유형</label>
              <select
                className="form-control"
                value={andonForm.andon_type}
                onChange={e => setAndonForm(f => ({ ...f, andon_type: e.target.value }))}
              >
                {['품질이상', '설비고장', '재료부족', '안전', '도움요청'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>호출자 ID</label>
              <input
                className="form-control"
                value={andonForm.caller_id}
                onChange={e => setAndonForm(f => ({ ...f, caller_id: e.target.value }))}
                placeholder="작업자 ID"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>메모 (선택)</label>
              <input
                className="form-control"
                value={andonForm.note}
                onChange={e => setAndonForm(f => ({ ...f, note: e.target.value }))}
                placeholder="이상 내용 간략히"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setAndonModal(null)} style={{ flex: 1 }}>취소</button>
              <button
                onClick={submitAndon}
                style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '8px', fontWeight: 700, cursor: 'pointer' }}
              >안돈 호출</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
