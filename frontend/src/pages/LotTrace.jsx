import { useState } from 'react'
import api from '../api'

const STEP = [
  { key: 'receipt',     emoji: '📦', label: '입고', bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
  { key: 'consumption', emoji: '🔩', label: '소모', bg: '#fef3c7', fg: '#b45309', border: '#fcd34d' },
  { key: 'production',  emoji: '🏭', label: '생산', bg: '#ede9fe', fg: '#6d28d9', border: '#c4b5fd' },
  { key: 'shipment',    emoji: '🚚', label: '출하', bg: '#dcfce7', fg: '#15803d', border: '#86efac' },
]

function FlowNode({ type, title, count, children, expanded, onToggle }) {
  const c = STEP.find(s => s.key === type)
  return (
    <div style={{ marginBottom: 12 }}>
      <div onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
        background: c.bg, border: `1.5px solid ${c.border}`, userSelect: 'none',
      }}>
        <span style={{ fontSize: 18 }}>{c.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: c.fg, fontSize: 13 }}>{c.label}</div>
          <div style={{ fontSize: 11, color: c.fg, opacity: 0.8 }}>{title}</div>
        </div>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: 'white', color: c.fg, border: `1px solid ${c.border}`, fontWeight: 700 }}>
          {count}건
        </span>
        <span style={{ color: c.fg, fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && children && (
        <div style={{ marginLeft: 20, paddingLeft: 12, borderLeft: `2px dashed ${c.border}`, marginTop: 4 }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* 수평 흐름 비주얼 */
function TraceFlowBar({ trace }) {
  const counts = [
    { key: 'receipt',     n: 1 },
    { key: 'consumption', n: trace.consumption?.length ?? 0 },
    { key: 'production',  n: trace.production?.length ?? 0 },
    { key: 'shipment',    n: trace.shipments?.length ?? 0 },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20, overflowX: 'auto', padding: '4px 0' }}>
      {counts.map((item, idx) => {
        const c = STEP[idx]
        const hasData = item.n > 0
        return (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 90 }}>
            <div style={{
              flex: 1, padding: '10px 12px', borderRadius: 8, border: `2px solid ${hasData ? c.border : '#e2e8f0'}`,
              background: hasData ? c.bg : '#f8fafc', textAlign: 'center',
              opacity: hasData ? 1 : 0.5,
            }}>
              <div style={{ fontSize: 20 }}>{c.emoji}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: hasData ? c.fg : '#94a3b8', marginTop: 2 }}>{c.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: hasData ? c.fg : '#94a3b8' }}>{item.n}</div>
            </div>
            {idx < counts.length - 1 && (
              <div style={{ padding: '0 4px', fontSize: 18, color: '#94a3b8', flexShrink: 0 }}>→</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function LotTrace() {
  const [searchPart, setSearchPart] = useState('')
  const [searchGr, setSearchGr] = useState('')
  const [searchSh, setSearchSh] = useState('')        // 출하번호 역추적
  const [mode, setMode] = useState('forward')          // 'forward' | 'reverse'

  const [lots, setLots] = useState([])
  const [selectedLot, setSelectedLot] = useState(null)
  const [trace, setTrace] = useState(null)
  const [expanded, setExpanded] = useState({ receipt: true, consumption: true, production: true, shipment: true })
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [reverseResult, setReverseResult] = useState(null)

  async function searchLots() {
    if (!searchPart && !searchGr) return
    setSearching(true)
    setTrace(null)
    setReverseResult(null)
    setSelectedLot(null)
    try {
      const params = new URLSearchParams()
      if (searchPart) params.set('part_no', searchPart)
      if (searchGr)   params.set('gr_no', searchGr)
      const r = await api.get(`/lot/search?${params}`)
      setLots(r.data)
    } finally { setSearching(false) }
  }

  async function traceGr(gr_no) {
    setLoading(true)
    setSelectedLot(gr_no)
    setReverseResult(null)
    try {
      const r = await api.get(`/lot/trace/${encodeURIComponent(gr_no)}`)
      setTrace(r.data)
    } finally { setLoading(false) }
  }

  async function reverseTrace() {
    if (!searchSh) return
    setLoading(true)
    setTrace(null)
    setLots([])
    setSelectedLot(null)
    try {
      const r = await api.get(`/lot/reverse-trace/${encodeURIComponent(searchSh)}`)
      setReverseResult(r.data)
    } catch (e) {
      alert('역추적 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setLoading(false) }
  }

  const toggle = (key) => setExpanded(e => ({ ...e, [key]: !e[key] }))

  return (
    <div style={{ padding: '16px 20px' }}>
      <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800 }}>LOT / 배치 추적</h2>

      {/* 모드 탭 */}
      <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 14, width: 'fit-content' }}>
        {[{ k: 'forward', label: '📦 입고 → 출하 순방향 추적' }, { k: 'reverse', label: '🚚 출하 → 입고 역방향 추적' }].map(tab => (
          <button key={tab.k} onClick={() => setMode(tab.k)} style={{
            padding: '7px 20px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: mode === tab.k ? '#1d4ed8' : '#fff',
            color: mode === tab.k ? '#fff' : '#64748b',
          }}>{tab.label}</button>
        ))}
      </div>

      {mode === 'forward' ? (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input className="form-control" placeholder="품번 검색" value={searchPart}
            onChange={e => setSearchPart(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchLots()} style={{ width: 180 }} />
          <input className="form-control" placeholder="입고번호(GR) 검색" value={searchGr}
            onChange={e => setSearchGr(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchLots()} style={{ width: 200 }} />
          <button className="btn btn-primary" onClick={searchLots} disabled={searching}>
            {searching ? '검색 중...' : 'LOT 검색'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input className="form-control" placeholder="출하번호(SH-…) 또는 수주번호" value={searchSh}
            onChange={e => setSearchSh(e.target.value)} onKeyDown={e => e.key === 'Enter' && reverseTrace()} style={{ width: 240 }} />
          <button className="btn btn-primary" onClick={reverseTrace} disabled={loading}>
            {loading ? '추적 중...' : '역방향 추적'}
          </button>
          <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>출하번호(SH-YYYYMMDD-NNN)로 원자재까지 역추적합니다</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: lots.length ? '280px 1fr' : '1fr', gap: 20 }}>
        {/* LOT 목록 */}
        {lots.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#64748b' }}>
              검색 결과 ({lots.length}건) — 클릭하여 추적
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 500, overflowY: 'auto' }}>
              {lots.map(lot => (
                <div key={lot.gr_no} onClick={() => traceGr(lot.gr_no)} style={{
                  padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                  background: selectedLot === lot.gr_no ? '#eff6ff' : undefined,
                  borderLeft: selectedLot === lot.gr_no ? '3px solid #3b82f6' : '3px solid transparent',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>{lot.gr_no}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {lot.part_name} · <strong style={{ color: '#1d4ed8' }}>{(lot.qty||0).toLocaleString()}</strong> EA
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {lot.receipt_date} · {lot.partner}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 추적 결과 */}
        <div>
          {loading && (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 32 }}>🔍</div>
              <div style={{ marginTop: 8 }}>추적 중...</div>
            </div>
          )}

          {/* 순방향 추적 결과 */}
          {!loading && trace && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>LOT 추적:</span>
                <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{trace.lot_no}</code>
                <span style={{ fontSize: 11, color: '#64748b' }}>{trace.receipt?.part_name}</span>
              </div>

              <TraceFlowBar trace={trace} />

              {/* 입고 */}
              <FlowNode type="receipt"
                title={`${trace.receipt.part_name} — ${trace.receipt.receipt_date}`}
                count={1} expanded={expanded.receipt} onToggle={() => toggle('receipt')}>
                <div style={{ padding: '10px 0', fontSize: 12 }}>
                  {[
                    ['입고번호', trace.receipt.gr_no],
                    ['품번/품명', `${trace.receipt.part_no} / ${trace.receipt.part_name}`],
                    ['입고일', trace.receipt.receipt_date],
                    ['수량', `${(trace.receipt.qty||0).toLocaleString()} EA`],
                    ['단가', `${(trace.receipt.unit_price||0).toLocaleString()}원`],
                    ['거래처', trace.receipt.partner],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ color: '#64748b', minWidth: 80, fontSize: 11 }}>{k}</span>
                      <span style={{ fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </FlowNode>

              {/* 소모 */}
              <FlowNode type="consumption"
                title={`${trace.receipt.part_name} 소모 이력`}
                count={trace.consumption.length} expanded={expanded.consumption} onToggle={() => toggle('consumption')}>
                {trace.consumption.length > 0 ? (
                  <table className="table" style={{ marginTop: 8, fontSize: 12 }}>
                    <thead><tr><th>소모일</th><th style={{ textAlign:'right' }}>수량</th><th>작업지시</th><th>비고</th></tr></thead>
                    <tbody>
                      {trace.consumption.map((c, i) => (
                        <tr key={i}>
                          <td>{c.txn_date}</td>
                          <td style={{ textAlign:'right', color:'#b91c1c', fontWeight:700 }}>{(c.qty||0).toLocaleString()}</td>
                          <td><code style={{ fontSize:11 }}>{c.ref_no || '—'}</code></td>
                          <td style={{ color:'#64748b' }}>{c.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ padding: 10, color: '#94a3b8', fontSize: 12 }}>소모 이력 없음</div>}
              </FlowNode>

              {/* 생산 */}
              <FlowNode type="production" title="관련 작업지시"
                count={trace.production.length} expanded={expanded.production} onToggle={() => toggle('production')}>
                {trace.production.length > 0 ? (
                  <table className="table" style={{ marginTop: 8, fontSize: 12 }}>
                    <thead><tr><th>작업지시번호</th><th>완제품</th><th>계획일</th><th style={{ textAlign:'right' }}>계획</th><th style={{ textAlign:'right' }}>실적</th><th>상태</th></tr></thead>
                    <tbody>
                      {trace.production.map(o => {
                        const ach = o.planned_qty>0 ? Math.round(o.actual_qty/o.planned_qty*100) : 0
                        return (
                          <tr key={o.pord_no}>
                            <td><code style={{ fontSize:11 }}>{o.pord_no}</code></td>
                            <td style={{ fontWeight:600 }}>{o.part_name}</td>
                            <td>{o.plan_date}</td>
                            <td style={{ textAlign:'right' }}>{(o.planned_qty||0).toLocaleString()}</td>
                            <td style={{ textAlign:'right', color:'#1d4ed8', fontWeight:700 }}>{(o.actual_qty||0).toLocaleString()}</td>
                            <td>
                              <span style={{
                                fontSize:10, padding:'2px 7px', borderRadius:20,
                                background: o.status==='완료'?'#dcfce7': o.status==='진행중'?'#fef3c7':'#f1f5f9',
                                color: o.status==='완료'?'#15803d': o.status==='진행중'?'#b45309':'#64748b',
                                fontWeight:700,
                              }}>{o.status} {ach>0?`(${ach}%)`:''}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : <div style={{ padding: 10, color: '#94a3b8', fontSize: 12 }}>관련 작업지시 없음</div>}
              </FlowNode>

              {/* 출하 */}
              <FlowNode type="shipment" title="완제품 출하 이력"
                count={trace.shipments.length} expanded={expanded.shipment} onToggle={() => toggle('shipment')}>
                {trace.shipments.length > 0 ? (
                  <table className="table" style={{ marginTop: 8, fontSize: 12 }}>
                    <thead><tr><th>출하번호</th><th>수주번호</th><th>품명</th><th>출하일</th><th style={{ textAlign:'right' }}>수량</th><th>고객</th></tr></thead>
                    <tbody>
                      {trace.shipments.map((s, i) => (
                        <tr key={i}>
                          <td><code style={{ fontSize:11 }}>{s.sh_no || '—'}</code></td>
                          <td><code style={{ fontSize:11 }}>{s.so_no}</code></td>
                          <td style={{ fontWeight:600 }}>{s.part_name}</td>
                          <td>{s.ship_date}</td>
                          <td style={{ textAlign:'right', fontWeight:700 }}>{(s.qty||0).toLocaleString()}</td>
                          <td>{s.customer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ padding: 10, color: '#94a3b8', fontSize: 12 }}>출하 이력 없음</div>}
              </FlowNode>
            </>
          )}

          {/* 역방향 추적 결과 */}
          {!loading && reverseResult && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>역방향 추적:</span>
                <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{reverseResult.sh_no || searchSh}</code>
                <span style={{ fontSize: 11, color: '#64748b' }}>{reverseResult.part_name}</span>
              </div>

              {/* 역방향 흐름 (오른쪽 → 왼쪽) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, overflowX: 'auto', padding: '4px 0' }}>
                {[
                  { emoji: '🚚', label: '출하', value: reverseResult.ship_date, sub: `${(reverseResult.ship_qty||0).toLocaleString()} EA`, color: '#15803d', bg: '#dcfce7', border: '#86efac' },
                  { emoji: '←', label: '', value: '', sub: '', color: '#94a3b8', bg: 'transparent', border: 'transparent', isArrow: true },
                  { emoji: '🏭', label: '생산', value: reverseResult.production?.plan_date || '—', sub: reverseResult.production?.pord_no || '없음', color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd' },
                  { emoji: '←', label: '', value: '', sub: '', color: '#94a3b8', bg: 'transparent', border: 'transparent', isArrow: true },
                  { emoji: '📦', label: '원자재 입고', value: reverseResult.receipt?.receipt_date || '추적불가', sub: reverseResult.receipt?.gr_no || '—', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
                ].map((n, i) => n.isArrow ? (
                  <span key={i} style={{ fontSize: 20, color: '#94a3b8', flexShrink: 0 }}>←</span>
                ) : (
                  <div key={i} style={{ flex: 1, minWidth: 110, padding: '10px 12px', borderRadius: 8, border: `2px solid ${n.border}`, background: n.bg, textAlign: 'center' }}>
                    <div style={{ fontSize: 18 }}>{n.emoji}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: n.color }}>{n.label}</div>
                    <div style={{ fontSize: 11, color: n.color, marginTop: 2 }}>{n.value}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{n.sub}</div>
                  </div>
                ))}
              </div>

              {/* 출하 상세 */}
              <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 8, padding: 14, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: '#15803d', fontSize: 13, marginBottom: 8 }}>🚚 출하 정보</div>
                {[
                  ['출하번호', reverseResult.sh_no],
                  ['수주번호', reverseResult.so_no],
                  ['품번/품명', `${reverseResult.part_no} / ${reverseResult.part_name}`],
                  ['출하일', reverseResult.ship_date],
                  ['수량', `${(reverseResult.ship_qty||0).toLocaleString()} EA`],
                  ['고객', reverseResult.customer],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid #dcfce7', fontSize: 12 }}>
                    <span style={{ color: '#64748b', minWidth: 80 }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{v || '—'}</span>
                  </div>
                ))}
              </div>

              {/* 생산 연결 */}
              {reverseResult.production && (
                <div style={{ background: '#f5f3ff', border: '1.5px solid #c4b5fd', borderRadius: 8, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: '#6d28d9', fontSize: 13, marginBottom: 8 }}>🏭 연결된 생산 작업지시</div>
                  {[
                    ['작업지시번호', reverseResult.production.pord_no],
                    ['품명', reverseResult.production.part_name],
                    ['계획일', reverseResult.production.plan_date],
                    ['계획수량', `${(reverseResult.production.planned_qty||0).toLocaleString()} EA`],
                    ['실적수량', `${(reverseResult.production.actual_qty||0).toLocaleString()} EA`],
                    ['상태', reverseResult.production.status],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid #ede9fe', fontSize: 12 }}>
                      <span style={{ color: '#64748b', minWidth: 80 }}>{k}</span>
                      <span style={{ fontWeight: 600 }}>{v || '—'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 원자재 입고 연결 */}
              {reverseResult.receipts?.length > 0 ? (
                <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13, marginBottom: 8 }}>📦 사용된 원자재 LOT ({reverseResult.receipts.length}건)</div>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead><tr><th>입고번호</th><th>품번</th><th>품명</th><th>입고일</th><th style={{ textAlign:'right' }}>수량</th><th>거래처</th></tr></thead>
                    <tbody>
                      {reverseResult.receipts.map((r, i) => (
                        <tr key={i}>
                          <td><code style={{ fontSize:11, cursor:'pointer', color:'#1d4ed8' }}
                            onClick={() => { setMode('forward'); traceGr(r.gr_no) }}>{r.gr_no}</code></td>
                          <td style={{ fontSize:11 }}>{r.part_no}</td>
                          <td style={{ fontWeight:600 }}>{r.part_name}</td>
                          <td>{r.receipt_date}</td>
                          <td style={{ textAlign:'right', fontWeight:700 }}>{(r.qty||0).toLocaleString()}</td>
                          <td>{r.partner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: 8, padding: 12, fontSize: 12, color: '#a16207' }}>
                  ⚠ 연결된 원자재 LOT를 찾지 못했습니다. (소모 기록이 없거나 연결이 누락된 경우)
                </div>
              )}
            </div>
          )}

          {!loading && !trace && !reverseResult && lots.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏷️</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>LOT 추적</div>
              <div style={{ fontSize: 12 }}>
                {mode === 'forward'
                  ? '품번 또는 입고번호로 LOT를 검색하세요'
                  : '출하번호(SH-YYYYMMDD-NNN)로 역방향 추적을 시작하세요'}
              </div>
              <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>입고번호(GR-YYYYMMDD-NNN)가 LOT 식별자입니다</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
