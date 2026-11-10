import { useState, useEffect, useCallback, useRef } from 'react'
import QRCode from 'qrcode'
import api from '../api'
import { getUser } from '../auth'

const BIG = { fontSize: 28, fontWeight: 800 }
const LABEL = { fontSize: 11, color: '#94a3b8', marginBottom: 2 }

function fmt(n) { return Number(n || 0).toLocaleString() }

export default function WorkerScreen() {
  const me = getUser()
  const workerId = me?.username || ''
  const workerName = me?.name || workerId

  const [machines, setMachines] = useState([])
  const [machineId, setMachineId] = useState('')
  const [myWos, setMyWos] = useState([])
  const [session, setSession] = useState(null)
  const [kpi, setKpi] = useState(null)
  const [goodQty, setGoodQty] = useState('')
  const [defectQty, setDefectQty] = useState('')
  const [defectType, setDefectType] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [palletModal, setPalletModal] = useState(null)  // { pallet_id, qr_text, qty, part_name, ... }
  const qrCanvasRef = useRef(null)

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  useEffect(() => {
    api.get('/mes-floor/machines').then(r => setMachines(r.data)).catch(() => {})
  }, [])

  const loadMyWos = useCallback(() => {
    if (!workerId) return
    const today = new Date().toISOString().slice(0, 10)
    api.get(`/mes-floor/work-orders?plan_date=${today}`).then(r => {
      setMyWos(r.data.filter(w =>
        w.assigned_worker_id === workerId && w.status !== '취소' && w.status !== '완료'
      ))
    }).catch(() => {})
  }, [workerId])

  const loadSession = useCallback(() => {
    if (!workerId) return
    api.get(`/mes-floor/my-session?worker_id=${workerId}`)
      .then(r => setSession(r.data || null))
      .catch(() => setSession(null))
  }, [workerId])

  const loadKpi = useCallback(() => {
    if (!workerId) return
    api.get(`/mes-floor/worker-kpi?worker_id=${workerId}`)
      .then(r => setKpi(r.data))
      .catch(() => {})
  }, [workerId])

  useEffect(() => {
    loadMyWos()
    loadSession()
    loadKpi()
    const t = setInterval(() => { loadSession(); loadKpi() }, 30000)
    return () => clearInterval(t)
  }, [loadMyWos, loadSession, loadKpi])

  const startSession = async (wo) => {
    setLoading(true)
    try {
      await api.post('/mes-floor/sessions/start', { wo_no: wo.wo_no, worker_id: workerId })
      flash('작업 시작!')
      loadSession()
    } catch (e) {
      flash('시작 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setLoading(false) }
  }

  const submitProd = async () => {
    if (!session) return
    if (!goodQty && !defectQty) return flash('수량을 입력하세요')
    setLoading(true)
    try {
      await api.post(`/mes-floor/sessions/${session.session_id}/log`, {
        good_qty: +goodQty || 0,
        defect_qty: +defectQty || 0,
        defect_type: defectType || null,
      })
      setGoodQty(''); setDefectQty(''); setDefectType('')
      flash('실적 입력 완료!')
      loadSession()
    } catch (e) {
      flash('입력 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setLoading(false) }
  }

  const closePallet = async () => {
    if (!session) return
    setLoading(true)
    try {
      const r = await api.post(`/mes-floor/sessions/${session.session_id}/pallet-close`)
      setPalletModal(r.data)
    } catch (e) {
      flash('파렛트 발행 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setLoading(false) }
  }

  // QR 캔버스 렌더링
  useEffect(() => {
    if (palletModal && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, palletModal.qr_text, { width: 200, margin: 2 }, () => {})
    }
  }, [palletModal])

  const printPallet = () => {
    if (!palletModal || !qrCanvasRef.current) return
    const canvas = qrCanvasRef.current
    const win = window.open('', '_blank')
    win.document.write(`
      <html><body style="font-family:sans-serif;padding:20px;text-align:center">
        <h2 style="font-size:16px;margin:0 0 8px">${palletModal.part_name}</h2>
        <p style="margin:4px 0;font-size:13px">품번: ${palletModal.part_no || ''}</p>
        <p style="margin:4px 0;font-size:13px">수량: <strong>${palletModal.qty} EA</strong></p>
        <p style="margin:4px 0;font-size:13px">LOT: <strong>${palletModal.pallet_id}</strong></p>
        <p style="margin:4px 0;font-size:12px;color:#666">WO: ${palletModal.wo_no}</p>
        <p style="margin:4px 0;font-size:12px;color:#666">${new Date().toLocaleDateString('ko-KR')}</p>
        <img src="${canvas.toDataURL()}" style="margin-top:8px;width:150px" />
        <script>window.onload=()=>{window.print();window.close()}</script>
      </body></html>
    `)
  }

  const endSession = async () => {
    if (!session) return
    // 불량 누락 확인
    if (session.machine_connected && session.unaccounted_qty > 0) {
      if (!window.confirm(`미신고 수량 ${session.unaccounted_qty}개가 있습니다.\n불량으로 추가 등록 후 완료하세요.\n그래도 완료하시겠습니까?`)) return
    }
    if (!window.confirm('작업을 완료 처리하시겠습니까?')) return
    setLoading(true)
    try {
      await api.post(`/mes-floor/sessions/${session.session_id}/complete`)
      flash('작업 완료!')
      setSession(null)
      loadMyWos()
    } catch (e) {
      flash('완료 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setLoading(false) }
  }

  const ach = session && session.target_qty > 0
    ? Math.round((session.good_qty || 0) / session.target_qty * 100) : 0

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif' }}>
      {/* 헤더 */}
      <div style={{ background: '#1e293b', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155' }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>🏭 현장 작업자 화면</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {kpi && (
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: kpi.current_shift === '주간' ? '#fef3c7' : '#1e1b4b',
              color: kpi.current_shift === '주간' ? '#92400e' : '#a5b4fc',
            }}>
              {kpi.current_shift === '주간' ? '☀ 주간' : '🌙 야간'} {kpi.shift_label}
            </span>
          )}
          <span style={{ fontSize: 13, color: '#94a3b8' }}>{workerName}</span>
          <span style={{ fontSize: 11, color: '#475569' }}>
            {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
          </span>
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 640, margin: '0 auto' }}>

        {/* 메시지 */}
        {msg && (
          <div style={{ background: '#065f46', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
            {msg}
          </div>
        )}

        {/* 현재 작업 세션 */}
        {session ? (
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#22d3ee', fontWeight: 700, marginBottom: 12 }}>▶ 진행 중인 작업</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={LABEL}>품번 / 품명</div>
                <div style={{ fontWeight: 600 }}>{session.part_no}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{session.part_name}</div>
              </div>
              <div>
                <div style={LABEL}>호기</div>
                <div style={{ fontWeight: 600 }}>{session.machine_name}</div>
              </div>
              <div>
                <div style={LABEL}>양품</div>
                <div style={{ ...BIG, color: '#22d3ee' }}>{fmt(session.good_qty)}</div>
              </div>
              <div>
                <div style={LABEL}>불량</div>
                <div style={{ ...BIG, color: session.defect_qty > 0 ? '#f87171' : '#94a3b8' }}>{fmt(session.defect_qty)}</div>
              </div>
              <div>
                <div style={LABEL}>목표</div>
                <div style={{ ...BIG }}>{fmt(session.target_qty)}</div>
              </div>
              <div>
                <div style={LABEL}>달성률</div>
                <div style={{ ...BIG, color: ach >= 100 ? '#4ade80' : ach >= 70 ? '#fbbf24' : '#f87171' }}>{ach}%</div>
              </div>
              <div>
                <div style={LABEL}>이론생산량</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#94a3b8' }}>{fmt(session.theory_qty)}</div>
              </div>
              <div>
                <div style={LABEL}>OEE</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa' }}>{session.oee}%</div>
              </div>
              <div>
                <div style={LABEL}>교대 / 실적공수</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  <span style={{ color: session.shift === '주간' ? '#fbbf24' : '#818cf8' }}>
                    {session.shift === '주간' ? '☀' : '🌙'} {session.shift}
                  </span>
                  <span style={{ color: '#94a3b8', marginLeft: 6 }}>
                    {session.man_hour_min}분
                  </span>
                </div>
              </div>
              <div>
                <div style={LABEL}>공수 가동률</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: session.man_hour_rate >= 80 ? '#4ade80' : '#fbbf24' }}>
                  {session.man_hour_rate}%
                </div>
                <div style={{ fontSize: 10, color: '#475569' }}>계획 {session.plan_hour_min}분</div>
              </div>
              {session.machine_connected && (
                <div style={{ gridColumn: '1 / -1', background: session.unaccounted_qty > 0 ? '#450a0a' : '#052e16', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>미신고 수량 (기계 기준)</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: session.unaccounted_qty > 0 ? '#f87171' : '#4ade80' }}>
                      {session.unaccounted_qty > 0 ? `⚠ ${session.unaccounted_qty} EA 미신고` : '✓ 수량 일치'}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', textAlign: 'right' }}>
                    <div>기계 총생산 {fmt(session.shot_count * (session.cavity_count || 1))}</div>
                    <div>양품+불량 {fmt((session.good_qty || 0) + (session.defect_qty || 0))}</div>
                  </div>
                </div>
              )}
            </div>

            {/* 파렛트 발행 */}
            {session.pallet_std_qty > 0 && session.good_qty >= session.pallet_std_qty && (
              <div style={{ marginBottom: 16 }}>
                <button onClick={closePallet} disabled={loading}
                  style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  📦 파렛트 완성 ({session.pallet_std_qty} EA) — LOT 발행
                </button>
              </div>
            )}

            {/* 실적 입력 */}
            <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>실적 입력</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={LABEL}>양품 수량</div>
                  <input type="number" min="0" value={goodQty} onChange={e => setGoodQty(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
                </div>
                <div>
                  <div style={LABEL}>불량 수량</div>
                  <input type="number" min="0" value={defectQty} onChange={e => setDefectQty(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: 8, border: '1px solid #475569', background: '#0f172a', color: '#f87171', fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
                </div>
              </div>
              <input placeholder="불량 유형 (선택)" value={defectType} onChange={e => setDefectType(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: 13, marginBottom: 10 }} />
              <button onClick={submitProd} disabled={loading}
                style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                실적 입력
              </button>
            </div>

            <button onClick={endSession} disabled={loading}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: '2px solid #16a34a', background: 'transparent', color: '#4ade80', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              ✅ 작업 완료
            </button>
          </div>
        ) : (
          <>
            {/* 나의 작업지시 목록 */}
            <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#e2e8f0' }}>
                📋 오늘의 작업지시 ({myWos.length}건)
              </div>
              {myWos.length === 0 ? (
                <div style={{ color: '#475569', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                  오늘 지정된 작업지시가 없습니다
                  <div style={{ fontSize: 11, color: '#334155', marginTop: 6 }}>관리자에게 문의하세요</div>
                </div>
              ) : myWos.map(w => (
                <div key={w.wo_no} style={{ background: '#0f172a', borderRadius: 10, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{w.part_name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{w.part_no} · {w.machine_name}</div>
                    </div>
                    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' }}>{w.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
                    <span style={{ color: '#94a3b8' }}>목표: <strong style={{ color: '#f8fafc' }}>{fmt(w.target_qty)}</strong></span>
                    <span style={{ color: '#22d3ee' }}>양품: <strong>{fmt(w.good_qty)}</strong></span>
                  </div>
                  <button onClick={() => startSession(w)} disabled={loading}
                    style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    작업 시작
                  </button>
                </div>
              ))}
            </div>

            {/* 오늘의 공수 현황 */}
            {kpi && (
              <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>
                  📊 오늘의 공수 현황
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: '☀ 주간 실적공수', val: `${kpi.day_shift.man_hour_min}분 (${Math.floor(kpi.day_shift.man_hour_min/60)}h ${kpi.day_shift.man_hour_min%60}m)`, rate: kpi.day_shift.man_hour_rate },
                    { label: '🌙 야간 실적공수', val: `${kpi.night_shift.man_hour_min}분`, rate: kpi.night_shift.man_hour_rate },
                    { label: '☀ 주간 양품', val: `${fmt(kpi.day_shift.good_qty)} EA`, rate: null, color: '#22d3ee' },
                    { label: '🌙 야간 양품', val: `${fmt(kpi.night_shift.good_qty)} EA`, rate: null, color: '#818cf8' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: item.color || '#f8fafc' }}>{item.val}</div>
                      {item.rate !== null && (
                        <div style={{ fontSize: 10, color: item.rate >= 80 ? '#4ade80' : '#fbbf24', marginTop: 2 }}>
                          공수 가동률 {item.rate}% / 계획 720분
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 안내 */}
            <div style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>💡 작업지시가 보이지 않으면 관리자에게 담당 작업자 지정을 요청하세요.</div>
              <div style={{ fontSize: 11, color: '#475569' }}>또는 작업지시 관리 메뉴에서 직접 세션을 시작할 수 있습니다.</div>
            </div>
          </>
        )}
      </div>

      {/* 파렛트 QR 모달 */}
      {palletModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 28, width: 320, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{palletModal.part_name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>{palletModal.part_no}</div>
            <canvas ref={qrCanvasRef} style={{ borderRadius: 8, background: '#fff', padding: 4 }} />
            <div style={{ marginTop: 12, fontSize: 18, fontWeight: 800, color: '#a78bfa' }}>{palletModal.pallet_id}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>수량: <strong style={{ color: '#f8fafc' }}>{fmt(palletModal.qty)} EA</strong></div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{palletModal.wo_no}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={printPallet}
                style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                🖨 라벨 출력
              </button>
              <button onClick={() => setPalletModal(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
