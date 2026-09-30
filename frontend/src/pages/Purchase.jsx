import { useEffect, useState, useCallback, useRef, Fragment } from 'react'
import * as XLSX from 'xlsx'
import api from '../api'

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

export default function Purchase() {
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

  return (
    <div>
      <div className="toolbar">
        <button className={`btn ${tab === 'groups' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('groups')}>발주서 목록</button>
        <button className={`btn ${tab === 'orders' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('orders')}>발주 라인</button>
        <button className={`btn ${tab === 'remaining' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('remaining')}>미입고 잔량</button>
        <button className={`btn ${tab === 'closing' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('closing')}>월 마감</button>
        <div className="spacer" />
        {tab === 'closing' && (
          <button className="btn btn-outline btn-sm" onClick={exportClosingExcel}
            style={{ color: '#166534', borderColor: '#16a34a' }}>
            📥 Excel 보고서
          </button>
        )}
        {tab !== 'closing' && <>
          <button className="btn btn-outline btn-sm" onClick={downloadTemplate}>양식 다운로드</button>
          <button className="btn btn-outline btn-sm" onClick={() => xlsxRef.current?.click()}>엑셀 일괄 발주</button>
          <input type="file" accept=".xlsx,.xls" ref={xlsxRef} style={{ display: 'none' }} onChange={uploadExcel} />
          <button className="btn btn-outline btn-sm" onClick={() => setShowSingle(true)}>단건 발주</button>
          <button className="btn btn-primary" onClick={() => setShowGroup(true)}>발주서 작성</button>
        </>}
      </div>

      {/* 발주서(그룹) 목록 */}
      {tab === 'groups' && (
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
            <div style={{ display:'flex', gap:12, alignItems:'center', padding:'10px 0', flexWrap:'wrap' }}>
              <input type="month" value={orderMonth} onChange={e => setOrderMonth(e.target.value)}
                style={{ border:'1px solid #d1d5db', borderRadius:6, padding:'4px 8px', fontSize:14 }} />
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:14, cursor:'pointer' }}>
                <input type="checkbox" checked={showOnlyRemaining} onChange={e => setShowOnlyRemaining(e.target.checked)} />
                미입고 잔량 있는 것만
              </label>
              <span style={{ fontSize:13, color:'#6b7280' }}>{filteredOrders.length}건</span>
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

            {/* 필터 바 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <select value={remainingPartner} onChange={e => setRemainingPartner(e.target.value)}
                style={{ fontSize: 13, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                <option value="">전체 업체 ({remaining.length}건)</option>
                {partners.map(p => {
                  const cnt = remaining.filter(o => o.partner_id === p).length
                  return <option key={p} value={p}>{p} ({cnt}건)</option>
                })}
              </select>
              {overdue.length > 0 && (
                <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                  ⚠ 납기 초과 {overdue.length}건
                </span>
              )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>조회 월</label>
            <input type="month" value={closingYM} onChange={e => setClosingYM(e.target.value)}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
            <button className="btn btn-primary btn-sm" onClick={loadClosing}>조회</button>
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
                              <div key={r.gr_no} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 16px 5px 32px', background: r.is_carryover ? '#fff7ed' : r.return_qty>0 ? '#fef2f2' : '#fafafa', borderBottom:'1px solid #f1f5f9', fontSize:11 }}>
                                <span style={{ fontFamily:'monospace', color:'#94a3b8', minWidth:160 }}>{r.gr_no}</span>
                                <span style={{ color:'#64748b' }}>{r.receipt_date}</span>
                                <span style={{ color:'#334155' }}>{r.qty.toLocaleString()}개 @₩{r.unit_price.toLocaleString()}</span>
                                <span style={{ color:'#334155', fontWeight:600 }}>₩{(r.qty*r.unit_price).toLocaleString()}</span>
                                {r.is_carryover ? (
                                  <span style={{ color:'#c2410c', fontWeight:700 }}>
                                    ↗이월중 {r.carryover_to_month ? `→ ${r.carryover_to_month}` : ''} ({r.carryover_reason})
                                  </span>
                                ) : null}
                                {r.return_qty > 0 ? (
                                  <span style={{ color:'#dc2626', fontWeight:700 }}>↩반품 {r.return_qty}개 ({r.return_reason})</span>
                                ) : null}
                                <span style={{ marginLeft:'auto', display:'flex', gap:6 }}>
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
    </div>
  )
}
