import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts'
import api from '../api'
import { getRole } from '../auth'

const EXEC_ROLES = new Set(['admin', 'executive', 'owner'])

const W  = (n) => n == null ? '—' : `₩${Math.round(n).toLocaleString()}`
const WM = (n) => n == null ? '—' : `₩${Math.round(n / 10000).toLocaleString()}만`
const PCT = (n) => n == null ? '—' : `${n}%`
const NUM = (n) => n == null ? '—' : Math.round(n).toLocaleString()

const SAP = {
  navy:    '#0d1f3c',
  blue:    '#0064d1',
  green:   '#107e3e',
  red:     '#aa0808',
  orange:  '#e9730c',
  yellow:  '#e8a000',
  textH:   '#32363a',
  textM:   '#74777a',
  textS:   '#a5a8a8',
  bg:      '#f5f6f7',
  card:    '#ffffff',
  border:  '#e5e5e5',
}

// SAP-style Big KPI Tile
function ExecTile({ label, value, unit, sub, color, trend, trendDir, onClick, children }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: SAP.card, border: `1px solid ${SAP.border}`, borderRadius: 8,
        padding: '18px 20px', cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 1px 4px rgba(0,0,0,.06)', flex: 1, minWidth: 0,
        borderTop: `3px solid ${color || SAP.blue}`,
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.12)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.06)' }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: SAP.textM, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: color || SAP.textH, lineHeight: 1.1 }}>{value ?? '—'}</span>
        {unit && <span style={{ fontSize: 13, color: SAP.textM }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: SAP.textM, marginBottom: 4 }}>{sub}</div>}
      {trendDir && (
        <div style={{ fontSize: 11, color: trendDir === 'up' ? SAP.green : trendDir === 'down' ? SAP.red : SAP.textM }}>
          {trendDir === 'up' ? '▲' : trendDir === 'down' ? '▼' : '─'} {trend}
        </div>
      )}
      {children}
    </div>
  )
}

// Progress bar tile
function ProgressTile({ label, rate, actual, target, color, onClick }) {
  const pct = Math.min(100, rate ?? 0)
  const barColor = rate == null ? SAP.border : rate >= 100 ? SAP.green : rate >= 70 ? SAP.orange : SAP.red
  return (
    <div
      onClick={onClick}
      style={{
        background: SAP.card, border: `1px solid ${SAP.border}`, borderRadius: 8,
        padding: '18px 20px', cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 1px 4px rgba(0,0,0,.06)', flex: 1, minWidth: 0,
        borderTop: `3px solid ${barColor}`,
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.12)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.06)' }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: SAP.textM, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: barColor, lineHeight: 1.1 }}>
          {rate != null ? rate : '—'}
        </span>
        {rate != null && <span style={{ fontSize: 13, color: SAP.textM }}>%</span>}
      </div>
      <div style={{ background: SAP.border, borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width .4s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: SAP.textM }}>
        <span>실적 {WM(actual)}</span>
        <span>목표 {WM(target)}</span>
      </div>
    </div>
  )
}

// Section header
function SecHeader({ title, count, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 3, height: 16, background: SAP.navy, borderRadius: 2 }} />
      <span style={{ fontSize: 14, fontWeight: 700, color: SAP.textH }}>{title}</span>
      {count != null && <span style={{ fontSize: 11, color: SAP.textM, background: '#e8ecf0', borderRadius: 10, padding: '1px 8px' }}>{count}</span>}
      <div style={{ flex: 1 }} />
      {children}
    </div>
  )
}

// Mini section card
function SectionCard({ title, children, accent }) {
  return (
    <div style={{
      background: SAP.card, border: `1px solid ${SAP.border}`, borderRadius: 8,
      padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
      borderLeft: `3px solid ${accent || SAP.blue}`,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: SAP.textM, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.5px' }}>{title}</div>
      {children}
    </div>
  )
}

// Risk badge
function RiskBadge({ label, count, severity }) {
  const colors = { high: [SAP.red, '#fff5f5'], medium: [SAP.orange, '#fff8f0'], low: [SAP.yellow, '#fffbf0'], ok: [SAP.green, '#f0fdf4'] }
  const [fg, bg] = colors[severity] || colors.low
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: bg, border: `1px solid ${fg}`, borderRadius: 20,
      padding: '4px 12px', fontSize: 12,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: fg }} />
      <span style={{ color: fg, fontWeight: 700 }}>{count}</span>
      <span style={{ color: SAP.textH }}>{label}</span>
    </div>
  )
}

const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

export default function Management() {
  const role = getRole()
  if (!EXEC_ROLES.has(role)) {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: SAP.textH, marginBottom: 8 }}>접근 권한 없음</div>
        <div style={{ fontSize: 13, color: SAP.textM }}>경영관리 대시보드는 대표/전무 계정만 조회 가능합니다</div>
      </div>
    )
  }

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const [kpi, setKpi] = useState(null)
  const [vsTarget, setVsTarget] = useState(null)
  const [qualityKpi, setQualityKpi] = useState(null)
  const [closing, setClosing] = useState(null)
  const [salesByPartner, setSalesByPartner] = useState([])
  const [purchaseByPartner, setPurchaseByPartner] = useState([])
  const [monthlyTrend, setMonthlyTrend] = useState([])
  const [stockSummary, setStockSummary] = useState([])
  const [alerts, setAlerts] = useState([])

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get(`/dashboard/kpi?year=${year}&month=${month}`).then(r => setKpi(r.data)).catch(() => {}),
      api.get(`/dashboard/sales-vs-target?year=${year}&month=${month}`).then(r => setVsTarget(r.data)).catch(() => {}),
      api.get(`/dashboard/quality-summary?year=${year}&month=${month}`).then(r => setQualityKpi(r.data)).catch(() => {}),
      api.get(`/dashboard/monthly-closing?year=${year}&month=${month}`).then(r => setClosing(r.data)).catch(() => {}),
      api.get(`/dashboard/sales-by-partner?year=${year}&month=${month}`).then(r => setSalesByPartner(r.data)).catch(() => {}),
      api.get(`/dashboard/purchase-by-partner?year=${year}&month=${month}`).then(r => setPurchaseByPartner(r.data)).catch(() => {}),
      api.get(`/dashboard/monthly-trend?year=${year}`).then(r => setMonthlyTrend(r.data)).catch(() => {}),
      api.get('/dashboard/stock-summary').then(r => setStockSummary(r.data)).catch(() => {}),
      api.get('/dashboard/alerts').then(r => setAlerts(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year, month])

  const toggle = (key) => setExpanded(e => e === key ? null : key)

  // Derived metrics
  const totalSales = salesByPartner.reduce((s, r) => s + r.amount, 0)
  const totalPurchase = purchaseByPartner.reduce((s, r) => s + r.amount, 0)
  const estimatedProfit = kpi ? kpi.gross_profit : null
  const profitMargin = kpi ? kpi.margin_rate : null
  const profitColor = profitMargin == null ? SAP.textH : profitMargin >= 20 ? SAP.green : profitMargin >= 10 ? SAP.orange : SAP.red

  const ncrOpen = qualityKpi ? qualityKpi.ncr.open + qualityKpi.ncr.in_progress : null
  const defectRate = qualityKpi ? qualityKpi.inspection.defect_rate : null
  const defectColor = defectRate == null ? SAP.textH : defectRate <= 1 ? SAP.green : defectRate <= 5 ? SAP.orange : SAP.red

  const overdueAlerts = alerts.filter(a => a.type === 'overdue')
  const warnAlerts = alerts.filter(a => a.type === 'warn')

  // Trend data for charts
  const trendData = monthlyTrend.map(r => ({
    m: `${r.month}월`,
    매출: Math.round((r.revenue || 0) / 10000),
    매입: Math.round((r.purchase || 0) / 10000),
  }))

  // Top partners for bar chart
  const topSales = [...salesByPartner].sort((a, b) => b.amount - a.amount).slice(0, 5)
  const topPurchase = [...purchaseByPartner].sort((a, b) => b.amount - a.amount).slice(0, 5)

  // Stock risk: items with very high qty (simplified)
  const highStockItems = stockSummary.filter(s => s.qty > 1000).slice(0, 5)

  return (
    <div style={{ background: SAP.bg, minHeight: '100vh', padding: '0 0 40px 0' }}>

      {/* ── Header ── */}
      <div style={{
        background: SAP.navy, color: '#fff', padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,.2)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.5px', flex: 1 }}>
          📊 경영관리 대시보드
        </div>
        <div style={{ fontSize: 11, color: '#9eb3cf', background: 'rgba(255,255,255,.1)', padding: '2px 10px', borderRadius: 12 }}>
          대표/전무 전용
        </div>
        <select
          value={year}
          onChange={e => setYear(+e.target.value)}
          style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 13 }}
        >
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y} style={{color:'#000'}}>{y}년</option>)}
        </select>
        <select
          value={month}
          onChange={e => setMonth(+e.target.value)}
          style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 13 }}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
            <option key={m} value={m} style={{color:'#000'}}>{m}월</option>
          )}
        </select>
        <button
          onClick={load}
          disabled={loading}
          style={{ padding: '5px 14px', borderRadius: 4, border: '1px solid rgba(255,255,255,.3)', background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer' }}
        >
          {loading ? '...' : '⟳ 새로고침'}
        </button>
      </div>

      <div style={{ padding: '0 24px' }}>

        {/* ══ Section 1: 전사 경영현황 (4 big KPI tiles) ══ */}
        <SecHeader title="전사 경영현황" />
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>

          <ExecTile
            label="이달 매출"
            value={kpi ? Math.round(kpi.total_revenue / 10000).toLocaleString() : null}
            unit="만원"
            sub={`구매 ${WM(totalPurchase)} / 매출 ${WM(totalSales)}`}
            color={SAP.blue}
            trend={kpi?.total_revenue > 0 ? '확정 출하 기준' : '출하 없음'}
            trendDir="neutral"
            onClick={() => toggle('sales')}
          />

          <ExecTile
            label="영업이익(추정)"
            value={estimatedProfit != null ? Math.round(estimatedProfit / 10000).toLocaleString() : null}
            unit="만원"
            sub={`이동평균원가 기준 · 마진율 ${PCT(profitMargin)}`}
            color={profitColor}
            trend={profitMargin != null ? (profitMargin >= 15 ? '양호' : profitMargin >= 5 ? '관리필요' : '주의') : null}
            trendDir={profitMargin == null ? null : profitMargin >= 15 ? 'up' : 'down'}
            onClick={() => toggle('profit')}
          >
            <div style={{ fontSize: 10, color: SAP.textS, marginTop: 4 }}>* 회계 마감 전 추정치</div>
          </ExecTile>

          <ProgressTile
            label="목표 달성률"
            rate={vsTarget?.total_rate}
            actual={vsTarget?.total_actual}
            target={vsTarget?.total_target}
            onClick={() => toggle('target')}
          />

          <ExecTile
            label="납기준수율"
            value={kpi?.delivery_rate}
            unit="%"
            sub={`재고회전 ${kpi?.inventory_turnover ?? '—'}회 / 미결발주 ${NUM(kpi?.po_open)}건`}
            color={kpi?.delivery_rate == null ? SAP.textH : kpi.delivery_rate >= 95 ? SAP.green : kpi.delivery_rate >= 80 ? SAP.orange : SAP.red}
            trend={kpi?.delivery_rate >= 95 ? '양호' : kpi?.delivery_rate >= 80 ? '점검 필요' : '위험'}
            trendDir={kpi?.delivery_rate >= 95 ? 'up' : 'down'}
            onClick={() => toggle('delivery')}
          />
        </div>

        {/* Drill-down: 영업 상세 */}
        {expanded === 'sales' && (
          <div style={{ background: SAP.card, border: `1px solid ${SAP.border}`, borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <SecHeader title="영업 상세 — 거래처별 매출">
              <button onClick={() => setExpanded(null)} style={{ fontSize: 11, background: 'none', border: 'none', color: SAP.textM, cursor: 'pointer' }}>✕ 닫기</button>
            </SecHeader>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: SAP.textM, marginBottom: 8 }}>거래처별 매출 TOP 5</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={topSales} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <XAxis dataKey="partner_name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v/10000)}만`} />
                    <Tooltip formatter={v => [`₩${Math.round(v).toLocaleString()}`, '매출']} />
                    <Bar dataKey="amount" fill={SAP.blue} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <div style={{ fontSize: 11, color: SAP.textM, marginBottom: 8 }}>12개월 매출/매입 트렌드</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <XAxis dataKey="m" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="매출" stroke={SAP.blue} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="매입" stroke={SAP.orange} strokeWidth={2} dot={false} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: SAP.bg }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: SAP.textM, fontWeight: 600, borderBottom: `1px solid ${SAP.border}` }}>거래처</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: SAP.textM, fontWeight: 600, borderBottom: `1px solid ${SAP.border}` }}>매출금액</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: SAP.textM, fontWeight: 600, borderBottom: `1px solid ${SAP.border}` }}>비중</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByPartner.slice(0, 10).map(r => (
                    <tr key={r.partner_id} style={{ borderBottom: `1px solid ${SAP.border}` }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>{r.partner_name}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: SAP.blue, fontWeight: 700 }}>{WM(r.amount)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: SAP.textM }}>
                        {totalSales > 0 ? `${Math.round(r.amount / totalSales * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Drill-down: 목표달성 상세 */}
        {expanded === 'target' && vsTarget && (
          <div style={{ background: SAP.card, border: `1px solid ${SAP.border}`, borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <SecHeader title="매출 목표 달성 상세">
              <button onClick={() => setExpanded(null)} style={{ fontSize: 11, background: 'none', border: 'none', color: SAP.textM, cursor: 'pointer' }}>✕ 닫기</button>
            </SecHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {vsTarget.details.map(d => {
                const rate = d.rate ?? 0
                const bar = rate >= 100 ? SAP.green : rate >= 70 ? SAP.orange : d.target > 0 ? SAP.red : SAP.blue
                return (
                  <div key={d.partner_id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{d.partner_name}</span>
                      <span style={{ color: bar, fontWeight: 700 }}>
                        {WM(d.actual)} / {d.target > 0 ? WM(d.target) : '목표없음'} {d.rate != null ? `(${d.rate}%)` : ''}
                      </span>
                    </div>
                    {d.target > 0 && (
                      <div style={{ background: SAP.border, borderRadius: 3, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, rate)}%`, height: '100%', background: bar, borderRadius: 3, transition: 'width .4s' }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ Section 2: 부문별 현황 (2×3 grid) ══ */}
        <SecHeader title="부문별 현황" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>

          {/* 영업관리 */}
          <SectionCard title="영업관리" accent={SAP.blue}>
            <div style={{ fontSize: 22, fontWeight: 700, color: SAP.blue, marginBottom: 4 }}>{WM(totalSales)}</div>
            <div style={{ fontSize: 11, color: SAP.textM, marginBottom: 12 }}>이달 확정 매출</div>
            <div style={{ height: 80 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSales.slice(0, 5)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <Bar dataKey="amount" radius={[2,2,0,0]}>
                    {topSales.slice(0, 5).map((_, i) => (
                      <Cell key={i} fill={i === 0 ? SAP.blue : `rgba(0,100,209,${0.8 - i * 0.15})`} />
                    ))}
                  </Bar>
                  <Tooltip formatter={v => WM(v)} labelFormatter={v => topSales[v]?.partner_name || ''} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {salesByPartner.length > 0 && (
              <div style={{ fontSize: 11, color: SAP.textM, marginTop: 6 }}>
                Top: {salesByPartner[0]?.partner_name} {WM(salesByPartner[0]?.amount)}
              </div>
            )}
          </SectionCard>

          {/* 품질경영 */}
          <SectionCard title="품질경영" accent={defectRate != null && defectRate > 3 ? SAP.red : SAP.green}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: defectColor }}>
                  {defectRate != null ? `${defectRate.toFixed(2)}%` : '—'}
                </div>
                <div style={{ fontSize: 10, color: SAP.textM }}>수입검사 불량률</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: ncrOpen > 3 ? SAP.red : ncrOpen > 0 ? SAP.orange : SAP.green }}>
                  {ncrOpen ?? '—'}건
                </div>
                <div style={{ fontSize: 10, color: SAP.textM }}>NCR 미결</div>
              </div>
            </div>
            {qualityKpi?.loss?.loss_rate != null && (
              <div style={{ background: SAP.bg, borderRadius: 6, padding: '8px 10px', fontSize: 11 }}>
                <span style={{ color: SAP.textM }}>공정손실률 </span>
                <span style={{ fontWeight: 700, color: qualityKpi.loss.loss_rate <= 2 ? SAP.green : SAP.orange }}>
                  {qualityKpi.loss.loss_rate.toFixed(2)}%
                </span>
                {qualityKpi?.ncr?.this_month_new > 0 && (
                  <span style={{ marginLeft: 8, color: SAP.orange }}>· 이달 신규 NCR {qualityKpi.ncr.this_month_new}건</span>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {defectRate != null && defectRate > 5 && <span style={{ fontSize: 10, background: '#fff5f5', color: SAP.red, padding: '2px 8px', borderRadius: 10, border: `1px solid ${SAP.red}` }}>⚠ 불량률 위험</span>}
              {ncrOpen > 3 && <span style={{ fontSize: 10, background: '#fff5f5', color: SAP.red, padding: '2px 8px', borderRadius: 10, border: `1px solid ${SAP.red}` }}>⚠ NCR 다수 미결</span>}
              {defectRate != null && defectRate <= 1 && ncrOpen === 0 && <span style={{ fontSize: 10, background: '#f0fdf4', color: SAP.green, padding: '2px 8px', borderRadius: 10, border: `1px solid ${SAP.green}` }}>✓ 품질 양호</span>}
            </div>
          </SectionCard>

          {/* 구매·재고 */}
          <SectionCard title="구매·재고" accent={SAP.orange}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: SAP.textH }}>
                  {kpi ? WM(kpi.stock_value) : '—'}
                </div>
                <div style={{ fontSize: 10, color: SAP.textM }}>현재 재고금액</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: kpi?.po_open > 20 ? SAP.orange : SAP.textH }}>
                  {kpi ? kpi.po_open : '—'}건
                </div>
                <div style={{ fontSize: 10, color: SAP.textM }}>미결 발주</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: SAP.textM, marginBottom: 4 }}>이달 매입액: <strong>{WM(totalPurchase)}</strong></div>
            <div style={{ fontSize: 11, color: SAP.textM }}>재고회전율: <strong>{kpi?.inventory_turnover ?? '—'}회</strong></div>
            {highStockItems.length > 0 && (
              <div style={{ fontSize: 10, color: SAP.orange, marginTop: 8 }}>⚠ 고재고 품목 {highStockItems.length}건 점검 필요</div>
            )}
          </SectionCard>

          {/* 재무관리 */}
          <SectionCard title="재무관리" accent={SAP.navy}>
            <div style={{ fontSize: 13, color: SAP.textM, marginBottom: 12 }}>
              회계 시스템 연동 후 조회 가능합니다
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: '매출채권 (미수금)', note: '영업→청구 데이터 기준' },
                { label: '매입채무', note: '구매 발주 잔액 기준' },
                { label: '현금흐름', note: '회계 모듈 연동 필요' },
              ].map(({ label, note }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${SAP.border}` }}>
                  <span style={{ fontSize: 12, color: SAP.textH }}>{label}</span>
                  <span style={{ fontSize: 11, color: SAP.textS, fontStyle: 'italic' }}>{note}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* 생산관리 */}
          <SectionCard title="생산관리" accent='#7b61ff'>
            <div style={{ fontSize: 13, color: SAP.textM, marginBottom: 8 }}>
              생산 원가 / MES 데이터 기준
            </div>
            {qualityKpi?.loss && (
              <div style={{ background: SAP.bg, borderRadius: 6, padding: '8px 10px', fontSize: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: SAP.textM }}>공정불량 로스율</span>
                  <strong style={{ color: qualityKpi.loss.loss_rate <= 2 ? SAP.green : qualityKpi.loss.loss_rate <= 5 ? SAP.orange : SAP.red }}>
                    {qualityKpi.loss.loss_rate != null ? `${qualityKpi.loss.loss_rate.toFixed(2)}%` : '—'}
                  </strong>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: SAP.textM }}>생산실적 상세</span>
                <span style={{ color: SAP.textS, fontStyle: 'italic' }}>→ 생산관리 탭 참조</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: SAP.textM }}>제조원가</span>
                <span style={{ color: SAP.textS, fontStyle: 'italic' }}>→ 원가관리 탭 참조</span>
              </div>
            </div>
          </SectionCard>

          {/* 인사·조직 */}
          <SectionCard title="인사·조직" accent={SAP.textM}>
            <div style={{ fontSize: 13, color: SAP.textM, marginBottom: 12 }}>
              인사 시스템 연동 전 — 준비 중
            </div>
            {[
              { label: '인건비율', note: '회계 연동 필요' },
              { label: '부서별 인원 현황', note: '인사 시스템 연동 필요' },
            ].map(({ label, note }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${SAP.border}` }}>
                <span style={{ fontSize: 12, color: SAP.textH }}>{label}</span>
                <span style={{ fontSize: 10, color: SAP.textS, fontStyle: 'italic' }}>{note}</span>
              </div>
            ))}
          </SectionCard>
        </div>

        {/* ══ Section 3: 경영 리스크 ══ */}
        <SecHeader title="경영 리스크 모니터링" />
        <div style={{
          background: SAP.card, border: `1px solid ${SAP.border}`, borderRadius: 8,
          padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <RiskBadge
              label="납기 위험"
              count={overdueAlerts.length}
              severity={overdueAlerts.length === 0 ? 'ok' : overdueAlerts.length <= 2 ? 'medium' : 'high'}
            />
            <RiskBadge
              label="품질 NCR 미결"
              count={`${ncrOpen ?? '—'}건`}
              severity={ncrOpen == null ? 'low' : ncrOpen === 0 ? 'ok' : ncrOpen <= 3 ? 'medium' : 'high'}
            />
            <RiskBadge
              label="불량률 경고"
              count={defectRate != null ? `${defectRate.toFixed(1)}%` : '—'}
              severity={defectRate == null ? 'low' : defectRate <= 1 ? 'ok' : defectRate <= 5 ? 'medium' : 'high'}
            />
            <RiskBadge
              label="미결 발주"
              count={`${kpi?.po_open ?? '—'}건`}
              severity={kpi?.po_open == null ? 'low' : kpi.po_open <= 5 ? 'ok' : kpi.po_open <= 15 ? 'medium' : 'high'}
            />
          </div>

          {/* Alert details */}
          {alerts.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {alerts.slice(0, 8).map((a, i) => {
                const colors = { overdue: [SAP.red, '#fff5f5'], warn: [SAP.orange, '#fff8f0'], new_request: [SAP.blue, '#eff6ff'] }
                const [fg, bg] = colors[a.type] || [SAP.textM, SAP.bg]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', background: bg, borderRadius: 6, border: `1px solid ${fg}22` }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: SAP.textH, flex: 1 }}>{a.message}</span>
                    {a.doc_no && <span style={{ fontSize: 11, color: SAP.textM, fontFamily: 'monospace' }}>{a.doc_no}</span>}
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: SAP.green, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: SAP.green, display: 'inline-block' }} />
              현재 특이 리스크 없음
            </div>
          )}
        </div>

        {/* ══ Section 4: 12개월 트렌드 ══ */}
        {monthlyTrend.length > 0 && (
          <>
            <SecHeader title="연간 매출/매입 추이" />
            <div style={{ background: SAP.card, border: `1px solid ${SAP.border}`, borderRadius: 8, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', marginBottom: 24 }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={SAP.blue} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={SAP.blue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="m" tick={{ fontSize: 11, fill: SAP.textM }} />
                  <YAxis tick={{ fontSize: 11, fill: SAP.textM }} tickFormatter={v => `${v}만`} />
                  <Tooltip formatter={(v, name) => [`${v.toLocaleString()}만원`, name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="매출" stroke={SAP.blue} strokeWidth={2} fill="url(#salesGrad)" />
                  <Line type="monotone" dataKey="매입" stroke={SAP.orange} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* Footer note */}
        <div style={{ fontSize: 10, color: SAP.textS, textAlign: 'right', paddingTop: 8 }}>
          * 영업이익·현금흐름은 회계 마감 전 추정치입니다. 정확한 재무 데이터는 회계 담당자 확인 필요.
        </div>

      </div>
    </div>
  )
}
