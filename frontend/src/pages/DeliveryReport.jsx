import { useEffect, useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import api from '../api'

const fmtPrice = (v) => {
  const n = Number(v ?? 0)
  if (Number.isInteger(n)) return n.toLocaleString('ko-KR')
  return n.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

/* ── 업체별 출고이력 슬라이드 패널 ── */
function DetailPanel({ partner, type, year, month, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!partner) return
    setLoading(true)
    if (type === 'customer') {
      api.get(`/sales/shipments?partner_id=${partner.partner_id}&year=${year}&month=${month}`)
        .then(r => setRows(r.data))
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      api.get(`/purchase/receipts?partner_id=${partner.partner_id}`)
        .then(r => {
          const filtered = r.data.filter(row => {
            const d = new Date(row.receipt_date)
            return d.getFullYear() === year && d.getMonth() + 1 === month
          })
          setRows(filtered)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [partner, type, year, month])

  if (!partner) return null

  const isCustomer = type === 'customer'
  const accentColor = isCustomer ? '#c8102e' : '#7c3aed'

  return (
    <>
      {/* 딤 배경 */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
      }} />
      {/* 패널 */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 760,
        background: 'var(--card)', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        zIndex: 1001, display: 'flex', flexDirection: 'column',
        animation: 'slideIn 0.22s ease',
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
        {/* 패널 헤더 */}
        <div style={{
          padding: '18px 24px', borderBottom: `3px solid ${accentColor}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>
              {isCustomer ? '고객사' : '외주처'} · {year}년 {month}월
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: accentColor }}>{partner.name}</div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 22, color: '#6b7280', lineHeight: 1,
          }}>✕</button>
        </div>

        {/* 요약 배지 */}
        <div style={{ padding: '12px 24px', display: 'flex', gap: 12, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, background: '#f1f5f9', padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
            {isCustomer ? '출하' : '입고'} {rows.length}건
          </span>
          <span style={{ fontSize: 12, background: '#f1f5f9', padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
            {isCustomer ? '총 출하금액' : '총 입고금액'} ₩{fmtPrice(rows.reduce((s, r) => s + (r.qty ?? 0) * (r.unit_price ?? 0), 0))}
          </span>
        </div>

        {/* 테이블 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>해당 기간 데이터 없음</div>
          ) : isCustomer ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['출하번호', '수주번호', '품번', '품명', '수량', '단가', '금액', '납기일', '출하일', '납기준수'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, textAlign: 'left', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const onTime = r.due_date && r.ship_date ? r.ship_date <= r.due_date : null
                  return (
                    <tr key={r.sh_no} style={{ background: i % 2 === 1 ? '#fafafa' : 'transparent', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 10px', fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>{r.sh_no}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12, color: '#6b7280' }}>{r.so_no}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12 }}>{r.part_no}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12 }}>{r.item_name ?? ''}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right' }}>{Number(r.qty).toLocaleString()}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right' }}>{fmtPrice(r.unit_price)}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right', fontWeight: 600 }}>
                        ₩{fmtPrice(Number(r.qty) * Number(r.unit_price ?? 0))}
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: 12, color: '#6b7280' }}>{r.due_date ?? '—'}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12 }}>{r.ship_date}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        {onTime === null ? <span style={{ color: '#9ca3af' }}>—</span>
                          : onTime ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
                          : <span style={{ color: '#dc2626', fontWeight: 700 }}>✗</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            /* 외주처 입고이력 */
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['입고번호', '발주번호', '품번', '수량', '단가', '금액', '입고일', '상태'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, textAlign: 'left', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.gr_no} style={{ background: i % 2 === 1 ? '#fafafa' : 'transparent', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>{r.gr_no}</td>
                    <td style={{ padding: '7px 10px', fontSize: 12, color: '#6b7280' }}>{r.po_no}</td>
                    <td style={{ padding: '7px 10px', fontSize: 12 }}>{r.part_no}</td>
                    <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right' }}>{Number(r.qty).toLocaleString()}</td>
                    <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right' }}>{fmtPrice(r.unit_price)}</td>
                    <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right', fontWeight: 600 }}>
                      ₩{fmtPrice(Number(r.qty) * Number(r.unit_price ?? 0))}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12, color: '#6b7280' }}>{r.receipt_date}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                        background: r.status === '확정' ? '#dcfce7' : r.status === '취소' ? '#fee2e2' : '#fef3c7',
                        color: r.status === '확정' ? '#166534' : r.status === '취소' ? '#991b1b' : '#92400e',
                      }}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

const now = new Date()

function RateBar({ value, thresholdGood = 90, thresholdWarn = 70, invert = false }) {
  if (value == null) return <span className="badge badge-gray">—</span>
  const good = invert ? value <= thresholdGood : value >= thresholdGood
  const warn = invert ? value <= thresholdWarn : value >= thresholdWarn
  const color = good ? '#16a34a' : warn ? '#d97706' : '#dc2626'
  const badgeClass = good ? 'badge-green' : warn ? 'badge-amber' : 'badge-red'
  const pct = invert ? Math.min(value * 10, 100) : Math.min(value, 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', minWidth: 80 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: color, transition: 'width 0.3s' }} />
      </div>
      <span className={`badge ${badgeClass}`} style={{ minWidth: 56, textAlign: 'center', fontSize: 12 }}>
        {value.toFixed(1)}%
      </span>
    </div>
  )
}

function SummaryKpi({ label, value, unit = '', color = '#1d4ed8' }) {
  return (
    <div style={{
      flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '14px 20px',
      textAlign: 'center', background: 'var(--card)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-sm)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 3 }}>{unit}</span></div>
    </div>
  )
}

export default function DeliveryReport() {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [customers, setCustomers] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState(null) // { partner, type: 'customer'|'supplier' }
  const printRef = useRef()

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get(`/dashboard/customer-scorecard?year=${year}&month=${month}`).then(r => setCustomers(r.data)).catch(() => {}),
      api.get(`/dashboard/supplier-scorecard?year=${year}&month=${month}`).then(r => setSuppliers(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year, month])

  const printReport = () => {
    const el = printRef.current
    if (!el) return
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head>
        <title>납기준수율 보고서 ${year}년 ${month}월</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Malgun Gothic', sans-serif; font-size: 12px; color: #1a1a1a; padding: 20px; }
          h1 { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
          h2 { font-size: 13px; font-weight: 700; margin: 20px 0 8px; color: #c8102e; border-bottom: 2px solid #c8102e; padding-bottom: 4px; }
          .meta { font-size: 11px; color: #6b7280; margin-bottom: 16px; }
          .summary { display: flex; gap: 12px; margin-bottom: 20px; }
          .kpi { flex: 1; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 16px; text-align: center; }
          .kpi-label { font-size: 10px; color: #6b7280; font-weight: 600; }
          .kpi-val { font-size: 22px; font-weight: 800; color: #1d4ed8; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th { background: #f1f5f9; font-size: 11px; font-weight: 700; padding: 7px 10px; text-align: left; border-bottom: 2px solid #cbd5e1; }
          td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
          .right { text-align: right; }
          .bar-wrap { display: flex; align-items: center; gap: 8px; }
          .bar-bg { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; min-width: 80px; }
          .bar-fill { height: 100%; border-radius: 4px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
          .green { background: #dcfce7; color: #166534; }
          .amber { background: #fef3c7; color: #92400e; }
          .red { background: #fee2e2; color: #991b1b; }
          .gray { background: #f1f5f9; color: #475569; }
          .total-row { font-weight: 700; background: #f8fafc; border-top: 2px solid #cbd5e1; }
          @media print { body { padding: 10px; } }
        </style>
      </head><body>
      ${el.innerHTML}
      </body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()

    // 고객사 시트
    const custData = [
      ['고객사명', '전체수주(건)', '출하완료(건)', '납기준수(건)', '납기준수율(%)', '총출하금액(원)'],
      ...customers.map(c => [c.name, c.total_orders, c.closed_orders, c.on_time, c.delivery_rate?.toFixed(1) ?? '—', c.total_ship_amt]),
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(custData)
    XLSX.utils.book_append_sheet(wb, ws1, '고객사_납기준수율')

    // 외주처 시트
    const supData = [
      ['외주처명', '발주건수(건)', '납기준수율(%)', '불량율(%)', '총입고금액(원)'],
      ...suppliers.map(s => [s.name, s.total_pos, s.delivery_rate?.toFixed(1) ?? '—', s.defect_rate?.toFixed(2) ?? '—', s.total_buy_amt]),
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(supData)
    XLSX.utils.book_append_sheet(wb, ws2, '외주처_납기준수율')

    XLSX.writeFile(wb, `납기준수율_보고서_${year}${String(month).padStart(2, '0')}.xlsx`)
  }

  const avgCustRate = customers.filter(c => c.delivery_rate != null).reduce((s, c, _, a) => s + c.delivery_rate / a.length, 0)
  const avgSupRate  = suppliers.filter(s => s.delivery_rate  != null).reduce((s, c, _, a) => s + c.delivery_rate / a.length, 0)
  const avgDefect   = suppliers.filter(s => s.defect_rate    != null).reduce((s, c, _, a) => s + c.defect_rate   / a.length, 0)

  const printDate = `출력일: ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`

  return (
    <div>
      {detail && (
        <DetailPanel
          partner={detail.partner}
          type={detail.type}
          year={year}
          month={month}
          onClose={() => setDetail(null)}
        />
      )}
      {/* 툴바 */}
      <div className="toolbar" style={{ marginBottom: 20 }}>
        <select value={year} onChange={e => setYear(+e.target.value)} style={{ width: 90 }}>
          {[2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={{ width: 70 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
            <option key={m} value={m}>{m}월</option>
          )}
        </select>
        <button className="btn btn-outline" onClick={load} disabled={loading}>
          {loading ? '로딩 중...' : '⟳ 조회'}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={exportExcel} disabled={loading}>
            📥 Excel
          </button>
          <button className="btn btn-primary" onClick={printReport} disabled={loading}>
            🖨️ 인쇄
          </button>
        </div>
      </div>

      {/* 보고서 본문 */}
      <div ref={printRef}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          borderBottom: '3px solid #c8102e', paddingBottom: 12, marginBottom: 20,
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>
              조이산업(주) · 품질경영부
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>
              납기준수율 종합 보고서
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              기준기간: {year}년 {month}월 &nbsp;|&nbsp; {printDate}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>KAISER ERP</div>
          </div>
        </div>

        {/* 종합 KPI 요약 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
          <SummaryKpi
            label="고객사 평균 납기준수율"
            value={customers.length ? avgCustRate.toFixed(1) : '—'}
            unit="%"
            color={avgCustRate >= 90 ? '#16a34a' : avgCustRate >= 70 ? '#d97706' : '#dc2626'}
          />
          <SummaryKpi
            label="외주처 평균 납기준수율"
            value={suppliers.filter(s => s.delivery_rate != null).length ? avgSupRate.toFixed(1) : '—'}
            unit="%"
            color={avgSupRate >= 90 ? '#16a34a' : avgSupRate >= 70 ? '#d97706' : '#dc2626'}
          />
          <SummaryKpi
            label="외주처 평균 불량율"
            value={suppliers.filter(s => s.defect_rate != null).length ? avgDefect.toFixed(2) : '—'}
            unit="%"
            color={avgDefect <= 1 ? '#16a34a' : avgDefect <= 5 ? '#d97706' : '#dc2626'}
          />
          <SummaryKpi
            label="고객사 수"
            value={customers.length}
            unit="개사"
            color="#1d4ed8"
          />
          <SummaryKpi
            label="외주처 수"
            value={suppliers.length}
            unit="개사"
            color="#7c3aed"
          />
        </div>

        {/* ── 고객사 납기준수율 ── */}
        <div style={{
          fontSize: 14, fontWeight: 800, color: '#c8102e',
          borderBottom: '2px solid #c8102e', paddingBottom: 6, marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>■</span>
          <span>고객사별 납기준수율</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280', marginLeft: 4 }}>
            ({year}년 {month}월 출하 기준)
          </span>
        </div>

        {customers.length === 0 ? (
          <div className="empty" style={{ marginBottom: 28 }}>해당 기간 출하 데이터 없음</div>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 28 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28, textAlign: 'center' }}>순위</th>
                  <th>고객사명</th>
                  <th style={{ textAlign: 'right', width: 90 }}>전체 수주</th>
                  <th style={{ textAlign: 'right', width: 90 }}>출하완료</th>
                  <th style={{ textAlign: 'right', width: 90 }}>납기준수</th>
                  <th style={{ width: 200 }}>납기준수율</th>
                  <th style={{ textAlign: 'right', width: 130 }}>총 출하금액</th>
                  <th style={{ width: 60, textAlign: 'center' }}>등급</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => {
                  const dr = c.delivery_rate
                  const grade = dr == null ? '—' : dr >= 95 ? 'A' : dr >= 85 ? 'B' : dr >= 70 ? 'C' : 'D'
                  const gradeColor = grade === 'A' ? '#166534' : grade === 'B' ? '#1e40af' : grade === 'C' ? '#92400e' : '#991b1b'
                  const gradeBg   = grade === 'A' ? '#dcfce7' : grade === 'B' ? '#dbeafe' : grade === 'C' ? '#fef3c7' : '#fee2e2'
                  return (
                    <tr key={c.partner_id} style={{ background: i % 2 === 1 ? '#fafafa' : 'transparent' }}>
                      <td style={{ textAlign: 'center', color: 'var(--text-sm)', fontSize: 12, fontWeight: 600 }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>
                        <span
                          onClick={() => setDetail({ partner: c, type: 'customer' })}
                          style={{ cursor: 'pointer', color: '#c8102e', textDecoration: 'underline', textUnderlineOffset: 3 }}
                        >{c.name}</span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-sm)' }}>{c.total_orders}건</td>
                      <td style={{ textAlign: 'right' }}>{c.closed_orders}건</td>
                      <td style={{ textAlign: 'right', color: '#1d4ed8', fontWeight: 600 }}>{c.on_time}건</td>
                      <td><RateBar value={dr} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#1d4ed8', fontSize: 13 }}>
                        ₩{Number(c.total_ship_amt).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', width: 28, height: 28, lineHeight: '28px',
                          borderRadius: '50%', background: gradeBg, color: gradeColor,
                          fontSize: 13, fontWeight: 900, textAlign: 'center',
                        }}>{grade}</span>
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: '#eff6ff' }}>
                  <td colSpan={2} style={{ textAlign: 'right', fontSize: 12 }}>합계 / 평균</td>
                  <td style={{ textAlign: 'right' }}>{customers.reduce((s, c) => s + c.total_orders, 0)}건</td>
                  <td style={{ textAlign: 'right' }}>{customers.reduce((s, c) => s + c.closed_orders, 0)}건</td>
                  <td style={{ textAlign: 'right', color: '#1d4ed8' }}>{customers.reduce((s, c) => s + c.on_time, 0)}건</td>
                  <td>
                    <span className={`badge ${avgCustRate >= 90 ? 'badge-green' : avgCustRate >= 70 ? 'badge-amber' : 'badge-red'}`}
                      style={{ fontWeight: 700, fontSize: 13 }}>
                      평균 {customers.length ? avgCustRate.toFixed(1) : '—'}%
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', color: '#1d4ed8', fontSize: 13 }}>
                    ₩{customers.reduce((s, c) => s + c.total_ship_amt, 0).toLocaleString()}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* 등급 기준 안내 */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap', fontSize: 11, color: '#6b7280',
        }}>
          <span>※ 등급 기준:</span>
          {[
            { g: 'A', label: '95% 이상', bg: '#dcfce7', c: '#166534' },
            { g: 'B', label: '85~94%',   bg: '#dbeafe', c: '#1e40af' },
            { g: 'C', label: '70~84%',   bg: '#fef3c7', c: '#92400e' },
            { g: 'D', label: '70% 미만', bg: '#fee2e2', c: '#991b1b' },
          ].map(({ g, label, bg, c }) => (
            <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                display: 'inline-block', width: 20, height: 20, lineHeight: '20px', borderRadius: '50%',
                background: bg, color: c, fontSize: 11, fontWeight: 800, textAlign: 'center',
              }}>{g}</span>
              {label}
            </span>
          ))}
        </div>

        {/* ── 외주처 납기준수율 ── */}
        <div style={{
          fontSize: 14, fontWeight: 800, color: '#7c3aed',
          borderBottom: '2px solid #7c3aed', paddingBottom: 6, marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>■</span>
          <span>외주처별 납기준수율 · 품질 스코어카드</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280', marginLeft: 4 }}>
            (전체 발주 기준)
          </span>
        </div>

        {suppliers.length === 0 ? (
          <div className="empty" style={{ marginBottom: 28 }}>외주처 데이터 없음</div>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 28 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28, textAlign: 'center' }}>순위</th>
                  <th>외주처명</th>
                  <th style={{ textAlign: 'right', width: 90 }}>발주건수</th>
                  <th style={{ width: 180 }}>납기준수율</th>
                  <th style={{ width: 180 }}>불량율</th>
                  <th style={{ textAlign: 'right', width: 130 }}>총 입고금액</th>
                  <th style={{ width: 60, textAlign: 'center' }}>종합등급</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s, i) => {
                  const dr = s.delivery_rate
                  const fr = s.defect_rate
                  const drScore = dr == null ? 0 : dr >= 95 ? 4 : dr >= 85 ? 3 : dr >= 70 ? 2 : 1
                  const frScore = fr == null ? 0 : fr <= 0.5 ? 4 : fr <= 1 ? 3 : fr <= 5 ? 2 : 1
                  const totalScore = (drScore + frScore) / 2
                  const grade = totalScore >= 3.5 ? 'A' : totalScore >= 2.5 ? 'B' : totalScore >= 1.5 ? 'C' : 'D'
                  const gradeColor = grade === 'A' ? '#166534' : grade === 'B' ? '#1e40af' : grade === 'C' ? '#92400e' : '#991b1b'
                  const gradeBg   = grade === 'A' ? '#dcfce7' : grade === 'B' ? '#dbeafe' : grade === 'C' ? '#fef3c7' : '#fee2e2'
                  return (
                    <tr key={s.partner_id} style={{ background: i % 2 === 1 ? '#fafafa' : 'transparent' }}>
                      <td style={{ textAlign: 'center', color: 'var(--text-sm)', fontSize: 12, fontWeight: 600 }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>
                        <span
                          onClick={() => setDetail({ partner: s, type: 'supplier' })}
                          style={{ cursor: 'pointer', color: '#7c3aed', textDecoration: 'underline', textUnderlineOffset: 3 }}
                        >{s.name}</span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-sm)' }}>{s.total_pos}건</td>
                      <td><RateBar value={dr} /></td>
                      <td><RateBar value={fr} thresholdGood={1} thresholdWarn={5} invert /></td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#7c3aed', fontSize: 13 }}>
                        ₩{Number(s.total_buy_amt ?? 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', width: 28, height: 28, lineHeight: '28px',
                          borderRadius: '50%', background: gradeBg, color: gradeColor,
                          fontSize: 13, fontWeight: 900, textAlign: 'center',
                        }}>{grade}</span>
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: '#f5f3ff' }}>
                  <td colSpan={2} style={{ textAlign: 'right', fontSize: 12 }}>합계 / 평균</td>
                  <td style={{ textAlign: 'right' }}>{suppliers.reduce((s, c) => s + c.total_pos, 0)}건</td>
                  <td>
                    {suppliers.filter(s => s.delivery_rate != null).length > 0 && (
                      <span className={`badge ${avgSupRate >= 90 ? 'badge-green' : avgSupRate >= 70 ? 'badge-amber' : 'badge-red'}`}
                        style={{ fontWeight: 700, fontSize: 13 }}>
                        평균 {avgSupRate.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td>
                    {suppliers.filter(s => s.defect_rate != null).length > 0 && (
                      <span className={`badge ${avgDefect <= 1 ? 'badge-green' : avgDefect <= 5 ? 'badge-amber' : 'badge-red'}`}
                        style={{ fontWeight: 700, fontSize: 13 }}>
                        평균 {avgDefect.toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', color: '#7c3aed', fontSize: 13 }}>
                    ₩{suppliers.reduce((s, c) => s + (c.total_buy_amt ?? 0), 0).toLocaleString()}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* 외주처 등급 기준 */}
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 20 }}>
          ※ 외주처 종합등급: 납기준수율 + 불량율 종합 평가 &nbsp;|&nbsp;
          A(우수) · B(양호) · C(보통) · D(개선필요)
        </div>

        {/* 서명란 */}
        <div style={{
          display: 'flex', gap: 0, marginTop: 32,
          borderTop: '1px solid var(--border)', paddingTop: 20,
        }}>
          {['담당', '팀장', '본부장', '대표이사'].map(title => (
            <div key={title} style={{
              flex: 1, textAlign: 'center', borderRight: '1px solid var(--border)',
              padding: '0 12px', fontSize: 12,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 36, color: '#374151' }}>{title}</div>
              <div style={{ borderTop: '1px solid #d1d5db', paddingTop: 6, color: '#9ca3af', fontSize: 11 }}>(서명)</div>
            </div>
          ))}
          <div style={{ width: 20 }} />
        </div>
      </div>
    </div>
  )
}
