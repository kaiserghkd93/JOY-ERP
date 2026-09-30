import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import api from '../api'

const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') }

function ItemSearchSelect({ value, items, onChange }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({})
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const selected = items.find(it => it.part_no === value)

  useEffect(() => {
    const close = (e) => {
      if (!triggerRef.current?.contains(e.target) && !document.getElementById('iss-drop')?.contains(e.target))
        setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (open && value && listRef.current) {
      const el = listRef.current.querySelector(`[data-pn="${CSS.escape(value)}"]`)
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [open, value])

  const openDropdown = () => {
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const goUp = spaceBelow < 220 && rect.top > spaceBelow
    const maxH = Math.min(400, goUp ? rect.top - 12 : spaceBelow - 12)
    setDropPos({ top: goUp ? rect.top - maxH - 2 : rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 540), maxH })
    setOpen(o => !o)
    setSearch('')
  }

  const filtered = items.filter(it =>
    it.part_no.toLowerCase().includes(search.toLowerCase()) ||
    it.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 200)

  return (
    <>
      <div ref={triggerRef} onClick={openDropdown} style={{
        padding: '6px 10px', border: `1.5px solid ${open ? '#1d4ed8' : '#cbd5e1'}`,
        borderRadius: 4, cursor: 'pointer', fontSize: 13, background: '#fff',
        minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: open ? '0 0 0 3px #bfdbfe' : 'none', userSelect: 'none',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected
            ? <><span style={{ fontFamily: 'monospace', color: '#1d4ed8', fontSize: 12 }}>{selected.part_no}</span><span style={{ marginLeft: 8, color: '#374151' }}>{selected.name}</span></>
            : <span style={{ color: '#aaa' }}>품목 선택...</span>}
        </span>
        <span style={{ color: '#94a3b8', fontSize: 10, marginLeft: 8, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && createPortal(
        <div id="iss-drop" style={{
          position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width,
          zIndex: 99999, background: '#fff', border: '1.5px solid #93c5fd', borderRadius: 8,
          boxShadow: '0 12px 36px rgba(0,0,0,.22)',
        }}>
          <div style={{ padding: '10px 10px 6px' }}>
            <input autoFocus type="text" placeholder="품번 또는 품명으로 검색..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', border: '2px solid #93c5fd',
                borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
              onClick={e => e.stopPropagation()} />
          </div>
          <div style={{ padding: '0 12px 6px', fontSize: 11, color: '#94a3b8' }}>
            {filtered.length}개 {search && `— "${search}" 검색결과`}
          </div>
          <div ref={listRef} style={{ maxHeight: dropPos.maxH - 80, overflowY: 'auto', borderTop: '1px solid #e2e8f0' }}>
            {filtered.length === 0 && <div style={{ padding: '14px 16px', color: '#888', fontSize: 13 }}>검색 결과 없음</div>}
            {filtered.map(it => {
              const isSel = it.part_no === value
              return (
                <div key={it.part_no} data-pn={it.part_no}
                  onMouseDown={e => { e.preventDefault(); onChange(it.part_no); setOpen(false); setSearch('') }}
                  style={{
                    padding: '9px 16px', cursor: 'pointer', fontSize: 13,
                    background: isSel ? '#eff6ff' : '',
                    borderLeft: isSel ? '3px solid #1d4ed8' : '3px solid transparent',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f1f5f9' }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = '' }}>
                  <span style={{ fontFamily: 'monospace', color: '#1d4ed8', minWidth: 140, flexShrink: 0, fontSize: 12 }}>{it.part_no}</span>
                  <span style={{ color: '#374151' }}>{it.name}</span>
                </div>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

function POSearchSelect({ orders, items, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [partnerFilter, setPartnerFilter] = useState('')
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const selected = orders.find(o => o.po_no === value)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const partners = [...new Set(orders.map(o => o.partner_id))].sort()
  const filtered = orders.filter(o => {
    if (partnerFilter && o.partner_id !== partnerFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return o.po_no.toLowerCase().includes(s) || o.part_no.toLowerCase().includes(s) || (items[o.part_no] || '').toLowerCase().includes(s)
    }
    return true
  })

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(o => !o)} style={{
        padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4,
        cursor: 'pointer', fontSize: 12, background: '#fff', minHeight: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        {selected
          ? <span><span style={{ fontFamily: 'monospace', color: '#1d4ed8' }}>{selected.po_no}</span>
              <span style={{ marginLeft: 8, color: '#555' }}>{selected.part_no}</span>
              {items[selected.part_no] && <span style={{ marginLeft: 6, color: '#888' }}>[{items[selected.part_no]}]</span>}
              <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b' }}>({selected.partner_id})</span>
            </span>
          : <span style={{ color: '#aaa' }}>발주번호 선택...</span>}
        <span style={{ color: '#888', fontSize: 10 }}>▼</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', zIndex: 9999, top: '100%', left: 0,
          background: '#fff', border: '1px solid #ccc', borderRadius: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,.15)', width: 860
        }}>
          {/* 외주처 필터 */}
          <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
            <button onClick={() => setPartnerFilter('')}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, border: '1px solid #cbd5e1',
                background: partnerFilter === '' ? '#1d4ed8' : '#fff', color: partnerFilter === '' ? '#fff' : '#333', cursor: 'pointer' }}>
              전체
            </button>
            {partners.map(p => (
              <button key={p} onClick={() => setPartnerFilter(p)}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, border: '1px solid #cbd5e1',
                  background: partnerFilter === p ? '#1d4ed8' : '#fff', color: partnerFilter === p ? '#fff' : '#333', cursor: 'pointer' }}>
                {p}
              </button>
            ))}
          </div>
          {/* 검색 */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
            <input autoFocus type="text" placeholder="발주번호 · 품번 · 품명 검색..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }}
              onClick={e => e.stopPropagation()} />
          </div>
          {/* 목록 */}
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {filtered.length === 0 && <div style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>검색 결과 없음</div>}
            {filtered.map(o => (
              <div key={o.po_no} onClick={() => { onChange(o.po_no); setOpen(false); setSearch('') }}
                style={{ padding: '7px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                  background: o.po_no === value ? '#eff6ff' : '', display: 'flex', alignItems: 'center', gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                onMouseLeave={e => e.currentTarget.style.background = o.po_no === value ? '#eff6ff' : ''}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1d4ed8', whiteSpace: 'nowrap', minWidth: 140 }}>{o.po_no}</span>
                <span style={{ fontSize: 12, color: '#111', whiteSpace: 'nowrap', minWidth: 100 }}>{o.part_no}</span>
                <span style={{ fontSize: 12, color: '#444', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{items[o.part_no] || ''}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{o.partner_id} · </span>
                <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>발주 {o.qty?.toLocaleString()} · </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: o.remaining_qty != null && o.remaining_qty < o.qty ? '#d97706' : '#166534', whiteSpace: 'nowrap' }}>
                  잔량 {(o.remaining_qty ?? o.qty)?.toLocaleString()}EA
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}> · {o.due_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ReceiptModal({ onClose, onSaved }) {
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState({})
  const [receipt_date, setReceiptDate] = useState(today())
  const [lines, setLines] = useState([{ po_no: '', qty: '', unit_price: '' }])

  useEffect(() => {
    Promise.all([
      api.get('/purchase/orders'),
      api.get('/master/items'),
      api.get('/purchase/orders/remaining'),
    ]).then(([ordRes, itemRes, remRes]) => {
      const remMap = Object.fromEntries(remRes.data.map(r => [r.po_no, r.remaining_qty]))
      const active = ordRes.data
        .filter(o => o.status !== 'closed' && o.status !== 'cancelled')
        .map(o => ({ ...o, remaining_qty: remMap[o.po_no] ?? o.qty }))
        .filter(o => o.remaining_qty > 0)
      setOrders(active)
      const map = {}
      itemRes.data.forEach(it => { map[it.part_no] = it.name })
      setItems(map)
    })
  }, [])

  const setLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  const addLine = () => setLines(ls => [...ls, { po_no: '', qty: '', unit_price: '' }])
  const removeLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i))

  const onPoChange = async (i, po_no) => {
    setLine(i, 'po_no', po_no)
    const o = orders.find(o => o.po_no === po_no)
    if (!o) return
    api.get(`/purchase/orders/${encodeURIComponent(po_no)}/summary`).then(r => {
      setOrders(prev => prev.map(x => x.po_no === po_no ? { ...x, remaining_qty: r.data.remaining_qty } : x))
      setLines(ls => ls.map((l, idx) => idx === i ? { ...l, qty: String(r.data.remaining_qty) } : l))
    }).catch(() => {})
    if (o.unit_price) {
      setLine(i, 'unit_price', o.unit_price)
    } else {
      api.get(`/master/items/${encodeURIComponent(o.part_no)}`).then(r => {
        if (r.data?.std_buy_price) setLine(i, 'unit_price', r.data.std_buy_price)
      }).catch(() => {})
    }
  }

  const submit = async () => {
    if (!receipt_date) return alert('입고일을 입력하세요')
    const valid = lines.filter(l => l.po_no && l.qty)
    if (valid.length === 0) return alert('발주번호와 수량을 입력하세요')
    let ok = 0, fail = 0
    for (const l of valid) {
      try {
        await api.post('/purchase/receipts', { po_no: l.po_no, qty: +l.qty, unit_price: +l.unit_price, receipt_date })
        ok++
      } catch (err) {
        fail++
        alert(`[${l.po_no}] 저장 실패: ` + (err.response?.data?.detail || err.message))
      }
    }
    if (ok > 0) onSaved()
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 960, maxWidth: '96vw' }}>
        <h3>입고 등록</h3>

        {/* 입고일 — 공통 */}
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>입고일 (전체 공통)</label>
          <input type="date" value={receipt_date} onChange={e => setReceiptDate(e.target.value)}
            style={{ maxWidth: 200 }} />
        </div>

        {/* 품목 라인 */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'visible' }}>
          {/* 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 110px 32px', gap: 8, padding: '6px 12px',
            background: '#f1f5f9', fontSize: 12, fontWeight: 600, color: '#475569' }}>
            <span>발주번호 / 품번 / 품명</span><span>입고수량</span><span>단가</span><span></span>
          </div>

          {lines.map((l, i) => {
            const o = orders.find(x => x.po_no === l.po_no)
            const remainingQty = o?.remaining_qty ?? o?.qty ?? 0
            const overQty = o && l.qty ? Math.max(0, +l.qty - remainingQty) : 0
            return (
              <div key={i} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', padding: '8px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 110px 32px', gap: 8, alignItems: 'center' }}>
                  <POSearchSelect orders={orders} items={items} value={l.po_no} onChange={v => onPoChange(i, v)} />
                  <input type="number" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                    placeholder="수량" style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, width: '100%' }} />
                  <input type="number" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                    placeholder="단가" style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, width: '100%' }} />
                  <button onClick={() => removeLine(i)} disabled={lines.length === 1}
                    style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: 16, cursor: lines.length === 1 ? 'default' : 'pointer', opacity: lines.length === 1 ? 0.3 : 1 }}>×</button>
                </div>
                {o && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, paddingLeft: 2 }}>
                    품번: <strong>{o.part_no}</strong>
                    {items[o.part_no] && <span style={{ marginLeft: 8 }}>품명: <strong>{items[o.part_no]}</strong></span>}
                    <span style={{ marginLeft: 8 }}>발주: <strong>{o.qty?.toLocaleString()}</strong></span>
                    <span style={{ marginLeft: 8 }}>잔량: <strong>{remainingQty?.toLocaleString()}</strong></span>
                    {overQty > 0 && <span style={{ marginLeft: 8, color: '#c2410c', fontWeight: 700 }}>⚠ 초과 {overQty.toLocaleString()}개</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button className="btn btn-outline btn-sm" onClick={addLine} style={{ marginTop: 8 }}>+ 품목 추가</button>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장 ({lines.filter(l => l.po_no && l.qty).length}건)</button>
        </div>
      </div>
    </div>
  )
}

function InspectModal({ gr, itemMap, partnerMap, onClose, onSaved }) {
  const [form, setForm] = useState({ pass_qty: '', fail_qty: 0, inspect_date: '', disposal: '반품', defect_note: '' })
  const [nonConformData, setNonConformData] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.inspect_date) return alert('검사일을 입력하세요')
    try {
      await api.post('/quality/inspections', {
        gr_no: gr.gr_no,
        inspect_date: form.inspect_date,
        pass_qty: +form.pass_qty,
        fail_qty: +form.fail_qty,
        disposal: form.disposal,
        defect_note: form.defect_note,
      })
      // 불량이 있으면 부적합통보서 자동 오픈
      if (+form.fail_qty > 0) {
        setNonConformData({ gr, form, itemMap, partnerMap })
      } else {
        onSaved()
      }
    } catch (err) {
      alert('저장 실패: ' + (err.response?.data?.detail || err.message))
    }
  }

  if (nonConformData) {
    return <NonConformModal data={nonConformData} onClose={onSaved} />
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>수입검사 등록 — {gr.gr_no}</h3>
        <div style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
          <span style={{ color: '#64748b' }}>품번 </span><strong>{gr.part_no}</strong>
          <span style={{ color: '#64748b', marginLeft: 12 }}>품명 </span><strong>{itemMap[gr.part_no] || ''}</strong>
          <span style={{ color: '#64748b', marginLeft: 12 }}>입고수량 </span><strong>{gr.qty?.toLocaleString()}</strong>
        </div>
        <div className="form-group">
          <label>검사일</label>
          <input type="date" value={form.inspect_date} onChange={e => set('inspect_date', e.target.value)} />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>합격수량</label>
            <input type="number" value={form.pass_qty} onChange={e => set('pass_qty', e.target.value)} />
          </div>
          <div className="form-group">
            <label style={{ color: '#dc2626' }}>불합격수량</label>
            <input type="number" value={form.fail_qty} onChange={e => set('fail_qty', e.target.value)} style={{ borderColor: +form.fail_qty > 0 ? '#dc2626' : undefined }} />
          </div>
        </div>
        {+form.fail_qty > 0 && (
          <>
            <div className="form-group">
              <label>불합격 처리</label>
              <select value={form.disposal} onChange={e => set('disposal', e.target.value)}>
                <option>반품</option><option>폐기</option><option>특채</option><option>보류</option>
              </select>
            </div>
            <div className="form-group">
              <label>불량내용</label>
              <textarea rows={2} value={form.defect_note} onChange={e => set('defect_note', e.target.value)} placeholder="치수불량, 외관불량, 크랙 등..." />
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
              ⚠ 불량 등록 시 부적합통보서가 자동으로 생성됩니다
            </div>
          </>
        )}
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>검사 등록</button>
        </div>
      </div>
    </div>
  )
}

function NonConformModal({ data, onClose }) {
  const { gr, form, itemMap, partnerMap } = data
  const [photos, setPhotos] = useState([])
  const [inspector, setInspector] = useState('')
  const [action, setAction] = useState(form.disposal)
  const fileRef = useRef(null)
  const printRef = useRef(null)

  const addPhotos = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => setPhotos(p => [...p, { name: f.name, src: ev.target.result }])
      reader.readAsDataURL(f)
    })
  }

  const removePhoto = (i) => setPhotos(p => p.filter((_, idx) => idx !== i))

  const doPrint = () => {
    const w = window.open('', '_blank', 'width=900,height=1200')
    const ncrNo = `NCR-${form.inspect_date.replace(/-/g,'')}` + `-${gr.gr_no.split('-').pop()}`
    const photoHtml = photos.length > 0
      ? photos.map(p => `<div style="display:inline-block;margin:4px;vertical-align:top;text-align:center">
          <img src="${p.src}" style="max-width:180px;max-height:140px;border:1px solid #ccc;border-radius:3px;display:block"/>
          <div style="font-size:8pt;color:#666;margin-top:2px">${p.name}</div>
        </div>`).join('')
      : '<div style="color:#aaa;text-align:center;padding:16px;font-size:9pt">첨부 사진 없음</div>'

    w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>부적합보고서 ${ncrNo}</title>
<style>
  @page { size: A4; margin: 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size:9.5pt; color:#111; margin:0; }
  button.print-btn { position:fixed;top:10px;right:10px;padding:7px 18px;background:#1e3a5f;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11pt;z-index:999; }
  table { width:100%; border-collapse:collapse; }
  td, th { border:1px solid #aaa; padding:5px 7px; vertical-align:middle; }
  .hdr-blue { background:#1e3a5f; color:#fff; font-weight:700; font-size:9pt; padding:4px 8px; }
  .cell-lbl { background:#f1f5f9; font-weight:600; color:#374151; width:90px; white-space:nowrap; }
  .sig-cell { height:52px; text-align:center; font-size:8pt; color:#bbb; vertical-align:bottom; padding-bottom:4px; }
  .pass { color:#16a34a; font-weight:700; }
  .fail { color:#dc2626; font-weight:700; }
  .disposal-badge { display:inline-block; border:1.5px solid #dc2626; border-radius:3px; padding:1px 10px; color:#dc2626; font-weight:700; font-size:9pt; }
  .write-area { min-height:36px; }
  @media print { button { display:none!important; } }
</style></head><body>
<button class="print-btn" onclick="window.print()">PDF / 인쇄</button>

<!-- ── 문서 헤더 ── -->
<table style="border:2px solid #1e3a5f; margin-bottom:0;">
  <tr>
    <td rowspan="3" style="border-right:2px solid #1e3a5f; width:130px; text-align:center; padding:10px;">
      <div style="font-size:15pt;font-weight:700;color:#1e3a5f;letter-spacing:2px;">NEXGEM</div>
      <div style="font-size:7.5pt;color:#666;margin-top:2px;">Quality Management</div>
    </td>
    <td colspan="4" style="background:#1e3a5f; text-align:center; padding:8px; border-bottom:1px solid #1e3a5f;">
      <div style="font-size:15pt;font-weight:700;letter-spacing:5px;color:#fff;">부 적 합 보 고 서</div>
      <div style="font-size:8pt;color:#cbd5e1;margin-top:2px;">NON-CONFORMANCE REPORT (NCR)</div>
    </td>
  </tr>
  <tr>
    <td class="cell-lbl" style="width:70px;">문서번호</td>
    <td style="font-weight:700; width:150px;">${ncrNo}</td>
    <td class="cell-lbl" style="width:60px;">개정</td>
    <td>Rev. 0</td>
  </tr>
  <tr>
    <td class="cell-lbl">발행일</td>
    <td>${form.inspect_date}</td>
    <td class="cell-lbl">페이지</td>
    <td>1 / 1</td>
  </tr>
</table>

<!-- ── 섹션 1: 부적합 식별 ── -->
<table style="border:1px solid #1e3a5f; border-top:none; margin-bottom:0;">
  <tr><td colspan="4" class="hdr-blue">1. 부적합 식별 (Non-Conformance Identification)</td></tr>
  <tr>
    <td class="cell-lbl">공급업체</td><td>${partnerMap?.[gr.po_no] || '—'}</td>
    <td class="cell-lbl">입고번호</td><td>${gr.gr_no}</td>
  </tr>
  <tr>
    <td class="cell-lbl">품번 (P/N)</td><td style="font-weight:700;">${gr.part_no}</td>
    <td class="cell-lbl">발주번호</td><td>${gr.po_no}</td>
  </tr>
  <tr>
    <td class="cell-lbl">품명</td><td colspan="3" style="font-weight:700;">${itemMap[gr.part_no] || '—'}</td>
  </tr>
  <tr>
    <td class="cell-lbl">검사일</td><td>${form.inspect_date}</td>
    <td class="cell-lbl">검사수량</td><td>${gr.qty?.toLocaleString()} EA</td>
  </tr>
  <tr>
    <td class="cell-lbl">합격수량</td><td class="pass">${(+form.pass_qty).toLocaleString()} EA</td>
    <td class="cell-lbl">불합격수량</td><td class="fail">${(+form.fail_qty).toLocaleString()} EA</td>
  </tr>
</table>

<!-- ── 섹션 2: 부적합 내용 ── -->
<table style="border:1px solid #1e3a5f; border-top:none; margin-bottom:0;">
  <tr><td colspan="2" class="hdr-blue">2. 부적합 내용 (Description of Non-Conformance)</td></tr>
  <tr>
    <td class="cell-lbl" style="width:90px;">불량 내용</td>
    <td style="min-height:40px;">${form.defect_note || '&nbsp;'}</td>
  </tr>
  <tr>
    <td class="cell-lbl">불량 사진</td>
    <td style="padding:8px;">${photoHtml}</td>
  </tr>
</table>

<!-- ── 섹션 3: 즉각 조치 ── -->
<table style="border:1px solid #1e3a5f; border-top:none; margin-bottom:0;">
  <tr><td colspan="2" class="hdr-blue">3. 즉각 조치 (Immediate / Containment Action)</td></tr>
  <tr>
    <td class="cell-lbl" style="width:90px;">처리방법</td>
    <td><span class="disposal-badge">${action}</span></td>
  </tr>
  <tr><td class="cell-lbl">조치 내용</td><td class="write-area">&nbsp;</td></tr>
  <tr><td class="cell-lbl">조치 기한</td><td>&nbsp;</td></tr>
</table>

<!-- ── 섹션 4: 원인분석 및 시정조치 ── -->
<table style="border:1px solid #1e3a5f; border-top:none; margin-bottom:0;">
  <tr><td colspan="2" class="hdr-blue">4. 원인분석 및 시정조치 (Root Cause &amp; Corrective Action)</td></tr>
  <tr><td class="cell-lbl" style="width:90px;">근본 원인</td><td class="write-area">&nbsp;</td></tr>
  <tr><td class="cell-lbl">시정 조치</td><td class="write-area">&nbsp;</td></tr>
  <tr><td class="cell-lbl">재발 방지</td><td class="write-area">&nbsp;</td></tr>
</table>

<!-- ── 섹션 5: 승인 ── -->
<table style="border:1px solid #1e3a5f; border-top:none; margin-bottom:0;">
  <tr><td colspan="6" class="hdr-blue">5. 승인 (Approval)</td></tr>
  <tr style="text-align:center; font-size:8.5pt;">
    <td class="cell-lbl" style="width:16%;">작성자</td>
    <td class="cell-lbl" style="width:16%;">검사자</td>
    <td class="cell-lbl" style="width:16%;">품질담당</td>
    <td class="cell-lbl" style="width:16%;">공급업체</td>
    <td class="cell-lbl" style="width:16%;">승인</td>
    <td class="cell-lbl" style="width:20%;">완료일</td>
  </tr>
  <tr>
    <td class="sig-cell">${inspector || ''}</td>
    <td class="sig-cell"></td>
    <td class="sig-cell"></td>
    <td class="sig-cell"></td>
    <td class="sig-cell"></td>
    <td class="sig-cell"></td>
  </tr>
</table>

<div style="font-size:7.5pt;color:#888;margin-top:6px;text-align:right;">QMS-F-QC-001 &nbsp;|&nbsp; Rev.0 &nbsp;|&nbsp; ISO 9001:2015 준거</div>
</body></html>`)
    w.document.close()
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 620, maxWidth: '98vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>⚠</span>
          <h3 style={{ margin: 0, color: '#dc2626' }}>부적합통보서 — {gr.gr_no}</h3>
        </div>

        {/* 기본 정보 */}
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
            <div><span style={{ color: '#9f1239' }}>품번</span> <strong>{gr.part_no}</strong></div>
            <div><span style={{ color: '#9f1239' }}>발주번호</span> <strong>{gr.po_no}</strong></div>
            <div><span style={{ color: '#9f1239' }}>품명</span> <strong>{itemMap[gr.part_no] || ''}</strong></div>
            <div><span style={{ color: '#9f1239' }}>검사일</span> <strong>{form.inspect_date}</strong></div>
            <div><span style={{ color: '#dc2626', fontWeight: 700 }}>불합격수량</span> <strong style={{ color: '#dc2626' }}>{(+form.fail_qty).toLocaleString()}</strong></div>
            <div><span style={{ color: '#9f1239' }}>합격수량</span> <strong style={{ color: '#16a34a' }}>{(+form.pass_qty).toLocaleString()}</strong></div>
          </div>
          {form.defect_note && <div style={{ marginTop: 6, color: '#7f1d1d' }}>불량내용: {form.defect_note}</div>}
        </div>

        {/* 처리방법 & 검사자 */}
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>처리방법</label>
            <select value={action} onChange={e => setAction(e.target.value)}>
              <option>반품</option><option>폐기</option><option>특채</option><option>보류</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>검사자</label>
            <input value={inspector} onChange={e => setInspector(e.target.value)} placeholder="홍길동" />
          </div>
        </div>

        {/* 사진 첨부 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>불량 사진 첨부</div>
          <div
            style={{ border: '2px dashed #fca5a5', borderRadius: 8, padding: 14, background: '#fff5f5', cursor: 'pointer', textAlign: 'center', marginBottom: 8 }}
            onClick={() => fileRef.current?.click()}
          >
            <div style={{ color: '#dc2626', fontSize: 13 }}>📷 클릭하여 사진 추가</div>
            <div style={{ color: '#aaa', fontSize: 11, marginTop: 4 }}>여러 장 선택 가능 (JPG, PNG)</div>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={addPhotos} />
          </div>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={p.src} alt={p.name} style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 6, border: '1px solid #fca5a5' }} />
                  <button
                    onClick={() => removePhoto(i)}
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: '20px', textAlign: 'center', padding: 0 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>닫기</button>
          <button className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }} onClick={doPrint}>
            📄 부적합통보서 출력
          </button>
        </div>
      </div>
    </div>
  )
}

function OutsourceReceiptModal({ onClose, onSaved }) {
  const [allItems, setAllItems] = useState([])
  const [partners, setPartners] = useState([])
  const [partnerId, setPartnerId] = useState('')
  const [lines, setLines] = useState([{ part_no: '', qty: '', unit_price: '', outsource_price: '' }])
  const [receipt_date, setReceiptDate] = useState(today())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [stockMap, setStockMap] = useState({})

  useEffect(() => {
    Promise.all([
      api.get('/master/items'),
      api.get('/master/partners'),
      api.get('/stock/snapshot').catch(() => ({ data: [] })),
    ]).then(([itemRes, partnerRes, stockRes]) => {
      setAllItems(itemRes.data)
      setPartners(partnerRes.data.filter(p => p.partner_type === '외주처' || p.partner_type === '외주' || true))
      const m = {}
      stockRes.data.forEach(s => { m[s.part_no] = s.current_stock })
      setStockMap(m)
    })
  }, [])

  const setLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  const addLine = () => setLines(ls => [...ls, { part_no: '', qty: '', unit_price: '' }])
  const removeLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i))

  const onPartSelect = (i, part_no) => {
    const item = allItems.find(it => it.part_no === part_no)
    setLines(ls => ls.map((l, idx) => idx === i
      ? { ...l, part_no, unit_price: item?.std_buy_price ?? l.unit_price }
      : l
    ))
  }

  const submit = async () => {
    if (!partnerId) return alert('외주처를 선택하세요')
    if (!receipt_date) return alert('입고일을 입력하세요')
    const valid = lines.filter(l => l.part_no && l.qty)
    if (valid.length === 0) return alert('품목을 1개 이상 입력하세요')
    setSaving(true)
    const partnerName = partners.find(p => p.partner_id === partnerId)?.name || partnerId
    try {
      for (const l of valid) {
        await api.post('/purchase/receipts/direct', {
          part_no: l.part_no, qty: +l.qty, unit_price: +l.unit_price,
          outsource_price: l.outsource_price !== '' ? +l.outsource_price : null,
          receipt_date, note: `외주입고 - ${partnerName}${note ? ' / ' + note : ''}`,
          partner_id: partnerId,
        })
      }
      onSaved()
    } catch (err) {
      alert('저장 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 900, maxWidth: '98vw', maxHeight: '96vh', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: 12 }}>외주 입고 등록</h3>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '7px 14px', marginBottom: 14, fontSize: 12, color: '#166534' }}>
          발주서 없이 외주처에서 입고되는 품목을 직접 등록합니다. 즉시 재고에 반영됩니다.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>외주처 <span style={{ color: '#dc2626' }}>*</span></label>
            <select value={partnerId} onChange={e => setPartnerId(e.target.value)}
              style={{ border: !partnerId ? '1.5px solid #fca5a5' : undefined }}>
              <option value="">외주처 선택...</option>
              {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name} ({p.partner_id})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>입고일</label>
            <input type="date" value={receipt_date} onChange={e => setReceiptDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>비고</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="작업지시번호, 특이사항 등" />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>입고 품목</span>
            <button className="btn btn-sm btn-outline" onClick={addLine}>+ 품목 추가</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '7px 8px', textAlign: 'left', borderBottom: '2px solid var(--border)' }}>품번 / 품명</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 80, textAlign: 'right' }}>현재고</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 100 }}>입고수량</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 110 }}>재고단가</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 120, color: '#166534' }}>지급단가 (포장비 등)</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 80, textAlign: 'right' }}>입고후재고</th>
                  <th style={{ width: 36, borderBottom: '2px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const stock = l.part_no ? (stockMap[l.part_no] ?? 0) : null
                  const afterStock = stock !== null ? stock + (+l.qty || 0) : null
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '5px 4px' }}>
                        <ItemSearchSelect value={l.part_no} items={allItems} onChange={v => onPartSelect(i, v)} />
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12,
                        color: stock !== null ? (stock < 0 ? '#dc2626' : '#374151') : '#ccc' }}>
                        {stock !== null ? stock.toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input type="number" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                          style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input type="number" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                          style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input type="number" value={l.outsource_price} onChange={e => setLine(i, 'outsource_price', e.target.value)}
                          placeholder="예: 77"
                          style={{ width: '100%', padding: '5px 8px', border: '1.5px solid #86efac', borderRadius: 4, fontSize: 13, background: '#f0fdf4' }} />
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12,
                        fontWeight: 600, color: afterStock === null ? '#ccc' : '#16a34a' }}>
                        {afterStock !== null ? afterStock.toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                        {lines.length > 1 && (
                          <button onClick={() => removeLine(i)}
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

        <div style={{ fontSize: 12, color: '#64748b', padding: '6px 0' }}>
          총 {lines.filter(l => l.part_no && l.qty).length}건 — 재고단가(재고반영) / 지급단가(월마감 정산금액)
        </div>
        <div className="modal-footer" style={{ paddingTop: 0 }}>
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" style={{ background: '#16a34a', borderColor: '#16a34a' }} onClick={submit} disabled={saving}>
            {saving ? '처리 중...' : '외주 입고 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DirectReceiptModal({ onClose, onSaved }) {
  const [allItems, setAllItems] = useState([])
  const [lines, setLines] = useState([{ part_no: '', qty: '', unit_price: '' }])
  const [receipt_date, setReceiptDate] = useState(today())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [stockMap, setStockMap] = useState({})

  useEffect(() => {
    api.get('/master/items').then(r => setAllItems(r.data))
    api.get('/stock/snapshot').then(r => {
      const m = {}
      r.data.forEach(s => { m[s.part_no] = s.current_stock })
      setStockMap(m)
    }).catch(() => {})
  }, [])

  const setLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  const addLine = () => setLines(ls => [...ls, { part_no: '', qty: '', unit_price: '' }])
  const removeLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i))

  const onPartSelect = (i, part_no) => {
    const item = allItems.find(it => it.part_no === part_no)
    setLines(ls => ls.map((l, idx) => idx === i
      ? { ...l, part_no, unit_price: item?.std_buy_price ?? l.unit_price }
      : l
    ))
  }

  const submit = async () => {
    if (!receipt_date) return alert('입고일을 입력하세요')
    const valid = lines.filter(l => l.part_no && l.qty)
    if (valid.length === 0) return alert('품목을 1개 이상 입력하세요')
    setSaving(true)
    try {
      for (const l of valid) {
        await api.post('/purchase/receipts/direct', {
          part_no: l.part_no, qty: +l.qty, unit_price: +l.unit_price,
          receipt_date, note: note || '직접입고',
        })
      }
      onSaved()
    } catch (err) {
      alert('저장 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 900, maxWidth: '98vw', maxHeight: '96vh', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: 12 }}>직접 입고 등록 (자체생산품)</h3>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '7px 14px', marginBottom: 14, fontSize: 12, color: '#1e40af' }}>
          발주 없이 자체생산품을 창고에 직접 입고합니다. 즉시 재고에 반영됩니다.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>입고일</label>
            <input type="date" value={receipt_date} onChange={e => setReceiptDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>비고</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="생산입고 등" />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>품목 목록</span>
            <button className="btn btn-sm btn-outline" onClick={addLine}>+ 품목 추가</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '7px 8px', textAlign: 'left', borderBottom: '2px solid var(--border)' }}>품번 / 품명</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 90, textAlign: 'right' }}>현재고</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 110 }}>입고수량</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 120 }}>단가</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 90, textAlign: 'right' }}>입고후재고</th>
                  <th style={{ width: 36, borderBottom: '2px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const stock = l.part_no ? (stockMap[l.part_no] ?? 0) : null
                  const afterStock = stock !== null ? stock + (+l.qty || 0) : null
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '5px 4px' }}>
                        <ItemSearchSelect value={l.part_no} items={allItems} onChange={v => onPartSelect(i, v)} />
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12,
                        color: stock !== null ? (stock < 0 ? '#dc2626' : '#374151') : '#ccc' }}>
                        {stock !== null ? stock.toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input type="number" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                          style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input type="number" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                          style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12,
                        fontWeight: 600, color: afterStock === null ? '#ccc' : '#16a34a' }}>
                        {afterStock !== null ? afterStock.toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                        {lines.length > 1 && (
                          <button onClick={() => removeLine(i)}
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

        <div style={{ fontSize: 12, color: '#64748b', padding: '6px 0' }}>
          총 {lines.filter(l => l.part_no && l.qty).length}건 입고 등록 — 즉시 재고 반영
        </div>
        <div className="modal-footer" style={{ paddingTop: 0 }}>
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? '처리 중...' : '입고 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_BADGE = { '대기': 'badge-amber', '확정': 'badge-green', '취소': 'badge-red' }
const STATUS_LABEL = { '대기': '검사대기', '확정': '입고확정', '취소': '취소' }

export default function Receipt() {
  const [receipts, setReceipts] = useState([])
  const [inspections, setInspections] = useState([])
  const [itemMap, setItemMap] = useState({})
  const [partnerMap, setPartnerMap] = useState({}) // po_no → 외주처명
  const [allPartners, setAllPartners] = useState([])
  const [assignGr, setAssignGr] = useState(null) // 외주처 지정 대상 gr
  const [assignPartnerId, setAssignPartnerId] = useState('')
  const [assignOutsourcePrice, setAssignOutsourcePrice] = useState('')
  const [tab, setTab] = useState('receipts')
  const [showModal, setShowModal] = useState(false)
  const [showDirectModal, setShowDirectModal] = useState(false)
  const [showOutsourceModal, setShowOutsourceModal] = useState(false)
  const [inspectGr, setInspectGr] = useState(null)

  const load = useCallback(() => {
    api.get('/purchase/receipts').then(r => setReceipts(r.data)).catch(() => {})
    api.get('/quality/inspections').then(r => setInspections(r.data)).catch(() => {})
    api.get('/master/items').then(r => {
      const map = {}
      r.data.forEach(it => { map[it.part_no] = it.name })
      setItemMap(map)
    }).catch(() => {})
    api.get('/master/partners').then(pr => {
      setAllPartners(pr.data)
      const pmap = {}
      pr.data.forEach(p => { pmap[p.partner_id] = p.name })
      // po_no → 외주처명 매핑 (발주서 기반)
      api.get('/purchase/orders').then(r => {
        const map = {}
        r.data.forEach(o => { map[o.po_no] = pmap[o.partner_id] || o.partner_id })
        setPartnerMap(map)
      }).catch(() => {})
    }).catch(() => {})
  }, [])

  const assignPartner = async () => {
    if (!assignGr) return
    try {
      await api.patch(`/purchase/receipts/${assignGr}/partner`, {
        partner_id: assignPartnerId || null,
        outsource_price: assignOutsourcePrice !== '' ? +assignOutsourcePrice : null,
      })
      setAssignGr(null)
      setAssignPartnerId('')
      setAssignOutsourcePrice('')
      load()
    } catch (err) {
      alert('저장 실패: ' + (err.response?.data?.detail || err.message))
    }
  }

  useEffect(() => { load() }, [load])

  const confirm = async (gr_no) => {
    await api.post(`/purchase/receipts/${gr_no}/confirm`)
    load()
  }

  const cancelConfirmed = async (gr_no, force = false) => {
    const reason = window.prompt(
      `${gr_no} 역분개 사유를 입력하세요\n(원전표 유지 + 취소전표 생성)`,
      '수량오류 역분개'
    )
    if (reason === null) return  // 취소 클릭
    try {
      await api.post(`/purchase/receipts/${gr_no}/reverse`, { reason })
      load()
    } catch (err) {
      const detail = err.response?.data?.detail || ''
      if (detail.includes('재고') && !force) {
        if (!window.confirm(`⚠ ${detail}\n\n강제 역분개(재고 음수 허용) 하시겠습니까?`)) return
        try {
          await api.post(`/stock/receipts/${gr_no}/cancel?force=true`)
          load()
        } catch (e2) {
          alert('강제취소 실패: ' + (e2.response?.data?.detail || e2.message))
        }
      } else {
        alert('역분개 실패: ' + detail)
      }
    }
  }


  return (
    <div>
      <div className="toolbar">
        <button className={`btn ${tab === 'receipts' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('receipts')}>입고 목록</button>
        <button className={`btn ${tab === 'inspect' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('inspect')}>검사 내역</button>
        <div className="spacer" />
        {tab === 'receipts' && (
          <>
            <button className="btn btn-outline"
              style={{ borderColor: '#16a34a', color: '#16a34a', fontWeight: 600 }}
              onClick={() => setShowOutsourceModal(true)}>
              외주 입고
            </button>
            <button className="btn btn-outline"
              style={{ borderColor: '#0f766e', color: '#0f766e', fontWeight: 600 }}
              onClick={() => setShowDirectModal(true)}>
              직접 입고 (자체생산)
            </button>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ 입고 등록</button>
          </>
        )}
      </div>

      {tab === 'receipts' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>입고번호</th><th>발주번호</th><th>품번</th><th>품명</th><th>수량</th><th>단가</th><th>입고일</th><th>상태</th><th>처리</th></tr>
            </thead>
            <tbody>
              {receipts.length === 0 && <tr><td colSpan={9} className="empty">입고 없음</td></tr>}
              {receipts.map(r => (
                <tr key={r.gr_no}>
                  <td><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.gr_no}</span></td>
                  <td>
                    {r.po_no === r.gr_no ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ color: '#0f766e', fontSize: 11, fontWeight: 600 }}>직접입고</span>
                        {r.partner_id
                          ? <span style={{ fontSize: 10, color: '#166534', background: '#dcfce7', borderRadius: 4, padding: '1px 5px', cursor: 'pointer' }}
                              onClick={() => { setAssignGr(r.gr_no); setAssignPartnerId(r.partner_id); setAssignOutsourcePrice(r.outsource_price ?? '') }}>
                              {allPartners.find(p => p.partner_id === r.partner_id)?.name || r.partner_id} ✎
                            </span>
                          : <span style={{ fontSize: 10, color: '#0f766e', background: '#ccfbf1', borderRadius: 4, padding: '1px 5px' }}>
                              자체생산
                            </span>
                        }
                      </div>
                    ) : r.po_no}
                  </td>
                  <td>{r.part_no}</td>
                  <td style={{ color: 'var(--text-sm)' }}>{itemMap[r.part_no] || ''}</td>
                  <td>{r.qty?.toLocaleString()}</td>
                  <td>₩{r.unit_price?.toLocaleString()}</td>
                  <td>{r.receipt_date}</td>
                  <td><span className={`badge ${STATUS_BADGE[r.status] || 'badge-gray'}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
                  <td>
                    {r.status === '대기' && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => setInspectGr(r)}>검사등록</button>
                        <button className="btn btn-sm btn-outline"
                          style={{ color: '#16a34a', borderColor: '#16a34a' }}
                          onClick={() => confirm(r.gr_no)}>즉시확정</button>
                      </div>
                    )}
                    {r.status === '확정' && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#16a34a' }}>✓ 재고반영완료</span>
                        <button className="btn btn-sm"
                          style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                          onClick={() => cancelConfirmed(r.gr_no)}>역분개</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'inspect' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>입고번호</th><th>검사일</th><th>합격</th><th>불합격</th><th>결과</th><th>처리</th><th>불량내용</th></tr>
            </thead>
            <tbody>
              {inspections.length === 0 && <tr><td colSpan={7} className="empty">검사 내역 없음</td></tr>}
              {inspections.map(i => (
                <tr key={i.id}>
                  <td>{i.gr_no}</td>
                  <td>{i.inspect_date}</td>
                  <td style={{ color: 'var(--success)' }}>{i.pass_qty}</td>
                  <td style={{ color: 'var(--danger)' }}>{i.fail_qty}</td>
                  <td><span className={`badge ${i.result === '합격' ? 'badge-green' : i.result === '불합격' ? 'badge-red' : 'badge-amber'}`}>{i.result}</span></td>
                  <td>{i.result === '합격' ? '—' : i.disposal}</td>
                  <td className="text-sm">{i.defect_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <ReceiptModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load() }} />}
      {showDirectModal && <DirectReceiptModal onClose={() => setShowDirectModal(false)} onSaved={() => { setShowDirectModal(false); load() }} />}

      {/* 외주처 지정 미니 모달 */}
      {assignGr && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 420 }}>
            <h3 style={{ marginBottom: 12 }}>외주처 지정 — {assignGr}</h3>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              이 직접입고 건의 외주처를 지정하면 월 마감 리포트에 반영됩니다.
            </div>
            <div className="form-group">
              <label>외주처</label>
              <select value={assignPartnerId} onChange={e => setAssignPartnerId(e.target.value)}>
                <option value="">미지정 (외주처 없음)</option>
                {allPartners.map(p => (
                  <option key={p.partner_id} value={p.partner_id}>{p.name} ({p.partner_id})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>지급단가 (외주처에 실제 지급하는 금액/개)</label>
              <input type="number" value={assignOutsourcePrice}
                onChange={e => setAssignOutsourcePrice(e.target.value)}
                placeholder="예: 77 (포장비 등 — 비워두면 입고단가 사용)"
                style={{ maxWidth: 320 }} />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                ※ 재고 단가와 별개로 월마감 지급금액 산출에만 사용됩니다
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setAssignGr(null); setAssignPartnerId('') }}>취소</button>
              <button className="btn btn-primary" onClick={assignPartner}>저장</button>
            </div>
          </div>
        </div>
      )}
      {showOutsourceModal && <OutsourceReceiptModal onClose={() => setShowOutsourceModal(false)} onSaved={() => { setShowOutsourceModal(false); load() }} />}
      {inspectGr && <InspectModal gr={inspectGr} itemMap={itemMap} partnerMap={partnerMap} onClose={() => setInspectGr(null)} onSaved={() => { setInspectGr(null); load() }} />}
    </div>
  )
}
