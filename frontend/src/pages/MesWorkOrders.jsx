import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const STATUS_BADGE = {
  '대기':     { bg: '#f1f5f9', color: '#475569' },
  '자재확인': { bg: '#fef9c3', color: '#a16207' },
  '발행':     { bg: '#ede9fe', color: '#6d28d9' },
  '진행':     { bg: '#dbeafe', color: '#1d4ed8' },
  '완료':     { bg: '#dcfce7', color: '#15803d' },
  '마감':     { bg: '#f3f4f6', color: '#374151' },
  '취소':     { bg: '#fee2e2', color: '#dc2626' },
}
const STATUS_FLOW = {
  '대기': '자재확인', '자재확인': '발행', '발행': '진행', '진행': '완료', '완료': '마감',
}
const STATUS_NEXT = STATUS_FLOW  // backward compat alias

const STATUS_LABEL = {
  '대기': '계획', '자재확인': '자재확인', '발행': '발행', '진행': '진행', '완료': '완료', '마감': '마감', '취소': '취소',
}

export default function MesWorkOrders() {
  const [wos, setWos] = useState([])
  const [machines, setMachines] = useState([])
  const [items, setItems] = useState([])
  const [workers, setWorkers] = useState([])
  const [filters, setFilters] = useState({ plan_date: today(), machine_id: '', status: '' })

  // 단건 발행 모달
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ part_no: '', machine_id: '', target_qty: '', plan_date: today(), mold_no: '', note: '', assigned_worker_id: '' })
  const [partSearch, setPartSearch] = useState('')
  const [partOpen, setPartOpen] = useState(false)

  // 생산계획 연동 일괄발행 모달
  const [showBulk, setShowBulk] = useState(false)
  const [bulkYear, setBulkYear] = useState(new Date().getFullYear())
  const [bulkMonth, setBulkMonth] = useState(new Date().getMonth()+1)
  const [bulkWeek, setBulkWeek] = useState(1)
  const [weekOptions, setWeekOptions] = useState([])
  const [planRows, setPlanRows] = useState([])
  const [bulkSel, setBulkSel] = useState({})       // { planId: { checked, machine_id, target_qty, plan_date, worker } }
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  // 실적입력 모달
  const [actualModal, setActualModal] = useState(null)  // wo_no
  const [actualForm, setActualForm] = useState({ good_qty: '', defect_qty: '' })
  const [actualSaving, setActualSaving] = useState(false)

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (filters.plan_date) p.set('plan_date', filters.plan_date)
    if (filters.machine_id) p.set('machine_id', filters.machine_id)
    if (filters.status) p.set('status', filters.status)
    api.get(`/mes-floor/work-orders?${p}`).then(r => setWos(r.data)).catch(() => setWos([]))
  }, [filters])

  useEffect(() => {
    load()
    api.get('/mes-floor/machines').then(r => setMachines(r.data)).catch(() => {})
    api.get('/master/items?active_only=true').then(r => setItems(r.data)).catch(() => {})
    api.get('/mes-floor/worker-list').then(r => setWorkers(r.data)).catch(() => {})
  }, [load])

  // ── 단건 발행 ──
  const submit = async () => {
    if (!form.part_no) return alert('품번을 선택하세요')
    if (!form.machine_id) return alert('호기를 선택하세요')
    if (!form.target_qty || +form.target_qty <= 0) return alert('목표수량을 입력하세요')
    try {
      await api.post('/mes-floor/work-orders', {
        part_no: form.part_no, machine_id: form.machine_id,
        target_qty: +form.target_qty, plan_date: form.plan_date,
        mold_no: form.mold_no || null, note: form.note || null,
        assigned_worker_id: form.assigned_worker_id || null,
      })
      setShowForm(false)
      setForm({ part_no:'', machine_id:'', target_qty:'', plan_date:today(), mold_no:'', note:'', assigned_worker_id:'' })
      setPartSearch('')
      load()
    } catch (e) { alert('등록 실패: ' + (e.response?.data?.detail || e.message)) }
  }

  // ── 상태 토글 ──
  const toggleStatus = async (wo) => {
    const next = STATUS_FLOW[wo.status]
    if (!next) return
    if (!window.confirm(`${wo.wo_no} 상태를 "${wo.status}" → "${next}"으로 변경하시겠습니까?`)) return
    try {
      await api.patch(`/mes-floor/work-orders/${wo.wo_no}/status`, { status: next })
      load()
    } catch (e) { alert('변경 실패: ' + (e.response?.data?.detail || e.message)) }
  }

  // ── WO 취소 ──
  const cancelWO = async (wo) => {
    if (!window.confirm(`${wo.wo_no} 작업지시를 취소하시겠습니까?\n자재 불출 역전표가 자동 생성됩니다.`)) return
    try {
      const r = await api.post(`/mes-floor/work-orders/${wo.wo_no}/cancel`)
      alert(`취소 완료. 역전표 ${r.data.reversed_entries}건 생성됨.`)
      load()
    } catch (e) { alert('취소 실패: ' + (e.response?.data?.detail || e.message)) }
  }

  // ── 작업표 프린트 ──
  const printWO = (wo) => {
    const w = window.open('', '_blank', 'width=800,height=900')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>작업표 ${wo.wo_no}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#111;font-size:13px}
  h1{font-size:20px;margin:0 0 4px;font-weight:800;letter-spacing:1px}
  .subtitle{color:#64748b;font-size:12px;margin:0 0 20px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th,td{border:1px solid #94a3b8;padding:7px 10px;font-size:12px}
  th{background:#f1f5f9;font-weight:700;text-align:left;width:30%}
  .header-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
  .qr-box{width:90px;height:90px;border:2px solid #e2e8f0;display:flex;align-items:center;justify-content:center;font-size:9px;text-align:center;padding:4px;line-height:1.3;color:#475569;word-break:break-all}
  .section-title{font-size:13px;font-weight:700;margin:16px 0 6px;padding-left:4px;border-left:3px solid #3b82f6}
  .status-pill{display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700;background:#dbeafe;color:#1d4ed8}
  .footer{margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;display:flex;gap:40px;font-size:12px}
  .sign-box{text-align:center;min-width:80px}
  .sign-line{border-bottom:1px solid #111;margin-bottom:4px;height:36px}
  @media print{body{margin:0;padding:12px}}
</style>
</head><body>
<div class="header-row">
  <div>
    <h1>작업지시서</h1>
    <div class="subtitle">Work Order</div>
  </div>
  <div class="qr-box">QR<br/>${wo.wo_no}<br/>${wo.part_no}</div>
</div>

<table>
  <tr><th>WO 번호</th><td><strong>${wo.wo_no}</strong></td><th>계획일</th><td>${wo.plan_date}</td></tr>
  <tr><th>품번</th><td>${wo.part_no}</td><th>품명</th><td>${wo.part_name || ''}</td></tr>
  <tr><th>호기</th><td>${wo.machine_name || wo.machine_id}</td><th>금형번호</th><td>${wo.mold_no || '—'}</td></tr>
  <tr><th>목표수량</th><td><strong style="font-size:16px">${(wo.target_qty||0).toLocaleString()}</strong> EA</td><th>담당자</th><td>${wo.assigned_worker_id || '—'}</td></tr>
  <tr><th>상태</th><td colspan="3"><span class="status-pill">${wo.status}</span></td></tr>
  ${wo.note ? `<tr><th>지시사항</th><td colspan="3">${wo.note}</td></tr>` : ''}
</table>

<div class="section-title">소요 자재 (BOM 기준)</div>
<table id="bom-table">
  <thead><tr><th style="width:35%">자재 품번</th><th style="width:35%">자재명</th><th style="width:15%;text-align:right">단위소요</th><th style="width:15%;text-align:right">총소요량</th></tr></thead>
  <tbody id="bom-body"><tr><td colspan="4" style="text-align:center;color:#94a3b8">BOM 데이터 없음</td></tr></tbody>
</table>

<div class="footer">
  <div class="sign-box"><div class="sign-line"></div>작성자</div>
  <div class="sign-box"><div class="sign-line"></div>확인자</div>
  <div class="sign-box"><div class="sign-line"></div>작업자</div>
  <div style="flex:1;text-align:right;color:#94a3b8;font-size:11px">인쇄일시: ${new Date().toLocaleString('ko-KR')}</div>
</div>
<script>
  // BOM 로드 후 테이블 채우기
  fetch('/api/bom/${wo.part_no}')
    .then(r=>r.ok?r.json():[]).then(rows=>{
      if(!rows||rows.length===0)return
      const tbody=document.getElementById('bom-body')
      tbody.innerHTML=rows.map(b=>\`<tr>
        <td>\${b.component_part_no||''}</td>
        <td>\${b.component_name||''}</td>
        <td style="text-align:right">\${Number(b.qty_per||0).toFixed(4)}</td>
        <td style="text-align:right"><strong>\${Math.round(Number(b.qty_per||0)*${wo.target_qty})}</strong></td>
      </tr>\`).join('')
    }).catch(()=>{})
  setTimeout(()=>window.print(),600)
</script>
</body></html>`)
    w.document.close()
  }

  // ── 실적 입력 저장 ──
  const saveActual = async () => {
    if (!actualModal) return
    setActualSaving(true)
    try {
      await api.patch(`/mes-floor/work-orders/${actualModal}/actual`, {
        good_qty: +actualForm.good_qty || 0,
        defect_qty: +actualForm.defect_qty || 0,
      })
      setActualModal(null)
      load()
    } catch (e) { alert('저장 실패: ' + (e.response?.data?.detail || e.message)) }
    finally { setActualSaving(false) }
  }

  // ── 생산계획 불러오기 ──
  const loadBulkPlan = async () => {
    setBulkLoading(true)
    try {
      const [weeksR, planR] = await Promise.all([
        api.get(`/production/weekly-plans/weeks?year=${bulkYear}&month=${bulkMonth}`),
        api.get(`/production/weekly-plans?year=${bulkYear}&month=${bulkMonth}`),
      ])
      setWeekOptions(weeksR.data || [])
      const rows = planR.data || []
      setPlanRows(rows)
      // 선택된 주차 기본값
      if (weeksR.data?.length > 0 && !bulkWeek) setBulkWeek(weeksR.data[0].week_no)
      // 초기 선택 상태 — 현재 주차 계획만 체크
      const initSel = {}
      rows.forEach(r => {
        const ws = r.week_start
        initSel[r.id] = { checked: false, machine_id: '', target_qty: r.planned_qty, plan_date: ws, worker: '' }
      })
      setBulkSel(initSel)
    } catch (e) { alert('계획 로딩 실패: ' + (e.response?.data?.detail || e.message)) }
    finally { setBulkLoading(false) }
  }

  useEffect(() => { if (showBulk) loadBulkPlan() }, [showBulk, bulkYear, bulkMonth])

  const bulkSubmit = async () => {
    const toCreate = planRows.filter(r => bulkSel[r.id]?.checked && bulkSel[r.id]?.machine_id)
    if (toCreate.length === 0) return alert('호기가 지정된 항목을 선택하세요')
    setBulkSubmitting(true)
    try {
      await Promise.all(toCreate.map(r => {
        const s = bulkSel[r.id]
        return api.post('/mes-floor/work-orders', {
          part_no: r.part_no, machine_id: s.machine_id,
          target_qty: +s.target_qty || r.planned_qty,
          plan_date: s.plan_date || r.week_start,
          assigned_worker_id: s.worker || null,
        })
      }))
      alert(`${toCreate.length}건 작업지시 발행 완료`)
      setShowBulk(false)
      load()
    } catch (e) { alert('일괄발행 실패: ' + (e.response?.data?.detail || e.message)) }
    finally { setBulkSubmitting(false) }
  }

  const filteredItems = items.filter(it =>
    !partSearch || it.part_no.includes(partSearch) || (it.name||'').includes(partSearch)
  ).slice(0, 20)

  const weekRows = planRows.filter(r => r.week_no === bulkWeek)

  const summary = {
    total: wos.length,
    pending: wos.filter(w => w.status==='대기').length,
    running: wos.filter(w => w.status==='진행').length,
    done:    wos.filter(w => w.status==='완료').length,
    totalGood:   wos.reduce((s,w)=>s+(w.good_qty||0),0),
    totalTarget: wos.reduce((s,w)=>s+(w.target_qty||0),0),
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* 헤더 */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>작업지시 관리</h2>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" style={{ background:'#0f766e', color:'#fff', border:'none' }}
            onClick={() => setShowBulk(true)}>
            📋 생산계획 연동 일괄발행
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ 단건 발행</button>
        </div>
      </div>

      {/* 필터 */}
      <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div className="form-group" style={{ margin:0 }}>
          <label style={{ fontSize:11 }}>계획일</label>
          <input type="date" className="form-control" value={filters.plan_date}
            onChange={e => setFilters(f=>({...f, plan_date:e.target.value}))} style={{ width:140 }} />
        </div>
        <div className="form-group" style={{ margin:0 }}>
          <label style={{ fontSize:11 }}>호기</label>
          <select className="form-control" value={filters.machine_id}
            onChange={e => setFilters(f=>({...f, machine_id:e.target.value}))} style={{ width:120 }}>
            <option value="">전체</option>
            {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin:0 }}>
          <label style={{ fontSize:11 }}>상태</label>
          <select className="form-control" value={filters.status}
            onChange={e => setFilters(f=>({...f, status:e.target.value}))} style={{ width:100 }}>
            <option value="">전체</option>
            {['대기','자재확인','발행','진행','완료','마감','취소'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn btn-sm btn-outline" onClick={load} style={{ alignSelf:'flex-end' }}>새로고침</button>
      </div>

      {/* 요약 카드 */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        {[
          { label:'전체', value:summary.total, color:'#475569' },
          { label:'대기', value:summary.pending, color:'#64748b' },
          { label:'진행중', value:summary.running, color:'#1d4ed8' },
          { label:'완료', value:summary.done, color:'#16a34a' },
        ].map(k => (
          <div key={k.label} style={{ border:'1px solid #e2e8f0', borderRadius:7, padding:'6px 16px', fontSize:12, background:'#fff', textAlign:'center' }}>
            <div style={{ color:'#94a3b8', fontSize:11 }}>{k.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.value}</div>
          </div>
        ))}
        {summary.totalTarget > 0 && (
          <div style={{ border:'1px solid #e2e8f0', borderRadius:7, padding:'6px 16px', fontSize:12, background:'#fff', textAlign:'center', minWidth:140 }}>
            <div style={{ color:'#94a3b8', fontSize:11 }}>달성률 (양품/목표)</div>
            <div style={{ fontSize:16, fontWeight:800, color: summary.totalGood/summary.totalTarget>=1?'#16a34a':'#d97706' }}>
              {Math.round(summary.totalGood/summary.totalTarget*100)}%
            </div>
            <div style={{ fontSize:11, color:'#64748b' }}>{summary.totalGood.toLocaleString()} / {summary.totalTarget.toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* 테이블 */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>WO번호</th>
              <th>품번</th>
              <th>품명</th>
              <th>호기</th>
              <th>담당자</th>
              <th style={{ textAlign:'right' }}>목표</th>
              <th style={{ textAlign:'right' }}>양품</th>
              <th style={{ textAlign:'right' }}>불량</th>
              <th style={{ minWidth:120 }}>달성률</th>
              <th>계획일</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {wos.length===0 ? (
              <tr><td colSpan={12} style={{ textAlign:'center', color:'#94a3b8', padding:32 }}>작업지시 없음</td></tr>
            ) : wos.map(w => {
              const ach = w.target_qty>0 ? Math.round((w.good_qty||0)/w.target_qty*100) : 0
              const sc  = STATUS_BADGE[w.status] || STATUS_BADGE['대기']
              const workerName = workers.find(u=>u.username===w.assigned_worker_id)?.name || w.assigned_worker_id || '—'
              const canChange = !!STATUS_FLOW[w.status]
              return (
                <tr key={w.wo_no}>
                  <td><code style={{ fontSize:11 }}>{w.wo_no}</code></td>
                  <td><code style={{ fontSize:11 }}>{w.part_no}</code></td>
                  <td style={{ fontWeight:500 }}>{w.part_name}</td>
                  <td>{w.machine_name}</td>
                  <td style={{ fontSize:12 }}>
                    {w.assigned_worker_id
                      ? <span style={{ padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600, background:'#ede9fe', color:'#6d28d9' }}>{workerName}</span>
                      : <span style={{ color:'#94a3b8' }}>미지정</span>}
                  </td>
                  <td style={{ textAlign:'right' }}>{(w.target_qty||0).toLocaleString()}</td>
                  <td style={{ textAlign:'right', color:'#1d4ed8', fontWeight:600 }}>{(w.good_qty||0).toLocaleString()}</td>
                  <td style={{ textAlign:'right', color:w.defect_qty>0?'#dc2626':undefined }}>{(w.defect_qty||0).toLocaleString()}</td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ flex:1, height:6, background:'#e5e7eb', borderRadius:3 }}>
                        <div style={{ width:`${Math.min(100,ach)}%`, height:'100%', borderRadius:3,
                          background: ach>=100?'#16a34a':ach>=70?'#f59e0b':'#ef4444', transition:'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, minWidth:28, textAlign:'right',
                        color: ach>=100?'#16a34a':ach>=70?'#d97706':'#dc2626' }}>{ach}%</span>
                    </div>
                  </td>
                  <td>{w.plan_date}</td>
                  <td>
                    <button
                      onClick={() => canChange && toggleStatus(w)}
                      title={canChange ? `클릭 → ${STATUS_FLOW[w.status]}` : ''}
                      style={{
                        padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                        background:sc.bg, color:sc.color, border:`1px solid ${sc.color}30`,
                        cursor:canChange?'pointer':'default',
                      }}
                    >
                      {w.status}{canChange && ' →'}
                    </button>
                  </td>
                  <td style={{ display:'flex', gap:4 }}>
                    <button className="btn btn-sm btn-outline" style={{ fontSize:11 }}
                      onClick={() => { setActualModal(w.wo_no); setActualForm({ good_qty:w.good_qty||'', defect_qty:w.defect_qty||'' }) }}>
                      실적
                    </button>
                    <button className="btn btn-sm btn-outline" style={{ fontSize:11 }}
                      title="작업표 출력" onClick={() => printWO(w)}>
                      🖨
                    </button>
                    {!['완료','마감','취소'].includes(w.status) && (
                      <button className="btn btn-sm" style={{ fontSize:11, background:'#fee2e2', color:'#dc2626', border:'none' }}
                        title="작업지시 취소 (자재 역전표 자동생성)" onClick={() => cancelWO(w)}>
                        취소
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── 단건 발행 모달 ── */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:12, padding:28, minWidth:360, maxWidth:460 }}>
            <h3 style={{ margin:'0 0 16px', fontSize:16, fontWeight:700 }}>작업지시 발행</h3>
            <div className="form-group" style={{ position:'relative' }}>
              <label>품번 *</label>
              <input className="form-control" value={form.part_no || partSearch}
                onChange={e => { setPartSearch(e.target.value); setForm(f=>({...f, part_no:''})); setPartOpen(true) }}
                onFocus={() => setPartOpen(true)} placeholder="품번 또는 품명 검색" />
              {partOpen && filteredItems.length>0 && !form.part_no && (
                <div style={{ position:'absolute', zIndex:10, background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, width:'100%', maxHeight:180, overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,.1)' }}>
                  {filteredItems.map(it => (
                    <div key={it.part_no} style={{ padding:'8px 12px', cursor:'pointer', fontSize:13 }}
                      onMouseDown={() => { setForm(f=>({...f, part_no:it.part_no})); setPartSearch(`${it.part_no} — ${it.name}`); setPartOpen(false) }}>
                      <span style={{ fontWeight:600 }}>{it.part_no}</span> {it.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label>호기 *</label>
                <select className="form-control" value={form.machine_id}
                  onChange={e => setForm(f=>({...f, machine_id:e.target.value}))}>
                  <option value="">선택</option>
                  {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>목표수량 *</label>
                <input className="form-control" type="number" min="1" value={form.target_qty}
                  onChange={e => setForm(f=>({...f, target_qty:e.target.value}))} />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label>계획일</label>
                <input type="date" className="form-control" value={form.plan_date}
                  onChange={e => setForm(f=>({...f, plan_date:e.target.value}))} />
              </div>
              <div className="form-group">
                <label>담당 작업자</label>
                <select className="form-control" value={form.assigned_worker_id}
                  onChange={e => setForm(f=>({...f, assigned_worker_id:e.target.value}))}>
                  <option value="">미지정</option>
                  {workers.map(u => <option key={u.username} value={u.username}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer" style={{ marginTop:16 }}>
              <button className="btn btn-outline" onClick={() => { setShowForm(false); setPartSearch('') }}>취소</button>
              <button className="btn btn-primary" onClick={submit}>발행</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 생산계획 연동 일괄발행 모달 ── */}
      {showBulk && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'#fff', borderRadius:12, padding:24, width:'90vw', maxWidth:900, maxHeight:'88vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>📋 생산계획 연동 일괄발행</h3>
              <button onClick={() => setShowBulk(false)} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#64748b' }}>✕</button>
            </div>

            {/* 기간 선택 */}
            <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center', flexWrap:'wrap' }}>
              <select className="form-control" value={bulkYear} onChange={e=>{setBulkYear(+e.target.value)}} style={{ width:90 }}>
                {[new Date().getFullYear()-1,new Date().getFullYear(),new Date().getFullYear()+1].map(y=><option key={y}>{y}</option>)}
              </select>
              <span style={{ fontSize:13 }}>년</span>
              <select className="form-control" value={bulkMonth} onChange={e=>{setBulkMonth(+e.target.value)}} style={{ width:70 }}>
                {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m}>{m}</option>)}
              </select>
              <span style={{ fontSize:13 }}>월</span>
              <div style={{ display:'flex', border:'1px solid #cbd5e1', borderRadius:6, overflow:'hidden' }}>
                {(weekOptions.length>0 ? weekOptions : [{week_no:1},{week_no:2},{week_no:3},{week_no:4}]).map(w=>(
                  <button key={w.week_no} onClick={()=>setBulkWeek(w.week_no)} style={{
                    padding:'5px 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                    background:bulkWeek===w.week_no?'#1d4ed8':'#fff', color:bulkWeek===w.week_no?'#fff':'#64748b',
                  }}>{w.week_no}주</button>
                ))}
              </div>
              {bulkLoading && <span style={{ fontSize:12, color:'#94a3b8' }}>로딩 중...</span>}
            </div>

            {/* 계획 테이블 */}
            <div style={{ flex:1, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:8 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead style={{ position:'sticky', top:0, background:'#f8fafc', zIndex:1 }}>
                  <tr>
                    <th style={{ padding:'8px 10px', textAlign:'center', borderBottom:'2px solid #e2e8f0', width:36 }}>
                      <input type="checkbox" onChange={e => {
                        const updated = {...bulkSel}
                        weekRows.forEach(r => { if(updated[r.id]) updated[r.id] = {...updated[r.id], checked:e.target.checked} })
                        setBulkSel(updated)
                      }} />
                    </th>
                    <th style={{ padding:'8px 10px', borderBottom:'2px solid #e2e8f0', textAlign:'left' }}>품번</th>
                    <th style={{ padding:'8px 10px', borderBottom:'2px solid #e2e8f0', textAlign:'left' }}>품명</th>
                    <th style={{ padding:'8px 10px', borderBottom:'2px solid #e2e8f0', textAlign:'right' }}>계획수량</th>
                    <th style={{ padding:'8px 10px', borderBottom:'2px solid #e2e8f0', textAlign:'right' }}>실적수량</th>
                    <th style={{ padding:'8px 10px', borderBottom:'2px solid #e2e8f0', textAlign:'center' }}>달성률</th>
                    <th style={{ padding:'8px 10px', borderBottom:'2px solid #e2e8f0', minWidth:120 }}>호기 *</th>
                    <th style={{ padding:'8px 10px', borderBottom:'2px solid #e2e8f0', minWidth:90 }}>목표수량</th>
                    <th style={{ padding:'8px 10px', borderBottom:'2px solid #e2e8f0', minWidth:120 }}>계획일</th>
                    <th style={{ padding:'8px 10px', borderBottom:'2px solid #e2e8f0', minWidth:100 }}>작업자</th>
                  </tr>
                </thead>
                <tbody>
                  {weekRows.length===0 ? (
                    <tr><td colSpan={10} style={{ textAlign:'center', padding:32, color:'#94a3b8' }}>
                      {bulkLoading ? '로딩 중...' : '해당 주차 생산계획 없음'}
                    </td></tr>
                  ) : weekRows.map(r => {
                    const s = bulkSel[r.id] || { checked:false, machine_id:'', target_qty:r.planned_qty, plan_date:r.week_start, worker:'' }
                    const ach = r.planned_qty>0 ? Math.round(r.actual_qty/r.planned_qty*100) : 0
                    return (
                      <tr key={r.id} style={{ background:s.checked?'#eff6ff':undefined, borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ textAlign:'center', padding:'6px 10px' }}>
                          <input type="checkbox" checked={s.checked||false}
                            onChange={e => setBulkSel(prev => ({...prev, [r.id]:{...s, checked:e.target.checked}}))} />
                        </td>
                        <td style={{ padding:'6px 10px', fontFamily:'monospace', fontSize:12 }}>{r.part_no}</td>
                        <td style={{ padding:'6px 10px', fontWeight:500 }}>{r.part_name}</td>
                        <td style={{ padding:'6px 10px', textAlign:'right' }}>{r.planned_qty.toLocaleString()}</td>
                        <td style={{ padding:'6px 10px', textAlign:'right', color:'#1d4ed8', fontWeight:600 }}>{r.actual_qty.toLocaleString()}</td>
                        <td style={{ padding:'6px 10px', textAlign:'center' }}>
                          <span style={{ fontWeight:700, color:ach>=100?'#16a34a':ach>=70?'#d97706':'#dc2626' }}>{ach}%</span>
                        </td>
                        <td style={{ padding:'4px 6px' }}>
                          <select style={{ width:'100%', fontSize:12, padding:'3px 6px', border:`1.5px solid ${s.checked&&!s.machine_id?'#ef4444':'#cbd5e1'}`, borderRadius:4 }}
                            value={s.machine_id}
                            onChange={e => setBulkSel(prev => ({...prev, [r.id]:{...s, machine_id:e.target.value}}))}>
                            <option value="">선택</option>
                            {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
                          </select>
                        </td>
                        <td style={{ padding:'4px 6px' }}>
                          <input type="number" style={{ width:'100%', fontSize:12, padding:'3px 6px', border:'1px solid #cbd5e1', borderRadius:4, textAlign:'right' }}
                            value={s.target_qty}
                            onChange={e => setBulkSel(prev => ({...prev, [r.id]:{...s, target_qty:e.target.value}}))} />
                        </td>
                        <td style={{ padding:'4px 6px' }}>
                          <input type="date" style={{ width:'100%', fontSize:12, padding:'3px 6px', border:'1px solid #cbd5e1', borderRadius:4 }}
                            value={s.plan_date}
                            onChange={e => setBulkSel(prev => ({...prev, [r.id]:{...s, plan_date:e.target.value}}))} />
                        </td>
                        <td style={{ padding:'4px 6px' }}>
                          <select style={{ width:'100%', fontSize:12, padding:'3px 6px', border:'1px solid #cbd5e1', borderRadius:4 }}
                            value={s.worker}
                            onChange={e => setBulkSel(prev => ({...prev, [r.id]:{...s, worker:e.target.value}}))}>
                            <option value="">미지정</option>
                            {workers.map(u => <option key={u.username} value={u.username}>{u.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14 }}>
              <span style={{ fontSize:12, color:'#64748b' }}>
                체크 선택: {Object.values(bulkSel).filter(s=>s.checked).length}건 선택
                {Object.values(bulkSel).filter(s=>s.checked&&!s.machine_id).length>0 && (
                  <span style={{ color:'#dc2626', marginLeft:8 }}>⚠ 호기 미선택 {Object.values(bulkSel).filter(s=>s.checked&&!s.machine_id).length}건</span>
                )}
              </span>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-outline" onClick={() => setShowBulk(false)}>닫기</button>
                <button className="btn btn-primary" onClick={bulkSubmit} disabled={bulkSubmitting}>
                  {bulkSubmitting ? '발행 중...' : '일괄 발행'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 실적 입력 모달 ── */}
      {actualModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1001 }}>
          <div style={{ background:'#fff', borderRadius:12, padding:24, width:320 }}>
            <h3 style={{ margin:'0 0 16px', fontSize:15, fontWeight:700 }}>실적 입력 — {actualModal}</h3>
            <div className="grid-2">
              <div className="form-group">
                <label>양품수량</label>
                <input className="form-control" type="number" min="0" value={actualForm.good_qty}
                  onChange={e => setActualForm(f=>({...f, good_qty:e.target.value}))} />
              </div>
              <div className="form-group">
                <label>불량수량</label>
                <input className="form-control" type="number" min="0" value={actualForm.defect_qty}
                  onChange={e => setActualForm(f=>({...f, defect_qty:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer" style={{ marginTop:12 }}>
              <button className="btn btn-outline" onClick={() => setActualModal(null)}>취소</button>
              <button className="btn btn-primary" onClick={saveActual} disabled={actualSaving}>
                {actualSaving ? '저장중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
