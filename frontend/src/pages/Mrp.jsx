import { useState, useEffect, useCallback } from 'react'
import api from '../api'

const fmt = n => Number(n || 0).toLocaleString()
const fmtW = n => `₩${Number(n || 0).toLocaleString()}`

const TYPE_LABEL = { raw: '원재료', sub: '부자재', outsourced: '외주품', semi: '반제품', finished: '완제품' }

const urgencyStyle = (days_to_order, is_overdue, is_urgent) => {
  if (is_overdue)  return { color: '#dc2626', fontWeight: 700, fontSize: 11 }
  if (is_urgent)   return { color: '#d97706', fontWeight: 700, fontSize: 11 }
  return { color: '#16a34a', fontSize: 11 }
}

const urgencyLabel = (row) => {
  if (!row.need_order) return '—'
  if (row.is_overdue)  return `D${row.days_to_order}`   // negative
  if (row.is_urgent)   return `D-${row.days_to_order}`
  return `D-${row.days_to_order}`
}

function ReqTable({ rows, selected, onToggle, onFieldChange, partners, type }) {
  const isBuy = type === 'buy'
  return (
    <div className="table-wrap" style={{ marginBottom: 16 }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 32 }}></th>
            <th>품번</th><th>품명</th><th>유형</th>
            <th style={{ textAlign: 'right' }}>총소요</th>
            <th style={{ textAlign: 'right' }}>현재고</th>
            <th style={{ textAlign: 'right' }}>{isBuy ? '오픈PO' : '진행생산'}</th>
            <th style={{ textAlign: 'right' }}>안전재고</th>
            <th style={{ textAlign: 'right' }}>순소요</th>
            <th style={{ textAlign: 'right' }}>{isBuy ? '발주제안' : '생산제안'}</th>
            {isBuy && <th style={{ textAlign: 'center', width: 60 }}>L/T</th>}
            {isBuy && <th style={{ textAlign: 'center', width: 90 }}>발주마감일</th>}
            {isBuy && <th style={{ textAlign: 'center', width: 56 }}>여유</th>}
            {isBuy && <th style={{ textAlign: 'right' }}>단가</th>}
            {isBuy && <th style={{ textAlign: 'right' }}>예상금액</th>}
            {isBuy && <th style={{ width: 150 }}>거래처</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={isBuy ? 16 : 10} className="empty">해당 없음</td></tr>
          )}
          {rows.map(req => {
            const sel = selected[req.part_no] || {}
            const checked = !!sel.checked
            const rowBg = req.is_overdue ? '#fef2f2' : req.is_urgent ? '#fffbeb' : (req.need_order ? '#fff' : '#f9fafb')
            return (
              <tr key={req.part_no} style={{ background: rowBg, opacity: req.need_order ? 1 : 0.55 }}>
                <td style={{ textAlign: 'center' }}>
                  {req.need_order && (
                    <input type="checkbox" checked={checked} onChange={() => onToggle(req.part_no)} />
                  )}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{req.part_no}</td>
                <td style={{ fontSize: 12 }}>{req.item_name}</td>
                <td style={{ fontSize: 11, color: '#64748b' }}>{TYPE_LABEL[req.item_type] || req.item_type}</td>
                <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(req.gross_requirement)}</td>
                <td style={{ textAlign: 'right', fontSize: 12, color: req.current_stock > 0 ? '#16a34a' : '#94a3b8' }}>{fmt(req.current_stock)}</td>
                <td style={{ textAlign: 'right', fontSize: 12, color: req.on_supply_qty > 0 ? '#d97706' : '#94a3b8' }}>{fmt(req.on_supply_qty)}</td>
                <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(req.safety_stock)}</td>
                <td style={{ textAlign: 'right', fontSize: 12, fontWeight: req.net_requirement > 0 ? 700 : 400, color: req.net_requirement > 0 ? '#dc2626' : '#94a3b8' }}>
                  {fmt(req.net_requirement)}
                </td>
                <td style={{ textAlign: 'right', fontSize: 12 }}>
                  {req.need_order ? (
                    <input type="number" value={sel.qty ?? req.order_qty}
                      onChange={e => onFieldChange(req.part_no, 'qty', e.target.value)}
                      disabled={!checked}
                      style={{ width: 70, textAlign: 'right', border: '1px solid #e2e8f0', borderRadius: 3, fontSize: 12, padding: '2px 4px' }} />
                  ) : '—'}
                </td>
                {isBuy && (
                  <td style={{ textAlign: 'center', fontSize: 11, color: '#64748b' }}>
                    {req.lead_time_days ? `${req.lead_time_days}일` : '7일'}
                  </td>
                )}
                {isBuy && (
                  <td style={{ textAlign: 'center', fontSize: 11, color: '#475569' }}>
                    {req.order_by_date || '—'}
                  </td>
                )}
                {isBuy && (
                  <td style={{ textAlign: 'center', ...urgencyStyle(req.days_to_order, req.is_overdue, req.is_urgent) }}>
                    {req.need_order ? urgencyLabel(req) : '—'}
                  </td>
                )}
                {isBuy && (
                  <td style={{ textAlign: 'right', fontSize: 12 }}>
                    {req.avg_cost ? fmtW(req.avg_cost) : (req.std_price ? fmtW(req.std_price) : '—')}
                  </td>
                )}
                {isBuy && (
                  <td style={{ textAlign: 'right', fontSize: 12, fontWeight: req.need_order ? 600 : 400 }}>
                    {req.need_order ? fmtW(req.estimated_amount) : '—'}
                  </td>
                )}
                {isBuy && (
                  <td>
                    {req.need_order && (
                      <select value={sel.partner_id ?? ''} disabled={!checked}
                        onChange={e => onFieldChange(req.part_no, 'partner_id', e.target.value)}
                        style={{ width: '100%', fontSize: 11, padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: 3 }}>
                        <option value="">거래처 선택</option>
                        {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
                      </select>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── 예외사항 탭 ────────────────────────────────────────────────────
function ExceptionTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/mrp/exceptions')
      setData(r.data)
    } catch (e) {
      alert(e.response?.data?.detail || '예외사항 로드 실패')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
  if (!data) return null

  const badge = (n, color) => (
    <span style={{ background: color, color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>{n}</span>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: '납기 지연 PO', val: data.late_po_count, color: '#dc2626' },
          { label: '안전재고 미달', val: data.safety_stock_alert_count, color: '#d97706' },
          { label: '긴급 미처리 PR', val: data.urgent_pr_count, color: '#7c3aed' },
          { label: '지연 생산오더', val: data.late_pord_count, color: '#0369a1' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: val > 0 ? color : '#f1f5f9', border: `1px solid ${val > 0 ? color : '#e2e8f0'}`, borderRadius: 8, padding: '10px 18px', minWidth: 130 }}>
            <div style={{ fontSize: 11, color: val > 0 ? '#fff' : '#94a3b8', fontWeight: 600, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: val > 0 ? '#fff' : '#64748b' }}>{val}건</div>
          </div>
        ))}
        <button className="btn btn-sm" onClick={load} style={{ alignSelf: 'center', marginLeft: 'auto' }}>새로고침</button>
      </div>

      {/* 납기 지연 PO */}
      {data.late_po_count > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626', marginBottom: 6 }}>
            🚨 납기 지연 PO {badge(data.late_po_count, '#dc2626')}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PO번호</th><th>품번</th><th>품명</th><th>거래처</th>
                  <th style={{ textAlign: 'right' }}>발주량</th>
                  <th>납기일</th><th style={{ textAlign: 'right' }}>지연일</th><th>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.late_po.map(r => (
                  <tr key={r.po_no} style={{ background: r.delay_days > 7 ? '#fef2f2' : '#fff' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.po_no}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.part_no}</td>
                    <td style={{ fontSize: 12 }}>{r.item_name}</td>
                    <td style={{ fontSize: 12 }}>{r.partner_name || r.partner_id}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(r.qty)}</td>
                    <td style={{ fontSize: 12, color: '#dc2626' }}>{r.due_date}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>+{r.delay_days}일</td>
                    <td style={{ fontSize: 11 }}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 안전재고 미달 */}
      {data.safety_stock_alert_count > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#d97706', marginBottom: 6 }}>
            ⚠️ 안전재고 미달 {badge(data.safety_stock_alert_count, '#d97706')}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>품번</th><th>품명</th><th>유형</th>
                  <th style={{ textAlign: 'right' }}>현재고</th>
                  <th style={{ textAlign: 'right' }}>안전재고</th>
                  <th style={{ textAlign: 'right' }}>부족량</th>
                  <th style={{ textAlign: 'right' }}>L/T</th>
                  <th>주요공급처</th>
                </tr>
              </thead>
              <tbody>
                {data.safety_stock_alerts.map(r => (
                  <tr key={r.part_no} style={{ background: r.shortage > r.safety_stock * 0.5 ? '#fffbeb' : '#fff' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.part_no}</td>
                    <td style={{ fontSize: 12 }}>{r.item_name}</td>
                    <td style={{ fontSize: 11, color: '#64748b' }}>{TYPE_LABEL[r.item_type] || r.item_type}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: '#dc2626' }}>{fmt(r.current_stock)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(r.safety_stock)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{fmt(r.shortage)}</td>
                    <td style={{ textAlign: 'right', fontSize: 11 }}>{r.lead_time_days}일</td>
                    <td style={{ fontSize: 11, color: '#64748b' }}>{r.supplier || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 긴급 미처리 PR */}
      {data.urgent_pr_count > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed', marginBottom: 6 }}>
            📋 긴급 미처리 PR (D-7 이내) {badge(data.urgent_pr_count, '#7c3aed')}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PR번호</th><th>품번</th><th>품명</th>
                  <th style={{ textAlign: 'right' }}>수량</th>
                  <th>필요일</th><th>발주마감일</th>
                  <th style={{ textAlign: 'right' }}>여유</th>
                  <th>상태</th><th>출처</th>
                </tr>
              </thead>
              <tbody>
                {data.urgent_pr.map(r => (
                  <tr key={r.pr_no} style={{ background: r.days_to_order < 0 ? '#fef2f2' : r.days_to_order <= 3 ? '#fffbeb' : '#fff' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.pr_no}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.part_no}</td>
                    <td style={{ fontSize: 12 }}>{r.item_name}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(r.qty)}</td>
                    <td style={{ fontSize: 12 }}>{r.need_date}</td>
                    <td style={{ fontSize: 12, color: r.days_to_order < 0 ? '#dc2626' : '#d97706' }}>{r.order_by_date}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: r.days_to_order < 0 ? '#dc2626' : '#d97706' }}>
                      {r.days_to_order < 0 ? `${r.days_to_order}일` : `D-${r.days_to_order}`}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, background: r.status === '승인' ? '#dcfce7' : '#fef9c3', color: r.status === '승인' ? '#15803d' : '#854d0e', borderRadius: 4, padding: '1px 6px' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: '#64748b' }}>{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 지연 생산오더 */}
      {data.late_pord_count > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0369a1', marginBottom: 6 }}>
            🏭 지연 생산오더 {badge(data.late_pord_count, '#0369a1')}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>오더번호</th><th>품번</th><th>품명</th>
                  <th style={{ textAlign: 'right' }}>계획</th>
                  <th style={{ textAlign: 'right' }}>실적</th>
                  <th style={{ textAlign: 'right' }}>잔량</th>
                  <th>계획일</th>
                  <th style={{ textAlign: 'right' }}>지연일</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.late_production_order.map(r => (
                  <tr key={r.pord_no} style={{ background: r.delay_days > 7 ? '#eff6ff' : '#fff' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.pord_no}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.part_no}</td>
                    <td style={{ fontSize: 12 }}>{r.item_name}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(r.planned_qty)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: '#16a34a' }}>{fmt(r.actual_qty)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{fmt(r.remaining)}</td>
                    <td style={{ fontSize: 12, color: '#0369a1' }}>{r.plan_date}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0369a1' }}>+{r.delay_days}일</td>
                    <td style={{ fontSize: 11 }}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.late_po_count === 0 && data.safety_stock_alert_count === 0 && data.urgent_pr_count === 0 && data.late_pord_count === 0 && (
        <div style={{ textAlign: 'center', color: '#16a34a', padding: '40px 0', fontSize: 14 }}>
          ✅ 현재 예외사항 없음 ({data.as_of} 기준)
        </div>
      )}
    </div>
  )
}

// ── 구매요청(PR) 목록 탭 ───────────────────────────────────────────
function PrTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/purchase-requests' + (filterStatus ? `?status=${encodeURIComponent(filterStatus)}` : ''))
      setRows(r.data)
    } catch (e) {
      alert(e.response?.data?.detail || 'PR 로드 실패')
    } finally { setLoading(false) }
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  const approve = async (pr_no) => {
    try {
      await api.patch(`/purchase-requests/${pr_no}/approve`)
      load()
    } catch (e) { alert(e.response?.data?.detail || '승인 실패') }
  }

  const reject = async (pr_no) => {
    const reason = prompt('반려 사유를 입력하세요')
    if (reason === null) return
    try {
      await api.patch(`/purchase-requests/${pr_no}/reject?note=${encodeURIComponent(reason)}`)
      load()
    } catch (e) { alert(e.response?.data?.detail || '반려 실패') }
  }

  const statusColor = {
    '작성중': { bg: '#f1f5f9', color: '#475569' },
    '승인대기': { bg: '#fef9c3', color: '#854d0e' },
    '승인': { bg: '#dcfce7', color: '#15803d' },
    '반려': { bg: '#fee2e2', color: '#dc2626' },
    'PO전환': { bg: '#dbeafe', color: '#1d4ed8' },
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>구매요청(PR) 목록</span>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 4 }}>
          <option value="">전체 상태</option>
          <option value="승인대기">승인대기</option>
          <option value="승인">승인</option>
          <option value="PO전환">PO전환</option>
          <option value="반려">반려</option>
        </select>
        <button className="btn btn-sm" onClick={load}>{loading ? '로딩...' : '새로고침'}</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>PR번호</th><th>품번</th><th>품명</th>
              <th style={{ textAlign: 'right' }}>수량</th>
              <th>필요일</th><th>발주마감일</th>
              <th style={{ textAlign: 'right' }}>여유</th>
              <th>상태</th><th>출처</th><th>요청자</th><th>승인자</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={12} className="empty">구매요청 없음</td></tr>
            )}
            {rows.map(r => {
              const sc = statusColor[r.status] || { bg: '#f1f5f9', color: '#475569' }
              return (
                <tr key={r.pr_no} style={{ background: r.is_overdue ? '#fef2f2' : r.is_urgent ? '#fffbeb' : '#fff' }}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.pr_no}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.part_no}</td>
                  <td style={{ fontSize: 12 }}>{r.item_name}</td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(r.qty)}</td>
                  <td style={{ fontSize: 12 }}>{r.need_date}</td>
                  <td style={{ fontSize: 12, color: r.is_overdue ? '#dc2626' : r.is_urgent ? '#d97706' : '#475569' }}>{r.order_by_date || '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: r.is_overdue ? '#dc2626' : r.is_urgent ? '#d97706' : '#16a34a' }}>
                    {r.days_to_order !== null ? (r.days_to_order < 0 ? `${r.days_to_order}일` : `D-${r.days_to_order}`) : '—'}
                  </td>
                  <td>
                    <span style={{ fontSize: 11, background: sc.bg, color: sc.color, borderRadius: 4, padding: '1px 6px' }}>{r.status}</span>
                  </td>
                  <td style={{ fontSize: 11, color: '#64748b' }}>{r.source}{r.source_ref ? ` (${r.source_ref})` : ''}</td>
                  <td style={{ fontSize: 11 }}>{r.requested_by}</td>
                  <td style={{ fontSize: 11, color: '#64748b' }}>{r.approved_by || '—'}</td>
                  <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                    {r.status === '승인대기' && (
                      <>
                        <button className="btn btn-sm" style={{ marginRight: 4, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}
                          onClick={() => approve(r.pr_no)}>승인</button>
                        <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                          onClick={() => reject(r.pr_no)}>반려</button>
                      </>
                    )}
                    {r.status === '승인' && !r.po_no && (
                      <span style={{ fontSize: 11, color: '#64748b' }}>거래처 지정 후 PO전환</span>
                    )}
                    {r.po_no && (
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8' }}>{r.po_no}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 메인 MRP 페이지 ───────────────────────────────────────────────
export default function Mrp() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [buySelected, setBuySelected] = useState({})
  const [prodSelected, setProdSelected] = useState({})
  const [partners, setPartners] = useState([])
  const [generating, setGenerating] = useState(false)
  const [generatedPR, setGeneratedPR] = useState(null)
  const [generatedProd, setGeneratedProd] = useState(null)
  const [tab, setTab] = useState('mrp')   // 'mrp' | 'exceptions' | 'pr'

  const runMrp = async () => {
    setLoading(true); setResult(null); setBuySelected({}); setProdSelected({})
    setGeneratedPR(null); setGeneratedProd(null)
    try {
      const r = await api.get(`/mrp/run?year=${year}&month=${month}`)
      setResult(r.data)
      api.get('/master/partners').then(p => setPartners(p.data.filter(x => x.partner_type !== '고객'))).catch(() => {})

      const buyS = {}
      for (const req of r.data.purchase_requirements || []) {
        if (req.need_order) {
          buyS[req.part_no] = { checked: true, qty: req.order_qty, partner_id: '', unit_price: req.avg_cost || req.std_price || 0 }
        }
      }
      setBuySelected(buyS)

      const prodS = {}
      for (const req of r.data.production_requirements || []) {
        if (req.need_order) {
          prodS[req.part_no] = { checked: true, qty: req.order_qty }
        }
      }
      setProdSelected(prodS)
    } catch (e) {
      alert(e.response?.data?.detail || 'MRP 실행 실패')
    } finally { setLoading(false) }
  }

  // 구매발주 대신 구매요청(PR) 생성
  const generatePRs = async () => {
    const lines = Object.entries(buySelected)
      .filter(([, v]) => v.checked && v.qty > 0)
      .map(([part_no, v]) => ({
        part_no, qty: parseInt(v.qty),
        partner_id: v.partner_id || null,
        unit_price: parseFloat(v.unit_price || 0) || null,
      }))
    if (!lines.length) return alert('발주 제안 항목을 선택하세요')
    setGenerating(true)
    try {
      const r = await api.post('/mrp/generate-purchase-requests', { year, month, lines })
      setGeneratedPR(r.data)
    } catch (e) {
      alert(e.response?.data?.detail || '구매요청 생성 실패')
    } finally { setGenerating(false) }
  }

  const generateProdOrders = async () => {
    const lines = Object.entries(prodSelected)
      .filter(([, v]) => v.checked && v.qty > 0)
      .map(([part_no, v]) => ({ part_no, qty: parseInt(v.qty) }))
    if (!lines.length) return alert('생산오더 생성할 항목이 없습니다')
    setGenerating(true)
    try {
      const r = await api.post('/mrp/generate-production-orders', { year, month, lines })
      setGeneratedProd(r.data)
    } catch (e) {
      alert(e.response?.data?.detail || '생산오더 생성 실패')
    } finally { setGenerating(false) }
  }

  const toggleBuy  = p => setBuySelected(s => ({ ...s, [p]: { ...s[p], checked: !s[p]?.checked } }))
  const toggleProd = p => setProdSelected(s => ({ ...s, [p]: { ...s[p], checked: !s[p]?.checked } }))
  const setBuyField  = (p, k, v) => setBuySelected(s => ({ ...s, [p]: { ...s[p], [k]: v } }))
  const setProdField = (p, k, v) => setProdSelected(s => ({ ...s, [p]: { ...s[p], [k]: v } }))

  const s = result?.summary || {}
  const buyRows  = result?.purchase_requirements  || []
  const prodRows = result?.production_requirements || []
  const demandRows = result?.product_demand || []

  const buyNeedCount  = buyRows.filter(r => r.need_order).length
  const prodNeedCount = prodRows.filter(r => r.need_order).length
  const buyChecked    = Object.values(buySelected).filter(v => v.checked).length
  const prodChecked   = Object.values(prodSelected).filter(v => v.checked).length

  const overdueCount = buyRows.filter(r => r.is_overdue && r.need_order).length
  const urgentCount  = buyRows.filter(r => r.is_urgent && r.need_order).length

  const TAB_STYLE = (active) => ({
    padding: '7px 18px', fontSize: 13, fontWeight: active ? 700 : 400,
    color: active ? '#1d4ed8' : '#64748b', background: active ? '#eff6ff' : 'transparent',
    border: 'none', borderBottom: active ? '2px solid #1d4ed8' : '2px solid transparent',
    cursor: 'pointer',
  })

  return (
    <div style={{ padding: '0 0 32px' }}>
      <div style={{ fontWeight: 800, fontSize: 18, color: '#1e3a5f', marginBottom: 16 }}>MRP — 자재소요량계획</div>

      {/* 탭 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 16 }}>
        <button style={TAB_STYLE(tab === 'mrp')} onClick={() => setTab('mrp')}>📊 MRP 계획</button>
        <button style={TAB_STYLE(tab === 'exceptions')} onClick={() => setTab('exceptions')}>🚨 예외사항</button>
        <button style={TAB_STYLE(tab === 'pr')} onClick={() => setTab('pr')}>📋 구매요청(PR)</button>
      </div>

      {/* ── MRP 계획 탭 ── */}
      {tab === 'mrp' && (
        <>
          <div className="erp-panel" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>연도</span>
                <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))}
                  style={{ width: 80, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>월</span>
                <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
                  style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" onClick={runMrp} disabled={loading}>
                {loading ? 'MRP 계산 중...' : 'MRP 실행'}
              </button>
            </div>
          </div>

          {result && (
            <>
              {/* KPI */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                  { label: '제품 수요', val: `${demandRows.length}품목`, bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
                  { label: '구매발주 필요', val: `${s.need_purchase_count || 0}품목`, bg: '#fef2f2', border: '#fecaca', color: '#dc2626' },
                  { label: '예상 발주금액', val: fmtW(s.estimated_purchase_amount || 0), bg: '#1e3a5f', border: '#1e40af', color: '#fff' },
                  { label: '생산오더 필요', val: `${s.need_production_count || 0}품목`, bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' },
                  ...(overdueCount > 0 ? [{ label: '발주 초과', val: `${overdueCount}건`, bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' }] : []),
                  ...(urgentCount > 0  ? [{ label: '긴급 (D-3)', val: `${urgentCount}건`, bg: '#fffbeb', border: '#fde68a', color: '#d97706' }] : []),
                ].map(({ label, val, bg, border, color }) => (
                  <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '10px 18px', minWidth: 150 }}>
                    <div style={{ fontSize: 11, color: color === '#fff' ? '#93c5fd' : color, fontWeight: 600, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* 범례 */}
              {buyNeedCount > 0 && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11, alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>여유 색상:</span>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>■ 적색 = 발주 초과(D+)</span>
                  <span style={{ color: '#d97706', fontWeight: 700 }}>■ 주황 = 긴급(D-0~3)</span>
                  <span style={{ color: '#16a34a' }}>■ 녹색 = 여유</span>
                </div>
              )}

              {/* 수요 소스 */}
              {demandRows.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>수요 소스 ({year}년 {month}월)</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {demandRows.map(d => (
                      <div key={d.part_no} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                        <span style={{ fontFamily: 'monospace', color: '#1d4ed8' }}>{d.part_no}</span>
                        <span style={{ color: '#64748b', marginLeft: 6 }}>{fmt(d.qty)}EA</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 구매발주 섹션 */}
              <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📦 구매자재 소요 ({buyRows.length}품목, 발주 필요 {buyNeedCount}건)</span>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>raw / sub / outsourced</span>
              </div>
              <ReqTable rows={buyRows} selected={buySelected}
                onToggle={toggleBuy} onFieldChange={setBuyField}
                partners={partners} type="buy" />

              {buyNeedCount > 0 && !generatedPR && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 24 }}>
                  <button className="btn btn-primary" onClick={generatePRs} disabled={generating}>
                    {generating ? '생성 중...' : `구매요청(PR) 생성 (${buyChecked}건)`}
                  </button>
                </div>
              )}
              {generatedPR && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 14, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 6 }}>
                    구매요청(PR) {generatedPR.count}건 생성 완료 — 구매요청(PR) 탭에서 승인 처리 후 PO 전환하세요
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {generatedPR.created.map(c => (
                      <span key={c.pr_no} style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontFamily: 'monospace' }}>
                        {c.pr_no} ({c.part_no} × {fmt(c.qty)}, 발주마감 {c.order_by_date})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 생산오더 섹션 */}
              <div style={{ fontWeight: 700, fontSize: 13, color: '#15803d', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🏭 생산오더 추천 ({prodRows.length}품목, 생산 필요 {prodNeedCount}건)</span>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>semi / finished</span>
              </div>
              <ReqTable rows={prodRows} selected={prodSelected}
                onToggle={toggleProd} onFieldChange={setProdField}
                partners={[]} type="make" />

              {prodNeedCount > 0 && !generatedProd && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 24 }}>
                  <button className="btn btn-primary" style={{ background: '#15803d', borderColor: '#15803d' }}
                    onClick={generateProdOrders} disabled={generating}>
                    {generating ? '생성 중...' : `생산오더 생성 (${prodChecked}건)`}
                  </button>
                </div>
              )}
              {generatedProd && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 6 }}>생산오더 {generatedProd.count}건 생성 완료</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {generatedProd.created.map(c => (
                      <span key={c.pord_no} style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontFamily: 'monospace' }}>
                        {c.pord_no} ({c.part_no} × {fmt(c.qty)})
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>생산 관리 → 생산오더에서 확인하세요</div>
                </div>
              )}
            </>
          )}

          {!result && !loading && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '60px 0', fontSize: 14 }}>
              연도·월을 선택하고 MRP 실행을 클릭하세요<br />
              <span style={{ fontSize: 12 }}>수주 + 생산계획 → BOM 전개 → Buy(구매요청 → 승인 → PO) / Make(생산오더) 분기</span>
            </div>
          )}
        </>
      )}

      {/* ── 예외사항 탭 ── */}
      {tab === 'exceptions' && <ExceptionTab />}

      {/* ── 구매요청(PR) 탭 ── */}
      {tab === 'pr' && <PrTab />}
    </div>
  )
}
