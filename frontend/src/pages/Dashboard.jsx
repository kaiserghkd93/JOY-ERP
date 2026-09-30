import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import * as XLSX from 'xlsx'
import api from '../api'

function exportExcel(rows, columns, filename) {
  const data = [columns.map(c => c.label), ...rows.map(r => columns.map(c => r[c.key]))]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}

export default function Dashboard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [kpi, setKpi] = useState(null)
  const [scorecard, setScorecard] = useState([])
  const [customerScorecard, setCustomerScorecard] = useState([])
  const [closing, setClosing] = useState(null)
  const [stockSummary, setStockSummary] = useState([])
  const [salesByPartner, setSalesByPartner] = useState([])
  const [purchaseByPartner, setPurchaseByPartner] = useState([])
  const [monthlyTrend, setMonthlyTrend] = useState([])

  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get(`/dashboard/kpi?year=${year}&month=${month}`).then(r => setKpi(r.data)).catch(() => {}),
      api.get('/dashboard/supplier-scorecard').then(r => setScorecard(r.data)).catch(() => {}),
      api.get(`/dashboard/customer-scorecard?year=${year}&month=${month}`).then(r => setCustomerScorecard(r.data)).catch(() => {}),
      api.get(`/dashboard/monthly-closing?year=${year}&month=${month}`).then(r => setClosing(r.data)).catch(() => {}),
      api.get('/dashboard/stock-summary').then(r => setStockSummary(r.data)).catch(() => {}),
      api.get(`/dashboard/sales-by-partner?year=${year}&month=${month}`).then(r => setSalesByPartner(r.data)).catch(() => {}),
      api.get(`/dashboard/purchase-by-partner?year=${year}&month=${month}`).then(r => setPurchaseByPartner(r.data)).catch(() => {}),
      api.get(`/dashboard/monthly-trend?year=${year}`).then(r => setMonthlyTrend(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year, month])

  const totalSales = closing?.sales?.reduce((s, r) => s + (r.revenue ?? 0), 0) ?? 0
  const totalPurchases = closing?.purchases?.reduce((s, r) => s + (r.buy_amt ?? 0), 0) ?? 0

  const salesTotal = salesByPartner.reduce((s, r) => s + r.amount, 0)
  const purchaseTotal = purchaseByPartner.reduce((s, r) => s + r.amount, 0)

  return (
    <div>
      <div className="toolbar">
        <select value={year} onChange={e => setYear(+e.target.value)} style={{ width: 90 }}>
          {[2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={{ width: 70 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <button className="btn btn-outline" onClick={load} disabled={loading}>
          {loading ? '로딩 중...' : '⟳ 새로고침'}
        </button>
        {loading && <span style={{ fontSize: 12, color: 'var(--text-sm)' }}>데이터 불러오는 중...</span>}
      </div>

      {/* 발주 현황 요약 바 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 20px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600 }}>오늘 신규 발주</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#1d4ed8' }}>{kpi?.po_today ?? '—'}<span style={{ fontSize: 13, fontWeight: 400 }}> 건</span></div>
        </div>
        <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 20px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>이달 누계 발주</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706' }}>{kpi?.po_this_month ?? '—'}<span style={{ fontSize: 13, fontWeight: 400 }}> 건</span></div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 20px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>미입고 진행중</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#16a34a' }}>{kpi?.po_open ?? '—'}<span style={{ fontSize: 13, fontWeight: 400 }}> 건</span></div>
        </div>
      </div>

      {/* KPI 카드 4종 */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">On-time Rate</div>
          <div className="kpi-value">
            {kpi != null ? kpi.delivery_rate.toFixed(1) : '—'}
            <span className="kpi-unit"> %</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">불량율</div>
          <div className="kpi-value">
            {kpi != null ? kpi.defect_rate.toFixed(2) : '—'}
            <span className="kpi-unit"> %</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">재고회전율</div>
          <div className="kpi-value">
            {kpi != null ? kpi.inventory_turnover.toFixed(2) : '—'}
            <span className="kpi-unit"> 회</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">매출총이익 / 마진율</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>
            {kpi != null ? `₩${Number(kpi.gross_profit).toLocaleString()}` : '—'}
          </div>
          <div className="kpi-unit">{kpi != null ? `마진율 ${kpi.margin_rate.toFixed(1)}%` : ''}</div>
        </div>
      </div>

      {/* 월 마감 + 재고 차트 */}
      <div className="chart-row">
        <div className="card">
          <div className="section-title">월 마감 요약 ({year}년 {month}월)</div>
          <table>
            <tbody>
              {/* 매출 합계 */}
              <tr style={{ background: '#eff6ff' }}>
                <td style={{ fontWeight: 700, fontSize: 13, paddingLeft: 8 }}>매출</td>
                <td className="text-right" style={{ fontWeight: 700, color: '#1d4ed8' }}>₩{totalSales.toLocaleString()}</td>
              </tr>
              {salesByPartner.map(r => (
                <tr key={r.partner_id}>
                  <td style={{ paddingLeft: 20, fontSize: 12, color: '#475569' }}>└ {r.partner_name}</td>
                  <td className="text-right" style={{ fontSize: 12, color: '#1d4ed8' }}>₩{r.amount.toLocaleString()}</td>
                </tr>
              ))}
              {salesByPartner.length === 0 && (
                <tr><td colSpan={2} style={{ paddingLeft: 20, fontSize: 12, color: '#94a3b8' }}>출고 데이터 없음</td></tr>
              )}
              {/* 매입 합계 */}
              <tr style={{ background: '#fff7ed', borderTop: '1px solid var(--border)' }}>
                <td style={{ fontWeight: 700, fontSize: 13, paddingLeft: 8 }}>매입</td>
                <td className="text-right" style={{ fontWeight: 700, color: '#ea580c' }}>₩{totalPurchases.toLocaleString()}</td>
              </tr>
              {purchaseByPartner.map(r => (
                <tr key={r.partner_id}>
                  <td style={{ paddingLeft: 20, fontSize: 12, color: '#475569' }}>└ {r.partner_name}</td>
                  <td className="text-right" style={{ fontSize: 12, color: '#ea580c' }}>₩{r.amount.toLocaleString()}</td>
                </tr>
              ))}
              {purchaseByPartner.length === 0 && (
                <tr><td colSpan={2} style={{ paddingLeft: 20, fontSize: 12, color: '#94a3b8' }}>입고 데이터 없음</td></tr>
              )}
              {/* 총이익 */}
              <tr style={{ borderTop: '2px solid var(--border)', background: '#f0fdf4' }}>
                <td style={{ fontWeight: 700, paddingLeft: 8 }}>총이익</td>
                <td className="text-right" style={{ fontWeight: 700, color: totalSales - totalPurchases >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  ₩{(totalSales - totalPurchases).toLocaleString()}
                  {totalSales > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, color: 'var(--text-sm)' }}>
                      ({((totalSales - totalPurchases) / totalSales * 100).toFixed(1)}%)
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="section-title">재고 현황 (상위 10, 재고금액 기준)</div>
          {stockSummary.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stockSummary.slice(0, 10)} margin={{ top: 4, right: 0, left: -10, bottom: 35 }}>
                <XAxis dataKey="part_no" tick={{ fontSize: 9 }} angle={-40} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `${v.toLocaleString()}개`} />
                <Bar dataKey="current_stock" fill="#1d4ed8" name="재고수량" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty">재고 없음</div>}
        </div>
      </div>

      {/* 월별 매출/매입 트렌드 */}
      <div className="section-title mt-16">월별 매출 / 매입 트렌드 ({year}년)</div>
      <div className="card" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <XAxis dataKey="month" tickFormatter={m => `${m}월`} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
            <Tooltip formatter={(v, name) => [`₩${Number(v).toLocaleString()}`, name]} labelFormatter={m => `${m}월`} />
            <Legend />
            <Line type="monotone" dataKey="sales" stroke="#1d4ed8" strokeWidth={2} name="매출" dot={{ r: 3 }} />
            <Line type="monotone" dataKey="purchases" stroke="#dc2626" strokeWidth={2} name="매입" dot={{ r: 3 }} />
            <Line type="monotone" dataKey="profit" stroke="#16a34a" strokeWidth={2} strokeDasharray="4 2" name="이익" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 고객사별 월별 출고금액 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 6 }}>
        <div className="section-title" style={{ margin: 0 }}>고객사별 출고금액 ({year}년 {month}월)</div>
        <button className="btn btn-sm btn-outline" onClick={() => exportExcel(
          salesByPartner,
          [
            { key: 'partner_name', label: '고객사명' },
            { key: 'qty', label: '출고수량' },
            { key: 'amount', label: '출고금액(원)' },
          ],
          `고객사별_출고금액_${year}${String(month).padStart(2,'0')}.xlsx`
        )}>Excel</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>순위</th>
              <th>고객사명</th>
              <th style={{ textAlign: 'right' }}>출고수량</th>
              <th style={{ textAlign: 'right' }}>출고금액</th>
              <th style={{ textAlign: 'right' }}>비율</th>
            </tr>
          </thead>
          <tbody>
            {salesByPartner.length === 0 && <tr><td colSpan={5} className="empty">해당 월 출고 데이터 없음</td></tr>}
            {salesByPartner.map((r, i) => (
              <tr key={r.partner_id}>
                <td style={{ textAlign: 'center', color: 'var(--text-sm)', fontSize: 12 }}>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{r.partner_name}</td>
                <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1d4ed8' }}>₩{r.amount.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-sm)' }}>
                  {salesTotal > 0 ? ((r.amount / salesTotal) * 100).toFixed(1) + '%' : '—'}
                </td>
              </tr>
            ))}
            {salesByPartner.length > 0 && (
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: '#f8fafc' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
                <td style={{ textAlign: 'right', color: '#1d4ed8' }}>₩{salesTotal.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>100%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 외주처별 월별 입고금액 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 6 }}>
        <div className="section-title" style={{ margin: 0 }}>외주처별 입고금액 ({year}년 {month}월)</div>
        <button className="btn btn-sm btn-outline" onClick={() => exportExcel(
          purchaseByPartner,
          [
            { key: 'partner_name', label: '외주처명' },
            { key: 'qty', label: '입고수량' },
            { key: 'amount', label: '입고금액(원)' },
          ],
          `외주처별_입고금액_${year}${String(month).padStart(2,'0')}.xlsx`
        )}>Excel</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>순위</th>
              <th>외주처명</th>
              <th style={{ textAlign: 'right' }}>입고수량</th>
              <th style={{ textAlign: 'right' }}>입고금액</th>
              <th style={{ textAlign: 'right' }}>비율</th>
            </tr>
          </thead>
          <tbody>
            {purchaseByPartner.length === 0 && <tr><td colSpan={5} className="empty">해당 월 입고 데이터 없음</td></tr>}
            {purchaseByPartner.map((r, i) => (
              <tr key={r.partner_id}>
                <td style={{ textAlign: 'center', color: 'var(--text-sm)', fontSize: 12 }}>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{r.partner_name}</td>
                <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>₩{r.amount.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-sm)' }}>
                  {purchaseTotal > 0 ? ((r.amount / purchaseTotal) * 100).toFixed(1) + '%' : '—'}
                </td>
              </tr>
            ))}
            {purchaseByPartner.length > 0 && (
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: '#f8fafc' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
                <td style={{ textAlign: 'right', color: '#16a34a' }}>₩{purchaseTotal.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>100%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 고객사 납기준수율 스코어카드 */}
      <div className="section-title mt-16">고객사 납기준수율 스코어카드</div>
      {customerScorecard.length > 0 ? (
        <div className="table-wrap" style={{ marginBottom: 24 }}>
          <table>
            <thead>
              <tr>
                <th>고객사명</th>
                <th style={{ textAlign: 'right' }}>전체 수주</th>
                <th style={{ textAlign: 'right' }}>출하완료</th>
                <th style={{ textAlign: 'right' }}>납기준수</th>
                <th>납기준수율</th>
                <th style={{ textAlign: 'right' }}>총 출하금액</th>
              </tr>
            </thead>
            <tbody>
              {customerScorecard.map(c => {
                const dr = c.delivery_rate
                return (
                  <tr key={c.partner_id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-sm)' }}>{c.total_orders}건</td>
                    <td style={{ textAlign: 'right' }}>{c.closed_orders}건</td>
                    <td style={{ textAlign: 'right', color: '#1d4ed8', fontWeight: 600 }}>{c.on_time}건</td>
                    <td>
                      {dr != null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', minWidth: 80
                          }}>
                            <div style={{
                              width: `${Math.min(dr, 100)}%`, height: '100%', borderRadius: 4,
                              background: dr >= 90 ? '#16a34a' : dr >= 70 ? '#d97706' : '#dc2626',
                              transition: 'width 0.3s',
                            }} />
                          </div>
                          <span className={`badge ${dr >= 90 ? 'badge-green' : dr >= 70 ? 'badge-amber' : 'badge-red'}`} style={{ minWidth: 52, textAlign: 'center' }}>
                            {dr.toFixed(1)}%
                          </span>
                        </div>
                      ) : (
                        <span className="badge badge-gray">데이터없음</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1d4ed8' }}>
                      ₩{Number(c.total_ship_amt).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty" style={{ marginBottom: 24 }}>고객사 데이터 없음</div>
      )}

      {/* 외주처 스코어카드 */}
      <div className="section-title mt-16">외주처 스코어카드</div>
      {scorecard.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>외주처명</th>
                <th>발주건수</th>
                <th>On-time Rate</th>
                <th>불량율</th>
                <th>총입고금액</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.map(s => {
                const dr = s.delivery_rate ?? null
                const fr = s.defect_rate ?? null
                return (
                  <tr key={s.partner_id}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td>{s.total_pos}건</td>
                    <td>
                      {dr != null
                        ? <span className={`badge ${dr >= 90 ? 'badge-green' : dr >= 70 ? 'badge-amber' : 'badge-red'}`}>{dr.toFixed(1)}%</span>
                        : <span className="badge badge-gray">데이터없음</span>}
                    </td>
                    <td>
                      {fr != null
                        ? <span className={`badge ${fr <= 1 ? 'badge-green' : fr <= 5 ? 'badge-amber' : 'badge-red'}`}>{fr.toFixed(2)}%</span>
                        : <span className="badge badge-gray">데이터없음</span>}
                    </td>
                    <td>₩{Number(s.total_buy_amt ?? 0).toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">외주처 데이터 없음 — 기준정보에서 거래처를 등록하세요</div>
      )}
    </div>
  )
}
