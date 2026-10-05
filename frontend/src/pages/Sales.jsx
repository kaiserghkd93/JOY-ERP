import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import api from '../api'

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const fmtPrice = (v) => { const n = Number(v ?? 0); if (Number.isInteger(n)) return n.toLocaleString('ko-KR'); return n.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) }

function ItemSearchSelect({ value, items, onChange }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, maxH: 380 })
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const selected = items.find(it => it.part_no === value)

  useEffect(() => {
    const close = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) &&
          !document.getElementById('iss-drop')?.contains(e.target)) {
        setOpen(false)
      }
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

  const dropdown = (
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
    </div>
  )

  return (
    <>
      <div ref={triggerRef} onClick={openDropdown} style={{
        padding: '6px 10px', border: `1px solid ${open ? '#1d4ed8' : '#cbd5e1'}`,
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
      {open && createPortal(dropdown, document.body)}
    </>
  )
}

function SalesOrderModal({ onClose, onSaved }) {
  const [customers, setCustomers] = useState([])
  const [allItems, setAllItems] = useState([])
  const [items, setItems] = useState([])
  const [partner_id, setPartnerId] = useState('')
  const [order_date, setOrderDate] = useState(today())
  const [due_date, setDueDate] = useState('')
  const [lines, setLines] = useState([{ part_no: '', qty: '', due_date: '' }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/master/partners').then(r => setCustomers(r.data.filter(p => p.partner_type === '고객' || p.partner_type === '공용')))
    api.get('/master/items').then(r => { setAllItems(r.data); setItems(r.data) })
  }, [])

  useEffect(() => {
    setItems(allItems)
  }, [allItems])

  const setLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  const addLine = () => setLines(ls => [...ls, { part_no: '', qty: '', due_date: due_date }])
  const removeLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i))

  const submit = async () => {
    if (!partner_id) return alert('고객사를 선택해주세요')
    if (!order_date || !due_date) return alert('수주일과 Due Date를 입력하세요')
    const valid = lines.filter(l => l.part_no && l.qty)
    if (valid.length === 0) return alert('품목을 1개 이상 입력하세요')
    setSaving(true)
    try {
      for (const l of valid) {
        await api.post('/sales/orders', { partner_id, part_no: l.part_no, qty: +l.qty, order_date, due_date: l.due_date || due_date })
      }
      onSaved()
    } catch (err) {
      alert('저장 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  const customerName = customers.find(p => p.partner_id === partner_id)?.name

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 1100, maxWidth: '98vw', maxHeight: '96vh', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: 16 }}>수주 등록</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>고객사</label>
            <select value={partner_id} onChange={e => setPartnerId(e.target.value)}>
              <option value="">선택</option>
              {customers.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>수주일</label>
            <input type="date" value={order_date} onChange={e => setOrderDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>기본 납기일 <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>(품목별 개별 입력 가능)</span></label>
            <input type="date" value={due_date} onChange={e => { setDueDate(e.target.value); setLines(ls => ls.map(l => l.due_date ? l : { ...l, due_date: e.target.value })) }} />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              품목 목록
            </span>
            <button className="btn btn-sm btn-outline" onClick={addLine}>+ 품목 추가</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '7px 8px', textAlign: 'left', borderBottom: '2px solid var(--border)' }}>품번 / 품명</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 110 }}>수량</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 160 }}>납기일</th>
                  <th style={{ width: 40, borderBottom: '2px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '5px 4px' }}>
                      <ItemSearchSelect value={l.part_no} items={items} onChange={v => setLine(i, 'part_no', v)} />
                    </td>
                    <td style={{ padding: '5px 4px' }}>
                      <input type="number" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                        style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                    </td>
                    <td style={{ padding: '5px 4px' }}>
                      <input type="date" value={l.due_date} onChange={e => setLine(i, 'due_date', e.target.value)}
                        style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }} />
                    </td>
                    <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(i)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-sm)', padding: '8px 0' }}>
          총 {lines.filter(l => l.part_no && l.qty).length}건 수주 등록
        </div>

        <div className="modal-footer" style={{ paddingTop: 0 }}>
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ShipModal({ so, onClose, onSaved }) {
  const remainQty = so.remaining_qty ?? so.qty ?? ''
  const [form, setForm] = useState({ qty: remainQty, ship_date: today(), unit_price: '' })
  useEffect(() => { setForm(f => ({ ...f, qty: so.remaining_qty ?? so.qty ?? '', ship_date: today() })) }, [so.so_no])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get(`/master/items/${encodeURIComponent(so.part_no)}`).then(r => {
      const price = r.data?.std_sell_price
      if (price) set('unit_price', price)
    }).catch(() => {})
  }, [so.part_no])
  const submit = async () => {
    if (!form.ship_date) return alert('출하일을 입력하세요')
    if (!form.qty) return alert('출하수량을 입력하세요')
    if (!form.unit_price && form.unit_price !== 0) return alert('판매단가를 입력하세요')
    try {
      await api.post('/sales/shipments', { so_no: so.so_no, qty: +form.qty, ship_date: form.ship_date, unit_price: +form.unit_price })
      onSaved()
    } catch (err) {
      alert('출하 실패: ' + (err.response?.data?.detail || err.message))
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>출하 등록 — {so.so_no}</h3>
        <div className="grid-2">
          <div className="form-group"><label>출하수량</label><input type="number" value={form.qty} onChange={e => set('qty', e.target.value)} /></div>
          <div className="form-group"><label>판매단가</label><input type="number" value={form.unit_price} onChange={e => set('unit_price', e.target.value)} /></div>
        </div>
        <div className="form-group"><label>출하일</label><input type="date" value={form.ship_date} onChange={e => set('ship_date', e.target.value)} /></div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>출하</button>
        </div>
      </div>
    </div>
  )
}

const STATUS_BADGE = { '수주': 'badge-blue', '일부출하': 'badge-amber', '완료': 'badge-green', '취소': 'badge-gray' }

function LsImportModal({ onClose, onDone }) {
  const [partners, setPartners] = useState([])
  const [partnerId, setPartnerId] = useState('')
  const [autoIssue, setAutoIssue] = useState(true)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    api.get('/master/partners').then(r =>
      setPartners(r.data.filter(p => p.partner_type === '고객' || p.partner_type === '공용'))
    )
  }, [])

  const upload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!partnerId) { alert('고객사를 먼저 선택하세요'); return }
    setLoading(true)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post(
        `/import/ls-shipment?partner_id=${encodeURIComponent(partnerId)}&auto_issue=${autoIssue}`,
        fd
      )
      setResult(res.data)
      onDone()
    } catch (err) {
      alert('업로드 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 580 }}>
        <h3>LS Electric 출고내역 임포트</h3>

        {!result ? (
          <>
            <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <b>지원 형식</b>: LS Electric ERP 출고내역 엑셀 그대로 업로드<br/>
              <span style={{ color: '#64748b', fontSize: 12 }}>
                A=품명 / B=품번 / E=출고일 / I=수량 / K=단가 — 헤더행 1행 건너뛰고 읽음
              </span>
            </div>

            <div className="form-group">
              <label>고객사 선택 (LS Electric)</label>
              <select value={partnerId} onChange={e => setPartnerId(e.target.value)}>
                <option value="">선택</option>
                {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name} ({p.partner_id})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={autoIssue} onChange={e => setAutoIssue(e.target.checked)} />
                <span>즉시 발행 + 출하처리 (거래명세서 자동 발행)</span>
              </label>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                체크 해제 시 거래명세서 작성중 상태로 저장 (수동 발행 필요)
              </div>
            </div>

            <div style={{ border: '2px dashed #cbd5e1', borderRadius: 8, padding: '28px 20px', textAlign: 'center', marginBottom: 16, cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 4 }}>클릭하여 파일 선택</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>LS Electric 출고내역 .xlsx 파일</div>
              <input type="file" accept=".xlsx,.xls" ref={fileRef} style={{ display: 'none' }} onChange={upload} />
            </div>

            {loading && (
              <div style={{ textAlign: 'center', padding: 20, color: '#1d4ed8' }}>처리 중...</div>
            )}
          </>
        ) : (
          <div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 8, fontSize: 15 }}>임포트 완료</div>
              <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                <span>처리 행: <b>{result.rows_ok}건</b></span>
                <span>신규 품목: <b>{result.items_created}건</b></span>
                <span>건너뜀: {result.rows_skip}건</span>
              </div>
            </div>

            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>생성된 거래명세서 ({result.invoices?.length}건)</div>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              {result.invoices?.map(inv => (
                <div key={inv.inv_no} style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'monospace', color: '#1d4ed8' }}>{inv.inv_no}</span>
                  <span style={{ color: '#64748b' }}>{inv.ship_date}</span>
                  <span>{inv.lines}개 품목</span>
                  <span className={`badge ${inv.issued ? 'badge-green' : 'badge-amber'}`}>
                    {inv.issued ? '발행완료' : '작성중'}
                  </span>
                </div>
              ))}
            </div>

            {result.errors?.length > 0 && (
              <div style={{ marginTop: 10, color: '#dc2626', fontSize: 12 }}>
                오류 {result.errors.length}건: {result.errors.slice(0, 3).map(e => `${e.row}행: ${e.error}`).join(' / ')}
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{result ? '닫기' : '취소'}</button>
        </div>
      </div>
    </div>
  )
}

function HyundaiShipImportModal({ onClose, onDone }) {
  const [partners, setPartners] = useState([])
  const [partnerId, setPartnerId] = useState('')
  const [autoIssue, setAutoIssue] = useState(true)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    api.get('/master/partners').then(r =>
      setPartners(r.data.filter(p => p.partner_type === '고객' || p.partner_type === '공용'))
    )
  }, [])

  const upload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!partnerId) { alert('고객사를 먼저 선택하세요'); e.target.value = ''; return }
    setLoading(true)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post(
        `/import/hyundai-shipment?partner_id=${encodeURIComponent(partnerId)}&auto_issue=${autoIssue}`,
        fd
      )
      setResult(res.data)
      onDone()
    } catch (err) {
      alert('업로드 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 580 }}>
        <h3>현대 납품현황 임포트</h3>

        {!result ? (
          <>
            <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <b>지원 형식</b>: 현대 납품현황 엑셀 (.xlsx)<br/>
              <span style={{ color: '#64748b', fontSize: 12 }}>
                A=자재번호 / E=단가 / F=입고수량 / I=입고일자 — 입고수량 0인 행은 제외
              </span>
            </div>

            <div className="form-group">
              <label>고객사 선택</label>
              <select value={partnerId} onChange={e => setPartnerId(e.target.value)}>
                <option value="">선택</option>
                {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name} ({p.partner_id})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={autoIssue} onChange={e => setAutoIssue(e.target.checked)} />
                <span>즉시 발행 + 출하처리 (거래명세서 자동 발행)</span>
              </label>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                체크 해제 시 거래명세서 작성중 상태로 저장
              </div>
            </div>

            <div style={{ border: '2px dashed #a5f3fc', borderRadius: 8, padding: '28px 20px', textAlign: 'center', marginBottom: 16, cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 4 }}>클릭하여 파일 선택</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>현대 납품현황 .xlsx 파일</div>
              <input type="file" accept=".xlsx,.xls" ref={fileRef} style={{ display: 'none' }} onChange={upload} />
            </div>

            {loading && <div style={{ textAlign: 'center', padding: 20, color: '#0e7490' }}>처리 중...</div>}
          </>
        ) : (
          <div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 8, fontSize: 15 }}>임포트 완료</div>
              <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                <span>처리 행: <b>{result.rows_ok}건</b></span>
                <span>신규 품목: <b>{result.items_created}건</b></span>
                <span>건너뜀: {result.rows_skip}건</span>
              </div>
            </div>

            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>생성된 거래명세서 ({result.invoices?.length}건)</div>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              {result.invoices?.map(inv => (
                <div key={inv.inv_no} style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'monospace', color: '#0e7490' }}>{inv.inv_no}</span>
                  <span style={{ color: '#64748b' }}>{inv.ship_date}</span>
                  <span>{inv.lines}개 품목</span>
                  <span className={`badge ${inv.issued ? 'badge-green' : 'badge-amber'}`}>
                    {inv.issued ? '발행완료' : '작성중'}
                  </span>
                </div>
              ))}
            </div>

            {result.errors?.length > 0 && (
              <div style={{ marginTop: 10, color: '#dc2626', fontSize: 12 }}>
                오류 {result.errors.length}건: {result.errors.slice(0, 3).map(e => `${e.row}행: ${e.error}`).join(' / ')}
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{result ? '닫기' : '취소'}</button>
        </div>
      </div>
    </div>
  )
}

function DirectShipModal({ onClose, onSaved }) {
  const [customers, setCustomers] = useState([])
  const [allItems, setAllItems] = useState([])
  const [stockMap, setStockMap] = useState({})
  const [partner_id, setPartnerId] = useState('')
  const [ship_date, setShipDate] = useState(today())
  const [note, setNote] = useState('')
  const [lines, setLines] = useState([{ part_no: '', qty: '', unit_price: '' }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/master/partners').then(r => setCustomers(r.data.filter(p => p.partner_type === '고객' || p.partner_type === '공용')))
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
      ? { ...l, part_no, unit_price: item?.std_sell_price ?? l.unit_price }
      : l
    ))
  }

  const submit = async () => {
    if (!partner_id) return alert('고객사를 선택하세요')
    if (!ship_date) return alert('출하일을 입력하세요')
    const valid = lines.filter(l => l.part_no && l.qty)
    if (valid.length === 0) return alert('품목을 1개 이상 입력하세요')
    setSaving(true)
    try {
      for (const l of valid) {
        await api.post('/sales/shipments/direct', {
          partner_id, ship_date, note: note || '직접출하',
          part_no: l.part_no, qty: +l.qty, unit_price: +l.unit_price,
        })
      }
      onSaved()
    } catch (err) {
      alert('출하 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 980, maxWidth: '98vw', maxHeight: '96vh', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: 12 }}>직접 출하 등록</h3>
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '7px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
          수주 없이 바로 출하 처리됩니다. (MCM 등 일정 기반 출하용)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>고객사</label>
            <select value={partner_id} onChange={e => setPartnerId(e.target.value)}>
              <option value="">선택</option>
              {customers.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>출하일</label>
            <input type="date" value={ship_date} onChange={e => setShipDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>비고</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="MCM 출하 등" />
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
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 110 }}>출하수량</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 120 }}>판매단가</th>
                  <th style={{ padding: '7px 8px', borderBottom: '2px solid var(--border)', width: 90, textAlign: 'right' }}>출하후재고</th>
                  <th style={{ width: 36, borderBottom: '2px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const item = allItems.find(it => it.part_no === l.part_no)
                  const stock = l.part_no ? (stockMap[l.part_no] ?? 0) : null
                  const afterStock = stock !== null ? stock - (+l.qty || 0) : null
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
                        fontWeight: 600,
                        color: afterStock === null ? '#ccc' : afterStock < 0 ? '#dc2626' : '#16a34a' }}>
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
          총 {lines.filter(l => l.part_no && l.qty).length}건 출하 등록
          {lines.some(l => l.part_no && l.qty && (stockMap[l.part_no] ?? 0) - (+l.qty) < 0) && (
            <span style={{ color: '#dc2626', marginLeft: 12, fontWeight: 600 }}>⚠ 재고 부족 품목 포함 — 음수 재고로 처리됩니다.</span>
          )}
        </div>

        <div className="modal-footer" style={{ paddingTop: 0 }}>
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? '처리 중...' : '출하 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HyundaiImportModal({ onClose, onDone }) {
  const [partners, setPartners] = useState([])
  const [partnerId, setPartnerId] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    api.get('/master/partners').then(r =>
      setPartners(r.data.filter(p => p.partner_type === '고객' || p.partner_type === '공용'))
    )
  }, [])

  const upload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!partnerId) { alert('고객사를 먼저 선택하세요'); e.target.value = ''; return }
    setLoading(true)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post(
        `/import/hyundai-so?partner_id=${encodeURIComponent(partnerId)}`,
        fd
      )
      setResult(res.data)
      onDone()
    } catch (err) {
      alert('업로드 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 520 }}>
        <h3>현대 수주양식 임포트</h3>
        {!result ? (
          <>
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <b>중복 자동 제외</b>: 동일 품번+수주일+납기일+수량이 이미 등록된 경우 건너뜁니다.<br/>
              <span style={{ color: '#64748b', fontSize: 12 }}>새로 추가된 발주 행만 수주목록에 등록됩니다.</span>
            </div>
            <div className="form-group">
              <label>고객사 선택</label>
              <select value={partnerId} onChange={e => setPartnerId(e.target.value)}>
                <option value="">선택</option>
                {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ border: '2px dashed #cbd5e1', padding: '28px 20px', textAlign: 'center', marginBottom: 16, cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 4 }}>클릭하여 파일 선택</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>현대 수주양식 .xlsx 파일</div>
              <input type="file" accept=".xlsx,.xls" ref={fileRef} style={{ display: 'none' }} onChange={upload} />
            </div>
            {loading && <div style={{ textAlign: 'center', padding: 20, color: '#1d4ed8' }}>처리 중...</div>}
          </>
        ) : (
          <div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 8, fontSize: 15 }}>임포트 완료</div>
              <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                <span>신규 수주: <b>{result.so_created}건</b></span>
                <span>신규 품목: <b>{result.items_created}건</b></span>
                <span>중복 건너뜀: {result.rows_skip}건</span>
              </div>
            </div>
            {result.errors?.length > 0 && (
              <div style={{ color: '#dc2626', fontSize: 12 }}>
                오류 {result.errors.length}건: {result.errors.slice(0, 3).map(e => `${e.row}행: ${e.error}`).join(' / ')}
              </div>
            )}
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{result ? '닫기' : '취소'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Sales() {
  const [orders, setOrders] = useState([])
  const [remaining, setRemaining] = useState([])
  const [shipments, setShipments] = useState([])
  const [tab, setTab] = useState('orders')
  const [showSO, setShowSO] = useState(false)
  const [shipSO, setShipSO] = useState(null)
  const [showLsImport, setShowLsImport] = useState(false)
  const [showHyundaiImport, setShowHyundaiImport] = useState(false)
  const [showHyundaiShipImport, setShowHyundaiShipImport] = useState(false)
  const [showDirectShip, setShowDirectShip] = useState(false)
  const [partnerFilter, setPartnerFilter] = useState('')
  const [shipPartnerFilter, setShipPartnerFilter] = useState('')
  const [shipDateFilter, setShipDateFilter] = useState('month')
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())

  // 월별 필터
  const now = new Date()
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1)
  const [monthAll, setMonthAll] = useState(false)  // 전체보기
  const ym = `${filterYear}-${String(filterMonth).padStart(2,'0')}`
  const yearOptions = [now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1]

  const [editSO, setEditSO] = useState(null) // { so_no, qty, due_date }

  const updateSO = async () => {
    try {
      await api.patch(`/sales/orders/${encodeURIComponent(editSO.so_no)}`, { qty: +editSO.qty, due_date: editSO.due_date })
      setEditSO(null)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || '수정 실패')
    }
  }

  const cancelSO = async (so_no) => {
    if (!window.confirm(`수주 ${so_no}를 취소하시겠습니까?`)) return
    try {
      await api.post(`/sales/orders/${encodeURIComponent(so_no)}/cancel`)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || '취소 실패')
    }
  }

  const load = useCallback(() => {
    return Promise.all([
      api.get('/sales/orders').then(r => setOrders(r.data)).catch(() => {}),
      api.get('/sales/orders/remaining').then(r => setRemaining(r.data)).catch(() => {}),
      api.get('/sales/shipments').then(r => setShipments(r.data)).catch(() => {}),
    ])
  }, [])

  useEffect(() => { load() }, [load])

  const cancelShip = async (sh_no) => {
    if (!confirm(`출하 ${sh_no}를 취소하시겠습니까?\n취소 시 수주 상태로 복원되고 재고가 복구됩니다.`)) return
    try {
      await api.post(`/sales/shipments/${sh_no}/cancel`)
      await load()
      setTab('orders')
    } catch (err) {
      alert('취소 실패: ' + (err.response?.data?.detail || err.message))
    }
  }

  // 탭별 월 필터 적용
  const filteredOrders = monthAll
    ? orders
    : orders.filter(o => (o.due_date || '').startsWith(ym))
  const filteredRemaining = monthAll
    ? remaining
    : remaining.filter(o => (o.due_date || '').startsWith(ym))
  const filteredShipments = monthAll
    ? shipments
    : shipments.filter(s => (s.ship_date || '').startsWith(ym))

  // 월 선택기 공통 컴포넌트
  const MonthPicker = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
      <select
        value={filterYear}
        onChange={e => setFilterYear(+e.target.value)}
        style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1' }}
      >
        {yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}
      </select>
      <select
        value={filterMonth}
        onChange={e => setFilterMonth(+e.target.value)}
        style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1' }}
      >
        {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
      </select>
      <button
        onClick={() => setMonthAll(a => !a)}
        style={{
          fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
          border: '1px solid #cbd5e1',
          background: monthAll ? '#1e40af' : '#f8fafc',
          color: monthAll ? '#fff' : '#475569',
        }}
      >전체</button>
    </div>
  )

  return (
    <div>
      <div className="toolbar">
        <button className={`btn ${tab === 'orders' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('orders')}>수주 목록</button>
        <button className={`btn ${tab === 'remaining' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('remaining')}>미납 잔량</button>
        <button className={`btn ${tab === 'ship' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('ship')}>출하 내역</button>
        <MonthPicker />
        <div className="spacer" />
        {tab === 'ship' && (() => {
          const btnStyle = (active) => ({
            padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer', border: '1px solid #cbd5e1',
            background: active ? '#1e40af' : '#f8fafc', color: active ? '#fff' : '#475569', fontWeight: active ? 600 : 400,
          })
          return (
            <>
              {['today','week','month','all'].map(f => (
                <button key={f} style={btnStyle(shipDateFilter === f)} onClick={() => setShipDateFilter(f)}>
                  {f === 'today' ? '오늘' : f === 'week' ? '이번주' : f === 'month' ? '이번달' : '전체'}
                </button>
              ))}
            </>
          )
        })()}
        <button className="btn btn-outline"
          style={{ borderColor: '#0f766e', color: '#0f766e', fontWeight: 600 }}
          onClick={() => setShowDirectShip(true)}>
          직접 출하 등록
        </button>
        <button className="btn btn-outline"
          style={{ borderColor: '#7c3aed', color: '#7c3aed', fontWeight: 600 }}
          onClick={() => setShowHyundaiImport(true)}>
          현대 수주 임포트
        </button>
        <button className="btn btn-outline"
          style={{ borderColor: '#0891b2', color: '#0e7490', fontWeight: 600 }}
          onClick={() => setShowHyundaiShipImport(true)}>
          현대 출고내역 임포트
        </button>
        <button className="btn btn-outline"
          style={{ borderColor: '#f59e0b', color: '#b45309', fontWeight: 600 }}
          onClick={() => setShowLsImport(true)}>
          LS 출고내역 임포트
        </button>
        <button className="btn btn-primary" onClick={() => setShowSO(true)}>+ 수주 등록</button>
      </div>

      {tab === 'orders' && (() => {
        const partners = [...new Set(filteredOrders.map(o => o.partner_id))].filter(Boolean).sort()
        const counts = {}
        filteredOrders.forEach(o => { counts[o.partner_id] = (counts[o.partner_id] || 0) + 1 })
        const totalActive = filteredOrders.filter(o => o.status !== '취소').length
        return (
          <div style={{ display: 'flex', gap: 6, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginRight: 4 }}>고객사</span>
            <button
              onClick={() => setPartnerFilter('')}
              style={{
                padding: '4px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: '1.5px solid',
                borderColor: !partnerFilter ? '#1e40af' : '#cbd5e1',
                background: !partnerFilter ? '#1e40af' : '#fff',
                color: !partnerFilter ? '#fff' : '#475569',
                fontWeight: !partnerFilter ? 700 : 400,
              }}>
              전체 <span style={{ opacity: 0.75 }}>({filteredOrders.length})</span>
            </button>
            {partners.map(p => (
              <button key={p}
                onClick={() => setPartnerFilter(p === partnerFilter ? '' : p)}
                style={{
                  padding: '4px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: '1.5px solid',
                  borderColor: partnerFilter === p ? '#1e40af' : '#cbd5e1',
                  background: partnerFilter === p ? '#1e40af' : '#fff',
                  color: partnerFilter === p ? '#fff' : '#475569',
                  fontWeight: partnerFilter === p ? 700 : 400,
                }}>
                {p} <span style={{ opacity: 0.75 }}>({counts[p] || 0})</span>
              </button>
            ))}
          </div>
        )
      })()}

      {tab === 'orders' && (
        <div className="table-wrap">
          <table style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: 140 }} />{/* 수주번호 */}
              <col style={{ width: 110 }} />{/* 고객사 */}
              <col style={{ width: 120 }} />{/* 품번 */}
              <col />{/* 품명 — 나머지 공간 */}
              <col style={{ width: 80 }} />{/* 수주수량 */}
              <col style={{ width: 90 }} />{/* 수주일 */}
              <col style={{ width: 90 }} />{/* Due Date */}
              <col style={{ width: 70 }} />{/* 상태 */}
              <col style={{ width: 60 }} />{/* 출하 */}
              <col style={{ width: 90 }} />{/* 수정 */}
              <col style={{ width: 60 }} />{/* 취소 */}
            </colgroup>
            <thead><tr><th>수주번호</th><th>고객사</th><th>품번</th><th>품명</th><th>수주수량</th><th>수주일</th><th>Due Date</th><th>상태</th><th>출하</th><th>수정</th><th>취소</th></tr></thead>
            <tbody>
              {filteredOrders.filter(o => !partnerFilter || o.partner_id === partnerFilter).length === 0 && <tr><td colSpan={11} className="empty">수주 없음</td></tr>}
              {filteredOrders.filter(o => !partnerFilter || o.partner_id === partnerFilter).map(o => (
                <tr key={o.so_no}>
                  <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.so_no}</span></td>
                  <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.partner_id}</td>
                  <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.part_no}</td>
                  <td style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.item_name}</td>
                  <td>
                    {editSO?.so_no === o.so_no
                      ? <input type="number" value={editSO.qty} onChange={e => setEditSO(s => ({ ...s, qty: e.target.value }))}
                          style={{ width: 70, padding: '2px 4px', border: '1px solid #1d4ed8', borderRadius: 3, fontSize: 12 }} />
                      : o.qty?.toLocaleString()}
                  </td>
                  <td>{o.order_date}</td>
                  <td>
                    {editSO?.so_no === o.so_no
                      ? <input type="date" value={editSO.due_date} onChange={e => setEditSO(s => ({ ...s, due_date: e.target.value }))}
                          style={{ padding: '2px 4px', border: '1px solid #1d4ed8', borderRadius: 3, fontSize: 12 }} />
                      : o.due_date}
                  </td>
                  <td><span className={`badge ${STATUS_BADGE[o.status] || 'badge-gray'}`}>{o.status}</span></td>
                  <td>{(o.status === '수주' || o.status === '일부출하') && <button className="btn btn-sm btn-primary" onClick={() => setShipSO(o)}>출하</button>}</td>
                  <td>
                    {editSO?.so_no === o.so_no
                      ? <><button className="btn btn-sm btn-primary" onClick={updateSO}>저장</button>{' '}<button className="btn btn-sm btn-outline" onClick={() => setEditSO(null)}>취소</button></>
                      : o.status !== '취소' && <button className="btn btn-sm btn-outline" onClick={() => setEditSO({ so_no: o.so_no, qty: o.qty, due_date: o.due_date })}>수정</button>}
                  </td>
                  <td>{o.status !== '취소' && o.status !== '출하완료' && <button className="btn btn-sm btn-danger" onClick={() => cancelSO(o.so_no)}>취소</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'remaining' && (() => {
        const remPartners = [...new Set(filteredRemaining.map(o => o.partner_id))].filter(Boolean).sort()
        const remCounts = {}
        filteredRemaining.forEach(o => { remCounts[o.partner_id] = (remCounts[o.partner_id] || 0) + 1 })
        const filtered = filteredRemaining.filter(o => !partnerFilter || o.partner_id === partnerFilter)
        return (
          <div>
            <div style={{ display: 'flex', gap: 6, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginRight: 4 }}>고객사</span>
              <button onClick={() => setPartnerFilter('')} style={{
                fontSize: 12, padding: '3px 12px', borderRadius: 20, border: '1px solid',
                cursor: 'pointer', borderColor: !partnerFilter ? '#1e40af' : '#cbd5e1',
                background: !partnerFilter ? '#1e40af' : '#fff', color: !partnerFilter ? '#fff' : '#475569', fontWeight: !partnerFilter ? 700 : 400,
              }}>전체 ({remaining.length})</button>
              {remPartners.map(p => (
                <button key={p} onClick={() => setPartnerFilter(p)} style={{
                  fontSize: 12, padding: '3px 12px', borderRadius: 20, border: '1px solid',
                  cursor: 'pointer', borderColor: partnerFilter === p ? '#1e40af' : '#cbd5e1',
                  background: partnerFilter === p ? '#1e40af' : '#fff', color: partnerFilter === p ? '#fff' : '#475569', fontWeight: partnerFilter === p ? 700 : 400,
                }}>{p} ({remCounts[p] || 0})</button>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>수주번호</th><th>고객사</th><th>품번</th><th>품명</th><th>수주량</th><th>출하량</th><th style={{ color: 'var(--danger)' }}>미납잔량</th><th>Due Date</th></tr></thead>
                <tbody>
                  {filtered.length === 0 && <tr><td colSpan={8} className="empty">미납 없음</td></tr>}
                  {filtered.map(o => (
                    <tr key={o.so_no}>
                      <td>{o.so_no}</td>
                      <td>{o.partner_id}</td>
                      <td>{o.part_no}</td>
                      <td style={{ color: '#475569' }}>{o.item_name}</td>
                      <td>{o.qty?.toLocaleString()}</td>
                      <td>{o.shipped_qty?.toLocaleString()}</td>
                      <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{o.remaining_qty?.toLocaleString()}</td>
                      <td>{o.due_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {tab === 'ship' && (() => {
        const shipPartners = [...new Set(filteredShipments.map(s => s.partner_id))].filter(Boolean).sort()
        const shipCounts = {}
        filteredShipments.forEach(s => { shipCounts[s.partner_id] = (shipCounts[s.partner_id] || 0) + 1 })
        return (
          <div style={{ display: 'flex', gap: 6, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginRight: 4 }}>고객사</span>
            <button
              onClick={() => setShipPartnerFilter('')}
              style={{
                padding: '4px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: '1.5px solid',
                borderColor: !shipPartnerFilter ? '#1e40af' : '#cbd5e1',
                background: !shipPartnerFilter ? '#1e40af' : '#fff',
                color: !shipPartnerFilter ? '#fff' : '#475569',
                fontWeight: !shipPartnerFilter ? 700 : 400,
              }}>
              전체 <span style={{ opacity: 0.75 }}>({filteredShipments.length})</span>
            </button>
            {shipPartners.map(p => (
              <button key={p}
                onClick={() => setShipPartnerFilter(p === shipPartnerFilter ? '' : p)}
                style={{
                  padding: '4px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: '1.5px solid',
                  borderColor: shipPartnerFilter === p ? '#1e40af' : '#cbd5e1',
                  background: shipPartnerFilter === p ? '#1e40af' : '#fff',
                  color: shipPartnerFilter === p ? '#fff' : '#475569',
                  fontWeight: shipPartnerFilter === p ? 700 : 400,
                }}>
                {p} <span style={{ opacity: 0.75 }}>({shipCounts[p] || 0})</span>
              </button>
            ))}
          </div>
        )
      })()}

      {tab === 'ship' && (() => {
        // 날짜 필터
        const today = new Date()
        const todayStr = today.toISOString().slice(0, 10)
        const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay() + 1)
        const weekStartStr = weekStart.toISOString().slice(0, 10)
        const monthStartStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`

        const filtered = filteredShipments.filter(s => {
          if (s.status === 'cancelled') return false
          if (shipPartnerFilter && s.partner_id !== shipPartnerFilter) return false
          if (shipDateFilter === 'today') return s.ship_date === todayStr
          if (shipDateFilter === 'week') return s.ship_date >= weekStartStr
          if (shipDateFilter === 'month') return s.ship_date >= monthStartStr
          return true
        })

        // 고객사 + 출하일 기준 그룹핑
        const groups = {}
        filtered.forEach(s => {
          const key = `${s.partner_id || ''}||${s.ship_date}`
          if (!groups[key]) groups[key] = { partner_id: s.partner_id, partner_name: s.partner_name, ship_date: s.ship_date, rows: [] }
          groups[key].rows.push(s)
        })
        const groupList = Object.values(groups).sort((a, b) => b.ship_date.localeCompare(a.ship_date))

        const toggleGroup = (key) => {
          setCollapsedGroups(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
          })
        }

        return (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>출하번호</th>
                  <th>수주번호</th>
                  <th>품번</th>
                  <th>수량</th>
                  <th>단가</th>
                  <th>출하일</th>
                  <th>상태</th>
                  <th>취소</th>
                </tr>
              </thead>
              <tbody>
                {groupList.length === 0 && <tr><td colSpan={9} className="empty">출하 없음</td></tr>}
                {groupList.map(g => {
                  const key = `${g.partner_id}||${g.ship_date}`
                  const collapsed = collapsedGroups.has(key)
                  const total = g.rows.filter(r => r.status === '확정').reduce((s, r) => s + r.qty * Number(r.unit_price), 0)
                  return (
                    <>
                      {/* 그룹 헤더 */}
                      <tr key={`hdr-${key}`}
                        onClick={() => toggleGroup(key)}
                        style={{ background: '#dbeafe', cursor: 'pointer', userSelect: 'none' }}>
                        <td style={{ textAlign: 'center', fontSize: 14, color: '#1e40af' }}>
                          {collapsed ? '▶' : '▼'}
                        </td>
                        <td colSpan={5} style={{ fontWeight: 700, fontSize: 13 }}>
                          {g.partner_name || g.partner_id}&nbsp;&nbsp;
                          <span style={{ color: '#1d4ed8' }}>{g.ship_date}</span>
                          <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                            ({g.rows.length}건 / 합계 ₩{total.toLocaleString()})
                          </span>
                        </td>
                        <td colSpan={3} style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <button className="btn btn-sm btn-primary"
                            onClick={() => window.open(
                              `${api.defaults.baseURL}/sales/shipments/print-bundle?partner_id=${encodeURIComponent(g.partner_id)}&ship_date=${g.ship_date}`,
                              '_blank'
                            )}>
                            거래명세서 PDF
                          </button>
                        </td>
                      </tr>
                      {/* 개별 행 — 접히면 숨김 */}
                      {!collapsed && g.rows.map(s => (
                        <tr key={s.sh_no} style={{ background: '#fafbfc' }}>
                          <td></td>
                          <td style={{ paddingLeft: 12, fontFamily: 'monospace', fontSize: 12 }}>{s.sh_no}</td>
                          <td style={{ fontSize: 12 }}>{s.so_no}</td>
                          <td style={{ fontSize: 12 }}>{s.part_no}</td>
                          <td>{s.qty?.toLocaleString()}</td>
                          <td>₩{fmtPrice(s.unit_price)}</td>
                          <td>{s.ship_date}</td>
                          <td><span className={`badge ${s.status === '확정' ? 'badge-green' : s.status === '취소' ? 'badge-red' : 'badge-amber'}`}>{s.status}</span></td>
                          <td>{s.status !== '취소' && <button className="btn btn-sm btn-danger" onClick={() => cancelShip(s.sh_no)}>취소</button>}</td>
                        </tr>
                      ))}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}

      {showSO && <SalesOrderModal onClose={() => setShowSO(false)} onSaved={() => { setShowSO(false); load() }} />}
      {shipSO && <ShipModal so={shipSO} onClose={() => setShipSO(null)} onSaved={() => { setShipSO(null); load() }} />}
      {showLsImport && <LsImportModal onClose={() => setShowLsImport(false)} onDone={load} />}
      {showHyundaiImport && <HyundaiImportModal onClose={() => setShowHyundaiImport(false)} onDone={load} />}
      {showHyundaiShipImport && <HyundaiShipImportModal onClose={() => setShowHyundaiShipImport(false)} onDone={load} />}
      {showDirectShip && <DirectShipModal onClose={() => setShowDirectShip(false)} onSaved={() => { setShowDirectShip(false); load() }} />}
    </div>
  )
}
