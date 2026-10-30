import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import * as XLSX from 'xlsx'
import api from '../api'
import { getRole } from '../auth'

// ── 역할별 노출 섹션 정의 ─────────────────────────────────────────
// true = 보임 / false = 숨김
// 역할별 노출 섹션. 없는 역할은 admin과 동일하게 처리됨.
// supplier_scorecard = 외주처 스코어카드 (총입고금액 포함) → 구매 담당만 표시
const ROLE_SECTIONS = {
  // ── 관리·경영 ──────────────────────────────────────────────────
  admin: {
    summary: true, kpi_delivery: true, kpi_quality: true, kpi_inventory: true, kpi_profit: true,
    target: true, closing: true, stock_chart: true, monthly_trend: true,
    sales_table: true, purchase_table: true, customer_scorecard: true,
    quality_dashboard: true, supplier_scorecard: true,
  },
  executive: {
    // 대표/전무: 매출·이익·품질 요약. 구매·재고 세부 제외
    summary: true, kpi_delivery: true, kpi_quality: true, kpi_inventory: false, kpi_profit: true,
    target: true, closing: true, stock_chart: false, monthly_trend: true,
    sales_table: false, purchase_table: false, customer_scorecard: false,
    quality_dashboard: true, supplier_scorecard: false,
  },
  manager: {
    // 상무: 전체에 준하되 외주처 세부 포함
    summary: true, kpi_delivery: true, kpi_quality: true, kpi_inventory: true, kpi_profit: true,
    target: true, closing: true, stock_chart: false, monthly_trend: true,
    sales_table: false, purchase_table: false, customer_scorecard: true,
    quality_dashboard: true, supplier_scorecard: true,
  },
  owner: {
    // 오너: 목표달성률 + 품질 현황만
    summary: false, kpi_delivery: false, kpi_quality: false, kpi_inventory: false, kpi_profit: false,
    target: true, closing: false, stock_chart: false, monthly_trend: false,
    sales_table: false, purchase_table: false, customer_scorecard: false,
    quality_dashboard: true, supplier_scorecard: false,
  },
  // ── 재무·영업 ──────────────────────────────────────────────────
  accounting: {
    // 경리: 매출·매입·이익·트렌드. 품질·외주처 제외
    summary: true, kpi_delivery: false, kpi_quality: false, kpi_inventory: true, kpi_profit: true,
    target: true, closing: true, stock_chart: false, monthly_trend: true,
    sales_table: true, purchase_table: true, customer_scorecard: false,
    quality_dashboard: false, supplier_scorecard: false,
  },
  sales: {
    // 영업: 매출·납기·고객사 현황. 구매·품질 제외
    summary: true, kpi_delivery: true, kpi_quality: false, kpi_inventory: false, kpi_profit: false,
    target: true, closing: false, stock_chart: false, monthly_trend: true,
    sales_table: true, purchase_table: false, customer_scorecard: true,
    quality_dashboard: false, supplier_scorecard: false,
  },
  shipping: {
    // 출하: 납기·매출·고객사 납기. 구매·품질 제외
    summary: true, kpi_delivery: true, kpi_quality: false, kpi_inventory: false, kpi_profit: false,
    target: true, closing: false, stock_chart: false, monthly_trend: false,
    sales_table: true, purchase_table: false, customer_scorecard: true,
    quality_dashboard: false, supplier_scorecard: false,
  },
  // ── 구매·자재 ──────────────────────────────────────────────────
  purchase: {
    // 외주구매: 발주·입고·재고·불량률·외주처 스코어카드
    summary: true, kpi_delivery: false, kpi_quality: true, kpi_inventory: true, kpi_profit: false,
    target: false, closing: false, stock_chart: true, monthly_trend: false,
    sales_table: false, purchase_table: true, customer_scorecard: false,
    quality_dashboard: false, supplier_scorecard: true,
  },
  material: {
    // 자재구매: 재고 현황만
    summary: false, kpi_delivery: false, kpi_quality: false, kpi_inventory: true, kpi_profit: false,
    target: false, closing: false, stock_chart: true, monthly_trend: false,
    sales_table: false, purchase_table: false, customer_scorecard: false,
    quality_dashboard: false, supplier_scorecard: false,
  },
  // ── 품질 ───────────────────────────────────────────────────────
  quality: {
    // 품질검사 담당자: 품질 KPI + 품질 대시보드만. 구매·매출 전면 제외
    summary: false, kpi_delivery: false, kpi_quality: true, kpi_inventory: false, kpi_profit: false,
    target: false, closing: false, stock_chart: false, monthly_trend: false,
    sales_table: false, purchase_table: false, customer_scorecard: false,
    quality_dashboard: true, supplier_scorecard: false,
  },
  quality_manager: {
    // 품질책임자: 품질 KPI + 납기준수율 + 고객사 납기 스코어카드. 구매·매출 제외
    summary: false, kpi_delivery: true, kpi_quality: true, kpi_inventory: false, kpi_profit: false,
    target: false, closing: false, stock_chart: false, monthly_trend: false,
    sales_table: false, purchase_table: false, customer_scorecard: true,
    quality_dashboard: true, supplier_scorecard: false,
  },
  // ── 생산 ───────────────────────────────────────────────────────
  production: {
    // 생산관리: 불량률 + 품질 대시보드. 구매·매출 제외
    summary: false, kpi_delivery: false, kpi_quality: true, kpi_inventory: false, kpi_profit: false,
    target: false, closing: false, stock_chart: false, monthly_trend: false,
    sales_table: false, purchase_table: false, customer_scorecard: false,
    quality_dashboard: true, supplier_scorecard: false,
  },
  manufacturing: {
    // 제조관리 총괄: 불량률 + 재고 + 품질 대시보드. 매출·구매금액 제외
    summary: false, kpi_delivery: false, kpi_quality: true, kpi_inventory: true, kpi_profit: false,
    target: false, closing: false, stock_chart: true, monthly_trend: false,
    sales_table: false, purchase_table: false, customer_scorecard: false,
    quality_dashboard: true, supplier_scorecard: false,
  },
}

function exportExcel(rows, columns, filename) {
  const data = [columns.map(c => c.label), ...rows.map(r => columns.map(c => r[c.key]))]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}

function KpiCard({ icon, label, value, unit, sub, accent, trend, trendDir }) {
  return (
    <div className="kpi-card">
      <div className="kpi-card-icon">{icon}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value ?? '—'}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {sub && <div className="text-muted" style={{ fontSize: 11 }}>{sub}</div>}
      {trendDir && (
        <div className={`kpi-trend ${trendDir}`}>
          {trendDir === 'up' ? '▲' : trendDir === 'down' ? '▼' : '—'} {trend}
        </div>
      )}
      <div className="kpi-accent-bar" style={{ background: accent }} />
    </div>
  )
}

function SummaryBox({ label, value, unit, color, bg, border }) {
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 'var(--radius)', padding: '12px 18px',
      flex: 1, textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>
        {value ?? '—'}
        <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  )
}

const customTooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12,
  padding: '6px 12px',
  boxShadow: 'var(--shadow)',
}

export default function Dashboard() {
  const now = new Date()
  const role = getRole()
  const show = ROLE_SECTIONS[role] || ROLE_SECTIONS.admin

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
  const [vsTarget, setVsTarget] = useState(null)
  const [qualityKpi, setQualityKpi] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    const needsKpi = show.summary || show.kpi_delivery || show.kpi_quality || show.kpi_inventory || show.kpi_profit
    const needsSales = show.summary || show.closing || show.sales_table
    const needsPurchase = show.closing || show.purchase_table
    const calls = []
    if (show.target || show.quality_dashboard)
      calls.push(api.get(`/dashboard/sales-vs-target?year=${year}&month=${month}`).then(r => setVsTarget(r.data)).catch(() => {}))
    if (show.quality_dashboard)
      calls.push(api.get(`/dashboard/quality-summary?year=${year}&month=${month}`).then(r => setQualityKpi(r.data)).catch(() => {}))
    if (needsKpi)
      calls.push(api.get(`/dashboard/kpi?year=${year}&month=${month}`).then(r => setKpi(r.data)).catch(() => {}))
    if (show.supplier_scorecard)
      calls.push(api.get('/dashboard/supplier-scorecard').then(r => setScorecard(r.data)).catch(() => {}))
    if (show.customer_scorecard)
      calls.push(api.get(`/dashboard/customer-scorecard?year=${year}&month=${month}`).then(r => setCustomerScorecard(r.data)).catch(() => {}))
    if (show.closing)
      calls.push(api.get(`/dashboard/monthly-closing?year=${year}&month=${month}`).then(r => setClosing(r.data)).catch(() => {}))
    if (show.stock_chart)
      calls.push(api.get('/dashboard/stock-summary').then(r => setStockSummary(r.data)).catch(() => {}))
    if (needsSales)
      calls.push(api.get(`/dashboard/sales-by-partner?year=${year}&month=${month}`).then(r => setSalesByPartner(r.data)).catch(() => {}))
    if (needsPurchase)
      calls.push(api.get(`/dashboard/purchase-by-partner?year=${year}&month=${month}`).then(r => setPurchaseByPartner(r.data)).catch(() => {}))
    if (show.monthly_trend)
      calls.push(api.get(`/dashboard/monthly-trend?year=${year}`).then(r => setMonthlyTrend(r.data)).catch(() => {}))
    Promise.all(calls).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year, month])

  const totalSales     = closing?.sales?.reduce((s, r) => s + (r.revenue ?? 0), 0) ?? 0
  const totalPurchases = closing?.purchases?.reduce((s, r) => s + (r.buy_amt ?? 0), 0) ?? 0
  const grossProfit    = totalSales - totalPurchases
  const salesTotal     = salesByPartner.reduce((s, r) => s + r.amount, 0)
  const purchaseTotal  = purchaseByPartner.reduce((s, r) => s + r.amount, 0)

  const QualityDashboard = () => {
    if (!qualityKpi) return null
    const insp = qualityKpi.inspection
    const ncr = qualityKpi.ncr
    const loss = qualityKpi.loss
    const po = qualityKpi.process_outgoing || {}
    const fmtW = (n) => n > 0 ? `₩${Math.round(n).toLocaleString()}` : '—'
    return (
      <div>
        <div className="section-title mt-16">품질 대시보드 — {qualityKpi.year}년 {qualityKpi.month}월</div>
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <KpiCard icon="🔍" label="수입검사 불량율"
            value={insp.defect_rate != null ? insp.defect_rate.toFixed(2) : null} unit=" %"
            sub={`검사 ${insp.total}건 · 합격율 ${insp.pass_rate != null ? insp.pass_rate.toFixed(1) : '—'}%`}
            accent={insp.defect_rate <= 1 ? 'var(--success)' : insp.defect_rate <= 5 ? 'var(--warn)' : 'var(--danger)'}
            trend={insp.defect_rate <= 1 ? '양호' : '관리 필요'}
            trendDir={insp.defect_rate <= 1 ? 'up' : 'down'}
          />
          <KpiCard icon="⚠️" label="부적합통보(NCR) 미결"
            value={ncr.open + ncr.in_progress} unit="건"
            sub={`접수 ${ncr.open} · 처리중 ${ncr.in_progress} · 완료 ${ncr.closed} · 이번달신규 ${ncr.this_month_new}`}
            accent={ncr.open + ncr.in_progress === 0 ? 'var(--success)' : ncr.open + ncr.in_progress <= 3 ? 'var(--warn)' : 'var(--danger)'}
            trend={ncr.open + ncr.in_progress === 0 ? '이슈없음' : '처리 필요'}
            trendDir={ncr.open + ncr.in_progress === 0 ? 'up' : 'down'}
          />
          <KpiCard icon="📉" label="공정불량 로스율"
            value={loss.loss_rate != null ? loss.loss_rate.toFixed(2) : null} unit=" %"
            sub={`불량금액 ${fmtW(loss.total_defect_cost)} / 생산금액 ${fmtW(loss.total_production_cost)}`}
            accent={loss.loss_rate == null ? 'var(--border)' : loss.loss_rate <= 2 ? 'var(--success)' : loss.loss_rate <= 5 ? 'var(--warn)' : 'var(--danger)'}
            trend={loss.loss_rate == null ? 'MES 업로드 필요' : loss.loss_rate <= 2 ? '양호' : '관리 필요'}
            trendDir={loss.loss_rate == null ? null : loss.loss_rate <= 2 ? 'up' : 'down'}
          />
          <KpiCard icon="🔧" label="공정/출하 불량율"
            value={po.defect_rate != null ? po.defect_rate.toFixed(2) : null} unit=" %"
            sub={`공정 ${po.process_count ?? 0}건 · 출하 ${po.outgoing_count ?? 0}건 · 불량 ${(po.total_defect_qty ?? 0).toLocaleString()}개`}
            accent={po.defect_rate == null ? 'var(--border)' : po.defect_rate <= 2 ? 'var(--success)' : po.defect_rate <= 5 ? 'var(--warn)' : 'var(--danger)'}
            trend={po.defect_rate == null ? '데이터 없음' : po.defect_rate <= 2 ? '양호' : '관리 필요'}
            trendDir={po.defect_rate == null ? null : po.defect_rate <= 2 ? 'up' : 'down'}
          />
        </div>
        {loss.top_defects.length > 0 && (
          <>
            <div className="section-title" style={{ fontSize: 13 }}>공정불량 유형별 순위 (이번 달)</div>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table style={{ fontSize: 12 }}>
                <thead><tr><th>순위</th><th>불량유형</th><th className="text-right">불량수량</th><th className="text-right">불량금액(원)</th></tr></thead>
                <tbody>
                  {loss.top_defects.map((d, i) => (
                    <tr key={d.defect_type}>
                      <td style={{ textAlign: 'center', color: 'var(--text-sm)' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                      <td style={{ fontWeight: i < 3 ? 600 : 400 }}>{d.defect_type}</td>
                      <td className="text-right">{d.qty.toLocaleString()}</td>
                      <td className="text-right" style={{ color: 'var(--danger)', fontWeight: 600 }}>{fmtW(d.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table style={{ fontSize: 12 }}>
            <thead><tr><th>구분</th><th className="text-right">건수</th><th className="text-right">비고</th></tr></thead>
            <tbody>
              <tr><td>총 검사</td><td className="text-right">{insp.total}건</td><td className="text-right" style={{ color: 'var(--text-sm)' }}>불량수량 {insp.total_fail_qty.toLocaleString()}개</td></tr>
              <tr style={{ background: '#f0fdf4' }}><td>합격</td><td className="text-right" style={{ color: 'var(--success)', fontWeight: 600 }}>{insp.pass}건</td><td className="text-right" style={{ color: 'var(--text-sm)' }}>{insp.pass_rate != null ? insp.pass_rate.toFixed(1) + '%' : '—'}</td></tr>
              <tr style={{ background: '#fef2f2' }}><td>불합격</td><td className="text-right" style={{ color: 'var(--danger)', fontWeight: 600 }}>{insp.fail}건</td><td className="text-right" style={{ color: 'var(--text-sm)' }}>{insp.total > 0 ? (100 - insp.pass_rate).toFixed(1) + '%' : '—'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ── 컨트롤 바 ── */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <select value={year} onChange={e => setYear(+e.target.value)} style={{ width: 90 }}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={{ width: 75 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
            <option key={m} value={m}>{m}월</option>
          )}
        </select>
        <button className="btn btn-outline" onClick={load} disabled={loading}>
          {loading ? '...' : '⟳ 새로고침'}
        </button>
        {loading && <span className="text-muted">데이터 불러오는 중...</span>}
        <div className="spacer" />
        <span className="text-muted">{year}년 {month}월 기준</span>
      </div>

      {/* ── 발주/매출 요약 바 ── */}
      {show.summary && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <SummaryBox label="오늘 신규 발주" value={kpi?.po_today} unit="건"
            color="#1d4ed8" bg="#eff6ff" border="#bfdbfe" />
          <SummaryBox label="이달 누계 발주" value={kpi?.po_this_month} unit="건"
            color="#92400e" bg="#fefce8" border="#fde68a" />
          <SummaryBox label="미입고 진행 중" value={kpi?.po_open} unit="건"
            color="#166534" bg="#f0fdf4" border="#bbf7d0" />
          <SummaryBox label="이달 매출 합계"
            value={salesTotal > 0 ? `₩${Math.round(salesTotal / 10000).toLocaleString()}만` : '—'}
            unit=""
            color="#7c3aed" bg="#faf5ff" border="#e9d5ff" />
        </div>
      )}

      {/* ── KPI 카드 (역할별 표시) ── */}
      {(show.kpi_delivery || show.kpi_quality || show.kpi_inventory || show.kpi_profit) && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          {show.kpi_delivery && (
            <KpiCard
              icon="📦" label="납기준수율 (On-time)"
              value={kpi != null ? kpi.delivery_rate.toFixed(1) : null} unit=" %"
              sub="고객사 출하 기준"
              accent={kpi != null && kpi.delivery_rate >= 90 ? 'var(--success)' : kpi != null && kpi.delivery_rate >= 70 ? 'var(--warn)' : 'var(--danger)'}
              trend={kpi != null && kpi.delivery_rate >= 90 ? '양호' : '주의 필요'}
              trendDir={kpi != null && kpi.delivery_rate >= 90 ? 'up' : kpi != null ? 'down' : null}
            />
          )}
          {show.kpi_quality && (
            <KpiCard
              icon="🔍" label="불량율"
              value={kpi != null ? kpi.defect_rate.toFixed(2) : null} unit=" %"
              sub="수입검사 기준"
              accent={kpi != null && kpi.defect_rate <= 1 ? 'var(--success)' : kpi != null && kpi.defect_rate <= 5 ? 'var(--warn)' : 'var(--danger)'}
              trend={kpi != null && kpi.defect_rate <= 1 ? '양호' : '관리 필요'}
              trendDir={kpi != null && kpi.defect_rate <= 1 ? 'up' : kpi != null ? 'down' : null}
            />
          )}
          {show.kpi_inventory && (
            <KpiCard
              icon="🔄" label="재고회전율"
              value={kpi != null ? kpi.inventory_turnover.toFixed(2) : null} unit=" 회"
              sub={`${year}년 ${month}월 누계`}
              accent="var(--primary)"
            />
          )}
          {show.kpi_profit && (
            <KpiCard
              icon="💹" label="매출총이익 / 마진율"
              value={kpi != null ? `₩${Number(kpi.gross_profit).toLocaleString()}` : null}
              sub={kpi != null ? `마진율 ${kpi.margin_rate.toFixed(1)}%` : ''}
              accent={kpi != null && kpi.margin_rate > 0 ? 'var(--success)' : 'var(--danger)'}
              trend={kpi != null ? `${kpi.margin_rate.toFixed(1)}% 마진` : null}
              trendDir={kpi != null && kpi.margin_rate > 0 ? 'up' : kpi != null ? 'down' : null}
            />
          )}
        </div>
      )}

      {/* ── 매출 목표 달성률 ── */}
      {show.target && vsTarget && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>
              {year}년 {month}월 매출 목표 달성률
            </div>
            {show.closing && (
              <a href="/sales-target" style={{ fontSize: 11, color: 'var(--primary)', textDecoration: 'none' }}>
                목표 수정 →
              </a>
            )}
            <div className="spacer" />
            <span style={{ fontSize: 13, fontWeight: 800, color: vsTarget.total_rate != null && vsTarget.total_rate >= 100 ? 'var(--success)' : vsTarget.total_rate != null && vsTarget.total_rate >= 70 ? '#E67E22' : 'var(--danger)' }}>
              {vsTarget.total_rate != null ? `${vsTarget.total_rate}%` : '목표 미설정'}
            </span>
          </div>
          {vsTarget.total_target > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-sm)', marginBottom: 3 }}>
                <span>실적 ₩{Math.round(vsTarget.total_actual / 10000).toLocaleString()}만</span>
                <span>목표 ₩{Math.round(vsTarget.total_target / 10000).toLocaleString()}만</span>
              </div>
              <div style={{ background: 'var(--border)', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, vsTarget.total_rate ?? 0)}%`,
                  height: '100%',
                  background: vsTarget.total_rate >= 100 ? 'var(--success)' : vsTarget.total_rate >= 70 ? '#E67E22' : 'var(--danger)',
                  borderRadius: 4,
                  transition: 'width .4s',
                }} />
              </div>
            </div>
          )}
          {vsTarget.details.length > 0 && (
            <table style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>거래처</th>
                  <th className="text-right">목표 (만원)</th>
                  <th className="text-right">실적 (만원)</th>
                  <th className="text-right">달성률</th>
                  <th style={{ width: 140 }}>진행도</th>
                </tr>
              </thead>
              <tbody>
                {vsTarget.details.map(d => {
                  const rate = d.rate ?? 0
                  const barColor = rate >= 100 ? 'var(--success)' : rate >= 70 ? '#E67E22' : d.target > 0 ? 'var(--danger)' : 'var(--primary)'
                  return (
                    <tr key={d.partner_id}>
                      <td style={{ fontWeight: 600 }}>{d.partner_name}</td>
                      <td className="text-right">{d.target > 0 ? `₩${Math.round(d.target / 10000).toLocaleString()}만` : <span className="text-muted">—</span>}</td>
                      <td className="text-right" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                        {d.actual > 0 ? `₩${Math.round(d.actual / 10000).toLocaleString()}만` : <span className="text-muted">—</span>}
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, color: barColor }}>
                        {d.rate != null ? `${d.rate}%` : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {d.target > 0 ? (
                          <div style={{ background: 'var(--border)', borderRadius: 3, height: 7, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, rate)}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                          </div>
                        ) : <span className="text-muted" style={{ fontSize: 10 }}>목표 없음</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {vsTarget.details.length === 0 && (
            <div className="text-muted" style={{ fontSize: 12, padding: '8px 0' }}>
              목표 매출 데이터 없음 — <a href="/sales-target" style={{ color: 'var(--primary)' }}>목표 설정하기</a>
            </div>
          )}
        </div>
      )}

      {/* ── 월 마감 + 재고 차트 ── */}
      {(show.closing || show.stock_chart) && (
        <div className="chart-row">
          {show.closing && (
            <div className="card">
              <div className="section-title">{year}년 {month}월 마감 요약</div>
              <table>
                <tbody>
                  <tr style={{ background: '#eff6ff' }}>
                    <td style={{ fontWeight: 700, paddingLeft: 8 }}>매출</td>
                    <td className="text-right" style={{ fontWeight: 700, color: '#1d4ed8' }}>
                      ₩{totalSales.toLocaleString()}
                    </td>
                  </tr>
                  {salesByPartner.map(r => (
                    <tr key={r.partner_id}>
                      <td style={{ paddingLeft: 20, fontSize: 12, color: 'var(--text-sm)' }}>└ {r.partner_name}</td>
                      <td className="text-right" style={{ fontSize: 12, color: '#1d4ed8' }}>₩{r.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {salesByPartner.length === 0 && (
                    <tr><td colSpan={2} style={{ paddingLeft: 20, fontSize: 12, color: 'var(--text-xs)' }}>출고 데이터 없음</td></tr>
                  )}
                  <tr style={{ background: '#fff7ed', borderTop: '1px solid var(--border)' }}>
                    <td style={{ fontWeight: 700, paddingLeft: 8 }}>매입</td>
                    <td className="text-right" style={{ fontWeight: 700, color: '#ea580c' }}>
                      ₩{totalPurchases.toLocaleString()}
                    </td>
                  </tr>
                  {purchaseByPartner.map(r => (
                    <tr key={r.partner_id}>
                      <td style={{ paddingLeft: 20, fontSize: 12, color: 'var(--text-sm)' }}>└ {r.partner_name}</td>
                      <td className="text-right" style={{ fontSize: 12, color: '#ea580c' }}>₩{r.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {purchaseByPartner.length === 0 && (
                    <tr><td colSpan={2} style={{ paddingLeft: 20, fontSize: 12, color: 'var(--text-xs)' }}>입고 데이터 없음</td></tr>
                  )}
                  <tr style={{ borderTop: '2px solid var(--border)', background: grossProfit >= 0 ? '#f0fdf4' : '#fef2f2' }}>
                    <td style={{ fontWeight: 700, paddingLeft: 8 }}>총이익</td>
                    <td className="text-right" style={{ fontWeight: 800, color: grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      ₩{grossProfit.toLocaleString()}
                      {totalSales > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, color: 'var(--text-sm)' }}>
                          ({((grossProfit / totalSales) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {show.stock_chart && (
            <div className="card">
              <div className="section-title">재고 현황 — 상위 10개 (수량 기준)</div>
              {stockSummary.length > 0 ? (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={stockSummary.slice(0, 10)} margin={{ top: 4, right: 0, left: -15, bottom: 38 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="part_no" tick={{ fontSize: 9 }} angle={-40} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={customTooltipStyle}
                      formatter={v => [`${v.toLocaleString()}개`, '재고수량']}
                    />
                    <Bar dataKey="current_stock" fill="#2563EB" name="재고수량" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="empty">재고 데이터 없음</div>}
            </div>
          )}
        </div>
      )}

      {/* ── 월별 트렌드 ── */}
      {show.monthly_trend && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>
            월별 매출 / 매입 트렌드 ({year}년)
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={m => `${m}월`} tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
              />
              <Tooltip
                contentStyle={customTooltipStyle}
                formatter={(v, name) => [`₩${Number(v).toLocaleString()}`, name]}
                labelFormatter={m => `${m}월`}
              />
              <Legend />
              <Line type="monotone" dataKey="sales"     stroke="#2563EB" strokeWidth={2.5} name="매출" dot={{ r: 3, fill: '#2563EB' }} />
              <Line type="monotone" dataKey="purchases" stroke="#ea580c" strokeWidth={2.5} name="매입" dot={{ r: 3, fill: '#ea580c' }} />
              <Line type="monotone" dataKey="profit"    stroke="#059669" strokeWidth={2} strokeDasharray="5 3" name="이익" dot={{ r: 3, fill: '#059669' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── 고객사별 출고 테이블 ── */}
      {show.sales_table && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ margin: 0 }}>고객사별 출고금액 — {year}년 {month}월</div>
            <button className="btn btn-sm btn-outline" onClick={() => exportExcel(
              salesByPartner,
              [{ key: 'partner_name', label: '고객사명' }, { key: 'qty', label: '출고수량' }, { key: 'amount', label: '출고금액(원)' }],
              `고객사별_출고금액_${year}${String(month).padStart(2, '0')}.xlsx`
            )}>↓ Excel</button>
          </div>
          <div className="table-wrap" style={{ marginBottom: 18 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>순위</th>
                  <th>고객사명</th>
                  <th className="text-right">출고수량</th>
                  <th className="text-right">출고금액</th>
                  <th className="text-right">비율</th>
                </tr>
              </thead>
              <tbody>
                {salesByPartner.length === 0 && <tr><td colSpan={5} className="empty">해당 월 출고 데이터 없음</td></tr>}
                {salesByPartner.map((r, i) => (
                  <tr key={r.partner_id}>
                    <td className="text-center" style={{ color: 'var(--text-sm)', fontSize: 12 }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td style={{ fontWeight: 500 }}>{r.partner_name}</td>
                    <td className="text-right">{r.qty.toLocaleString()}</td>
                    <td className="text-right" style={{ fontWeight: 600, color: 'var(--primary)' }}>₩{r.amount.toLocaleString()}</td>
                    <td className="text-right" style={{ fontSize: 12, color: 'var(--text-sm)' }}>
                      {salesTotal > 0 ? ((r.amount / salesTotal) * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
                {salesByPartner.length > 0 && (
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: '#f8fafc' }}>
                    <td colSpan={3} className="text-right">합계</td>
                    <td className="text-right" style={{ color: 'var(--primary)' }}>₩{salesTotal.toLocaleString()}</td>
                    <td className="text-right">100%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── 외주처별 입고 테이블 ── */}
      {show.purchase_table && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ margin: 0 }}>외주처별 입고금액 — {year}년 {month}월</div>
            <button className="btn btn-sm btn-outline" onClick={() => exportExcel(
              purchaseByPartner,
              [{ key: 'partner_name', label: '외주처명' }, { key: 'qty', label: '입고수량' }, { key: 'amount', label: '입고금액(원)' }],
              `외주처별_입고금액_${year}${String(month).padStart(2, '0')}.xlsx`
            )}>↓ Excel</button>
          </div>
          <div className="table-wrap" style={{ marginBottom: 18 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>순위</th>
                  <th>외주처명</th>
                  <th className="text-right">입고수량</th>
                  <th className="text-right">입고금액</th>
                  <th className="text-right">비율</th>
                </tr>
              </thead>
              <tbody>
                {purchaseByPartner.length === 0 && <tr><td colSpan={5} className="empty">해당 월 입고 데이터 없음</td></tr>}
                {purchaseByPartner.map((r, i) => (
                  <tr key={r.partner_id}>
                    <td className="text-center" style={{ color: 'var(--text-sm)', fontSize: 12 }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{r.partner_name}</td>
                    <td className="text-right">{r.qty.toLocaleString()}</td>
                    <td className="text-right" style={{ fontWeight: 600, color: 'var(--success)' }}>₩{r.amount.toLocaleString()}</td>
                    <td className="text-right" style={{ fontSize: 12, color: 'var(--text-sm)' }}>
                      {purchaseTotal > 0 ? ((r.amount / purchaseTotal) * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
                {purchaseByPartner.length > 0 && (
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: '#f8fafc' }}>
                    <td colSpan={3} className="text-right">합계</td>
                    <td className="text-right" style={{ color: 'var(--success)' }}>₩{purchaseTotal.toLocaleString()}</td>
                    <td className="text-right">100%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── 고객사 납기준수율 스코어카드 ── */}
      {show.customer_scorecard && (
        <>
          <div className="section-title mt-16">고객사 납기준수율 스코어카드</div>
          {customerScorecard.length > 0 ? (
            <div className="table-wrap" style={{ marginBottom: 18 }}>
              <table>
                <thead>
                  <tr>
                    <th>고객사명</th>
                    <th className="text-right">전체 수주</th>
                    <th className="text-right">출하완료</th>
                    <th className="text-right">납기준수</th>
                    <th>납기준수율</th>
                    <th className="text-right">총 출하금액</th>
                  </tr>
                </thead>
                <tbody>
                  {customerScorecard.map(c => {
                    const dr = c.delivery_rate
                    return (
                      <tr key={c.partner_id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td className="text-right" style={{ color: 'var(--text-sm)' }}>{c.total_orders}건</td>
                        <td className="text-right">{c.closed_orders}건</td>
                        <td className="text-right" style={{ color: 'var(--primary)', fontWeight: 600 }}>{c.on_time}건</td>
                        <td>
                          {dr != null ? (
                            <div className="stock-bar-wrap">
                              <div className="stock-bar">
                                <div className={`stock-bar-fill ${dr >= 90 ? '' : dr >= 70 ? 'warn' : 'danger'}`}
                                  style={{ width: `${Math.min(dr, 100)}%` }} />
                              </div>
                              <span className={`badge ${dr >= 90 ? 'badge-green' : dr >= 70 ? 'badge-amber' : 'badge-red'}`}
                                style={{ minWidth: 52, justifyContent: 'center' }}>
                                {dr.toFixed(1)}%
                              </span>
                            </div>
                          ) : <span className="badge badge-gray">데이터없음</span>}
                        </td>
                        <td className="text-right" style={{ fontWeight: 600, color: 'var(--primary)' }}>
                          ₩{Number(c.total_ship_amt).toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty" style={{ marginBottom: 18 }}>고객사 데이터 없음</div>
          )}
        </>
      )}

      {/* ── 품질 대시보드 ── */}
      {show.quality_dashboard && <QualityDashboard />}

      {/* ── 외주처 스코어카드 ── */}
      {show.supplier_scorecard && (
        <>
          <div className="section-title mt-16">외주처 스코어카드</div>
          {scorecard.length > 0 ? (
            <div className="table-wrap" style={{ marginBottom: 24 }}>
              <table>
                <thead>
                  <tr>
                    <th>외주처명</th>
                    <th className="text-right">발주건수</th>
                    <th>On-time Rate</th>
                    <th>불량율</th>
                    <th className="text-right">총입고금액</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.map(s => {
                    const dr = s.delivery_rate ?? null
                    const fr = s.defect_rate ?? null
                    return (
                      <tr key={s.partner_id}>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td className="text-right">{s.total_pos}건</td>
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
                        <td className="text-right">₩{Number(s.total_buy_amt ?? 0).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty" style={{ marginBottom: 24 }}>외주처 데이터 없음 — 기준정보에서 거래처를 등록하세요</div>
          )}
        </>
      )}
    </div>
  )
}
