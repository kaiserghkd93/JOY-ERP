import { useState, useEffect, useCallback, useRef } from 'react'
import QRCode from 'qrcode'
import api from '../api'
import { getUser } from '../auth'
import SearchableSelect from '../components/SearchableSelect'

const BIG = { fontSize: 28, fontWeight: 800 }
const LABEL = { fontSize: 11, color: '#94a3b8', marginBottom: 2 }

// 사출 불량 유형 프리셋
const DEFECT_TYPES = ['치수불량', '외관불량', '충진불량', '플래시', '웰드라인', '싱크마크', '수축', '변색', '버', '기타']

function fmt(n) { return Number(n || 0).toLocaleString() }

function getShiftLabel() {
  const h = new Date().getHours(), m = new Date().getMinutes()
  const mins = h * 60 + m
  return mins >= 8 * 60 + 30 && mins < 20 * 60 + 30 ? '주간' : '야간'
}

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
  const [palletModal, setPalletModal] = useState(null)
  const qrCanvasRef = useRef(null)

  // 작업 준비 체크리스트 모달 (작업 시작 전)
  const [checklistModal, setChecklistModal] = useState(null) // { wo } pending work order
  const [checklist, setChecklist] = useState({
    mold_ok: null, material_ok: null, temp_ok: null, pressure_ok: null,
    safety_ok: null, first_ok: null, tool_ok: null, cleaning_ok: null, note: '',
  })

  // 교대 인수인계 모달
  const [handoverModal, setHandoverModal] = useState(false)
  const [handoverForm, setHandoverForm] = useState({
    good_qty: '', defect_qty: '', issues: '', pending_work: '', special_note: '',
  })
  const [recentHandovers, setRecentHandovers] = useState([])

  // 자재 출고 요청 모달
  const [matReqModal, setMatReqModal] = useState(false)
  const [matReqForm, setMatReqForm] = useState({ part_no: '', req_qty: '', reason: '' })
  const [inspModal, setInspModal] = useState(null) // { type: '초물'|'중간'|'종물' }
  const [inspForm, setInspForm] = useState({ result: 'OK', appearance: 'OK', dim1_spec: '', dim1_actual: '', dim2_spec: '', dim2_actual: '', note: '' })
  const [procCondModal, setProcCondModal] = useState(false)
  const [procCondForm, setProcCondForm] = useState({
    barrel_temp1: '', barrel_temp2: '', barrel_temp3: '',
    mold_temp_core: '', mold_temp_cav: '',
    injection_pressure: '', holding_pressure: '', back_pressure: '',
    injection_speed: '', cooling_time: '', cycle_time: '', shot_weight: '',
  })
  const [items, setItems] = useState([])
  const [myReqs, setMyReqs] = useState([])

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  useEffect(() => {
    api.get('/mes-floor/machines').then(r => setMachines(r.data)).catch(() => {})
  }, [])

  const loadMyWos = useCallback(() => {
    if (!workerId) return
    const today = new Date().toISOString().slice(0, 10)
    api.get(`/mes-floor/work-orders?plan_date=${today}`).then(r => {
      setMyWos(r.data.filter(w =>
        w.status !== '취소' && w.status !== '완료' &&
        (w.assigned_worker_id === workerId || !w.assigned_worker_id)
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

  // 아이템 목록 (자재요청용)
  useEffect(() => {
    api.get('/items').then(r => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }, [])

  const loadMyReqs = useCallback(() => {
    if (!workerId) return
    api.get(`/mes-floor/material-req?requester_id=${workerId}&limit=10`).then(r => setMyReqs(r.data)).catch(() => {})
  }, [workerId])

  const loadHandovers = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10)
    api.get(`/mes-floor/handover?shift_date=${today}&limit=5`).then(r => setRecentHandovers(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    loadMyReqs()
    loadHandovers()
  }, [loadMyReqs, loadHandovers])

  const startSession = async (wo) => {
    // 작업 준비 체크리스트 먼저
    setChecklist({ mold_ok: null, material_ok: null, temp_ok: null, pressure_ok: null, safety_ok: null, first_ok: null, tool_ok: null, cleaning_ok: null, note: '' })
    setChecklistModal(wo)
  }

  const confirmStartWithChecklist = async () => {
    const wo = checklistModal
    setLoading(true)
    try {
      // 체크리스트 저장
      await api.post('/mes-floor/setup-checklist', {
        wo_no: wo.wo_no,
        machine_id: wo.machine_id,
        worker_id: workerId,
        shift: getShiftLabel(),
        ...checklist,
      })
      // 세션 시작
      await api.post('/mes-floor/sessions/start', { wo_no: wo.wo_no, worker_id: workerId })
      flash('작업 시작!')
      setChecklistModal(null)
      loadSession()
    } catch (e) {
      flash('시작 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setLoading(false) }
  }

  const submitHandover = async () => {
    if (!handoverForm.issues && !handoverForm.pending_work && !handoverForm.special_note) {
      return flash('내용을 하나 이상 입력하세요')
    }
    setLoading(true)
    try {
      const shift = getShiftLabel()
      const toShift = shift === '주간' ? '야간' : '주간'
      await api.post('/mes-floor/handover', {
        shift_date: new Date().toISOString().slice(0, 10),
        from_shift: shift,
        to_shift: toShift,
        machine_id: session?.machine_id || null,
        outgoing_worker: workerId,
        good_qty: +handoverForm.good_qty || (session?.good_qty || 0),
        defect_qty: +handoverForm.defect_qty || (session?.defect_qty || 0),
        issues: handoverForm.issues,
        pending_work: handoverForm.pending_work,
        special_note: handoverForm.special_note,
      })
      flash('인수인계 등록 완료!')
      setHandoverModal(false)
      setHandoverForm({ good_qty: '', defect_qty: '', issues: '', pending_work: '', special_note: '' })
      loadHandovers()
    } catch (e) {
      flash('등록 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setLoading(false) }
  }

  const submitMatReq = async () => {
    if (!matReqForm.part_no || !matReqForm.req_qty) return flash('품번과 수량을 입력하세요')
    setLoading(true)
    try {
      await api.post('/mes-floor/material-req', {
        wo_no: session?.wo_no || null,
        machine_id: session?.machine_id || null,
        requester_id: workerId,
        part_no: matReqForm.part_no,
        req_qty: +matReqForm.req_qty,
        reason: matReqForm.reason,
      })
      flash('자재 출고 요청 완료!')
      setMatReqModal(false)
      setMatReqForm({ part_no: '', req_qty: '', reason: '' })
      loadMyReqs()
    } catch (e) {
      flash('요청 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setLoading(false) }
  }

  // 불량 즉시 등록: 타입 선택 + 수량 1 세팅
  const quickDefect = async (dtype) => {
    if (!session) return
    setLoading(true)
    try {
      await api.post(`/mes-floor/sessions/${session.session_id}/log`, {
        good_qty: 0,
        defect_qty: 1,
        defect_type: dtype,
      })
      flash(`불량 1EA 등록: ${dtype}`)
      loadSession()
    } catch (e) {
      flash('등록 실패: ' + (e.response?.data?.detail || e.message))
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

            {/* 불량 즉시 등록 버튼 */}
            <div style={{ borderTop: '1px solid #334155', paddingTop: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: '#f87171', fontWeight: 700, marginBottom: 8 }}>⚡ 불량 즉시 등록 (1EA)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DEFECT_TYPES.map(dt => (
                  <button key={dt} onClick={() => quickDefect(dt)} disabled={loading}
                    style={{ padding: '7px 12px', borderRadius: 20, border: '1px solid #dc2626', background: 'rgba(220,38,38,0.1)', color: '#fca5a5', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {dt}
                  </button>
                ))}
              </div>
            </div>

            {/* 실적 입력 (일괄) */}
            <div style={{ borderTop: '1px solid #334155', paddingTop: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>📊 실적 일괄 입력</div>
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
              {/* 불량 유형 선택 (일괄입력 시) */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  {DEFECT_TYPES.map(dt => (
                    <button key={dt} onClick={() => setDefectType(dt)}
                      style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${defectType === dt ? '#3b82f6' : '#334155'}`, background: defectType === dt ? '#1d4ed8' : 'transparent', color: defectType === dt ? '#fff' : '#64748b', fontSize: 11, cursor: 'pointer' }}>
                      {dt}
                    </button>
                  ))}
                </div>
                <input placeholder="또는 직접 입력..." value={defectType} onChange={e => setDefectType(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', fontSize: 12 }} />
              </div>
              <button onClick={submitProd} disabled={loading}
                style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                실적 입력
              </button>
            </div>

            {/* 현장 액션 버튼 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <button onClick={() => { setHandoverModal(true); loadHandovers() }} disabled={loading}
                style={{ padding: '11px', borderRadius: 8, border: '1px solid #475569', background: 'transparent', color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                📋 교대 인수인계
              </button>
              <button onClick={() => setMatReqModal(true)} disabled={loading}
                style={{ padding: '11px', borderRadius: 8, border: '1px solid #475569', background: 'transparent', color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                📦 자재 출고 요청
              </button>
              <button onClick={() => setInspModal({ type: '초물' })} disabled={loading}
                style={{ padding: '11px', borderRadius: 8, border: '1px solid #0ea5e9', background: 'transparent', color: '#38bdf8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                🔍 초·중·종물 검사
              </button>
              <button onClick={() => setProcCondModal(true)} disabled={loading}
                style={{ padding: '11px', borderRadius: 8, border: '1px solid #7c3aed', background: 'transparent', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                🧪 공정 조건 기록
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
                <div key={w.wo_no} style={{ background: '#0f172a', borderRadius: 10, padding: 16, marginBottom: 10, borderLeft: `3px solid ${w.assigned_worker_id === workerId ? '#1d4ed8' : '#334155'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{w.part_name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{w.part_no} · {w.machine_name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' }}>{w.status}</span>
                      {w.assigned_worker_id === workerId && <span style={{ fontSize: 10, color: '#4ade80' }}>✓ 담당자 지정</span>}
                      {!w.assigned_worker_id && <span style={{ fontSize: 10, color: '#94a3b8' }}>담당자 미지정</span>}
                    </div>
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

      {/* ── #5 작업 준비 체크리스트 모달 ── */}
      {checklistModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>📋 작업 준비 체크리스트</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>IATF 16949 §8.5.1 — {checklistModal.part_name} / {checklistModal.machine_name}</div>
            {[
              { key: 'mold_ok', label: '1. 금형 장착 및 상태 확인' },
              { key: 'material_ok', label: '2. 원료 준비 및 건조 확인' },
              { key: 'temp_ok', label: '3. 온도 설정값 확인' },
              { key: 'pressure_ok', label: '4. 사출압력/속도 설정 확인' },
              { key: 'safety_ok', label: '5. 안전장치 작동 점검' },
              { key: 'first_ok', label: '6. 초물 검사 합격 확인' },
              { key: 'tool_ok', label: '7. 공구/지그/치구 준비' },
              { key: 'cleaning_ok', label: '8. 작업 전 청소 완료' },
            ].map(item => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
                <span style={{ fontSize: 13, color: checklist[item.key] === 'Y' ? '#4ade80' : checklist[item.key] === 'N' ? '#f87171' : '#e2e8f0' }}>{item.label}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['Y', 'N'].map(v => (
                    <button key={v} onClick={() => setChecklist(c => ({ ...c, [item.key]: v }))}
                      style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 14,
                        background: checklist[item.key] === v ? (v === 'Y' ? '#16a34a' : '#dc2626') : '#334155',
                        color: checklist[item.key] === v ? '#fff' : '#64748b',
                      }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <textarea placeholder="특이사항 (선택)" value={checklist.note}
              onChange={e => setChecklist(c => ({ ...c, note: e.target.value }))}
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: 12, resize: 'vertical', minHeight: 56 }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={confirmStartWithChecklist} disabled={loading}
                style={{ flex: 2, padding: '13px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                작업 시작
              </button>
              <button onClick={() => setChecklistModal(null)}
                style={{ flex: 1, padding: '13px', borderRadius: 10, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── #3 교대 인수인계 모달 ── */}
      {handoverModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>📋 교대 인수인계</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              {getShiftLabel()} → {getShiftLabel() === '주간' ? '야간' : '주간'} 인계 / {new Date().toLocaleDateString('ko-KR')}
            </div>

            {/* 최근 인수인계 */}
            {recentHandovers.length > 0 && (
              <div style={{ marginBottom: 16, background: '#0f172a', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>이전 교대 인수인계</div>
                {recentHandovers.slice(0, 2).map(h => (
                  <div key={h.id} style={{ marginBottom: 8, fontSize: 12, borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                    <span style={{ color: '#3b82f6', fontWeight: 700 }}>{h.from_shift} → {h.to_shift}</span>
                    <span style={{ color: '#475569', marginLeft: 8 }}>{h.outgoing_worker}</span>
                    {h.issues && <div style={{ color: '#fca5a5', marginTop: 2 }}>이슈: {h.issues}</div>}
                    {h.pending_work && <div style={{ color: '#fbbf24', marginTop: 2 }}>미완료: {h.pending_work}</div>}
                    {!h.acknowledged_at && (
                      <button onClick={async () => { await api.post(`/mes-floor/handover/${h.id}/acknowledge`); loadHandovers() }}
                        style={{ marginTop: 4, padding: '3px 10px', borderRadius: 20, border: 'none', background: '#16a34a', color: '#fff', fontSize: 10, cursor: 'pointer' }}>
                        ✓ 인수 확인
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 인계 작성 폼 */}
            {[
              { key: 'good_qty', label: '이번 교대 양품 수량', placeholder: session?.good_qty || 0, type: 'number' },
              { key: 'defect_qty', label: '이번 교대 불량 수량', placeholder: session?.defect_qty || 0, type: 'number' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{f.label}</div>
                <input type={f.type} value={handoverForm[f.key]} placeholder={f.placeholder}
                  onChange={e => setHandoverForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: 13 }} />
              </div>
            ))}
            {[
              { key: 'issues', label: '품질/설비 이슈', placeholder: '예) 3호기 사출압력 불안정, 색상 미세 차이 발생 중' },
              { key: 'pending_work', label: '미완료 작업/인수 사항', placeholder: '예) WO-001 목표 500EA 중 350EA 완료, 금형 교체 예정' },
              { key: 'special_note', label: '특이사항', placeholder: '예) 원료 잔여량 20kg, 창고 반납 필요' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{f.label}</div>
                <textarea value={handoverForm[f.key]} placeholder={f.placeholder}
                  onChange={e => setHandoverForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: 12, resize: 'vertical', minHeight: 48 }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={submitHandover} disabled={loading}
                style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                인수인계 등록
              </button>
              <button onClick={() => setHandoverModal(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── #4 자재 출고 요청 모달 ── */}
      {matReqModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>📦 자재 출고 요청</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>창고로 자재 출고 요청</div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>품번 선택</div>
              <SearchableSelect
                value={matReqForm.part_no}
                onChange={v => setMatReqForm(p => ({ ...p, part_no: v }))}
                options={items.map(i => ({ value: i.part_no, label: `${i.part_no} ${i.name}` }))}
                placeholder="— 품번 선택 —"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>요청 수량</div>
              <input type="number" min="0.01" step="0.01" value={matReqForm.req_qty}
                onChange={e => setMatReqForm(p => ({ ...p, req_qty: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: 15, fontWeight: 700, textAlign: 'center' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>요청 사유</div>
              <input value={matReqForm.reason} onChange={e => setMatReqForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="예) 원료 소진, 금형 교체 준비"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: 13 }} />
            </div>

            {/* 최근 내 요청 */}
            {myReqs.length > 0 && (
              <div style={{ marginBottom: 16, background: '#0f172a', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>최근 요청 현황</div>
                {myReqs.slice(0, 3).map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8' }}>{r.req_no}</span>
                    <span style={{ color: '#e2e8f0' }}>{r.part_name} {r.req_qty}</span>
                    <span style={{
                      padding: '1px 6px', borderRadius: 20, fontSize: 10,
                      background: r.status === '출고완료' ? '#14532d' : r.status === '승인' ? '#1e3a8a' : r.status === '반려' ? '#450a0a' : '#1e293b',
                      color: r.status === '출고완료' ? '#4ade80' : r.status === '승인' ? '#93c5fd' : r.status === '반려' ? '#f87171' : '#94a3b8',
                    }}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={submitMatReq} disabled={loading}
                style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                출고 요청
              </button>
              <button onClick={() => setMatReqModal(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 초·중·종물 검사 모달 ── */}
      {inspModal && session && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, width: '90%', maxWidth: 420 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, color: '#e2e8f0' }}>🔍 초·중·종물 검사</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>공정 중 품질 확인 (IATF §8.5.1)</div>

            {/* 검사 유형 선택 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>검사 유형</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['초물', '중간', '종물'].map(t => (
                  <button key={t} onClick={() => setInspModal({ type: t })}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${inspModal.type === t ? '#0ea5e9' : '#334155'}`, background: inspModal.type === t ? '#0c4a6e' : 'transparent', color: inspModal.type === t ? '#38bdf8' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* 판정 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>외관 판정</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['OK', 'NG'].map(v => (
                  <button key={v} onClick={() => setInspForm(f => ({ ...f, appearance: v }))}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${inspForm.appearance === v ? (v === 'OK' ? '#16a34a' : '#dc2626') : '#334155'}`, background: inspForm.appearance === v ? (v === 'OK' ? '#14532d' : '#450a0a') : 'transparent', color: inspForm.appearance === v ? (v === 'OK' ? '#4ade80' : '#f87171') : '#94a3b8', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* 치수 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>치수 1 (규격 / 실측)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" placeholder="규격" value={inspForm.dim1_spec} onChange={e => setInspForm(f => ({ ...f, dim1_spec: e.target.value }))}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13 }} />
                <input type="number" placeholder="실측" value={inspForm.dim1_actual} onChange={e => setInspForm(f => ({ ...f, dim1_actual: e.target.value }))}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13 }} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>비고</div>
              <input value={inspForm.note} onChange={e => setInspForm(f => ({ ...f, note: e.target.value }))} placeholder="특이사항"
                style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={async () => {
                const result = inspForm.appearance === 'NG' ? 'NG' : 'OK'
                try {
                  await fetch(`/api/mes-floor/article-inspection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                    body: JSON.stringify({
                      session_id: session.session_id,
                      wo_no: session.wo_no,
                      machine_id: session.machine_id,
                      worker_id: session.worker_id,
                      insp_type: inspModal.type,
                      result,
                      appearance: inspForm.appearance,
                      dim1_spec: inspForm.dim1_spec ? parseFloat(inspForm.dim1_spec) : null,
                      dim1_actual: inspForm.dim1_actual ? parseFloat(inspForm.dim1_actual) : null,
                      note: inspForm.note,
                    })
                  })
                  flash(`${inspModal.type} 검사 ${result} 등록`)
                  setInspModal(null)
                  setInspForm({ result: 'OK', appearance: 'OK', dim1_spec: '', dim1_actual: '', dim2_spec: '', dim2_actual: '', note: '' })
                } catch { flash('검사 등록 실패', true) }
              }} disabled={loading}
                style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: '#0369a1', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                등록
              </button>
              <button onClick={() => setInspModal(null)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 공정 조건 기록 모달 ── */}
      {procCondModal && session && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#1e293b', borderRadius:16, padding:24, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:15, fontWeight:800, marginBottom:16, color:'#e2e8f0' }}>🧪 공정 조건 기록</div>
            {[
              ['노즐온도 (℃)', 'barrel_temp1'], ['1존온도 (℃)', 'barrel_temp2'], ['2존온도 (℃)', 'barrel_temp3'],
              ['코어온도 (℃)', 'mold_temp_core'], ['캐비티온도 (℃)', 'mold_temp_cav'],
              ['사출압 (MPa)', 'injection_pressure'], ['보압 (MPa)', 'holding_pressure'], ['배압 (MPa)', 'back_pressure'],
              ['사출속도 (mm/s)', 'injection_speed'], ['냉각시간 (sec)', 'cooling_time'], ['사이클 (sec)', 'cycle_time'],
              ['숏트중량 (g)', 'shot_weight'],
            ].map(([label, key]) => (
              <div key={key} style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, color:'#94a3b8', marginBottom:4 }}>{label}</div>
                <input
                  type="number" step="0.1" inputMode="decimal"
                  value={procCondForm[key]}
                  onChange={e => setProcCondForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width:'100%', padding:'10px', borderRadius:8, border:'1px solid #334155', background:'#0f172a', color:'#e2e8f0', fontSize:14, boxSizing:'border-box' }}
                  placeholder={label}
                />
              </div>
            ))}
            <div style={{ display:'flex', gap:10, marginTop:16 }}>
              <button onClick={async () => {
                try {
                  const payload = { session_id: session.id, wo_no: session.wo_no, machine_id: session.machine_id, recorded_by: session.worker_id }
                  Object.entries(procCondForm).forEach(([k, v]) => { if (v !== '') payload[k] = parseFloat(v) })
                  await api.post('/mes-floor/process-condition', payload)
                  flash('공정 조건 기록 완료')
                  setProcCondModal(false)
                  setProcCondForm({ barrel_temp1:'',barrel_temp2:'',barrel_temp3:'',mold_temp_core:'',mold_temp_cav:'',injection_pressure:'',holding_pressure:'',back_pressure:'',injection_speed:'',cooling_time:'',cycle_time:'',shot_weight:'' })
                } catch { flash('기록 실패', true) }
              }} disabled={loading}
                style={{ flex:2, padding:'12px', borderRadius:10, border:'none', background:'#7c3aed', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                기록 저장
              </button>
              <button onClick={() => setProcCondModal(false)}
                style={{ flex:1, padding:'12px', borderRadius:10, border:'1px solid #334155', background:'transparent', color:'#94a3b8', fontSize:13, cursor:'pointer' }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
