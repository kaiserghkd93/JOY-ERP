import { useEffect, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import api from '../api'

const LEDGER_TYPE_BADGE = {
  '입고': 'badge-green', '출고': 'badge-red', '생산입고': 'badge-blue',
  '재고조정': 'badge-amber', '취소': 'badge-gray',
}

function LedgerModal({ item, onClose, onAdjusted }) {
  const { part_no, name, current_stock } = item
  const [ledger, setLedger] = useState([])
  const [loading, setLoading] = useState(true)
  const [adjustMode, setAdjustMode] = useState(false)
  const [targetQty, setTargetQty] = useState(String(current_stock))
  const [adjNote, setAdjNote] = useState('초기재고 입력')
  const [saving, setSaving] = useState(false)

  const loadLedger = useCallback(() => {
    setLoading(true)
    api.get(`/stock/ledger/${part_no}`).then(r => {
      setLedger(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [part_no])

  useEffect(() => { loadLedger() }, [loadLedger])

  let running = 0
  const rows = ledger.map(l => {
    running += l.qty
    return { ...l, balance: running }
  })

  const saveAdjust = async () => {
    const qty = parseInt(targetQty)
    if (isNaN(qty) || qty < 0) return alert('올바른 수량을 입력하세요')
    setSaving(true)
    try {
      await api.post(`/stock/set-stock?part_no=${encodeURIComponent(part_no)}&target_qty=${qty}&note=${encodeURIComponent(adjNote)}`)
      setAdjustMode(false)
      loadLedger()
      onAdjusted()
    } finally {
      setSaving(false)
    }
  }

  const exportLedger = () => {
    const data = [
      ['날짜', '구분', '입출고', '단가', '잔량', '참조문서', '비고'],
      ...rows.map(r => [r.txn_date, r.ledger_type, r.qty, r.unit_price, r.balance, r.ref_no || '', r.note || '']),
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '수불부')
    XLSX.writeFile(wb, `수불부_${part_no}.xlsx`)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 780, maxWidth: '98vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>수불부 — {part_no} ({name})</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-outline" onClick={exportLedger}>Excel</button>
            <button className="btn btn-sm btn-primary" onClick={() => setAdjustMode(true)}>재고 수정</button>
          </div>
        </div>

        {/* 재고 수동 조정 폼 */}
        {adjustMode && (
          <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: '#854d0e' }}>재고 수동 입력</div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>
              현재고: <b>{current_stock.toLocaleString()}</b> →
              입력한 수량으로 자동 조정 전표가 생성됩니다.
            </div>
            <div className="grid-2" style={{ maxWidth: 480 }}>
              <div className="form-group">
                <label>설정할 재고수량</label>
                <input
                  type="number"
                  value={targetQty}
                  onChange={e => setTargetQty(e.target.value)}
                  style={{ fontWeight: 700, fontSize: 16 }}
                  min={0}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>사유</label>
                <input
                  type="text"
                  value={adjNote}
                  onChange={e => setAdjNote(e.target.value)}
                  placeholder="초기재고 입력, 실사조정 등"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn btn-primary btn-sm" onClick={saveAdjust} disabled={saving}>
                {saving ? '저장 중...' : '확인'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setAdjustMode(false)}>취소</button>
            </div>
          </div>
        )}

        <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>구분</th>
                <th style={{ textAlign: 'right' }}>입출고량</th>
                <th style={{ textAlign: 'right' }}>단가</th>
                <th style={{ textAlign: 'right', color: '#1d4ed8' }}>잔량</th>
                <th>참조문서</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="empty">로딩 중…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="empty">입출고 이력 없음</td></tr>}
              {rows.map(l => (
                <tr key={l.id}>
                  <td>{l.txn_date}</td>
                  <td><span className={`badge ${LEDGER_TYPE_BADGE[l.ledger_type] || 'badge-gray'}`}>{l.ledger_type}</span></td>
                  <td style={{ textAlign: 'right', color: l.qty > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {l.qty > 0 ? '+' : ''}{l.qty.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>{l.unit_price ? `₩${Number(l.unit_price).toLocaleString()}` : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{l.balance.toLocaleString()}</td>
                  <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{l.ref_no || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-sm)' }}>{l.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function SetStockModal({ item, onClose, onSaved }) {
  const [qty, setQty] = useState(String(item.current_stock))
  const [note, setNote] = useState('초기재고 입력')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const n = parseInt(qty)
    if (isNaN(n) || n < 0) return alert('올바른 수량을 입력하세요')
    setSaving(true)
    try {
      await api.post(`/stock/set-stock?part_no=${encodeURIComponent(item.part_no)}&target_qty=${n}&note=${encodeURIComponent(note)}`)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 420 }}>
        <h3>재고 수동 입력 — {item.part_no}</h3>
        <div style={{ marginBottom: 10, color: '#555', fontSize: 13 }}>
          {item.name} &nbsp;·&nbsp; 현재고: <b>{item.current_stock.toLocaleString()}</b>
        </div>
        <div className="form-group">
          <label>설정할 재고수량</label>
          <input
            type="number"
            value={qty}
            onChange={e => setQty(e.target.value)}
            style={{ fontWeight: 700, fontSize: 20, textAlign: 'center' }}
            min={0}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && save()}
          />
        </div>
        <div className="form-group">
          <label>사유</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="초기재고 입력, 실사조정 등" />
        </div>
        {parseInt(qty) !== item.current_stock && !isNaN(parseInt(qty)) && (
          <div style={{ background: '#eff6ff', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
            조정량: <b style={{ color: parseInt(qty) > item.current_stock ? '#16a34a' : '#dc2626' }}>
              {parseInt(qty) > item.current_stock ? '+' : ''}{parseInt(qty) - item.current_stock}
            </b>
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? '저장 중...' : '재고 설정'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Inventory() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('외주품')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [ledgerItem, setLedgerItem] = useState(null)
  const [setStockItem, setSetStockItem] = useState(null)

  const load = useCallback(() => {
    api.get('/dashboard/stock-summary').then(r => {
      setRows(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    const matchQ = r.part_no.toLowerCase().includes(q.toLowerCase()) || (r.name || '').toLowerCase().includes(q.toLowerCase())
    const matchType = !typeFilter || r.item_type === typeFilter
    const matchSupplier = !supplierFilter || r.spec === supplierFilter
    return matchQ && matchType && matchSupplier
  })

  // 현재 typeFilter 적용 후 품목이 있는 고객사만 pill로 표시
  const typeFiltered = rows.filter(r => !typeFilter || r.item_type === typeFilter)
  const customerList = [...new Set(typeFiltered.map(r => r.spec).filter(Boolean))].sort()

  // 안전재고 미달 품목
  const shortage = filtered.filter(r => r.safety_stock > 0 && r.current_stock < r.safety_stock)
  const maxStock = Math.max(...filtered.map(r => r.current_stock), 1)

  const exportExcel = () => {
    const data = [
      ['품번', '품명', '고객사', '현재고', '안전재고', '이동평균단가', '재고금액'],
      ...filtered.map(r => [
        r.part_no, r.name, r.spec || '', r.current_stock,
        r.safety_stock || 0,
        r.avg_price || 0,
        r.stock_value || 0,
      ]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    // 열 너비 설정
    ws['!cols'] = [{ wch: 18 }, { wch: 40 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    const sheetName = supplierFilter ? `재고_${supplierFilter}` : typeFilter ? `재고_${typeFilter}` : '재고_전체'
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
    XLSX.writeFile(wb, `재고현황_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      {/* 안전재고 미달 경고 배너 */}
      {shortage.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>⚠</span>
          <div>
            <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>안전재고 미달 {shortage.length}건</div>
            <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>
              {shortage.slice(0, 5).map(r => `${r.part_no} (현재고 ${r.current_stock} / 안전재고 ${r.safety_stock})`).join(' · ')}
              {shortage.length > 5 && ` 외 ${shortage.length - 5}건`}
            </div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <button className={`btn ${typeFilter === '외주품' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTypeFilter('외주품')}>외주품</button>
        <button className={`btn ${typeFilter === '원자재' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTypeFilter('원자재')}>원자재</button>
        <button className={`btn ${typeFilter === '' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTypeFilter('')}>전체</button>
        <input type="search" placeholder="품번·품명 검색" value={q} onChange={e => setQ(e.target.value)} style={{ width: 220, marginLeft: 8 }} />
        <div className="spacer" />
        <span className="text-sm">{filtered.length}개 품목</span>
        <button className="btn btn-outline" onClick={exportExcel} style={{ color: '#16a34a', borderColor: '#16a34a' }}>
          ⬇ Excel
        </button>
      </div>

      {/* 고객사별 필터 pill */}
      {customerList.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 2 }}>고객사</span>
          <button
            onClick={() => setSupplierFilter('')}
            style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', border: '1px solid',
              background: supplierFilter === '' ? '#1d4ed8' : '#f1f5f9',
              color: supplierFilter === '' ? '#fff' : '#475569',
              borderColor: supplierFilter === '' ? '#1d4ed8' : '#e2e8f0',
              fontWeight: supplierFilter === '' ? 700 : 400,
            }}
          >전체</button>
          {customerList.map(s => (
            <button key={s}
              onClick={() => setSupplierFilter(f => f === s ? '' : s)}
              style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', border: '1px solid',
                background: supplierFilter === s ? '#1d4ed8' : '#f1f5f9',
                color: supplierFilter === s ? '#fff' : '#475569',
                borderColor: supplierFilter === s ? '#1d4ed8' : '#e2e8f0',
                fontWeight: supplierFilter === s ? 700 : 400,
              }}
            >{s}</button>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>품번</th>
              <th>품명</th>
              <th style={{ textAlign: 'right' }}>현재고</th>
              <th style={{ textAlign: 'right' }}>안전재고</th>
              <th style={{ width: 140 }}>재고량</th>
              <th style={{ textAlign: 'right' }}>이동평균단가</th>
              <th style={{ textAlign: 'right' }}>재고금액</th>
              <th>수불부</th>
              <th>재고수정</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="empty">로딩 중…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="empty">재고 없음</td></tr>}
            {filtered.map(r => {
              const isShortageLine = r.safety_stock > 0 && r.current_stock < r.safety_stock
              const pct = (r.current_stock / maxStock) * 100
              const cls = isShortageLine ? 'danger' : pct > 50 ? '' : pct > 20 ? 'warn' : 'danger'
              return (
                <tr key={r.part_no} style={isShortageLine ? { background: '#fff5f5' } : {}}>
                  <td><code style={{ background: isShortageLine ? '#fee2e2' : '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{r.part_no}</code></td>
                  <td>{r.name}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: isShortageLine ? '#dc2626' : undefined }}>
                    {r.current_stock.toLocaleString()}
                    {isShortageLine && <span style={{ fontSize: 11, marginLeft: 4 }}>⚠</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: r.safety_stock > 0 ? '#92400e' : '#cbd5e1' }}>
                    {r.safety_stock > 0 ? r.safety_stock.toLocaleString() : '—'}
                  </td>
                  <td>
                    <div className="stock-bar-wrap">
                      <div className="stock-bar">
                        <div className={`stock-bar-fill ${cls}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>{r.avg_price ? `₩${r.avg_price.toLocaleString()}` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.stock_value ? `₩${r.stock_value.toLocaleString()}` : '—'}</td>
                  <td><button className="btn btn-sm btn-outline" onClick={() => setLedgerItem(r)}>수불부</button></td>
                  <td>
                    <button className="btn btn-sm btn-outline"
                      style={{ borderColor: '#f59e0b', color: '#b45309' }}
                      onClick={() => setSetStockItem(r)}>수정</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {ledgerItem && <LedgerModal item={ledgerItem} onClose={() => setLedgerItem(null)} onAdjusted={load} />}
      {setStockItem && <SetStockModal item={setStockItem} onClose={() => setSetStockItem(null)} onSaved={() => { setSetStockItem(null); load() }} />}
    </div>
  )
}
