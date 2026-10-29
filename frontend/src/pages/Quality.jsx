import { useEffect, useState, useCallback } from 'react'
import api from '../api'
import { getRole } from '../auth'

const AQL_OPTIONS = [0.065, 0.1, 0.15, 0.25, 0.4, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5]
const STD_STATUS_BADGE = { '작성중': 'badge-gray', '승인완료': 'badge-green', '폐기': 'badge-red' }

function StandardModal({ editStd, onClose, onSaved }) {
  const [partners, setPartners] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState({
    part_no: editStd?.part_no || '',
    partner_id: editStd?.partner_id || '',
    drawing_no: editStd?.drawing_no || '',
    drawing_rev: editStd?.drawing_rev || '',
    sampling_level: editStd?.sampling_level || 'II',
    aql: editStd?.aql ?? 1.0,
    note: editStd?.note || '',
    effective_date: editStd?.effective_date || '',
  })
  const [stdItems, setStdItems] = useState(
    editStd?.items?.map(i => ({ ...i })) || [{ item_name: '', unit: 'mm', spec_nominal: '', spec_upper: '', spec_lower: '', is_critical: false, is_special: false, method: '', equipment: '', frequency: '매회', sort_order: 0 }]
  )
  const [allItems, setAllItems] = useState([])

  useEffect(() => {
    api.get('/master/partners').then(r => setPartners(r.data)).catch(() => {})
    api.get('/master/items').then(r => setAllItems(r.data)).catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setItem = (idx, k, v) => setStdItems(arr => arr.map((r, i) => i === idx ? { ...r, [k]: v } : r))
  const addItem = () => setStdItems(arr => [...arr, { item_name: '', unit: 'mm', spec_nominal: '', spec_upper: '', spec_lower: '', is_critical: false, is_special: false, method: '', equipment: '', frequency: '매회', sort_order: arr.length }])
  const removeItem = (idx) => setStdItems(arr => arr.filter((_, i) => i !== idx))

  const submit = async () => {
    const payload = {
      ...form,
      aql: +form.aql,
      effective_date: form.effective_date || null,
      items: stdItems.map((it, i) => ({
        item_name: it.item_name, unit: it.unit,
        spec_nominal: it.spec_nominal !== '' ? +it.spec_nominal : null,
        spec_upper: it.spec_upper !== '' ? +it.spec_upper : null,
        spec_lower: it.spec_lower !== '' ? +it.spec_lower : null,
        is_critical: it.is_critical, is_special: it.is_special,
        method: it.method, equipment: it.equipment,
        frequency: it.frequency || '매회',
        sort_order: i,
      }))
    }
    try {
      if (editStd) {
        await api.post(`/quality/standards/${editStd.id}/revise`, payload)
      } else {
        await api.post('/quality/standards', payload)
      }
      onSaved()
    } catch (e) {
      alert(e.response?.data?.detail || '저장 실패')
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" style={{ maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3>{editStd ? `개정 — ${editStd.std_no} Rev.${editStd.std_rev}` : '검사기준 등록'}</h3>
        <div className="grid-2">
          <div className="form-group">
            <label>품번 *</label>
            <select value={form.part_no} onChange={e => set('part_no', e.target.value)}>
              <option value="">선택</option>
              {allItems.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>협력업체 (없으면 전사공통)</label>
            <select value={form.partner_id} onChange={e => set('partner_id', e.target.value)}>
              <option value="">전사공통</option>
              {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>도면번호</label><input value={form.drawing_no} onChange={e => set('drawing_no', e.target.value)} /></div>
          <div className="form-group"><label>도면개정</label><input value={form.drawing_rev} onChange={e => set('drawing_rev', e.target.value)} placeholder="A, B, 01..." /></div>
        </div>
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="form-group">
            <label>샘플링 레벨 (ISO 2859-1)</label>
            <select value={form.sampling_level} onChange={e => set('sampling_level', e.target.value)}>
              {['I','II','III'].map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>AQL</label>
            <select value={form.aql} onChange={e => set('aql', e.target.value)}>
              {AQL_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>적용일</label><input type="date" value={form.effective_date} onChange={e => set('effective_date', e.target.value)} /></div>
          <div className="form-group"><label>비고</label><input value={form.note} onChange={e => set('note', e.target.value)} /></div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="section-title">검사항목</span>
            <button className="btn btn-sm btn-outline" onClick={addItem}>＋ 항목 추가</button>
          </div>
          {stdItems.map((it, idx) => (
            <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '2 1 160px', marginBottom: 4 }}>
                  <label style={{ fontSize: 11 }}>항목명 *</label>
                  <input value={it.item_name} onChange={e => setItem(idx, 'item_name', e.target.value)} placeholder="외관, 치수A..." />
                </div>
                <div className="form-group" style={{ flex: '1 1 60px', marginBottom: 4 }}>
                  <label style={{ fontSize: 11 }}>단위</label>
                  <input value={it.unit} onChange={e => setItem(idx, 'unit', e.target.value)} style={{ width: 60 }} />
                </div>
                <div className="form-group" style={{ flex: '1 1 70px', marginBottom: 4 }}>
                  <label style={{ fontSize: 11 }}>기준값</label>
                  <input type="number" value={it.spec_nominal} onChange={e => setItem(idx, 'spec_nominal', e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: '1 1 70px', marginBottom: 4 }}>
                  <label style={{ fontSize: 11 }}>상한</label>
                  <input type="number" value={it.spec_upper} onChange={e => setItem(idx, 'spec_upper', e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: '1 1 70px', marginBottom: 4 }}>
                  <label style={{ fontSize: 11 }}>하한</label>
                  <input type="number" value={it.spec_lower} onChange={e => setItem(idx, 'spec_lower', e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: '2 1 120px', marginBottom: 4 }}>
                  <label style={{ fontSize: 11 }}>검사방법</label>
                  <input value={it.method} onChange={e => setItem(idx, 'method', e.target.value)} placeholder="버니어캘리퍼스..." />
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 18 }}>
                  <label style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={it.is_critical} onChange={e => setItem(idx, 'is_critical', e.target.checked)} />
                    중요
                  </label>
                  <label style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={it.is_special} onChange={e => setItem(idx, 'is_special', e.target.checked)} />
                    특별
                  </label>
                  <button className="btn btn-sm btn-danger" style={{ fontSize: 11 }} onClick={() => removeItem(idx)}>삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>{editStd ? '개정 저장' : '등록'}</button>
        </div>
      </div>
    </div>
  )
}

function ClaimModal({ onClose, onSaved }) {
  const [partners, setPartners] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState({
    partner_id: '', part_no: '', occur_date: '', defect_type: '', defect_qty: '',
    m4_category: 'Material(자재)', why1: '', why2: '', why3: '', why4: '', why5: '',
    corrective_action: '', preventive_action: '',
  })

  useEffect(() => {
    api.get('/master/partners').then(r => setPartners(r.data))
    api.get('/master/items').then(r => setItems(r.data))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = async () => {
    await api.post('/quality/claims', { ...form, defect_qty: +form.defect_qty })
    onSaved()
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <h3>품질 클레임 등록</h3>
        <div className="grid-2">
          <div className="form-group">
            <label>외주처/고객</label>
            <select value={form.partner_id} onChange={e => set('partner_id', e.target.value)}>
              <option value="">선택</option>
              {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>품번</label>
            <select value={form.part_no} onChange={e => set('part_no', e.target.value)}>
              <option value="">선택</option>
              {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>발생일</label><input type="date" value={form.occur_date} onChange={e => set('occur_date', e.target.value)} /></div>
          <div className="form-group"><label>불량수량</label><input type="number" value={form.defect_qty} onChange={e => set('defect_qty', e.target.value)} /></div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>불량유형</label><input value={form.defect_type} onChange={e => set('defect_type', e.target.value)} placeholder="치수불량, 외관불량…" /></div>
          <div className="form-group">
            <label>4M 구분</label>
            <select value={form.m4_category} onChange={e => set('m4_category', e.target.value)}>
              <option>Material(자재)</option>
              <option>Machine(설비)</option>
              <option>Method(방법)</option>
              <option>Man(작업자)</option>
            </select>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <div className="section-title">5WHY 분석</div>
          {[1,2,3,4,5].map(n => (
            <div className="form-group" key={n}>
              <label>WHY {n}</label>
              <input value={form[`why${n}`]} onChange={e => set(`why${n}`, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="form-group"><label>시정조치</label><textarea rows={2} value={form.corrective_action} onChange={e => set('corrective_action', e.target.value)} /></div>
        <div className="form-group"><label>재발방지</label><textarea rows={2} value={form.preventive_action} onChange={e => set('preventive_action', e.target.value)} /></div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  )
}

const STATUS_BADGE = { '접수': 'badge-blue', '조사중': 'badge-amber', '완료': 'badge-green', '보류': 'badge-gray' }
const APPR_BADGE = {
  '작성중': 'badge-gray', '승인대기': 'badge-amber',
  '반려': 'badge-red', '승인완료': 'badge-blue', '최종확정': 'badge-green',
}

export default function Quality() {
  const role = getRole()
  const isManager = role === 'admin' || role === 'quality_manager'

  const [claims, setClaims] = useState([])
  const [defectRates, setDefectRates] = useState([])
  const [inspections, setInspections] = useState([])
  const [standards, setStandards] = useState([])
  const [tab, setTab] = useState('inspections')
  const [showModal, setShowModal] = useState(false)
  const [showStdModal, setShowStdModal] = useState(false)
  const [editStd, setEditStd] = useState(null)
  const [detailClaim, setDetailClaim] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(() => {
    api.get('/quality/claims').then(r => setClaims(r.data)).catch(() => {})
    api.get('/quality/defect-rate').then(r => setDefectRates(r.data)).catch(() => {})
    api.get('/quality/inspections').then(r => setInspections(r.data)).catch(() => {})
    api.get('/quality/standards').then(r => setStandards(r.data)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const updateStatus = async (claim_no, status) => {
    await api.patch(`/quality/claims/${claim_no}`, { status })
    load()
  }

  const requestApproval = async (id) => {
    await api.post(`/quality/inspections/${id}/request-approval`).catch(e => alert(e.response?.data?.detail || '오류'))
    load()
  }
  const approve = async (id) => {
    await api.post(`/quality/inspections/${id}/approve`).catch(e => alert(e.response?.data?.detail || '오류'))
    load()
  }
  const reject = async (id) => {
    if (!rejectReason.trim()) return alert('반려 사유를 입력하세요')
    await api.post(`/quality/inspections/${id}/reject`, { reason: rejectReason }).catch(e => alert(e.response?.data?.detail || '오류'))
    setRejectTarget(null); setRejectReason(''); load()
  }
  const confirm = async (id) => {
    await api.post(`/quality/inspections/${id}/confirm`).catch(e => alert(e.response?.data?.detail || '오류'))
    load()
  }

  return (
    <div>
      <div className="erp-panel" style={{marginBottom:8}}>
        <div className="erp-actions">
          <div className="qdate-bar">
            {[['inspections','입고검사'], ['standards','검사기준'], ['claims','클레임 목록'], ['rates','외주처별 불량율']].map(([v,l])=>(
              <button key={v} className={`qdate-btn${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
            ))}
          </div>
          <div className="spacer"/>
          {tab === 'claims' && <button className="btn btn-sm btn-primary" onClick={()=>setShowModal(true)}>＋ 클레임 등록</button>}
          {tab === 'standards' && <button className="btn btn-sm btn-primary" onClick={()=>{setEditStd(null);setShowStdModal(true)}}>＋ 기준 등록</button>}
        </div>
      </div>

      {tab === 'inspections' && (
        <>
        <div className="result-bar">
          <span className="result-bar-title">입고검사 목록</span>
          <span className="result-bar-count">{inspections.length}건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>입고번호</th><th>검사일</th><th>검사수량</th><th>합격</th><th>불합격</th>
              <th>판정</th><th>승인상태</th><th>담당자</th>
              {isManager && <th>반려사유</th>}
              <th>액션</th>
            </tr></thead>
            <tbody>
              {inspections.length === 0 && <tr><td colSpan={10} className="empty">검사결과 없음</td></tr>}
              {inspections.map(insp => (
                <tr key={insp.id}>
                  <td style={{fontFamily:'monospace',fontSize:11}}>{insp.gr_no}</td>
                  <td>{insp.inspect_date}</td>
                  <td>{insp.inspect_qty?.toLocaleString()}</td>
                  <td style={{color:'var(--success)'}}>{insp.pass_qty?.toLocaleString()}</td>
                  <td style={{color:'var(--danger)'}}>{insp.fail_qty?.toLocaleString()}</td>
                  <td><span className={`badge ${insp.result==='합격'?'badge-green':insp.result==='불합격'?'badge-red':'badge-amber'}`}>{insp.result}</span></td>
                  <td><span className={`badge ${APPR_BADGE[insp.approval_status||'작성중']}`}>{insp.approval_status||'작성중'}</span></td>
                  <td style={{fontSize:11,color:'var(--text-sm)'}}>{insp.inspector_id||'—'}</td>
                  {isManager && <td style={{fontSize:11,color:'var(--danger)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}}>{insp.rejection_reason||'—'}</td>}
                  <td>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {/* 담당자: 승인요청 버튼 */}
                      {!isManager && (insp.approval_status==='작성중'||insp.approval_status==='반려'||!insp.approval_status) && (
                        <button className="btn btn-sm btn-primary" onClick={()=>requestApproval(insp.id)}>승인요청</button>
                      )}
                      {/* 책임자: 승인/반려/최종확정 */}
                      {isManager && insp.approval_status==='승인대기' && (<>
                        <button className="btn btn-sm btn-success" onClick={()=>approve(insp.id)}>승인</button>
                        <button className="btn btn-sm btn-danger" onClick={()=>setRejectTarget(insp.id)}>반려</button>
                      </>)}
                      {isManager && insp.approval_status==='승인완료' && (
                        <button className="btn btn-sm btn-primary" onClick={()=>confirm(insp.id)}>최종확정</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* 반려 사유 모달 */}
      {rejectTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:400}}>
            <h3>반려 사유 입력</h3>
            <div className="form-group">
              <textarea rows={4} style={{width:'100%',padding:8,borderRadius:6,border:'1px solid var(--border)'}}
                placeholder="반려 사유를 입력하세요"
                value={rejectReason} onChange={e=>setRejectReason(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>{setRejectTarget(null);setRejectReason('')}}>취소</button>
              <button className="btn btn-danger" onClick={()=>reject(rejectTarget)}>반려 확정</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'standards' && (
        <>
        <div className="result-bar">
          <span className="result-bar-title">검사기준 목록</span>
          <span className="result-bar-count">{standards.length}건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>기준번호</th><th>Rev</th><th>품번</th><th>협력업체</th><th>도면번호</th>
              <th>샘플링</th><th>AQL</th><th>항목수</th><th>상태</th><th>승인자</th><th>적용일</th>
              {isManager && <th>관리</th>}
            </tr></thead>
            <tbody>
              {standards.length === 0 && <tr><td colSpan={12} className="empty">등록된 검사기준 없음</td></tr>}
              {standards.map(s => (
                <tr key={s.id}>
                  <td style={{fontFamily:'monospace',fontSize:11}}>{s.std_no}</td>
                  <td style={{fontWeight:600}}>{s.std_rev}</td>
                  <td style={{fontSize:12}}>{s.part_no}</td>
                  <td style={{fontSize:12,color:'var(--text-sm)'}}>{s.partner_id || '전사공통'}</td>
                  <td style={{fontSize:12}}>{s.drawing_no ? `${s.drawing_no}${s.drawing_rev ? '-'+s.drawing_rev : ''}` : '—'}</td>
                  <td><span className="badge badge-blue">{s.sampling_level}</span></td>
                  <td style={{fontVariantNumeric:'tabular-nums'}}>{s.aql}</td>
                  <td style={{textAlign:'center'}}>
                    {s.items?.filter(i=>i.is_critical).length > 0 && <span className="badge badge-red" style={{fontSize:10}}>중요{s.items.filter(i=>i.is_critical).length}</span>}
                    {' '}{s.items?.length || 0}
                  </td>
                  <td><span className={`badge ${STD_STATUS_BADGE[s.status]||'badge-gray'}`}>{s.status}</span></td>
                  <td style={{fontSize:11,color:'var(--text-sm)'}}>{s.approver_id || '—'}</td>
                  <td style={{fontSize:11}}>{s.effective_date || '—'}</td>
                  {isManager && (
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        {s.status === '작성중' && (
                          <button className="btn btn-sm btn-success" onClick={async()=>{
                            await api.post(`/quality/standards/${s.id}/approve`).catch(e=>alert(e.response?.data?.detail||'오류'))
                            load()
                          }}>승인</button>
                        )}
                        <button className="btn btn-sm btn-outline" onClick={()=>{setEditStd(s);setShowStdModal(true)}}>개정</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === 'claims' && (
        <>
        <div className="result-bar">
          <span className="result-bar-title">클레임 목록</span>
          <span className="result-bar-count">{claims.length}건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>클레임번호</th><th>외주처</th><th>품번</th><th>발생일</th><th>불량유형</th><th>수량</th><th>4M</th><th>상태</th><th>처리</th></tr></thead>
            <tbody>
              {claims.length === 0 && <tr><td colSpan={9} className="empty">클레임 없음</td></tr>}
              {claims.map(c => (
                <tr key={c.claim_no}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.claim_no}</td>
                  <td>{c.partner_id}</td>
                  <td>{c.part_no}</td>
                  <td>{c.occur_date}</td>
                  <td>{c.defect_type}</td>
                  <td>{c.defect_qty}</td>
                  <td><span className="badge badge-purple">{c.m4_category?.split('(')[0]}</span></td>
                  <td><span className={`badge ${STATUS_BADGE[c.status] || 'badge-gray'}`}>{c.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-outline" onClick={() => setDetailClaim(c)}>상세</button>
                      {c.status === '접수' && <button className="btn btn-sm btn-primary" onClick={() => updateStatus(c.claim_no, '조사중')}>조사</button>}
                      {c.status === '조사중' && <button className="btn btn-sm btn-success" onClick={() => updateStatus(c.claim_no, '완료')}>완료</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === 'rates' && (
        <>
        <div className="result-bar">
          <span className="result-bar-title">외주처별 불량율</span>
          <span className="result-bar-count">{defectRates.length}건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>외주처</th><th>총검사수</th><th>불합격수</th><th>불량율</th></tr></thead>
            <tbody>
              {defectRates.length === 0 && <tr><td colSpan={4} className="empty">데이터 없음</td></tr>}
              {defectRates.map(r => (
                <tr key={r.partner_id}>
                  <td>{r.partner_name || r.partner_id}</td>
                  <td>{r.total_inspect?.toLocaleString()}</td>
                  <td style={{ color: 'var(--danger)' }}>{r.total_fail?.toLocaleString()}</td>
                  <td>
                    <span className={`badge ${r.defect_rate <= 1 ? 'badge-green' : r.defect_rate <= 5 ? 'badge-amber' : 'badge-red'}`}>
                      {r.defect_rate?.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {showStdModal && (
        <StandardModal
          editStd={editStd}
          onClose={() => setShowStdModal(false)}
          onSaved={() => { setShowStdModal(false); load() }}
        />
      )}

      {showModal && <ClaimModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load() }} />}

      {detailClaim && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <h3>클레임 상세 — {detailClaim.claim_no}</h3>
            <table>
              <tbody>
                <tr><td style={{ width: 120, color: 'var(--text-sm)', fontSize: 12 }}>불량유형</td><td>{detailClaim.defect_type}</td></tr>
                <tr><td>4M 구분</td><td>{detailClaim.m4_category}</td></tr>
                <tr><td>WHY 1</td><td>{detailClaim.why1 || '—'}</td></tr>
                <tr><td>WHY 2</td><td>{detailClaim.why2 || '—'}</td></tr>
                <tr><td>WHY 3</td><td>{detailClaim.why3 || '—'}</td></tr>
                <tr><td>WHY 4</td><td>{detailClaim.why4 || '—'}</td></tr>
                <tr><td>WHY 5</td><td>{detailClaim.why5 || '—'}</td></tr>
                <tr><td>시정조치</td><td>{detailClaim.corrective_action || '—'}</td></tr>
                <tr><td>재발방지</td><td>{detailClaim.preventive_action || '—'}</td></tr>
              </tbody>
            </table>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDetailClaim(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
