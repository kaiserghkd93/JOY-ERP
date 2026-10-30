import { useEffect, useState, useCallback, useRef, Fragment } from 'react'
import * as XLSX from 'xlsx'
import api from '../api'
import { isMaster, getRole } from '../auth'

const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') }

const STATUS_BADGE = {
  '발주중': 'badge-blue', '일부입고': 'badge-amber',
  '입고완료': 'badge-green', '취소': 'badge-gray',
  '발행': 'badge-blue', '완료': 'badge-green', '작성중': 'badge-amber',
}

/* 품번 검색 드롭다운 */
function PartSelect({ value, items, onChange }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = items.find(it => it.part_no === value)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = items.filter(it =>
    it.part_no.toLowerCase().includes(search.toLowerCase()) ||
    it.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 100)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(o => !o)} style={{
        padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4,
        cursor: 'pointer', fontSize: 12, background: '#fff', minHeight: 28,
        display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
      }}>
        {selected ? <span style={{ color: '#1d4ed8', fontFamily: 'monospace' }}>{selected.part_no}</span>
          : <span style={{ color: '#aaa' }}>품번 선택...</span>}
        {selected && <span style={{ marginLeft: 6, color: '#555', fontSize: 11 }}>{selected.name}</span>}
      </div>
      {open && (
        <div style={{
          position: 'fixed', zIndex: 9999, background: '#fff',
          border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,.15)',
          width: 340,
        }}>
          <div style={{ padding: 6 }}>
            <input autoFocus type="text" placeholder="품번·품명 검색..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
              onClick={e => e.stopPropagation()} />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0 && <div style={{ padding: '8px 12px', color: '#888', fontSize: 12 }}>검색 결과 없음</div>}
            {filtered.map(it => (
              <div key={it.part_no}
                onClick={() => { onChange(it.part_no); setOpen(false); setSearch('') }}
                style={{ padding: '5px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <span style={{ fontFamily: 'monospace', color: '#1d4ed8', marginRight: 8 }}>{it.part_no}</span>
                <span style={{ color: '#555' }}>{it.name}</span>
                {it.std_buy_price > 0 && <span style={{ float: 'right', color: '#64748b' }}>₩{Number(it.std_buy_price).toLocaleString()}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 멀티품목 발주서 작성 모달 ── */
function GroupModal({ onClose, onSaved }) {
  const [partners, setPartners] = useState([])
  const [allItems, setAllItems] = useState([])
  const [items, setItems] = useState([])
  const [header, setHeader] = useState({ partner_id: '', order_date: today(), due_date: '', note: '' })
  const [lines, setLines] = useState([{ part_no: '', qty: '', unit_price: '', due_date: '', note: '' }])
  const [carryovers, setCarryovers] = useState([])   // 이월 목록
  const [appliedCo, setAppliedCo] = useState({})     // { carryover_id: apply_qty }

  useEffect(() => {
    api.get('/master/partners').then(r => setPartners(r.data.filter(p => p.partner_type === '외주처')))
    api.get('/master/items').then(r => {
      const filtered = r.data.filter(i => i.item_type === 'outsourced' || i.item_type === 'raw' || i.item_type === 'sub' || i.item_type === 'finished' || i.item_type === 'semi')
      setAllItems(filtered)
      setItems(filtered)
    })
  }, [])

  // 외주처 선택 시 이월 목록 조회
  useEffect(() => {
    if (header.partner_id) {
      api.get(`/purchase/carryover?partner_id=${header.partner_id}`)
        .then(r => setCarryovers(r.data))
        .catch(() => setCarryovers([]))
    } else {
      setCarryovers([])
    }
    setAppliedCo({})
  }, [header.partner_id])

  useEffect(() => { setItems(allItems) }, [allItems])

  const setH = (k, v) => setHeader(h => ({ ...h, [k]: v }))
  const setLine = (idx, k, v) => setLines(ls => ls.map((l, i) => i === idx ? { ...l, [k]: v } : l))

  const onPartNoChange = (idx, part_no) => {
    const item = items.find(i => i.part_no === part_no) || allItems.find(i => i.part_no === part_no)
    setLines(ls => ls.map((l, i) => i === idx ? {
      ...l, part_no,
      unit_price: item?.std_buy_price ? String(item.std_buy_price) : l.unit_price,
    } : l))
  }
  const addLine = () => setLines(ls => [...ls, { part_no: '', qty: '', unit_price: '', note: '' }])
  const removeLine = (idx) => setLines(ls => ls.filter((_, i) => i !== idx))

  const total = lines.reduce((s, l) => s + (l.qty && l.unit_price ? +l.qty * +l.unit_price : 0), 0)

  // 이월 적용 — 라인의 품번과 매칭되는 이월을 찾아 qty에서 차감
  const applyCarryoverToLine = (idx, co) => {
    const line = lines[idx]
    const currentQty = +line.qty || 0
    const applyQty = Math.min(co.remaining_qty, currentQty)
    if (applyQty <= 0) { alert('발주수량을 먼저 입력하세요'); return }
    if (window.confirm(`이월 ${co.remaining_qty.toLocaleString()}개 중 ${applyQty.toLocaleString()}개를 적용합니다.\n발주수량: ${currentQty.toLocaleString()} → ${(currentQty - applyQty).toLocaleString()}개`)) {
      setLines(ls => ls.map((l, i) => i === idx ? { ...l, qty: String(currentQty - applyQty) } : l))
      setAppliedCo(prev => ({ ...prev, [co.id]: (prev[co.id] || 0) + applyQty }))
    }
  }

  const submit = async () => {
    const validLines = lines.filter(l => l.part_no && l.qty)
    if (!header.partner_id || !header.order_date || !header.due_date || validLines.length === 0) {
      alert('외주처, 발주일, Due Date, 품목을 입력하세요')
      return
    }
    try {
      await api.post('/purchase/groups', {
        ...header,
        lines: validLines.map(l => ({
          part_no: l.part_no, qty: +l.qty,
          unit_price: l.unit_price ? +l.unit_price : null,
          due_date: l.due_date || header.due_date || null,
          note: l.note || null,
        })),
      })
      // 이월 적용량 서버에 반영
      for (const [coId, applyQty] of Object.entries(appliedCo)) {
        if (applyQty > 0) {
          await api.patch(`/purchase/carryover/${coId}/apply`, { apply_qty: applyQty }).catch(() => {})
        }
      }
      onSaved()
    } catch (e) {
      alert(e.response?.data?.detail || '저장 실패')
    }
  }

  const partnerName = partners.find(p => p.partner_id === header.partner_id)?.name

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 900, maxWidth: '98vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: 16 }}>발주서 작성</h3>

        {/* 헤더 */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>외주처 *</label>
            <select value={header.partner_id} onChange={e => setH('partner_id', e.target.value)}>
              <option value="">선택</option>
              {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>발주일 *</label>
            <input type="date" value={header.order_date} onChange={e => setH('order_date', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Due Date *</label>
            <input type="date" value={header.due_date} onChange={e => setH('due_date', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>비고</label>
          <input value={header.note} onChange={e => setH('note', e.target.value)} placeholder="특이사항 입력" />
        </div>

        {/* 이월 알림 배너 */}
        {carryovers.length > 0 && (
          <div style={{
            background: '#fff7ed', border: '1px solid #fb923c', borderRadius: 6,
            padding: '8px 14px', marginBottom: 10, fontSize: 12,
          }}>
            <span style={{ fontWeight: 700, color: '#c2410c' }}>⚠ 이월 잔량 있음</span>
            <span style={{ color: '#92400e', marginLeft: 8 }}>
              이 외주처의 품목을 라인에 추가하면 "이월 적용" 버튼이 나타납니다.
            </span>
            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {carryovers.map(co => (
                <span key={co.id} style={{
                  background: '#fed7aa', borderRadius: 4, padding: '2px 8px',
                  color: '#92400e', fontWeight: 600,
                }}>
                  {co.part_no} — 이월 {co.remaining_qty.toLocaleString()}개 ({co.source_ym})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 품목 라인 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              품목 목록
              {header.partner_id && items.length < allItems.length &&
                <span style={{ fontSize: 11, color: '#1d4ed8', marginLeft: 8, fontWeight: 400 }}>
                  {partnerName} 납품 이력 {items.length}개 품목
                </span>}
            </span>
            <button className="btn btn-sm btn-outline" onClick={addLine}>+ 품목 추가</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '7px 8px', textAlign: 'left', borderBottom: '2px solid var(--border)', width: '38%' }}>품번 / 품명</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 90 }}>수량</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 80 }}>이월차감</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 110 }}>단가</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 110, textAlign: 'right' }}>금액</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 130 }}>개별납기</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)' }}>비고</th>
                  <th style={{ width: 36, borderBottom: '2px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const matchedCo = carryovers.filter(co => co.part_no === l.part_no && co.remaining_qty > 0)
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: matchedCo.length > 0 ? '#fffbeb' : '' }}>
                      <td style={{ padding: '5px 4px' }}>
                        <PartSelect value={l.part_no} items={items} onChange={v => onPartNoChange(idx, v)} />
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input type="number" value={l.qty} onChange={e => setLine(idx, 'qty', e.target.value)}
                          style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                        {matchedCo.map(co => (
                          <button key={co.id}
                            className="btn btn-sm"
                            style={{ fontSize: 10, padding: '2px 6px', background: '#fff7ed', border: '1px solid #fb923c', color: '#c2410c', borderRadius: 4, whiteSpace: 'nowrap' }}
                            onClick={() => applyCarryoverToLine(idx, co)}
                            title={`이월 ${co.remaining_qty}개 차감 적용`}>
                            -{co.remaining_qty.toLocaleString()}↙
                          </button>
                        ))}
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input type="number" value={l.unit_price} onChange={e => setLine(idx, 'unit_price', e.target.value)}
                          placeholder="표준가"
                          style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: '#1d4ed8' }}>
                        {l.qty && l.unit_price ? `₩${(+l.qty * +l.unit_price).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input type="date" value={l.due_date} onChange={e => setLine(idx, 'due_date', e.target.value)}
                          style={{ width: '100%', padding: '5px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input value={l.note} onChange={e => setLine(idx, 'note', e.target.value)}
                          style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                        {lines.length > 1 && (
                          <button onClick={() => removeLine(idx)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 합계 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '2px solid var(--border)', marginTop: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-sm)' }}>총 {lines.filter(l => l.qty && l.part_no).length}종</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1d4ed8' }}>합계 ₩{total.toLocaleString()}</span>
        </div>

        <div className="modal-footer" style={{ paddingTop: 0 }}>
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>발주서 발행</button>
        </div>
      </div>
    </div>
  )
}

/* ── 단건 발주 모달 (기존) ── */
function SinglePOModal({ onClose, onSaved }) {
  const [partners, setPartners] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ partner_id: '', part_no: '', qty: '', order_date: '', due_date: '' })

  useEffect(() => {
    api.get('/master/partners').then(r => setPartners(r.data.filter(p => p.partner_type === '외주처')))
    api.get('/master/items').then(r => setItems(r.data.filter(i => i.item_type === '외주품' || i.item_type === '원자재')))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = async () => {
    try {
      await api.post('/purchase/orders', { ...form, qty: +form.qty })
      onSaved()
    } catch (e) {
      alert(e.response?.data?.detail || '저장 실패')
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>단건 발주 등록</h3>
        <div className="form-group">
          <label>외주처</label>
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
        <div className="grid-2">
          <div className="form-group"><label>발주수량</label><input type="number" value={form.qty} onChange={e => set('qty', e.target.value)} /></div>
          <div className="form-group"><label>발주일</label><input type="date" value={form.order_date} onChange={e => set('order_date', e.target.value)} /></div>
        </div>
        <div className="form-group"><label>Due Date</label><input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} /></div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  )
}

const RETURN_REASONS = ['불량', '발주수량초과', '규격불일치', '납기초과', '기타']
const CARRYOVER_REASONS = ['27일 이후 입고', '발주수량 초과', '재검토 필요', '납기 연장', '기타']

function CarryoverModal({ title, max_qty, default_qty, part_name, label, default_to_month, onClose, onSaved }) {
  const [qty, setQty] = useState(String(default_qty ?? max_qty ?? ''))
  const [reason, setReason] = useState(CARRYOVER_REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [toMonth, setToMonth] = useState(() => {
    if (default_to_month) return default_to_month
    // 기본값: 다음 달
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const q = parseInt(qty)
    if (!q || q < 1 || q > max_qty) { alert(`이월수량은 1~${max_qty.toLocaleString()} 사이여야 합니다`); return }
    const finalReason = reason === '기타' ? customReason : reason
    if (!finalReason) { alert('사유를 입력하세요'); return }
    if (!toMonth) { alert('이월 대상 월을 선택하세요'); return }
    setSaving(true)
    try {
      await onSaved(q, finalReason, toMonth)
    } catch (e) {
      alert(e.response?.data?.detail || e.message || '이월 처리 실패')
      setSaving(false)
    }
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div style={{ background:'var(--card)',borderRadius:12,padding:28,minWidth:360,boxShadow:'0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ fontWeight:700,fontSize:16,marginBottom:16,color:'#c2410c' }}>↗ {title || '이월 처리'}</div>
        <div style={{ fontSize:13,color:'#555',marginBottom:12 }}>{part_name}</div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:12,fontWeight:600,display:'block',marginBottom:4 }}>이월수량 (최대 {max_qty.toLocaleString()}개)</label>
          <input type="number" value={qty} onChange={e=>setQty(e.target.value)} min={1} max={max_qty}
            style={{ width:'100%',padding:'6px 10px',border:'1px solid #fb923c',borderRadius:6,fontSize:13 }} />
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:12,fontWeight:600,display:'block',marginBottom:4 }}>이월 대상 월 <span style={{color:'#c2410c'}}>*</span></label>
          <input type="month" value={toMonth} onChange={e=>setToMonth(e.target.value)}
            style={{ width:'100%',padding:'6px 10px',border:'2px solid #fb923c',borderRadius:6,fontSize:13,fontWeight:700 }} />
          <div style={{ fontSize:11,color:'#888',marginTop:3 }}>이 금액이 해당 월 매입액에 자동 반영됩니다</div>
        </div>
        <div style={{ marginBottom:reason==='기타'?8:16 }}>
          <label style={{ fontSize:12,fontWeight:600,display:'block',marginBottom:4 }}>이월사유</label>
          <select value={reason} onChange={e=>setReason(e.target.value)}
            style={{ width:'100%',padding:'6px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:13 }}>
            {CARRYOVER_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {reason==='기타' && (
          <div style={{ marginBottom:16 }}>
            <input value={customReason} onChange={e=>setCustomReason(e.target.value)} placeholder="사유 직접 입력"
              style={{ width:'100%',padding:'6px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:13 }} />
          </div>
        )}
        <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-sm" style={{ background:'#c2410c',color:'#fff',border:'none' }} onClick={submit} disabled={saving}>
            {saving ? '처리중…' : label || `이월 확정 → ${toMonth}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReturnModal({ gr_no, max_qty, part_name, onClose, onSaved }) {
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState(RETURN_REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const q = parseInt(qty)
    if (!q || q < 1 || q > max_qty) { alert(`반품수량은 1~${max_qty} 사이여야 합니다`); return }
    const finalReason = reason === '기타' ? customReason : reason
    if (!finalReason) { alert('사유를 입력하세요'); return }
    setSaving(true)
    try {
      await api.patch(`/purchase/receipts/${gr_no}/return`, { return_qty: q, reason: finalReason })
      onSaved()
    } catch (e) {
      alert(e.response?.data?.detail || '반품 처리 실패')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div style={{ background:'var(--card)',borderRadius:12,padding:28,minWidth:340,boxShadow:'0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ fontWeight:700,fontSize:16,marginBottom:16,color:'#dc2626' }}>↩ 반품 처리</div>
        <div style={{ fontSize:13,color:'#555',marginBottom:12 }}>{part_name} ({gr_no})</div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:12,fontWeight:600,display:'block',marginBottom:4 }}>반품수량 (최대 {max_qty.toLocaleString()}개)</label>
          <input type="number" value={qty} onChange={e=>setQty(e.target.value)} min={1} max={max_qty}
            style={{ width:'100%',padding:'6px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:13 }} />
        </div>
        <div style={{ marginBottom:reason==='기타'?8:16 }}>
          <label style={{ fontSize:12,fontWeight:600,display:'block',marginBottom:4 }}>반품사유</label>
          <select value={reason} onChange={e=>setReason(e.target.value)}
            style={{ width:'100%',padding:'6px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:13 }}>
            {RETURN_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {reason==='기타' && (
          <div style={{ marginBottom:16 }}>
            <input value={customReason} onChange={e=>setCustomReason(e.target.value)} placeholder="사유 직접 입력"
              style={{ width:'100%',padding:'6px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:13 }} />
          </div>
        )}
        <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-sm" style={{ background:'#dc2626',color:'#fff',border:'none' }} onClick={submit} disabled={saving}>
            {saving ? '처리중…' : '반품 확정'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 자재구매 탭 ─────────────────────────────────────────────── */
/* ── 자재 발주 생성 모달 ── */
function MatOrderModal({ partners, allItems, onClose, onSaved }) {
  const [header, setHeader] = useState({ partner_id: '', order_date: today(), note: '' })
  const [lines, setLines] = useState([{ part_no: '', qty: '', unit_price: '', due_date: '' }])
  const [saving, setSaving] = useState(false)

  const addLine = () => setLines(l => [...l, { part_no: '', qty: '', unit_price: '', due_date: '' }])
  const delLine = i => setLines(l => l.filter((_,j)=>j!==i))
  const setLine = (i, k, v) => setLines(l => l.map((ln,j) => j===i ? {...ln,[k]:v} : ln))

  const save = async () => {
    if (!header.partner_id) return alert('거래처를 선택하세요')
    if (lines.some(l => !l.part_no || !l.qty)) return alert('품번과 수량을 입력하세요')
    setSaving(true)
    try {
      await api.post('/material/orders', {
        partner_id: header.partner_id,
        order_date: header.order_date,
        note: header.note,
        lines: lines.map(l => ({
          part_no: l.part_no,
          qty: parseInt(l.qty),
          unit_price: parseFloat(l.unit_price || 0),
          due_date: l.due_date || header.order_date,
        })),
      })
      onSaved()
      onClose()
    } catch(e) {
      alert(e.response?.data?.detail || '발주 생성 실패')
    } finally { setSaving(false) }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'#fff',borderRadius:12,width:700,maxHeight:'85vh',overflowY:'auto',padding:24}} onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:16,color:'#1e3a5f'}}>자재 발주 등록</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
          <div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:4}}>거래처 *</div>
            <select value={header.partner_id} onChange={e=>setHeader(h=>({...h,partner_id:e.target.value}))}
              style={{width:'100%',padding:'6px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}>
              <option value="">선택...</option>
              {partners.map(p=><option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:4}}>발주일 *</div>
            <input type="date" value={header.order_date} onChange={e=>setHeader(h=>({...h,order_date:e.target.value}))}
              style={{width:'100%',padding:'6px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}/>
          </div>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:12}}>
          <thead>
            <tr style={{background:'#f8fafc'}}>
              <th style={{padding:'6px 8px',textAlign:'left',border:'1px solid #e2e8f0'}}>품번</th>
              <th style={{padding:'6px 8px',textAlign:'right',border:'1px solid #e2e8f0'}}>수량</th>
              <th style={{padding:'6px 8px',textAlign:'right',border:'1px solid #e2e8f0'}}>단가</th>
              <th style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}>납기</th>
              <th style={{padding:'6px 8px',border:'1px solid #e2e8f0',width:32}}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln,i)=>(
              <tr key={i}>
                <td style={{padding:'4px 6px',border:'1px solid #e2e8f0'}}>
                  <PartSelect value={ln.part_no} items={allItems} onChange={v=>{
                    const it = allItems.find(x=>x.part_no===v)
                    setLine(i,'part_no',v)
                    if(it?.std_buy_price) setLine(i,'unit_price',it.std_buy_price)
                  }}/>
                </td>
                <td style={{padding:'4px 6px',border:'1px solid #e2e8f0'}}>
                  <input type="number" value={ln.qty} onChange={e=>setLine(i,'qty',e.target.value)}
                    style={{width:'100%',textAlign:'right',border:'none',fontSize:12,background:'transparent'}}/>
                </td>
                <td style={{padding:'4px 6px',border:'1px solid #e2e8f0'}}>
                  <input type="number" value={ln.unit_price} onChange={e=>setLine(i,'unit_price',e.target.value)}
                    style={{width:'100%',textAlign:'right',border:'none',fontSize:12,background:'transparent'}}/>
                </td>
                <td style={{padding:'4px 6px',border:'1px solid #e2e8f0'}}>
                  <input type="date" value={ln.due_date} onChange={e=>setLine(i,'due_date',e.target.value)}
                    style={{border:'none',fontSize:12,background:'transparent',width:'100%'}}/>
                </td>
                <td style={{padding:'4px 6px',border:'1px solid #e2e8f0',textAlign:'center'}}>
                  <button onClick={()=>delLine(i)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14}}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{display:'flex',gap:8,justifyContent:'space-between',alignItems:'center'}}>
          <button className="btn btn-sm" style={{background:'#f1f5f9',color:'#475569',border:'1px solid #e2e8f0'}} onClick={addLine}>＋ 품목 추가</button>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-sm" onClick={onClose}>취소</button>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>{saving?'저장 중...':'발주 등록'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 자재 입고 등록 모달 ── */
function MatReceiveModal({ orders, onClose, onSaved }) {
  const [form, setForm] = useState({ po_no: '', part_no: '', qty: '', unit_price: '', receipt_date: today(), note: '' })
  const [saving, setSaving] = useState(false)
  const selPO = orders.find(o => o.po_no === form.po_no)

  const save = async () => {
    if (!form.po_no || !form.part_no || !form.qty) return alert('발주번호, 품번, 수량을 입력하세요')
    setSaving(true)
    try {
      await api.post('/material/receive', {
        po_no: form.po_no,
        part_no: form.part_no,
        qty: parseInt(form.qty),
        unit_price: parseFloat(form.unit_price || 0),
        receipt_date: form.receipt_date,
        note: form.note,
      })
      onSaved(); onClose()
    } catch(e) { alert(e.response?.data?.detail || '입고 실패') }
    finally { setSaving(false) }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'#fff',borderRadius:12,width:480,padding:24}} onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:16,color:'#1e3a5f'}}>자재 입고 등록</div>
        <div style={{display:'grid',gap:10,marginBottom:16}}>
          <div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:4}}>발주번호 *</div>
            <select value={form.po_no} onChange={e=>{
              const po = orders.find(o=>o.po_no===e.target.value)
              setForm(f=>({...f, po_no:e.target.value, part_no: po?.part_no||'', unit_price: po?.unit_price||''}))
            }} style={{width:'100%',padding:'6px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}>
              <option value="">선택...</option>
              {orders.filter(o=>o.remaining_qty>0).map(o=>(
                <option key={o.po_no} value={o.po_no}>{o.po_no} — {o.item_name} (잔여 {o.remaining_qty.toLocaleString()})</option>
              ))}
            </select>
          </div>
          {selPO && <div style={{fontSize:12,color:'#64748b',background:'#f8fafc',padding:'6px 10px',borderRadius:4}}>
            거래처: {selPO.partner_name} | 품번: {selPO.part_no} | 단가: ₩{Number(selPO.unit_price).toLocaleString()}
          </div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div>
              <div style={{fontSize:11,color:'#64748b',marginBottom:4}}>입고수량 *</div>
              <input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}
                style={{width:'100%',padding:'6px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'#64748b',marginBottom:4}}>입고단가</div>
              <input type="number" value={form.unit_price} onChange={e=>setForm(f=>({...f,unit_price:e.target.value}))}
                style={{width:'100%',padding:'6px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}/>
            </div>
          </div>
          <div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:4}}>입고일 *</div>
            <input type="date" value={form.receipt_date} onChange={e=>setForm(f=>({...f,receipt_date:e.target.value}))}
              style={{width:'100%',padding:'6px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}/>
          </div>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>{saving?'처리 중...':'입고 확정'}</button>
        </div>
      </div>
    </div>
  )
}

function MaterialPurchase() {
  const now = new Date()
  const [matTab, setMatTab] = useState('orders')
  const [matMonth, setMatMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [matPartners, setMatPartners] = useState([])
  const [allItems, setAllItems] = useState([])
  const [matPartner, setMatPartner] = useState('')
  const [orders, setOrders] = useState([])
  const [receipts, setReceipts] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)

  useEffect(() => {
    api.get('/master/partners').then(r => setMatPartners(r.data.filter(p => p.partner_type !== '고객'))).catch(()=>{})
    api.get('/master/items').then(r => setAllItems(r.data.filter(i => i.active !== false))).catch(()=>{})
  }, [])

  const loadOrders = useCallback(() => {
    setLoading(true)
    let url = '/material/orders?'
    if (matPartner) url += `partner_id=${matPartner}&`
    api.get(url).then(r => setOrders(r.data)).catch(()=>{}).finally(()=>setLoading(false))
  }, [matPartner])

  const loadReceipts = useCallback(() => {
    setLoading(true)
    let url = '/material/receipts?'
    if (matPartner) url += `partner_id=${matPartner}&`
    api.get(url).then(r => setReceipts(r.data)).catch(()=>{}).finally(()=>setLoading(false))
  }, [matPartner])

  const loadSummary = useCallback(() => {
    const [y, m] = matMonth.split('-')
    api.get(`/material/summary?year=${y}&month=${m}`)
      .then(r => setSummary(r.data)).catch(()=>setSummary(null))
  }, [matMonth])

  useEffect(() => {
    if (matTab === 'orders') loadOrders()
    else if (matTab === 'receipt') loadReceipts()
    else if (matTab === 'closing') loadSummary()
  }, [matTab, loadOrders, loadReceipts, loadSummary])

  // 월 필터링 (클라이언트)
  const monthOrders = orders.filter(o => o.order_date?.startsWith(matMonth))
  const monthReceipts = receipts.filter(r => r.receipt_date?.startsWith(matMonth))

  const MAT_TABS = [
    ['orders',  '자재 발주 목록'],
    ['receipt', '자재 입고 현황'],
    ['closing', '자재 매입 집계'],
  ]

  const fmt = n => Number(n||0).toLocaleString()

  return (
    <div>
      {showOrderModal && (
        <MatOrderModal partners={matPartners} allItems={allItems}
          onClose={()=>setShowOrderModal(false)} onSaved={loadOrders}/>
      )}
      {showReceiveModal && (
        <MatReceiveModal orders={orders.filter(o=>o.remaining_qty>0)}
          onClose={()=>setShowReceiveModal(false)} onSaved={loadReceipts}/>
      )}

      {/* 서브탭 + 액션 */}
      <div className="erp-panel" style={{marginBottom:8}}>
        <div className="erp-actions">
          <div className="qdate-bar">
            {MAT_TABS.map(([v,l])=>(
              <button key={v} className={`qdate-btn${matTab===v?' active':''}`} onClick={()=>setMatTab(v)}>{l}</button>
            ))}
          </div>
          <div className="spacer"/>
          {matTab === 'orders' && (
            <button className="btn btn-sm btn-primary" onClick={()=>setShowOrderModal(true)}>＋ 자재 발주</button>
          )}
          {matTab === 'receipt' && (
            <button className="btn btn-sm btn-primary" onClick={()=>{loadOrders();setShowReceiveModal(true)}}>＋ 입고 등록</button>
          )}
        </div>
      </div>

      {/* 공통 필터 */}
      {(matTab === 'orders' || matTab === 'receipt') && (
        <div className="erp-panel" style={{marginBottom:8}}>
          <div className="erp-grid-2" style={{gridTemplateColumns:'auto 1fr auto 1fr'}}>
            <div className="erp-label">조회 월</div>
            <div className="erp-value">
              <input type="month" value={matMonth} onChange={e=>setMatMonth(e.target.value)}
                style={{border:'none',background:'transparent',fontSize:13,padding:'0 4px'}}/>
            </div>
            <div className="erp-label">거래처</div>
            <div className="erp-value">
              <select value={matPartner} onChange={e=>setMatPartner(e.target.value)}
                style={{border:'none',background:'transparent',fontSize:13,padding:'0 4px'}}>
                <option value="">전체</option>
                {matPartners.map(p=><option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 자재 발주 목록 */}
      {matTab === 'orders' && (
        <>
          <div className="result-bar">
            <span className="result-bar-title">자재 발주 목록</span>
            <span className="result-bar-count">{monthOrders.length}건</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>발주번호</th><th>거래처</th><th>품번</th><th>품명</th>
                  <th style={{textAlign:'right'}}>발주수량</th><th style={{textAlign:'right'}}>입고</th>
                  <th style={{textAlign:'right'}}>단가</th><th style={{textAlign:'right'}}>금액</th>
                  <th>발주일</th><th>납기</th><th>상태</th><th>발주서</th><th>취소</th></tr>
              </thead>
              <tbody>
                {monthOrders.length === 0 && <tr><td colSpan={13} className="empty">{loading?'조회 중...':'자재 발주 없음'}</td></tr>}
                {monthOrders.map(o=>(
                  <tr key={o.po_no}>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{o.po_no}</td>
                    <td>{o.partner_name}</td>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{o.part_no}</td>
                    <td>{o.item_name}</td>
                    <td style={{textAlign:'right'}}>{fmt(o.qty)} {o.item_unit}</td>
                    <td style={{textAlign:'right',color: o.confirmed_qty>0?'#16a34a':'#94a3b8'}}>{fmt(o.confirmed_qty)}</td>
                    <td style={{textAlign:'right'}}>₩{fmt(o.unit_price)}</td>
                    <td style={{textAlign:'right'}}>₩{fmt(o.qty * o.unit_price)}</td>
                    <td style={{fontSize:11}}>{o.order_date}</td>
                    <td style={{fontSize:11}}>{o.due_date}</td>
                    <td><span className={`badge ${o.status==='open'?'badge-blue':o.status==='partial'?'badge-amber':o.status==='closed'?'badge-green':'badge-gray'}`}>
                      {o.status==='open'?'발주중':o.status==='partial'?'일부입고':o.status==='closed'?'완료':'취소'}
                    </span></td>
                    <td>
                      <button className="btn btn-sm btn-primary"
                        onClick={()=>window.open(`${api.defaults.baseURL}/material/orders/${o.po_no}/print`,'_blank')}>
                        발주서 출력
                      </button>
                    </td>
                    <td>
                      {o.confirmed_qty === 0 && o.status !== 'closed' && o.status !== 'cancelled' && (
                        <button className="btn btn-sm" style={{background:'#fee2e2',color:'#b91c1c',border:'1px solid #fca5a5'}}
                          onClick={async()=>{
                            if(!window.confirm(`자재 발주 ${o.po_no}를 삭제하시겠습니까?`)) return
                            try {
                              await api.delete(`/material/orders/${o.po_no}`)
                              loadOrders()
                            } catch(e) {
                              alert(e.response?.data?.detail || '삭제 실패')
                            }
                          }}>삭제</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 자재 입고 현황 */}
      {matTab === 'receipt' && (
        <>
          <div className="result-bar">
            <span className="result-bar-title">자재 입고 현황</span>
            <span style={{fontSize:11,color:'#64748b',marginLeft:8}}>※ 외주 입고와 별도 관리</span>
            <span className="result-bar-count">{monthReceipts.length}건</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>입고번호</th><th>발주번호</th><th>거래처</th><th>품번</th><th>품명</th>
                  <th style={{textAlign:'right'}}>수량</th><th style={{textAlign:'right'}}>단가</th>
                  <th style={{textAlign:'right'}}>금액</th><th>입고일</th><th>상태</th></tr>
              </thead>
              <tbody>
                {monthReceipts.length === 0 && <tr><td colSpan={10} className="empty">{loading?'조회 중...':'자재 입고 없음'}</td></tr>}
                {monthReceipts.map(r=>(
                  <tr key={r.gr_no}>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{r.gr_no}</td>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{r.po_no}</td>
                    <td>{r.partner_id}</td>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{r.part_no}</td>
                    <td>{r.item_name}</td>
                    <td style={{textAlign:'right'}}>{fmt(r.qty)}</td>
                    <td style={{textAlign:'right'}}>₩{fmt(r.unit_price)}</td>
                    <td style={{textAlign:'right'}}>₩{fmt(r.amount)}</td>
                    <td style={{fontSize:11}}>{r.receipt_date}</td>
                    <td><span className="badge badge-green">확정</span></td>
                  </tr>
                ))}
                {monthReceipts.length > 0 && (
                  <tr style={{fontWeight:700,background:'#f8fafc'}}>
                    <td colSpan={5} style={{textAlign:'right',color:'#475569'}}>합계</td>
                    <td style={{textAlign:'right'}}>{fmt(monthReceipts.reduce((a,r)=>a+r.qty,0))}</td>
                    <td></td>
                    <td style={{textAlign:'right'}}>₩{fmt(monthReceipts.reduce((a,r)=>a+r.amount,0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 자재 매입 집계 */}
      {matTab === 'closing' && (
        <>
          <div className="erp-panel" style={{marginBottom:8}}>
            <div className="erp-grid-2" style={{gridTemplateColumns:'auto 1fr'}}>
              <div className="erp-label">조회 월</div>
              <div className="erp-value">
                <input type="month" value={matMonth} onChange={e=>setMatMonth(e.target.value)}
                  style={{border:'none',background:'transparent',fontSize:13,padding:'0 4px'}}/>
              </div>
            </div>
            <div className="erp-actions">
              <span style={{fontSize:12,color:'#64748b'}}>※ 외주 매입 집계와 별도 — 자재 구매 입고 기준</span>
              <div className="spacer"/>
              <button className="btn btn-primary btn-sm" onClick={loadSummary}>조회</button>
            </div>
          </div>
          {summary && (
            <>
              <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
                {[
                  {label:'자재 입고건수', val:`${summary.total_receipts}건`, color:'#1d4ed8',bg:'#eff6ff',border:'#bfdbfe'},
                  {label:'자재 입고금액', val:`₩${fmt(summary.total_amount)}`, color:'#fff',bg:'#1e3a5f',border:'#1e40af'},
                ].map(({label,val,color,bg,border})=>(
                  <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:8,padding:'10px 18px',minWidth:160}}>
                    <div style={{fontSize:11,color:color==='#fff'?'#93c5fd':color,fontWeight:600,marginBottom:4}}>{label}</div>
                    <div style={{fontSize:16,fontWeight:800,color}}>{val}</div>
                  </div>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>거래처</th><th style={{textAlign:'right'}}>입고건수</th><th style={{textAlign:'right'}}>매입금액</th></tr>
                  </thead>
                  <tbody>
                    {summary.by_partner.length === 0 && <tr><td colSpan={3} className="empty">집계 데이터 없음</td></tr>}
                    {summary.by_partner.map(p=>(
                      <tr key={p.partner_id}>
                        <td>{p.partner_name}</td>
                        <td style={{textAlign:'right'}}>{p.count}건</td>
                        <td style={{textAlign:'right'}}>₩{fmt(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default function Purchase() {
  const [mainTab, setMainTab] = useState('outsource')
  const [groups, setGroups] = useState([])
  const [orders, setOrders] = useState([])
  const [remaining, setRemaining] = useState([])
  const now = new Date()
  const [orderMonth, setOrderMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [showOnlyRemaining, setShowOnlyRemaining] = useState(true)
  const [remainingPartner, setRemainingPartner] = useState('')
  const [deliveryRates, setDeliveryRates] = useState([])
  const [tab, setTab] = useState('groups')
  const [closing, setClosing] = useState({ po_based: [], outsource: [] })
  const [closingYM, setClosingYM] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [expandedPartner, setExpandedPartner] = useState(null)
  const [showGroup, setShowGroup] = useState(false)
  const [showSingle, setShowSingle] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState(null)
  const [returnModal, setReturnModal] = useState(null) // { gr_no, max_qty, part_name }
  const [carryoverModal, setCarryoverModal] = useState(null) // { mode:'receipt'|'over', gr_no?, ln?, partner_id?, max_qty, part_name }
  const xlsxRef = useRef()

  const load = useCallback(() => {
    api.get('/purchase/groups').then(r => setGroups(r.data)).catch(() => {})
    api.get('/purchase/orders').then(r => setOrders(r.data.filter(o => o.status !== 'closed' && o.status !== 'cancelled'))).catch(() => {})
    api.get('/purchase/orders/remaining').then(r => setRemaining(r.data)).catch(() => {})
    api.get('/purchase/partners/delivery-rate').then(r => setDeliveryRates(r.data)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const openPrint = (group_no) => {
    window.open(`${api.defaults.baseURL}/purchase/groups/${group_no}/print`, '_blank')
  }

  const downloadPdf = (group_no) => {
    const a = document.createElement('a')
    a.href = `${api.defaults.baseURL}/purchase/groups/${group_no}/pdf`
    a.download = `발주서_${group_no}.pdf`
    a.click()
  }

  const downloadTemplate = () => {
    const data = [
      ['partner_id', 'order_date', 'due_date', 'note', 'part_no', 'qty', 'unit_price', 'line_note'],
      ['마이더스시스템', '2026-06-23', '2026-07-15', '정기발주', 'GC3-MO-0052', 100, 3300, ''],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '발주양식')
    XLSX.writeFile(wb, '발주_양식.xlsx')
  }

  const uploadExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])

    if (!rows.length) { alert('데이터가 없습니다'); return }

    // partner_id별로 그룹핑
    const grouped = {}
    for (const r of rows) {
      const key = `${r.partner_id}||${r.order_date}||${r.due_date}`
      if (!grouped[key]) grouped[key] = { partner_id: String(r.partner_id), order_date: String(r.order_date), due_date: String(r.due_date), note: r.note || '', lines: [] }
      grouped[key].lines.push({
        part_no: String(r.part_no),
        qty: Number(r.qty),
        unit_price: r.unit_price ? Number(r.unit_price) : null,
        note: r.line_note || null,
      })
    }

    let ok = 0, fail = 0
    for (const g of Object.values(grouped)) {
      try {
        await api.post('/purchase/groups', g)
        ok++
      } catch { fail++ }
    }
    alert(`발주서 ${ok}건 등록 완료${fail ? `, ${fail}건 실패` : ''}`)
    load()
  }

  const exportClosingExcel = async () => {
    if (closing.po_based.length === 0 && closing.outsource.length === 0) {
      alert('먼저 조회하세요')
      return
    }
    const [y, m] = closingYM.split('-')
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:8001'}/purchase/closing/excel?year=${y}&month=${+m}`)
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `외주월마감_${y}${m}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Excel 생성 실패: ' + e.message)
    }
  }

  // 다음 달 YYYY-MM 계산
  const nextMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const registerCarryover = (partner_id, ln, ym) => {
    setCarryoverModal({
      mode: 'over',
      partner_id, ln, ym,
      max_qty: ln.over_qty,
      default_qty: ln.over_qty,
      part_name: `${ln.part_no} ${ln.part_name||''} (초과분)`,
      title: '초과수량 이월',
      default_to_month: nextMonth(closingYM),
    })
  }

  const printReturnSlip = async (gr_no, ln) => {
    try {
      const r = await api.get(`/purchase/receipts/${gr_no}/return-slip`)
      const d = r.data
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>반품명세서</title>
<style>
  body{font-family:'맑은 고딕',sans-serif;font-size:12px;margin:20px}
  h2{text-align:center;font-size:18px;margin-bottom:4px}
  .sub{text-align:center;color:#555;margin-bottom:20px;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th,td{border:1px solid #333;padding:6px 10px}
  th{background:#f0f0f0;font-weight:700}
  .right{text-align:right} .center{text-align:center}
  .red{color:#dc2626;font-weight:700}
  .info{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:16px}
  .info-cell{border:1px solid #999;padding:6px 10px;font-size:12px}
  .info-label{font-weight:700;color:#555;font-size:10px;display:block;margin-bottom:2px}
  .sig{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:24px}
  .sig-cell{border:1px solid #999;padding:8px 10px;text-align:center;min-height:50px}
  @media print{body{margin:0}button{display:none}}
</style></head><body>
<h2>(주)넥스젬 — 반품명세서</h2>
<div class="sub">Return Delivery Note | 반품 처리 확인서</div>
<div class="info">
  <div class="info-cell"><span class="info-label">GR번호</span>${d.gr_no}</div>
  <div class="info-cell"><span class="info-label">발주번호</span>${d.po_no}</div>
  <div class="info-cell"><span class="info-label">외주처</span>${d.partner_name}</div>
  <div class="info-cell"><span class="info-label">입고일</span>${d.receipt_date}</div>
</div>
<table>
  <thead><tr>
    <th>품번</th><th>품명</th>
    <th class="center">납품수량<br>(거래명세표)</th>
    <th class="center">합격수량<br>(실입고)</th>
    <th class="center red">반품수량</th>
    <th class="right">단가</th>
    <th class="right">정산금액<br>(합격분)</th>
  </tr></thead>
  <tbody><tr>
    <td>${d.part_no}</td>
    <td>${d.part_name}</td>
    <td class="center">${d.delivered_qty.toLocaleString()}</td>
    <td class="center">${d.accepted_qty.toLocaleString()}</td>
    <td class="center red">${d.return_qty.toLocaleString()}</td>
    <td class="right">₩${d.unit_price.toLocaleString()}</td>
    <td class="right">₩${d.settlement_amt.toLocaleString()}</td>
  </tr></tbody>
</table>
<div style="margin-bottom:8px;padding:10px;background:#fef2f2;border:1px solid #fca5a5;border-radius:4px">
  <strong class="red">반품사유:</strong> ${d.defect_note || '수입검사 불합격'}
</div>
<div style="margin-bottom:16px;padding:10px;background:#f0fdf4;border:1px solid #86efac;border-radius:4px;font-size:11px">
  ※ 본 명세서는 수입검사 결과에 따른 불합격품 반품 확인서입니다.<br>
  ※ 정산금액은 합격 수량 기준이며, 반품 수량(${d.return_qty.toLocaleString()}개)은 대금 청구 대상에서 제외됩니다.
</div>
<div class="sig">
  <div class="sig-cell"><div style="font-size:10px;color:#555">작성자</div><div style="margin-top:24px"></div></div>
  <div class="sig-cell"><div style="font-size:10px;color:#555">품질부서 확인</div><div style="margin-top:24px"></div></div>
  <div class="sig-cell"><div style="font-size:10px;color:#555">외주처 수령 확인</div><div style="margin-top:24px"></div></div>
</div>
<div style="text-align:right;margin-top:20px;font-size:11px;color:#888">발행일: ${new Date().toLocaleDateString('ko-KR')} | (주)넥스젬 구매팀</div>
<button onclick="window.print()" style="display:block;margin:20px auto;padding:8px 24px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">🖨 반품명세서 인쇄/PDF</button>
</body></html>`
      const w = window.open('', '_blank', 'width=900,height=700')
      w.document.write(html)
      w.document.close()
    } catch(e) {
      alert('반품명세서 조회 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  const toggleReceiptCarryover = (gr_no, currentVal, reason, qty, part_name, carryover_to_month) => {
    if (currentVal) {
      // 이월 해제는 바로 처리
      api.patch(`/purchase/receipts/${gr_no}/carryover`, { is_carryover: 0, reason: null })
        .then(() => loadClosing())
        .catch(e => alert(e.response?.data?.detail || '이월 해제 실패'))
    } else {
      setCarryoverModal({
        mode: 'receipt',
        gr_no,
        max_qty: qty,
        default_qty: qty,
        part_name: `${part_name || gr_no}`,
        title: '입고 이월 처리',
        default_to_month: carryover_to_month || nextMonth(closingYM),
      })
    }
  }

  const loadClosing = () => {
    const [y, m] = closingYM.split('-')
    api.get(`/purchase/closing/monthly?year=${y}&month=${m}`)
      .then(r => { setClosing(r.data); setExpandedPartner(null) })
      .catch(() => alert('조회 실패'))
  }

  const updatePoDueDate = async (po_no, due_date, groupNo) => {
    try {
      await api.patch(`/purchase/orders/${po_no}/due-date`, { due_date })
      // 그룹 데이터 새로고침
      setGroups(prev => prev.map(g => {
        if (g.group_no !== groupNo) return g
        return {
          ...g,
          lines: g.lines.map(l => l.po_no === po_no ? { ...l, due_date } : l)
        }
      }))
    } catch (e) {
      alert('납기일 수정 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  const cancelGroup = async (group_no) => {
    if (!window.confirm(`발주서 ${group_no}를 취소하시겠습니까?`)) return
    try {
      await api.patch(`/purchase/groups/${group_no}/cancel`)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || '취소 실패')
    }
  }

  const isAdmin = isMaster()
  const role = getRole()

  // admin만 외주구매 탭 표시 (owner 포함 나머지는 자재구매만)
  const tabs = isAdmin
    ? [['outsource','외주구매'],['material','자재구매']]
    : [['material','자재구매']]

  // 외주구매 탭 없는 역할로 접속하면 material 탭으로 고정
  const effectiveTab = (!isAdmin && mainTab === 'outsource') ? 'material' : mainTab

  return (
    <div>
      {/* 외주구매 / 자재구매 메인 분류 탭 */}
      <div style={{display:'flex',gap:0,marginBottom:12,borderBottom:'2px solid var(--border)'}}>
        {tabs.map(([v,l])=>(
          <button key={v} onClick={()=>setMainTab(v)} style={{
            padding:'8px 24px', fontWeight:effectiveTab===v?700:400, fontSize:14,
            background:'none', border:'none', borderBottom: effectiveTab===v?'2px solid #1e3a5f':'2px solid transparent',
            color: effectiveTab===v?'#1e3a5f':'#64748b', cursor:'pointer', marginBottom:-2,
          }}>{l}</button>
        ))}
      </div>

      {effectiveTab === 'material' && <MaterialPurchase />}
      {effectiveTab !== 'material' && <>

      {/* 탭 + 액션 바 */}
      <div className="erp-panel" style={{marginBottom:8}}>
        <div className="erp-actions">
          <div className="qdate-bar">
            {[['groups','발주서 목록'],['orders','발주 라인'],['remaining','미입고 잔량'],['closing','월 마감']].map(([v,l])=>(
              <button key={v} className={`qdate-btn${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
            ))}
          </div>
          <div className="spacer"/>
          {tab==='closing' && (
            <button className="btn btn-sm" style={{color:'#166534',border:'1px solid #16a34a'}} onClick={exportClosingExcel}>📥 Excel</button>
          )}
          {tab!=='closing' && <>
            <button className="btn btn-sm btn-outline" onClick={downloadTemplate}>양식 다운로드</button>
            <button className="btn btn-sm btn-outline" onClick={()=>xlsxRef.current?.click()}>엑셀 일괄 발주</button>
            <input type="file" accept=".xlsx,.xls" ref={xlsxRef} style={{display:'none'}} onChange={uploadExcel}/>
            <button className="btn btn-sm btn-outline" onClick={()=>setShowSingle(true)}>단건 발주</button>
            <button className="btn btn-sm btn-primary" onClick={()=>setShowGroup(true)}>＋ 발주서 작성</button>
          </>}
        </div>
      </div>

      {/* 발주서(그룹) 목록 */}
      {tab === 'groups' && (
        <>
        <div className="result-bar">
          <span className="result-bar-title">발주서 목록</span>
          <span className="result-bar-count">{groups.length}건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>발주서번호</th>
                <th>외주처</th>
                <th>품목수</th>
                <th>발주일</th>
                <th>Due Date</th>
                <th>상태</th>
                <th>PDF/인쇄</th>
                <th>상세</th>
                <th>취소</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && <tr><td colSpan={9} className="empty">발주서 없음 — 발주서 작성 버튼으로 등록하세요</td></tr>}
              {groups.map(g => (
                <>
                  <tr key={g.group_no}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{g.group_no}</span></td>
                    <td style={{ fontWeight: 500 }}>{g.partner_name || g.partner_id}</td>
                    <td style={{ textAlign: 'center' }}>{g.lines?.length ?? 0}종</td>
                    <td>{g.order_date}</td>
                    <td>{g.due_date}</td>
                    <td><span className={`badge ${STATUS_BADGE[g.status] || 'badge-gray'}`}>{g.status}</span></td>
                    <td>
                      <button className="btn btn-sm btn-primary" onClick={() => openPrint(g.group_no)}>
                        발주서 출력
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline"
                        onClick={() => setExpandedGroup(expandedGroup === g.group_no ? null : g.group_no)}>
                        {expandedGroup === g.group_no ? '▲ 닫기' : '▼ 납기수정'}
                      </button>
                    </td>
                    <td>
                      {g.status !== '취소' && (
                        <button className="btn btn-sm btn-danger" onClick={() => cancelGroup(g.group_no)}>취소</button>
                      )}
                    </td>
                  </tr>
                  {expandedGroup === g.group_no && g.lines?.map(line => (
                    <tr key={line.po_no} style={{ background: '#f8fafc' }}>
                      <td></td>
                      <td colSpan={2} style={{ paddingLeft: 24, fontSize: 12, color: 'var(--text-sm)' }}>
                        └ {line.po_no}
                      </td>
                      <td style={{ fontSize: 12 }}>{line.part_no}</td>
                      <td style={{ fontSize: 12 }}>{line.qty?.toLocaleString()} EA</td>
                      <td style={{ fontSize: 12 }}>
                        {line.unit_price ? `₩${Number(line.unit_price).toLocaleString()}` : '—'}
                      </td>
                      <td>
                        <input
                          type="date"
                          defaultValue={line.due_date || g.due_date}
                          style={{ fontSize: 12, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: 4 }}
                          onBlur={e => {
                            const newDate = e.target.value
                            if (newDate && newDate !== (line.due_date || g.due_date)) {
                              updatePoDueDate(line.po_no, newDate, g.group_no)
                            }
                          }}
                        />
                      </td>
                      <td><span className={`badge ${STATUS_BADGE[line.status] || 'badge-gray'}`}>{line.status}</span></td>
                      <td></td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* 단건 발주 목록 */}
      {tab === 'orders' && (() => {
        const remMap = Object.fromEntries(remaining.map(r => [r.po_no, r.remaining_qty]))
        const filteredOrders = orders.filter(o => {
          const monthMatch = o.order_date?.slice(0,7) === orderMonth || o.due_date?.slice(0,7) === orderMonth
          if (!monthMatch) return false
          const remQty = remMap[o.po_no] ?? o.qty
          if (showOnlyRemaining && remQty <= 0) return false
          return true
        })
        return (
          <div>
            <div className="erp-panel" style={{marginBottom:8}}>
              <div className="erp-grid-2" style={{gridTemplateColumns:'auto 1fr auto auto'}}>
                <div className="erp-label">조회 월</div>
                <div className="erp-value" style={{gridColumn:'span 3'}}>
                  <input type="month" value={orderMonth} onChange={e=>setOrderMonth(e.target.value)}
                    style={{border:'none',background:'transparent',fontSize:13,padding:'0 4px'}}/>
                  <label style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:13,cursor:'pointer',marginLeft:16}}>
                    <input type="checkbox" checked={showOnlyRemaining} onChange={e=>setShowOnlyRemaining(e.target.checked)}/>
                    미입고 잔량 있는 것만
                  </label>
                </div>
              </div>
            </div>
            <div className="result-bar">
              <span className="result-bar-title">발주 라인</span>
              <span className="result-bar-count">{filteredOrders.length}건</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>발주번호</th><th>외주처</th><th>품번</th><th>발주수량</th><th>잔량</th><th>발주일</th><th>Due Date</th><th>상태</th></tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 && <tr><td colSpan={8} className="empty">발주 없음</td></tr>}
                  {filteredOrders.map(o => {
                    const remQty = remMap[o.po_no] ?? o.qty
                    const remColor = remQty <= 0 ? '#9ca3af' : remQty < o.qty ? '#d97706' : '#111827'
                    return (
                      <tr key={o.po_no}>
                        <td><span style={{ fontFamily:'monospace', fontSize:12 }}>{o.po_no}</span></td>
                        <td>{o.partner_id}</td>
                        <td>{o.part_no}</td>
                        <td style={{ color:'#6b7280' }}>{o.qty?.toLocaleString()}</td>
                        <td><strong style={{ color: remColor }}>{remQty?.toLocaleString()}</strong></td>
                        <td>{o.order_date}</td>
                        <td>{o.due_date}</td>
                        <td><span className={`badge ${STATUS_BADGE[o.status] || 'badge-gray'}`}>{o.status}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* 미입고 잔량 */}
      {tab === 'remaining' && (() => {
        const partners = [...new Set(remaining.map(o => o.partner_id))].sort()
        const filtered = remainingPartner ? remaining.filter(o => o.partner_id === remainingPartner) : remaining
        const today = new Date().toISOString().slice(0, 10)
        const overdue = filtered.filter(o => String(o.due_date) < today)

        return (
          <div>
            {/* erp-panel 필터 */}
            <div className="erp-panel" style={{marginBottom:8}}>
              <div className="erp-grid-2" style={{gridTemplateColumns:'auto 1fr'}}>
                <div className="erp-label">업체 선택</div>
                <div className="erp-value">
                  <select value={remainingPartner} onChange={e=>setRemainingPartner(e.target.value)}
                    style={{border:'none',background:'transparent',fontSize:13,padding:'0 4px',minWidth:160}}>
                    <option value="">전체 ({remaining.length}건)</option>
                    {[...new Set(remaining.map(o=>o.partner_id))].sort().map(p=>{
                      const cnt=remaining.filter(o=>o.partner_id===p).length
                      return <option key={p} value={p}>{p} ({cnt}건)</option>
                    })}
                  </select>
                </div>
              </div>
            </div>
            {/* 납기준수율 KPI */}
            {deliveryRates.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, letterSpacing: 1 }}>
                  업체별 납기준수율 (입고완료 발주 기준)
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {deliveryRates.map(dr => {
                    const color = dr.rate >= 90 ? '#16a34a' : dr.rate >= 70 ? '#d97706' : '#dc2626'
                    const bg    = dr.rate >= 90 ? '#f0fdf4' : dr.rate >= 70 ? '#fffbeb' : '#fef2f2'
                    const border= dr.rate >= 90 ? '#bbf7d0' : dr.rate >= 70 ? '#fde68a' : '#fecaca'
                    return (
                      <div key={dr.partner_id}
                        onClick={() => setRemainingPartner(p => p === dr.partner_id ? '' : dr.partner_id)}
                        style={{
                          background: bg, border: `1px solid ${border}`, borderRadius: 10,
                          padding: '8px 14px', cursor: 'pointer', minWidth: 130, textAlign: 'center',
                          outline: remainingPartner === dr.partner_id ? `2px solid ${color}` : 'none',
                        }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{dr.partner_name}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color }}>{dr.rate}%</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                          납기준수 {dr.on_time} / 전체 {dr.total}건
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="result-bar">
              <span className="result-bar-title">미입고 잔량</span>
              <span className="result-bar-count">{filtered.length}건</span>
              {overdue.length>0 && <span style={{marginLeft:12,color:'#dc2626',fontWeight:600,fontSize:12}}>⚠ 납기초과 {overdue.length}건</span>}
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>발주번호</th><th>외주처</th><th>품번</th><th>품명</th>
                    <th>발주량</th><th style={{ color: 'var(--danger)' }}>미입고잔량</th><th>Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && <tr><td colSpan={7} className="empty">미입고 없음</td></tr>}
                  {filtered.map(o => {
                    const isOverdue = String(o.due_date) < today
                    return (
                      <tr key={o.po_no} style={{ background: isOverdue ? '#fff5f5' : undefined }}>
                        <td>{o.po_no}</td>
                        <td>{o.partner_id}</td>
                        <td>{o.part_no}</td>
                        <td>{o.part_name}</td>
                        <td>{o.order_qty?.toLocaleString()}</td>
                        <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{o.remaining_qty?.toLocaleString()}</td>
                        <td style={{ color: isOverdue ? '#dc2626' : undefined, fontWeight: isOverdue ? 600 : undefined }}>
                          {String(o.due_date)}{isOverdue ? ' ⚠' : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* 월 마감 */}
      {tab === 'closing' && (
        <div>
          <div className="erp-panel" style={{marginBottom:8}}>
            <div className="erp-grid-2" style={{gridTemplateColumns:'auto 1fr'}}>
              <div className="erp-label">조회 월</div>
              <div className="erp-value">
                <input type="month" value={closingYM} onChange={e=>setClosingYM(e.target.value)}
                  style={{border:'none',background:'transparent',fontSize:13,padding:'0 4px'}}/>
              </div>
            </div>
            <div className="erp-actions">
              <button className="btn btn-primary btn-sm" onClick={loadClosing}>조회</button>
            </div>
          </div>

          {closing.po_based.length === 0 && closing.outsource.length === 0 && (
            <div style={{ color: '#888', fontSize: 13, padding: 24, textAlign: 'center' }}>조회 버튼을 눌러 월 마감 현황을 확인하세요</div>
          )}

          {/* ── 요약 ── */}
          {(closing.po_based.length > 0 || closing.outsource.length > 0 || (closing.carryover_in||[]).length > 0) && (() => {
            // 실입고금액 = 입고금액 - 이월금액 - 반품금액
            const totalNet = [
              ...closing.po_based.map(p => p.net_received_amt || p.received_amt),
              ...closing.outsource.map(p => p.net_received_amt || p.received_amt),
            ].reduce((a, b) => a + b, 0)
            const totalCarryover = [
              ...closing.po_based.map(p => p.carryover_amt || 0),
              ...closing.outsource.map(p => p.carryover_amt || 0),
            ].reduce((a, b) => a + b, 0)
            const totalReturn = [
              ...closing.po_based.map(p => (p.receipt_return_amt || 0) + (p.return_amt || 0)),
              ...closing.outsource.map(p => p.return_amt || 0),
            ].reduce((a, b) => a + b, 0)
            const totalCarryoverIn = (closing.carryover_in||[]).reduce((s, p) => s + (p.carryover_in_amt || 0), 0)
            // 당월 총 매입금액 = 실입고(이월·반품 제외) + 이월수취분
            const totalPurchase = totalNet + totalCarryoverIn
            return (
              <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
                <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'10px 18px', minWidth:160 }}>
                  <div style={{ fontSize:11, color:'#3b82f6', fontWeight:600, marginBottom:4 }}>실입고금액 (이월·반품 제외)</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#1d4ed8' }}>₩{totalNet.toLocaleString()}</div>
                </div>
                {totalCarryoverIn > 0 && (
                  <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'10px 18px', minWidth:160 }}>
                    <div style={{ fontSize:11, color:'#16a34a', fontWeight:600, marginBottom:4 }}>↙이월 수취분</div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#15803d' }}>₩{totalCarryoverIn.toLocaleString()}</div>
                  </div>
                )}
                <div style={{ background:'#1e3a5f', border:'1px solid #1e40af', borderRadius:8, padding:'10px 18px', minWidth:180 }}>
                  <div style={{ fontSize:11, color:'#93c5fd', fontWeight:600, marginBottom:4 }}>
                    이달 총 매입금액{totalCarryoverIn > 0 ? ' (실입고+이월수취)' : ''}
                  </div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>₩{totalPurchase.toLocaleString()}</div>
                </div>
                {totalCarryover > 0 && (
                  <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, padding:'10px 18px', minWidth:160 }}>
                    <div style={{ fontSize:11, color:'#c2410c', fontWeight:600, marginBottom:4 }}>↗이월금액 (차월로)</div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#c2410c' }}>₩{totalCarryover.toLocaleString()}</div>
                  </div>
                )}
                {totalReturn > 0 && (
                  <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 18px', minWidth:160 }}>
                    <div style={{ fontSize:11, color:'#dc2626', fontWeight:600, marginBottom:4 }}>반품금액</div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#dc2626' }}>₩{totalReturn.toLocaleString()}</div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── 발주 기반 입고 ── */}
          {closing.po_based.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a5f', borderBottom: '2px solid #1e3a5f', padding: '6px 0', marginBottom: 12 }}>
                발주서 기반 입고
              </div>
              {closing.po_based.map(p => {
                const hasOver = p.over_qty > 0
                const hasCarryover = (p.carryover_qty || 0) > 0
                const hasReturn = (p.receipt_return_qty || 0) > 0
                const key = 'po_' + p.partner_id
                return (
                  <div key={key} style={{ marginBottom: 10, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                      background: hasReturn ? '#fef2f2' : hasCarryover ? '#fff7ed' : '#f8fafc', cursor: 'pointer',
                      borderBottom: expandedPartner === key ? '1px solid var(--border)' : 'none',
                    }}
                      onClick={() => setExpandedPartner(expandedPartner === key ? null : key)}>
                      <span style={{ fontWeight: 700, fontSize: 14, minWidth: 140 }}>{p.partner_name || p.partner_id}</span>
                      <span style={{ fontSize: 12, color: '#555' }}>발주 <strong>{p.order_qty.toLocaleString()}</strong></span>
                      <span style={{ fontSize: 12, color: '#555' }}>입고 <strong>{p.received_qty.toLocaleString()}</strong></span>
                      {hasCarryover && <span style={{ fontSize: 12, color: '#c2410c', fontWeight: 700 }}>↗이월 ₩{(p.carryover_amt||0).toLocaleString()}</span>}
                      {hasReturn && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>↩반품 ₩{(p.receipt_return_amt||0).toLocaleString()}</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 12 }}>
                        실금액 <strong style={{ color:'#1d4ed8' }}>₩{(p.net_received_amt||p.received_amt).toLocaleString()}</strong>
                      </span>
                      <span style={{ fontSize: 12 }}>{expandedPartner === key ? '▲' : '▼'}</span>
                    </div>
                    {expandedPartner === key && (
                      <div>
                        {p.lines.map(ln => (
                          <div key={ln.po_no}>
                            {/* 발주 라인 요약 행 */}
                            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 16px', background: (ln.carryover_qty||0)>0 ? '#fff7ed' : (ln.receipt_return_qty||0)>0 ? '#fef2f2' : (ln.over_qty||0)>0 ? '#fff7ed' : '#fff', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                              <span style={{ fontFamily:'monospace', color:'#64748b', minWidth:160 }}>{ln.po_no}</span>
                              <span style={{ fontFamily:'monospace', color:'#1d4ed8', minWidth:120 }}>{ln.part_no}</span>
                              <span style={{ minWidth:160, color:'#334155' }}>{ln.part_name}</span>
                              <span style={{ color:'#64748b' }}>발주 {ln.order_qty.toLocaleString()}</span>
                              <span style={{ color:'#334155' }}>입고 {ln.received_qty.toLocaleString()}</span>
                              {(ln.over_qty||0)>0 && (
                                <span style={{ display:'flex', alignItems:'center', gap:6, color:'#c2410c', fontWeight:700 }}>
                                  초과 {ln.over_qty.toLocaleString()}개 / ₩{(ln.over_amt||0).toLocaleString()}
                                  <button
                                    style={{ fontSize:10, padding:'2px 8px', borderRadius:4, border:'1px solid #fb923c', background:'#fff7ed', color:'#c2410c', cursor:'pointer' }}
                                    onClick={e => { e.stopPropagation(); registerCarryover(p.partner_id, ln, closingYM) }}>
                                    이월↗
                                  </button>
                                </span>
                              )}
                              {(ln.carryover_qty||0)>0 && <span style={{ color:'#c2410c', fontWeight:700 }}>↗이월 {(ln.carryover_qty).toLocaleString()}개 / ₩{(ln.carryover_amt||0).toLocaleString()}</span>}
                              {(ln.receipt_return_qty||0)>0 && <span style={{ color:'#dc2626', fontWeight:700 }}>↩반품 {ln.receipt_return_qty}개 / ₩{(ln.receipt_return_amt||0).toLocaleString()}</span>}
                              <span style={{ marginLeft:'auto', fontWeight:700, color:'#1d4ed8' }}>₩{(ln.net_received_amt||ln.received_amt).toLocaleString()}</span>
                            </div>
                            {/* 입고 건별 행 */}
                            {(ln.receipts||[]).map(r => (
                              <div key={r.gr_no} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 16px 5px 32px', background: r.is_carryover ? '#fff7ed' : r.return_qty>0 ? '#fef2f2' : '#fafafa', borderBottom:'1px solid #f1f5f9', fontSize:11, flexWrap:'wrap' }}>
                                <span style={{ fontFamily:'monospace', color:'#94a3b8', minWidth:160 }}>{r.gr_no}</span>
                                <span style={{ color:'#64748b' }}>{r.receipt_date}</span>
                                {/* 납품/합격/반품 수량 3단 표시 */}
                                {(r.delivered_qty > 0 && r.delivered_qty !== r.qty) ? (
                                  <span style={{ display:'flex', gap:6, alignItems:'center' }}>
                                    <span style={{ color:'#64748b' }}>납품 <strong>{r.delivered_qty.toLocaleString()}</strong></span>
                                    <span style={{ color:'#888' }}>→</span>
                                    <span style={{ color:'#166534' }}>합격 <strong>{r.qty.toLocaleString()}</strong></span>
                                    {r.return_qty > 0 && <span style={{ color:'#dc2626' }}>반품 <strong>{r.return_qty.toLocaleString()}</strong></span>}
                                  </span>
                                ) : (
                                  <span style={{ color:'#334155' }}>{r.qty.toLocaleString()}개 @₩{r.unit_price.toLocaleString()}</span>
                                )}
                                <span style={{ color:'#334155', fontWeight:600 }}>₩{(r.qty*r.unit_price).toLocaleString()}</span>
                                {r.is_carryover ? (
                                  <span style={{ color:'#c2410c', fontWeight:700 }}>
                                    ↗이월중 {r.carryover_to_month ? `→ ${r.carryover_to_month}` : ''} ({r.carryover_reason})
                                  </span>
                                ) : null}
                                {r.return_qty > 0 && !(r.delivered_qty > 0 && r.delivered_qty !== r.qty) ? (
                                  <span style={{ color:'#dc2626', fontWeight:700 }}>↩반품 {r.return_qty}개 ({r.return_reason})</span>
                                ) : null}
                                <span style={{ marginLeft:'auto', display:'flex', gap:6 }}>
                                  {r.return_qty > 0 && (
                                    <button
                                      style={{ fontSize:10, padding:'2px 8px', borderRadius:4, border:'1px solid #7c3aed', background:'#f5f3ff', color:'#7c3aed', cursor:'pointer' }}
                                      onClick={e => { e.stopPropagation(); printReturnSlip(r.gr_no, ln) }}>
                                      반품명세서
                                    </button>
                                  )}
                                  <button
                                    style={{ fontSize:10, padding:'2px 8px', borderRadius:4, border:'1px solid #fb923c', background: r.is_carryover ? '#c2410c' : '#fff7ed', color: r.is_carryover ? '#fff' : '#c2410c', cursor:'pointer' }}
                                    onClick={e => { e.stopPropagation(); toggleReceiptCarryover(r.gr_no, r.is_carryover, r.carryover_reason, r.qty, ln.part_name || ln.part_no, r.carryover_to_month) }}>
                                    {r.is_carryover ? '이월취소' : '이월↗'}
                                  </button>
                                  <button
                                    style={{ fontSize:10, padding:'2px 8px', borderRadius:4, border:'1px solid #fca5a5', background:'#fef2f2', color:'#dc2626', cursor:'pointer' }}
                                    onClick={e => { e.stopPropagation(); setReturnModal({ gr_no: r.gr_no, max_qty: r.qty, part_name: ln.part_name || ln.part_no }) }}>
                                    반품↩
                                  </button>
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── 외주 입고 (발주서 없음) ── */}
          {closing.outsource.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#166534', borderBottom: '2px solid #16a34a', padding: '6px 0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>외주 입고 (발주서 없음)</span>
                <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>— 월말 정산 검토 항목</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: '#166534' }}>
                  실금액 ₩{closing.outsource.reduce((s, p) => s + (p.net_received_amt||p.received_amt), 0).toLocaleString()}
                </span>
              </div>
              {closing.outsource.map(p => {
                const key = 'out_' + p.partner_id
                const hasCarryover = (p.carryover_qty||0) > 0
                const hasReturn = (p.return_qty||0) > 0
                return (
                  <div key={key} style={{ marginBottom: 10, border: '1px solid #bbf7d0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                      background: hasReturn ? '#fef2f2' : hasCarryover ? '#fff7ed' : '#f0fdf4', cursor: 'pointer',
                      borderBottom: expandedPartner === key ? '1px solid #bbf7d0' : 'none',
                    }}
                      onClick={() => setExpandedPartner(expandedPartner === key ? null : key)}>
                      <span style={{ fontWeight: 700, fontSize: 14, minWidth: 140, color: '#166534' }}>{p.partner_name || p.partner_id}</span>
                      <span style={{ fontSize: 12, color: '#555' }}>입고 <strong>{p.received_qty.toLocaleString()}</strong>개</span>
                      {hasCarryover && <span style={{ fontSize:12, color:'#c2410c', fontWeight:700 }}>↗이월 ₩{(p.carryover_amt||0).toLocaleString()}</span>}
                      {hasReturn && <span style={{ fontSize:12, color:'#dc2626', fontWeight:700 }}>↩반품 ₩{(p.return_amt||0).toLocaleString()}</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight:700, color: '#166534' }}>
                        실금액 ₩{(p.net_received_amt||p.received_amt).toLocaleString()}
                      </span>
                      <span style={{ fontSize: 12 }}>{expandedPartner === key ? '▲' : '▼'}</span>
                    </div>
                    {expandedPartner === key && (
                      <div className="table-wrap" style={{ margin: 0 }}>
                        <table style={{ fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th>입고번호</th><th>품번</th><th>품명</th>
                              <th style={{ textAlign: 'right' }}>입고수량</th>
                              <th style={{ textAlign: 'right' }}>재고단가</th>
                              <th style={{ textAlign: 'right', color: '#166534' }}>지급단가</th>
                              <th style={{ textAlign: 'right', color: '#166534' }}>지급금액</th>
                              <th>입고일</th><th>비고</th>
                              <th>이월/반품</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.lines.map(ln => (
                              <tr key={ln.gr_no} style={{ background: ln.is_carryover ? '#fff7ed' : ln.return_qty > 0 ? '#fef2f2' : '' }}>
                                <td style={{ fontFamily: 'monospace' }}>{ln.gr_no}</td>
                                <td style={{ fontFamily: 'monospace', color: '#1d4ed8' }}>{ln.part_no}</td>
                                <td>{ln.part_name}</td>
                                <td style={{ textAlign: 'right' }}>{ln.qty.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', color: '#64748b' }}>{ln.unit_price ? `₩${ln.unit_price.toLocaleString()}` : '—'}</td>
                                <td style={{ textAlign: 'right', color: ln.outsource_price != null ? '#166534' : '#94a3b8', fontWeight: ln.outsource_price != null ? 700 : 400 }}>
                                  {ln.outsource_price != null ? `₩${ln.outsource_price.toLocaleString()}` : '(재고단가)'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: ln.is_carryover ? '#c2410c' : ln.return_qty > 0 ? '#dc2626' : '#166534' }}>
                                  {ln.is_carryover ? <span>↗이월<br/><span style={{fontSize:10}}>{ln.carryover_reason}</span></span>
                                    : ln.return_qty > 0 ? `↩반품 ${ln.return_qty}개` : `₩${ln.net_amt?.toLocaleString() ?? ln.amt.toLocaleString()}`}
                                </td>
                                <td>{ln.receipt_date}</td>
                                <td style={{ color: '#64748b', fontSize: 11 }}>{ln.note}</td>
                                <td>
                                  <div style={{ display:'flex', gap:4 }}>
                                    <button
                                      style={{ fontSize:10, padding:'2px 7px', borderRadius:4, border:'1px solid #fb923c', background: ln.is_carryover ? '#c2410c' : '#fff7ed', color: ln.is_carryover ? '#fff' : '#c2410c', cursor:'pointer' }}
                                      onClick={() => toggleReceiptCarryover(ln.gr_no, ln.is_carryover, ln.carryover_reason, ln.qty, ln.part_name || ln.part_no, ln.carryover_to_month)}>
                                      {ln.is_carryover ? '이월취소' : '이월↗'}
                                    </button>
                                    <button
                                      style={{ fontSize:10, padding:'2px 7px', borderRadius:4, border:'1px solid #fca5a5', background:'#fef2f2', color:'#dc2626', cursor:'pointer' }}
                                      onClick={() => setReturnModal({ gr_no: ln.gr_no, max_qty: ln.qty, part_name: ln.part_name || ln.part_no })}>
                                      반품↩
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── 이월 수취분 (이전 달에서 이번 달로 이월된 매입) ── */}
          {(closing.carryover_in||[]).length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontWeight:700, fontSize:14, color:'#15803d', borderBottom:'2px solid #16a34a', padding:'6px 0', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
                <span>↙ 이월 수취분 ({closingYM} 매입 반영)</span>
                <span style={{ fontSize:12, fontWeight:400, color:'#64748b' }}>— 전월 이월 지정 항목이 이번 달 매입액으로 자동 연동</span>
                <span style={{ marginLeft:'auto', fontWeight:800, color:'#15803d', fontSize:15 }}>
                  ₩{(closing.carryover_in||[]).reduce((s,p)=>s+(p.carryover_in_amt||0),0).toLocaleString()}
                </span>
              </div>
              {(closing.carryover_in||[]).map(p => (
                <div key={p.partner_id} style={{ marginBottom:10, border:'1px solid #86efac', borderRadius:8, overflow:'hidden' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', background:'#f0fdf4', cursor:'pointer',
                    borderBottom: expandedPartner === 'ci_'+p.partner_id ? '1px solid #86efac' : 'none' }}
                    onClick={() => setExpandedPartner(expandedPartner === 'ci_'+p.partner_id ? null : 'ci_'+p.partner_id)}>
                    <span style={{ fontWeight:700, fontSize:14, minWidth:140 }}>{p.partner_name || p.partner_id}</span>
                    <span style={{ fontSize:12, color:'#555' }}>이월수취 <strong>{p.carryover_in_qty.toLocaleString()}</strong>개</span>
                    <span style={{ marginLeft:'auto', fontWeight:800, color:'#15803d' }}>₩{p.carryover_in_amt.toLocaleString()}</span>
                    <span style={{ fontSize:12 }}>{expandedPartner === 'ci_'+p.partner_id ? '▲' : '▼'}</span>
                  </div>
                  {expandedPartner === 'ci_'+p.partner_id && (
                    <div>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:'#dcfce7' }}>
                            <th style={{ padding:'6px 12px', textAlign:'left', borderBottom:'1px solid #86efac' }}>GR번호</th>
                            <th style={{ padding:'6px 12px', textAlign:'left' }}>품번</th>
                            <th style={{ padding:'6px 12px', textAlign:'left' }}>품명</th>
                            <th style={{ padding:'6px 12px', textAlign:'right' }}>이월수량</th>
                            <th style={{ padding:'6px 12px', textAlign:'right' }}>단가</th>
                            <th style={{ padding:'6px 12px', textAlign:'right' }}>이월금액</th>
                            <th style={{ padding:'6px 12px', textAlign:'left' }}>입고일</th>
                            <th style={{ padding:'6px 12px', textAlign:'left' }}>사유</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.lines.map(ln => (
                            <tr key={ln.gr_no} style={{ borderBottom:'1px solid #f0fdf4', background:'#fff' }}>
                              <td style={{ padding:'5px 12px', fontFamily:'monospace', color:'#64748b' }}>{ln.gr_no}</td>
                              <td style={{ padding:'5px 12px', color:'#1d4ed8', fontFamily:'monospace' }}>{ln.part_no}</td>
                              <td style={{ padding:'5px 12px' }}>{ln.part_name}</td>
                              <td style={{ padding:'5px 12px', textAlign:'right' }}>{ln.carryover_qty.toLocaleString()}</td>
                              <td style={{ padding:'5px 12px', textAlign:'right' }}>₩{ln.unit_price.toLocaleString()}</td>
                              <td style={{ padding:'5px 12px', textAlign:'right', fontWeight:700, color:'#15803d' }}>₩{ln.carryover_amt.toLocaleString()}</td>
                              <td style={{ padding:'5px 12px', color:'#64748b' }}>{ln.receipt_date}</td>
                              <td style={{ padding:'5px 12px', color:'#888', fontSize:11 }}>{ln.carryover_reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showGroup && <GroupModal onClose={() => setShowGroup(false)} onSaved={() => { setShowGroup(false); load() }} />}
      {showSingle && <SinglePOModal onClose={() => setShowSingle(false)} onSaved={() => { setShowSingle(false); load() }} />}
      {returnModal && (
        <ReturnModal
          gr_no={returnModal.gr_no}
          max_qty={returnModal.max_qty}
          part_name={returnModal.part_name}
          onClose={() => setReturnModal(null)}
          onSaved={() => { setReturnModal(null); loadClosing() }}
        />
      )}
      {carryoverModal && (
        <CarryoverModal
          title={carryoverModal.title}
          max_qty={carryoverModal.max_qty}
          default_qty={carryoverModal.default_qty}
          part_name={carryoverModal.part_name}
          default_to_month={carryoverModal.default_to_month}
          onClose={() => setCarryoverModal(null)}
          onSaved={async (qty, reason, toMonth) => {
            const cm = carryoverModal
            if (cm.mode === 'receipt') {
              await api.patch(`/purchase/receipts/${cm.gr_no}/carryover`, {
                is_carryover: 1, reason, carryover_qty: qty, carryover_to_month: toMonth,
              })
            } else {
              await api.post('/purchase/carryover', {
                partner_id: cm.partner_id, part_no: cm.ln.part_no, po_no: cm.ln.po_no,
                source_ym: cm.ym, over_qty: qty, note: reason,
              })
            }
            setCarryoverModal(null)
            loadClosing()
          }}
        />
      )}
      </>}
    </div>
  )
}

