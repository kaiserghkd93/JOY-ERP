import { useState } from 'react'
import api from '../api'

const STEP_COLOR = {
  receipt:     { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd', label: '입고 LOT' },
  consumption: { bg: '#fef3c7', fg: '#b45309', border: '#fcd34d', label: '소모' },
  production:  { bg: '#ede9fe', fg: '#6d28d9', border: '#c4b5fd', label: '생산' },
  shipment:    { bg: '#dcfce7', fg: '#15803d', border: '#86efac', label: '출하' },
}

function FlowNode({ type, title, count, children, expanded, onToggle }) {
  const c = STEP_COLOR[type]
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
          background: c.bg, border: `1.5px solid ${c.border}`,
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 16 }}>
          {type === 'receipt' ? '📦' : type === 'consumption' ? '🔩' : type === 'production' ? '🏭' : '🚚'}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: c.fg, fontSize: 14 }}>{c.label}</div>
          <div style={{ fontSize: 12, color: c.fg, opacity: 0.8 }}>{title}</div>
        </div>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'white', color: c.fg, border: `1px solid ${c.border}` }}>
          {count}건
        </span>
        <span style={{ color: c.fg, fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && children && (
        <div style={{ marginLeft: 20, paddingLeft: 12, borderLeft: `2px dashed ${c.border}`, marginTop: 4 }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function LotTrace() {
  const [searchPart, setSearchPart] = useState('')
  const [searchGr, setSearchGr] = useState('')
  const [lots, setLots] = useState([])
  const [selectedLot, setSelectedLot] = useState(null)
  const [trace, setTrace] = useState(null)
  const [expanded, setExpanded] = useState({ receipt: true, consumption: true, production: true, shipment: true })
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  async function searchLots() {
    setSearching(true)
    try {
      const params = new URLSearchParams()
      if (searchPart) params.set('part_no', searchPart)
      if (searchGr)   params.set('gr_no', searchGr)
      const r = await api.get(`/lot/search?${params}`)
      setLots(r.data)
      setTrace(null)
      setSelectedLot(null)
    } finally {
      setSearching(false)
    }
  }

  async function traceGr(gr_no) {
    setLoading(true)
    setSelectedLot(gr_no)
    try {
      const r = await api.get(`/lot/trace/${encodeURIComponent(gr_no)}`)
      setTrace(r.data)
    } finally {
      setLoading(false)
    }
  }

  const toggle = (key) => setExpanded(e => ({ ...e, [key]: !e[key] }))

  return (
    <div style={{ padding: '20px 24px' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>LOT / 배치 추적 (Batch Trace)</h2>

      {/* 검색 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="품번 검색"
          value={searchPart}
          onChange={e => setSearchPart(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchLots()}
          style={{ width: 200 }}
        />
        <input
          className="input"
          placeholder="입고번호(GR) 검색"
          value={searchGr}
          onChange={e => setSearchGr(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchLots()}
          style={{ width: 200 }}
        />
        <button className="btn btn-primary" onClick={searchLots} disabled={searching}>
          {searching ? '검색 중...' : 'LOT 검색'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: lots.length ? '300px 1fr' : '1fr', gap: 24 }}>
        {/* LOT 목록 */}
        {lots.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>
              검색 결과 ({lots.length}건)
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 600, overflowY: 'auto' }}>
              {lots.map(lot => (
                <div
                  key={lot.gr_no}
                  onClick={() => traceGr(lot.gr_no)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    background: selectedLot === lot.gr_no ? '#eff6ff' : undefined,
                    borderLeft: selectedLot === lot.gr_no ? '3px solid #3b82f6' : '3px solid transparent',
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 13, fontFamily: 'monospace' }}>{lot.gr_no}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {lot.part_name} · {lot.qty.toLocaleString()}EA
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {lot.receipt_date} · {lot.partner}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 추적 결과 */}
        <div>
          {loading && <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>추적 중...</div>}

          {!loading && trace && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: 'var(--text-secondary)' }}>
                LOT 흐름 추적: <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{trace.lot_no}</span>
              </div>

              {/* 입고 */}
              <FlowNode
                type="receipt"
                title={`${trace.receipt.part_name} — ${trace.receipt.receipt_date}`}
                count={1}
                expanded={expanded.receipt}
                onToggle={() => toggle('receipt')}
              >
                <div style={{ padding: '10px 0', fontSize: 13 }}>
                  {[
                    ['입고번호', trace.receipt.gr_no],
                    ['품번/품명', `${trace.receipt.part_no} / ${trace.receipt.part_name}`],
                    ['입고일', trace.receipt.receipt_date],
                    ['수량', `${trace.receipt.qty.toLocaleString()} EA`],
                    ['단가', `${trace.receipt.unit_price.toLocaleString()}원`],
                    ['거래처', trace.receipt.partner],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-secondary)', minWidth: 80 }}>{k}</span>
                      <span style={{ fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </FlowNode>

              {/* 소모 */}
              <FlowNode
                type="consumption"
                title={`${trace.receipt.part_name} 소모 이력`}
                count={trace.consumption.length}
                expanded={expanded.consumption}
                onToggle={() => toggle('consumption')}
              >
                {trace.consumption.length > 0 ? (
                  <table className="tbl" style={{ marginTop: 8 }}>
                    <thead><tr><th>소모일</th><th style={{ textAlign: 'right' }}>수량</th><th>작업지시</th><th>비고</th></tr></thead>
                    <tbody>
                      {trace.consumption.map((c, i) => (
                        <tr key={i}>
                          <td>{c.txn_date}</td>
                          <td style={{ textAlign: 'right', color: '#b91c1c' }}>{c.qty.toLocaleString()}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.ref_no || '-'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 13 }}>소모 이력 없음</div>}
              </FlowNode>

              {/* 생산 */}
              <FlowNode
                type="production"
                title="관련 작업지시"
                count={trace.production.length}
                expanded={expanded.production}
                onToggle={() => toggle('production')}
              >
                {trace.production.length > 0 ? (
                  <table className="tbl" style={{ marginTop: 8 }}>
                    <thead><tr><th>작업지시번호</th><th>완제품</th><th>계획일</th><th style={{ textAlign: 'right' }}>계획</th><th style={{ textAlign: 'right' }}>실적</th><th>상태</th></tr></thead>
                    <tbody>
                      {trace.production.map(o => (
                        <tr key={o.pord_no}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.pord_no}</td>
                          <td style={{ fontWeight: 500 }}>{o.part_name}</td>
                          <td>{o.plan_date}</td>
                          <td style={{ textAlign: 'right' }}>{o.planned_qty.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{o.actual_qty.toLocaleString()}</td>
                          <td>
                            <span style={{
                              fontSize: 11, padding: '2px 7px', borderRadius: 999,
                              background: o.status === '완료' ? '#dcfce7' : o.status === '진행중' ? '#fef3c7' : 'var(--surface-1)',
                              color: o.status === '완료' ? '#15803d' : o.status === '진행중' ? '#b45309' : 'var(--text-secondary)',
                            }}>{o.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 13 }}>관련 작업지시 없음</div>}
              </FlowNode>

              {/* 출하 */}
              <FlowNode
                type="shipment"
                title="완제품 출하 이력"
                count={trace.shipments.length}
                expanded={expanded.shipment}
                onToggle={() => toggle('shipment')}
              >
                {trace.shipments.length > 0 ? (
                  <table className="tbl" style={{ marginTop: 8 }}>
                    <thead><tr><th>수주번호</th><th>품명</th><th>출하일</th><th style={{ textAlign: 'right' }}>수량</th><th>고객</th></tr></thead>
                    <tbody>
                      {trace.shipments.map((s, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.so_no}</td>
                          <td style={{ fontWeight: 500 }}>{s.part_name}</td>
                          <td>{s.ship_date}</td>
                          <td style={{ textAlign: 'right' }}>{s.qty.toLocaleString()}</td>
                          <td>{s.customer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 13 }}>출하 이력 없음</div>}
              </FlowNode>
            </>
          )}

          {!loading && !trace && lots.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏷️</div>
              <div style={{ fontSize: 14 }}>품번 또는 입고번호로 LOT를 검색하세요</div>
              <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>입고번호(GR-YYYYMMDD-NNN)가 LOT 식별자입니다</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
