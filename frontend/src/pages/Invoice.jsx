import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import api from '../api'

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
        padding: '4px 8px', border: `1.5px solid ${open ? '#1d4ed8' : '#cbd5e1'}`,
        borderRadius: 4, cursor: 'pointer', fontSize: 12, background: '#fff',
        minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: open ? '0 0 0 3px #bfdbfe' : 'none', userSelect: 'none',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected
            ? <><span style={{ fontFamily: 'monospace', color: '#1d4ed8', fontSize: 11 }}>{selected.part_no}</span><span style={{ marginLeft: 6, color: '#374151' }}>{selected.name}</span></>
            : <span style={{ color: '#aaa' }}>품목 선택...</span>}
        </span>
        <span style={{ color: '#94a3b8', fontSize: 10, marginLeft: 6, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
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
                  <span style={{ color: '#374151', flex: 1 }}>{it.name}</span>
                  {it.std_sell_price > 0 && <span style={{ color: '#64748b', flexShrink: 0 }}>₩{Number(it.std_sell_price).toLocaleString()}</span>}
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

const STATUS_BADGE = {
  '작성중': 'badge-amber',
  '발행완료': 'badge-green',
  '취소': 'badge-gray',
}

function InvoiceModal({ editInv, onClose, onSaved }) {
  const [customers, setCustomers] = useState([])
  const [items, setItems] = useState([])
  const [itemSearch, setItemSearch] = useState('')
  const [partner_id, setPartnerId] = useState(editInv?.partner_id || '')
  const [issue_date, setIssueDate] = useState(editInv?.issue_date || new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState(editInv?.note || '')
  const [lines, setLines] = useState(
    editInv?.lines?.map(l => ({ part_no: l.part_no, qty: String(l.qty), unit_price: String(l.unit_price) })) || []
  )

  useEffect(() => {
    api.get('/master/partners').then(r => setCustomers(r.data.filter(p => p.partner_type === '고객' || p.partner_type === '공용')))
    api.get('/master/items').then(r => setItems(r.data))
  }, [])

const addLine = () => setLines(prev => [...prev, { part_no: '', qty: '', unit_price: '' }])
  const removeLine = (i) => setLines(prev => prev.filter((_, idx) => idx !== i))
  const setLine = (i, field, val) => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l))

  const onPartChange = (i, part_no) => {
    const item = items.find(it => it.part_no === part_no)
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, part_no, unit_price: item?.std_sell_price ? String(item.std_sell_price) : l.unit_price } : l))
  }

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0)

  const submit = async () => {
    if (!partner_id) return alert('고객사를 선택해주세요')
    if (lines.length === 0) return alert('품목을 추가해주세요')
    const body = {
      partner_id,
      issue_date,
      note: note || null,
      lines: lines.map(l => ({ part_no: l.part_no, qty: +l.qty, unit_price: +l.unit_price })),
    }
    if (editInv) {
      await api.patch(`/invoices/${editInv.inv_no}`, body)
    } else {
      await api.post('/invoices', body)
    }
    onSaved()
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 720, width: '95%' }}>
        <h3>{editInv ? '거래명세서 수정' : '거래명세서 작성'}</h3>

        <div className="grid-2">
          <div className="form-group">
            <label>고객사</label>
            <select value={partner_id} onChange={e => setPartnerId(e.target.value)}>
              <option value="">선택</option>
              {customers.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>발행일</label>
            <input type="date" value={issue_date} onChange={e => setIssueDate(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>비고</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="선택사항" />
        </div>

        {/* 품목 라인 */}
        <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13 }}>품목 명세</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#eff6ff' }}>
              <th style={{ padding: '6px 8px', border: '1px solid #ddd', width: '32%' }}>품번</th>
              <th style={{ padding: '6px 8px', border: '1px solid #ddd', width: '18%' }}>수량</th>
              <th style={{ padding: '6px 8px', border: '1px solid #ddd', width: '22%' }}>단가</th>
              <th style={{ padding: '6px 8px', border: '1px solid #ddd', width: '20%' }}>금액</th>
              <th style={{ padding: '6px 8px', border: '1px solid #ddd', width: '8%' }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ padding: '4px 6px', border: '1px solid #eee' }}>
                  <ItemSearchSelect
                    value={l.part_no}
                    items={items}
                    onChange={v => onPartChange(i, v)}
                  />
                </td>
                <td style={{ padding: '4px 6px', border: '1px solid #eee' }}>
                  <input type="number" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)} style={{ width: '100%', textAlign: 'right' }} />
                </td>
                <td style={{ padding: '4px 6px', border: '1px solid #eee' }}>
                  <input type="number" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)} style={{ width: '100%', textAlign: 'right' }} />
                </td>
                <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right', fontWeight: 600 }}>
                  ₩{((Number(l.qty) || 0) * (Number(l.unit_price) || 0)).toLocaleString()}
                </td>
                <td style={{ padding: '4px 6px', border: '1px solid #eee', textAlign: 'center' }}>
                  <button className="btn btn-sm btn-danger" onClick={() => removeLine(i)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button className="btn btn-sm btn-outline" onClick={addLine}>+ 품목 추가</button>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1d4ed8' }}>
            합계: ₩{total.toLocaleString()}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장 (임시)</button>
        </div>
      </div>
    </div>
  )
}

// ── 업체별 월별 매출 집계표 ──────────────────────────────────────
function SalesSummaryTable() {
  const [data, setData] = useState(null)
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    api.get('/invoices/summary/by-partner-month')
      .then(r => setData(r.data))
      .catch(() => setData({}))
  }, [])

  if (!data) return <div style={{ padding: 24, color: '#888' }}>로딩 중...</div>

  // 해당 연도 달만 필터
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const partners = Object.keys(data).sort()

  if (partners.length === 0)
    return <div style={{ padding: 24, color: '#888' }}>발행완료 명세서가 없습니다.</div>

  const colStyle = { textAlign: 'right', padding: '6px 10px', fontSize: 12 }
  const hStyle = { padding: '7px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>업체별 월별 매출 현황</span>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          style={{ padding: '4px 8px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 4 }}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#64748b' }}>※ 이월 설정 시 다음 달로 반영됨</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 900, fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#1e3a5f', color: '#fff' }}>
              <th style={{ ...hStyle, textAlign: 'left', color: '#fff', minWidth: 120 }}>업체명</th>
              {months.map(m => (
                <th key={m} style={{ ...hStyle, color: '#fff', minWidth: 80 }}>
                  {m.slice(5)}월
                </th>
              ))}
              <th style={{ ...hStyle, color: '#fbbf24', minWidth: 100 }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p, pi) => {
              const rowTotal = months.reduce((s, m) => s + (data[p]?.[m] || 0), 0)
              return (
                <tr key={p} style={{ background: pi % 2 === 0 ? '#f8fafc' : '#fff' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 600, fontSize: 12, borderRight: '1px solid #e2e8f0' }}>{p}</td>
                  {months.map(m => (
                    <td key={m} style={{ ...colStyle, borderRight: '1px solid #f1f5f9', color: data[p]?.[m] ? '#1e293b' : '#cbd5e1' }}>
                      {data[p]?.[m] ? `₩${data[p][m].toLocaleString()}` : '—'}
                    </td>
                  ))}
                  <td style={{ ...colStyle, fontWeight: 700, color: '#1d4ed8', borderLeft: '2px solid #e2e8f0' }}>
                    ₩{rowTotal.toLocaleString()}
                  </td>
                </tr>
              )
            })}
            {/* 월계 합계행 */}
            <tr style={{ background: '#1e3a5f', color: '#fff' }}>
              <td style={{ padding: '6px 10px', fontWeight: 700, fontSize: 12 }}>월 합계</td>
              {months.map(m => {
                const mTotal = partners.reduce((s, p) => s + (data[p]?.[m] || 0), 0)
                return (
                  <td key={m} style={{ ...colStyle, color: mTotal ? '#fff' : '#4b6082', fontWeight: 600 }}>
                    {mTotal ? `₩${mTotal.toLocaleString()}` : '—'}
                  </td>
                )
              })}
              <td style={{ ...colStyle, fontWeight: 800, color: '#fbbf24' }}>
                ₩{partners.reduce((s, p) => s + months.reduce((ss, m) => ss + (data[p]?.[m] || 0), 0), 0).toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thisYM = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

export default function Invoice() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editInv, setEditInv] = useState(null)
  const [activeTab, setActiveTab] = useState('list')

  // 필터 상태 — 기본값: 이번 달
  const [filterMonth, setFilterMonth] = useState(thisYM())
  const [filterPartner, setFilterPartner] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.get('/invoices')
      .then(r => { setInvoices(r.data); setLoading(false) })
      .catch(e => { console.error('Invoice load error:', e); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  // 고객사 목록 (필터용)
  const partners = [...new Set(invoices.map(i => i.partner_name || i.partner_id))].sort()

  // 월 목록 (필터 드롭다운용 — 전체 기간)
  const monthOptions = [...new Set(invoices.map(i => i.issue_date.slice(0, 7)))].sort().reverse()

  // 필터 적용
  const filtered = invoices.filter(inv => {
    if (filterMonth && inv.issue_date.slice(0, 7) !== filterMonth) return false
    if (filterPartner && (inv.partner_name || inv.partner_id) !== filterPartner) return false
    if (filterStatus && inv.status !== filterStatus) return false
    return true
  })

  const issue = async (inv_no) => {
    if (!confirm('발행하면 출하처리가 자동으로 됩니다. 발행하시겠습니까?')) return
    await api.post(`/invoices/${inv_no}/issue`)
    load()
  }

  const cancel = async (inv_no, isIssued) => {
    const msg = isIssued
      ? '발행완료 거래명세서를 취소하면 출하내역과 재고도 함께 역분개됩니다.\n정말 취소하시겠습니까?'
      : '거래명세서를 취소하시겠습니까?'
    if (!confirm(msg)) return
    await api.post(`/invoices/${inv_no}/cancel`)
    load()
  }

  const printInv = (inv_no) => {
    window.open(`${api.defaults.baseURL}/invoices/${inv_no}/print`, '_blank')
  }

  const setClosing = async (inv_no, currentType) => {
    const next = currentType == null ? '금월' : currentType === '금월' ? '이월' : null
    const params = next ? `?closing_type=${next}` : ''
    await api.patch(`/invoices/${inv_no}/closing${params}`)
    load()
  }

  const CLOSING_STYLE = {
    null:  { label: '미설정', bg: '#f1f5f9', color: '#94a3b8', border: '#cbd5e1' },
    '금월': { label: '금월마감', bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
    '이월': { label: '이월',   bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
  }

  const tabStyle = (t) => ({
    padding: '7px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
    color: activeTab === t ? '#1d4ed8' : '#64748b',
    background: 'none', border: 'none',
    borderBottom: activeTab === t ? '2px solid #1d4ed8' : '2px solid transparent',
  })

  const selStyle = {
    padding: '5px 10px', fontSize: 12, border: '1px solid #cbd5e1',
    borderRadius: 5, background: '#fff', cursor: 'pointer', height: 30,
  }

  // 필터된 합계
  const filteredTotal = filtered.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)

  return (
    <div>
      <div className="erp-panel" style={{marginBottom:8}}>
        <div className="erp-grid-2" style={{gridTemplateColumns:'auto 1fr auto 1fr auto 1fr'}}>
          <div className="erp-label">기간</div>
          <div className="erp-value">
            <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={{border:'none',background:'transparent',fontSize:13}}>
              <option value="">전체 기간</option>
              {monthOptions.map(m=><option key={m} value={m}>{m.slice(0,4)}년 {m.slice(5)}월</option>)}
            </select>
          </div>
          <div className="erp-label">고객사</div>
          <div className="erp-value">
            <select value={filterPartner} onChange={e=>setFilterPartner(e.target.value)} style={{border:'none',background:'transparent',fontSize:13}}>
              <option value="">전체</option>
              {partners.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="erp-label">상태</div>
          <div className="erp-value">
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{border:'none',background:'transparent',fontSize:13}}>
              <option value="">전체</option>
              <option value="작성중">작성중</option>
              <option value="발행완료">발행완료</option>
              <option value="취소">취소</option>
            </select>
          </div>
        </div>
        <div className="erp-actions">
          <div className="qdate-bar">
            {[['list','명세서 목록'],['summary','업체별 월별 매출']].map(([v,l])=>(
              <button key={v} className={`qdate-btn${activeTab===v?' active':''}`} onClick={()=>setActiveTab(v)}>{l}</button>
            ))}
          </div>
          {(filterMonth !== thisYM() || filterPartner || filterStatus) && (
            <button className="btn btn-sm btn-outline" onClick={()=>{setFilterMonth(thisYM());setFilterPartner('');setFilterStatus('')}}>초기화</button>
          )}
          <div className="spacer"/>
          {activeTab==='list' && (
            <button className="btn btn-sm btn-primary" onClick={()=>{setEditInv(null);setShowModal(true)}}>＋ 거래명세서 작성</button>
          )}
        </div>
      </div>

      {activeTab === 'summary' && (
        <div style={{ padding: '16px 0' }}>
          <SalesSummaryTable key={invoices.length} />
        </div>
      )}

      {activeTab === 'list' && (
        <>
          <div className="result-bar">
            <span className="result-bar-title">거래명세서 목록</span>
            <span className="result-bar-count">{filtered.length}건</span>
            <span style={{marginLeft:12,color:'#1d4ed8',fontWeight:700,fontSize:12}}>₩{filteredTotal.toLocaleString()}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>문서번호</th>
                  <th>고객사</th>
                  <th>발행일</th>
                  <th>품목수</th>
                  <th>합계금액</th>
                  <th>상태</th>
                  <th>마감구분</th>
                  <th>출하처리</th>
                  <th>PDF</th>
                  <th>취소</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={10} className="empty">불러오는 중...</td></tr>}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={10} className="empty">
                    {invoices.length > 0 ? '조건에 맞는 명세서가 없습니다' : '거래명세서 없음'}
                  </td></tr>
                )}
                {filtered.map(inv => {
                  const day = new Date(inv.issue_date).getDate()
                  const canSetClosing = day >= 25 && inv.status === '발행완료'
                  const cs = CLOSING_STYLE[inv.closing_type] || CLOSING_STYLE[null]
                  return (
                    <tr key={inv.inv_no}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.inv_no}</td>
                      <td>{inv.partner_name || inv.partner_id}</td>
                      <td>{inv.issue_date}</td>
                      <td style={{ textAlign: 'center' }}>{inv.lines?.length || 0}건</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>₩{Number(inv.total_amount)?.toLocaleString()}</td>
                      <td><span className={`badge ${STATUS_BADGE[inv.status] || 'badge-gray'}`}>{inv.status}</span></td>
                      <td style={{ textAlign: 'center' }}>
                        {canSetClosing ? (
                          <button
                            onClick={() => setClosing(inv.inv_no, inv.closing_type)}
                            style={{
                              padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              background: cs.bg, color: cs.color, border: `1px solid ${cs.border}`,
                              borderRadius: 12, whiteSpace: 'nowrap',
                            }}
                            title="클릭: 미설정 → 금월마감 → 이월 → 미설정"
                          >
                            {cs.label}
                          </button>
                        ) : (
                          <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                        )}
                      </td>
                      <td>
                        {inv.status === '작성중' && (
                          <button className="btn btn-sm btn-primary" onClick={() => issue(inv.inv_no)}>
                            발행 (출하처리)
                          </button>
                        )}
                        {inv.status === '발행완료' && (
                          <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 600 }}>✓ 출하완료</span>
                        )}
                      </td>
                      <td>
                        {inv.status === '발행완료' && (
                          <button className="btn btn-sm btn-outline" onClick={() => printInv(inv.inv_no)}>PDF</button>
                        )}
                      </td>
                      <td>
                        {inv.status === '작성중' && (
                          <>
                            <button className="btn btn-sm btn-outline" onClick={() => { setEditInv(inv); setShowModal(true) }}
                              style={{ marginRight: 4 }}>수정</button>
                            <button className="btn btn-sm btn-danger" onClick={() => cancel(inv.inv_no, false)}>취소</button>
                          </>
                        )}
                        {inv.status === '발행완료' && (
                          <button className="btn btn-sm btn-danger" onClick={() => cancel(inv.inv_no, true)}>취소</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <InvoiceModal
          editInv={editInv}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
