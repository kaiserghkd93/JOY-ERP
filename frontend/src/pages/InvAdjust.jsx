import { useEffect, useState, useCallback } from 'react'
import api from '../api'
import { getRole } from '../auth'

const LOSS_TYPES = [
  '퍼지·짜내기','시동로스','러너폐기','러너회수',
  '재분쇄재회수','재분쇄재재투입','원재료폐기','제품불량(kg)','기타',
]
const LOSS_TYPE_MAP = {
  '퍼지·짜내기':'purge','시동로스':'startup','러너폐기':'runner_scrap',
  '러너회수':'runner_recover','재분쇄재회수':'regrind_in',
  '재분쇄재재투입':'regrind_out','원재료폐기':'raw_disposal',
  '제품불량(kg)':'product_defect','기타':'other',
}
const ADJ_STATUS_LABEL = {
  '작성중':'작성중','승인대기':'대기','승인완료':'승인','반려':'반려','확정':'확정',
}
const ADJ_STATUS_COLOR = {
  '작성중':'var(--text-sm)','승인대기':'var(--warn)','승인완료':'var(--primary)',
  '반려':'var(--danger)','확정':'var(--success)',
}

function today() { return new Date().toISOString().slice(0,10) }

export default function InvAdjust() {
  const [tab, setTab] = useState('adj')   // 'adj' | 'loss' | 'history'
  const role = getRole()
  const isAdmin = role === 'admin' || role === 'owner'
  const isManager = ['admin','owner','manufacturing','quality_manager'].includes(role)

  // ── 재고조정 상태 ──
  const [items, setItems] = useState([])
  const [adjs, setAdjs] = useState([])
  const [adjForm, setAdjForm] = useState({
    adj_date: today(), part_no: '', actual_qty: '', reason: '', note: '',
  })
  const [bookQty, setBookQty] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectTarget, setRejectTarget] = useState(null)

  // ── 로스 상태 ──
  const [rawItems, setRawItems] = useState([])
  const [losses, setLosses] = useState([])
  const [lossForm, setLossForm] = useState({
    loss_date: today(), raw_part_no: '', loss_type: '퍼지·짜내기',
    qty_kg: '', part_no: '', machine_no: '', pord_no: '', reason_code: '', note: '',
  })

  const loadAdjs = useCallback(() => {
    api.get('/inv-adjust/adjustments').then(r => setAdjs(r.data || [])).catch(()=>{})
  }, [])
  const loadLosses = useCallback(() => {
    api.get('/inv-adjust/losses').then(r => setLosses(r.data || [])).catch(()=>{})
  }, [])

  useEffect(() => {
    api.get('/master/items').then(r => {
      const all = Array.isArray(r.data) ? r.data : []
      setItems(all)
      setRawItems(all.filter(i => i.item_type === 'raw' || i.unit === 'kg' || i.unit === 'g'))
    }).catch(()=>{})
    loadAdjs()
    loadLosses()
  }, [loadAdjs, loadLosses])

  // 품번 선택 시 현재고 조회
  useEffect(() => {
    if (!adjForm.part_no) { setBookQty(null); return }
    api.get(`/ledger/stock/${adjForm.part_no}`).then(r => {
      setBookQty(r.data?.qty ?? r.data ?? null)
    }).catch(()=> setBookQty(null))
  }, [adjForm.part_no])

  const setAdj = (k,v) => setAdjForm(f=>({...f,[k]:v}))
  const setLoss = (k,v) => setLossForm(f=>({...f,[k]:v}))

  const submitAdj = async () => {
    if (!adjForm.part_no || adjForm.actual_qty === '') return alert('품번과 실사수량을 입력해주세요.')
    if (!adjForm.reason) return alert('조정 사유를 입력해주세요.')
    try {
      const res = await api.post('/inv-adjust/adjustments', {
        ...adjForm, actual_qty: parseInt(adjForm.actual_qty),
      })
      if (res.data?.admin_direct) {
        alert(`직접 반영 완료 (차이: ${res.data.diff_qty}`)
      } else {
        alert('조정 요청이 승인대기로 등록되었습니다.')
      }
      setAdjForm({ adj_date: today(), part_no: '', actual_qty: '', reason: '', note: '' })
      setBookQty(null)
      loadAdjs()
    } catch(e) { alert(e?.response?.data?.detail || '오류') }
  }

  const approveAdj = async (id) => {
    await api.patch(`/inv-adjust/adjustments/${id}/approve`)
    loadAdjs()
  }
  const rejectAdj = async (id) => {
    if (!rejectReason.trim()) return alert('반려 사유를 입력해주세요.')
    await api.patch(`/inv-adjust/adjustments/${id}/reject?reason=${encodeURIComponent(rejectReason)}`)
    setRejectTarget(null); setRejectReason(''); loadAdjs()
  }
  const confirmAdj = async (id) => {
    await api.patch(`/inv-adjust/adjustments/${id}/confirm`)
    loadAdjs()
  }

  const submitLoss = async () => {
    if (!lossForm.raw_part_no || !lossForm.qty_kg) return alert('원재료와 수량을 입력해주세요.')
    try {
      await api.post('/inv-adjust/losses', {
        ...lossForm,
        qty_kg: parseFloat(lossForm.qty_kg),
        loss_type: LOSS_TYPE_MAP[lossForm.loss_type] || 'other',
      })
      setLossForm({ loss_date: today(), raw_part_no: '', loss_type: '퍼지·짜내기',
        qty_kg: '', part_no: '', machine_no: '', pord_no: '', reason_code: '', note: '' })
      loadLosses()
    } catch(e) { alert(e?.response?.data?.detail || '오류') }
  }

  const confirmLoss = async (id) => {
    await api.patch(`/inv-adjust/losses/${id}/confirm`)
    loadLosses()
  }
  const deleteLoss = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await api.delete(`/inv-adjust/losses/${id}`)
    loadLosses()
  }

  const diff = bookQty !== null && adjForm.actual_qty !== ''
    ? parseInt(adjForm.actual_qty) - bookQty : null

  const pendingAdjs = adjs.filter(a => ['승인대기','승인완료'].includes(a.status))
  const histAdjs = adjs.filter(a => ['확정','반려'].includes(a.status))
  const draftLosses = losses.filter(l => l.status === '작성중')
  const confirmedLosses = losses.filter(l => l.status === '확정')

  return (
    <div className="erp-wrap">
      <div className="erp-panel" style={{marginBottom:8}}>
        <div className="erp-actions">
          <div className="qdate-bar">
            {[['adj','재고조정 등록'],['loss','로스 등록'],['history','이력 조회']].map(([v,l])=>(
              <button key={v} className={`qdate-btn${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 재고조정 등록 ── */}
      {tab === 'adj' && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            {/* 등록 폼 */}
            <div className="erp-panel">
              <div className="section-title">실사 재고조정 {isAdmin && <span style={{fontSize:11,color:'var(--success)',marginLeft:8}}>관리자 — 즉시 반영 (기록 없음)</span>}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
                <div className="form-group"><label>조정일자</label>
                  <input type="date" value={adjForm.adj_date} onChange={e=>setAdj('adj_date',e.target.value)}/>
                </div>
                <div className="form-group"><label>품번</label>
                  <select value={adjForm.part_no} onChange={e=>setAdj('part_no',e.target.value)}>
                    <option value="">선택</option>
                    {items.map(i=><option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
                  </select>
                </div>
              </div>
              {bookQty !== null && (
                <div style={{background:'var(--bg)',borderRadius:4,padding:'8px 12px',marginBottom:8,fontSize:12}}>
                  ERP 장부재고: <strong>{bookQty.toLocaleString()}</strong>
                  {diff !== null && (
                    <span style={{marginLeft:16,color: diff===0?'var(--text-sm)': diff>0?'var(--success)':'var(--danger)',fontWeight:600}}>
                      차이: {diff > 0 ? '+' : ''}{diff}
                    </span>
                  )}
                </div>
              )}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div className="form-group"><label>실사수량</label>
                  <input type="number" value={adjForm.actual_qty} onChange={e=>setAdj('actual_qty',e.target.value)} placeholder="실제 수량"/>
                </div>
                <div className="form-group"><label>조정 사유</label>
                  <input value={adjForm.reason} onChange={e=>setAdj('reason',e.target.value)} placeholder="예: 파손, 실사 오차"/>
                </div>
              </div>
              <div className="form-group"><label>비고</label>
                <input value={adjForm.note} onChange={e=>setAdj('note',e.target.value)} placeholder="추가 설명"/>
              </div>
              <button className="btn btn-primary" style={{width:'100%',marginTop:4}} onClick={submitAdj}>
                {isAdmin ? '즉시 반영' : '승인 요청'}
              </button>
            </div>

            {/* 승인 대기 목록 */}
            <div className="erp-panel">
              <div className="section-title">승인 대기 / 처리</div>
              {pendingAdjs.length === 0
                ? <div style={{padding:'24px',textAlign:'center',color:'var(--text-sm)'}}>대기 없음</div>
                : <div style={{overflowY:'auto',maxHeight:340}}>
                  {pendingAdjs.map(a=>(
                    <div key={a.id} style={{borderBottom:'1px solid var(--border)',padding:'10px 0'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div>
                          <span style={{fontWeight:600,fontSize:13}}>{a.adj_no}</span>
                          <span style={{marginLeft:8,fontSize:11,color:'var(--text-sm)'}}>{a.adj_date}</span>
                          <span style={{marginLeft:8,padding:'1px 6px',borderRadius:10,fontSize:10,
                            background:'var(--bg)',color:ADJ_STATUS_COLOR[a.status]}}>
                            {ADJ_STATUS_LABEL[a.status]}
                          </span>
                        </div>
                      </div>
                      <div style={{fontSize:12,margin:'4px 0'}}>
                        <strong>{a.part_name}</strong> — 장부 {a.book_qty} → 실사 {a.actual_qty}
                        <span style={{marginLeft:8,fontWeight:600,
                          color:a.diff_qty===0?'var(--text-sm)':a.diff_qty>0?'var(--success)':'var(--danger)'}}>
                          ({a.diff_qty > 0 ? '+' : ''}{a.diff_qty})
                        </span>
                      </div>
                      <div style={{fontSize:11,color:'var(--text-sm)'}}>{a.reason} | 등록: {a.created_by}</div>
                      {isManager && a.status === '승인대기' && (
                        <div style={{display:'flex',gap:6,marginTop:6}}>
                          <button className="btn btn-sm btn-primary" onClick={()=>approveAdj(a.id)}>승인</button>
                          <button className="btn btn-sm" style={{background:'var(--danger)',color:'#fff',border:'none'}}
                            onClick={()=>setRejectTarget(a.id)}>반려</button>
                        </div>
                      )}
                      {isManager && a.status === '승인완료' && (
                        <button className="btn btn-sm btn-primary" style={{marginTop:6}} onClick={()=>confirmAdj(a.id)}>
                          확정 (재고 반영)
                        </button>
                      )}
                      {rejectTarget === a.id && (
                        <div style={{marginTop:6,display:'flex',gap:6}}>
                          <input value={rejectReason} onChange={e=>setRejectReason(e.target.value)}
                            placeholder="반려 사유" style={{flex:1,fontSize:12}}/>
                          <button className="btn btn-sm" style={{background:'var(--danger)',color:'#fff',border:'none'}}
                            onClick={()=>rejectAdj(a.id)}>확인</button>
                          <button className="btn btn-sm btn-outline" onClick={()=>setRejectTarget(null)}>취소</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              }
            </div>
          </div>
        </>
      )}

      {/* ── 로스 등록 ── */}
      {tab === 'loss' && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <div className="erp-panel">
              <div className="section-title">로스 등록 (kg 단위)</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
                <div className="form-group"><label>발생일자</label>
                  <input type="date" value={lossForm.loss_date} onChange={e=>setLoss('loss_date',e.target.value)}/>
                </div>
                <div className="form-group"><label>로스 유형</label>
                  <select value={lossForm.loss_type} onChange={e=>setLoss('loss_type',e.target.value)}>
                    {LOSS_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>원재료 품번</label>
                  <select value={lossForm.raw_part_no} onChange={e=>setLoss('raw_part_no',e.target.value)}>
                    <option value="">선택</option>
                    {items.map(i=><option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>수량 (kg)</label>
                  <input type="number" step="0.001" value={lossForm.qty_kg} onChange={e=>setLoss('qty_kg',e.target.value)} placeholder="0.000"/>
                </div>
                <div className="form-group"><label>제품 품번 (선택)</label>
                  <select value={lossForm.part_no} onChange={e=>setLoss('part_no',e.target.value)}>
                    <option value="">선택</option>
                    {items.map(i=><option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>사출기 번호</label>
                  <input value={lossForm.machine_no} onChange={e=>setLoss('machine_no',e.target.value)} placeholder="예: IMM-01"/>
                </div>
                <div className="form-group"><label>작업지시 번호 (선택)</label>
                  <input value={lossForm.pord_no} onChange={e=>setLoss('pord_no',e.target.value)} placeholder="WO-..."/>
                </div>
                <div className="form-group"><label>사유코드</label>
                  <select value={lossForm.reason_code} onChange={e=>setLoss('reason_code',e.target.value)}>
                    <option value="">선택</option>
                    {['성형불량','금형이상','설비이상','색상교체','원재료교체','초기조건설정','품질부적합','기타'].map(c=>(
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group"><label>비고</label>
                <input value={lossForm.note} onChange={e=>setLoss('note',e.target.value)} placeholder="상세 내용"/>
              </div>
              <button className="btn btn-primary" style={{width:'100%',marginTop:4}} onClick={submitLoss}>로스 등록</button>
            </div>

            <div className="erp-panel">
              <div className="section-title">미확정 로스 목록</div>
              <div style={{overflowY:'auto',maxHeight:380}}>
                {draftLosses.length === 0
                  ? <div style={{padding:'24px',textAlign:'center',color:'var(--text-sm)'}}>없음</div>
                  : draftLosses.map(l=>(
                    <div key={l.id} style={{borderBottom:'1px solid var(--border)',padding:'8px 0'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div>
                          <span style={{fontWeight:600,fontSize:12}}>{l.loss_type}</span>
                          <span style={{marginLeft:8,fontSize:11,color:'var(--text-sm)'}}>{l.loss_date}</span>
                        </div>
                        <div style={{display:'flex',gap:4}}>
                          {isManager && (
                            <button className="btn btn-sm btn-primary" onClick={()=>confirmLoss(l.id)}>확정</button>
                          )}
                          <button className="btn btn-sm btn-outline" style={{color:'var(--danger)'}}
                            onClick={()=>deleteLoss(l.id)}>삭제</button>
                        </div>
                      </div>
                      <div style={{fontSize:12,margin:'3px 0'}}>
                        <strong>{l.raw_part_name}</strong> {l.qty_kg} kg
                        {l.machine_no && <span style={{color:'var(--text-sm)',marginLeft:8}}>{l.machine_no}</span>}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-sm)'}}>등록: {l.created_by}{l.reason_code && ` | ${l.reason_code}`}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 이력 조회 ── */}
      {tab === 'history' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="erp-panel">
            <div className="section-title">재고조정 확정 이력</div>
            <div className="table-wrap" style={{maxHeight:500}}>
              <table>
                <thead><tr>
                  <th>번호</th><th>일자</th><th>품명</th><th>장부</th><th>실사</th><th>차이</th><th>사유</th><th>확정자</th>
                </tr></thead>
                <tbody>
                  {histAdjs.length === 0 && <tr><td colSpan={8} className="empty">없음</td></tr>}
                  {histAdjs.map(a=>(
                    <tr key={a.id}>
                      <td style={{fontSize:10,color:'var(--text-sm)'}}>{a.adj_no}</td>
                      <td>{a.adj_date}</td>
                      <td>{a.part_name}</td>
                      <td style={{textAlign:'right'}}>{a.book_qty?.toLocaleString()}</td>
                      <td style={{textAlign:'right'}}>{a.actual_qty?.toLocaleString()}</td>
                      <td style={{textAlign:'right',fontWeight:600,
                        color:a.diff_qty===0?'var(--text-sm)':a.diff_qty>0?'var(--success)':'var(--danger)'}}>
                        {a.diff_qty > 0 ? '+':''}{a.diff_qty}
                      </td>
                      <td>{a.reason}</td>
                      <td>{a.approved_by || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="erp-panel">
            <div className="section-title">확정 로스 이력</div>
            <div className="table-wrap" style={{maxHeight:500}}>
              <table>
                <thead><tr>
                  <th>일자</th><th>유형</th><th>원재료</th><th>kg</th><th>사유</th><th>확정자</th>
                </tr></thead>
                <tbody>
                  {confirmedLosses.length === 0 && <tr><td colSpan={6} className="empty">없음</td></tr>}
                  {confirmedLosses.map(l=>(
                    <tr key={l.id}>
                      <td>{l.loss_date}</td>
                      <td><span style={{fontSize:11,padding:'1px 6px',background:'var(--bg)',borderRadius:10}}>{l.loss_type}</span></td>
                      <td>{l.raw_part_name}</td>
                      <td style={{textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{parseFloat(l.qty_kg).toFixed(3)}</td>
                      <td>{l.reason_code || '-'}</td>
                      <td>{l.confirmed_by || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
