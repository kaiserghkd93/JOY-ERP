import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const now = new Date()
const STATUS_STYLE = {
  '계산중':   { bg: '#fef9c3', color: '#a16207' },
  '확정':     { bg: '#dbeafe', color: '#1d4ed8' },
  '지급완료': { bg: '#dcfce7', color: '#16a34a' },
}

function fmt(n) { return Math.round(Number(n) || 0).toLocaleString() }

export default function HrPayroll() {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [payrolls, setPayrolls] = useState([])
  const [calcLoading, setCalcLoading] = useState(false)
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => {
    api.get(`/hr/payroll?year=${year}&month=${month}`).then(r => setPayrolls(r.data)).catch(() => setPayrolls([]))
  }, [year, month])

  useEffect(() => { load() }, [load])

  const calculate = async () => {
    if (!window.confirm(`${year}년 ${month}월 급여를 자동계산하시겠습니까?\n기존 계산 결과가 덮어씌워집니다.`)) return
    setCalcLoading(true)
    try {
      await api.post(`/hr/payroll/calculate?year=${year}&month=${month}`)
      load()
    } catch (e) {
      alert('계산 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setCalcLoading(false)
    }
  }

  const confirmPay = async (id) => {
    await api.patch(`/hr/payroll/${id}/confirm`).catch(e => alert(e.response?.data?.detail || e.message))
    load()
  }

  const markPaid = async (id) => {
    await api.patch(`/hr/payroll/${id}/paid`).catch(e => alert(e.response?.data?.detail || e.message))
    load()
  }

  const totals = payrolls.reduce((acc, p) => ({
    gross: acc.gross + Number(p.gross_pay || 0),
    deduct: acc.deduct + Number(p.total_deduct || 0),
    net: acc.net + Number(p.net_pay || 0),
  }), { gross: 0, deduct: 0, net: 0 })

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>월급 명세서</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-control" value={year} onChange={e => setYear(+e.target.value)} style={{ width: 90 }}>
            {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="form-control" value={month} onChange={e => setMonth(+e.target.value)} style={{ width: 70 }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m}>{m}</option>)}
          </select>
          <span style={{ fontSize: 13, color: '#64748b' }}>월</span>
          <button className="btn btn-primary" onClick={calculate} disabled={calcLoading}>
            {calcLoading ? '계산중...' : '자동 계산'}
          </button>
        </div>
      </div>

      {payrolls.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: '총 지급액', value: totals.gross, color: '#1d4ed8' },
            { label: '총 공제액', value: totals.deduct, color: '#dc2626' },
            { label: '총 실수령액', value: totals.net, color: '#16a34a' },
          ].map(k => (
            <div key={k.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{fmt(k.value)}<span style={{ fontSize: 11 }}>원</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>사번</th><th>이름</th><th>부서</th><th>고용형태</th>
              <th style={{ textAlign: 'right' }}>기본급</th>
              <th style={{ textAlign: 'right' }}>연장수당</th>
              <th style={{ textAlign: 'right' }}>총지급</th>
              <th style={{ textAlign: 'right' }}>총공제</th>
              <th style={{ textAlign: 'right' }}>실수령액</th>
              <th>상태</th><th></th>
            </tr>
          </thead>
          <tbody>
            {payrolls.length === 0 && (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                급여 데이터가 없습니다. <strong>자동 계산</strong> 버튼을 눌러 계산하세요.
              </td></tr>
            )}
            {payrolls.map(p => {
              const st = STATUS_STYLE[p.status] || STATUS_STYLE['계산중']
              return (
                <tr key={p.id}>
                  <td><code style={{ fontSize: 11 }}>{p.emp_id}</code></td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{p.dept || '—'}</td>
                  <td><span style={{
                    padding: '1px 7px', borderRadius: 20, fontSize: 11,
                    background: p.emp_type === 'annual' ? '#dbeafe' : '#fef9c3',
                    color: p.emp_type === 'annual' ? '#1d4ed8' : '#a16207',
                  }}>{p.emp_type === 'annual' ? '연봉' : '시급'}</span></td>
                  <td style={{ textAlign: 'right' }}>{fmt(p.base_pay)}</td>
                  <td style={{ textAlign: 'right', color: Number(p.ot_pay) > 0 ? '#d97706' : undefined }}>{fmt(p.ot_pay)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{fmt(p.gross_pay)}</td>
                  <td style={{ textAlign: 'right', color: '#dc2626' }}>{fmt(p.total_deduct)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{fmt(p.net_pay)}</td>
                  <td>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm" style={{ marginRight: 4 }} onClick={() => setSelected(p)}>명세서</button>
                    {p.status === '계산중' && (
                      <button className="btn btn-sm" style={{ marginRight: 4, background: '#dbeafe', color: '#1d4ed8', border: 'none' }}
                        onClick={() => confirmPay(p.id)}>확정</button>
                    )}
                    {p.status === '확정' && (
                      <button className="btn btn-sm" style={{ background: '#dcfce7', color: '#16a34a', border: 'none' }}
                        onClick={() => markPaid(p.id)}>지급완료</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected && <PayslipModal payroll={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

/* ── 대기업형 흑백 급여명세서 ──────────────────────────────────────── */
function PayslipModal({ payroll: p, onClose }) {
  const W = (n) => Number(n || 0).toLocaleString()
  const fmtTime = (h, m) => (h || m) ? (m ? `${h}h ${m}m` : `${h}h`) : null

  const payItems = [
    { label: '기본급',      sub: p.std_hourly ? `통상시급 ${W(p.std_hourly)}원 × ${p.std_hrs||209}h` : null, val: p.base_pay },
    { label: '연장수당',    sub: fmtTime(p.pay_ot_hrs, p.pay_ot_min) ? `${fmtTime(p.pay_ot_hrs, p.pay_ot_min)} × 1.5` : null, val: p.ot_pay },
    { label: '심야수당',    sub: p.pay_night_hrs ? `${p.pay_night_hrs}h × 0.5` : null, val: p.night_pay },
    { label: '휴일수당',    sub: fmtTime(p.pay_holiday_hrs, p.pay_holiday_min) ? `${fmtTime(p.pay_holiday_hrs, p.pay_holiday_min)} × 1.5` : null, val: p.holiday_pay },
    { label: '식대',        sub: '비과세', val: p.meal_allow },
    { label: '차량유지비',  sub: '비과세', val: p.vehicle_allow },
    { label: '성과/상여',   sub: null, val: p.bonus },
  ].filter(r => Number(r.val) > 0)

  const deductItems = [
    { label: '국민연금', val: p.deduct_pension },
    { label: '건강보험', val: p.deduct_health },
    { label: '장기요양', val: p.deduct_lcare },
    { label: '고용보험', val: p.deduct_employ },
    { label: '갑근세',   val: p.deduct_income_tax },
    { label: '주민세',   val: p.deduct_local_tax },
  ].filter(r => Number(r.val) > 0)

  const rows = Math.max(payItems.length, deductItems.length)
  const pad = (arr) => [...arr, ...Array(Math.max(0, rows - arr.length)).fill(null)]

  const BRD = '1px solid #333'
  const BRD_LIGHT = '1px solid #bbb'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <style>{`
        @media print {
          body > *:not(.ps-overlay) { display: none !important; }
          .ps-overlay { position: static !important; background: none !important; display: block !important; }
          .ps-modal { box-shadow: none !important; border: none !important; max-width: 100% !important; }
          .ps-no-print { display: none !important; }
          @page { margin: 15mm; size: A4 portrait; }
        }
        .ps-overlay { z-index: 1000; }
      `}</style>

      <div className="modal ps-modal ps-overlay"
        style={{ maxWidth: 640, width: '100%', background: '#fff', color: '#000',
          fontFamily: '"Malgun Gothic","Apple SD Gothic Neo",sans-serif', fontSize: 12 }}
        onClick={e => e.stopPropagation()}>

        {/* 제목 */}
        <div style={{ textAlign: 'center', borderBottom: '3px double #000', paddingBottom: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 8, color: '#000' }}>급  여  명  세  서</div>
          <div style={{ fontSize: 11, color: '#444', marginTop: 4, letterSpacing: 2 }}>{p.year}년 {p.month}월분</div>
        </div>

        {/* 사원 정보 */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <tbody>
            <tr>
              {[['사  번', p.emp_id], ['성  명', p.name], ['부  서', p.dept || '—'], ['직  급', p.position || '—']].map(([k, v]) => (
                <>
                  <th key={k} style={{ background: '#222', color: '#fff', border: BRD, padding: '5px 10px',
                    textAlign: 'center', fontWeight: 700, fontSize: 11, width: 68, letterSpacing: 1 }}>{k}</th>
                  <td key={v} style={{ border: BRD, padding: '5px 10px', minWidth: 90 }}>{v}</td>
                </>
              ))}
            </tr>
            <tr>
              <th style={{ background: '#222', color: '#fff', border: BRD, padding: '5px 10px', textAlign: 'center', fontWeight: 700, fontSize: 11 }}>고용형태</th>
              <td style={{ border: BRD, padding: '5px 10px' }}>{p.emp_type === 'annual' ? '연봉제' : '시급제'}</td>
              <th style={{ background: '#222', color: '#fff', border: BRD, padding: '5px 10px', textAlign: 'center', fontWeight: 700, fontSize: 11 }}>통상시급</th>
              <td style={{ border: BRD, padding: '5px 10px' }}>{p.std_hourly ? `${W(p.std_hourly)} 원` : '—'}</td>
              <th style={{ background: '#222', color: '#fff', border: BRD, padding: '5px 10px', textAlign: 'center', fontWeight: 700, fontSize: 11 }}>소정근로</th>
              <td style={{ border: BRD, padding: '5px 10px' }}>{p.std_hrs || 209}h / 월</td>
              <th style={{ background: '#222', color: '#fff', border: BRD, padding: '5px 10px', textAlign: 'center', fontWeight: 700, fontSize: 11 }}>연장시간</th>
              <td style={{ border: BRD, padding: '5px 10px' }}>{fmtTime(p.pay_ot_hrs, p.pay_ot_min) || '0h'}</td>
            </tr>
          </tbody>
        </table>

        {/* 지급 / 공제 테이블 */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <thead>
            <tr>
              <th colSpan={2} style={{ background: '#000', color: '#fff', border: BRD, padding: '6px 10px',
                textAlign: 'center', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>지  급  항  목</th>
              <th colSpan={2} style={{ background: '#000', color: '#fff', border: BRD, padding: '6px 10px',
                textAlign: 'center', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>공  제  항  목</th>
            </tr>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ border: BRD_LIGHT, padding: '4px 10px', fontSize: 11, fontWeight: 700, width: '25%', textAlign: 'center' }}>항목</th>
              <th style={{ border: BRD_LIGHT, padding: '4px 10px', fontSize: 11, fontWeight: 700, width: '25%', textAlign: 'center' }}>금액(원)</th>
              <th style={{ border: BRD_LIGHT, padding: '4px 10px', fontSize: 11, fontWeight: 700, width: '25%', textAlign: 'center' }}>항목</th>
              <th style={{ border: BRD_LIGHT, padding: '4px 10px', fontSize: 11, fontWeight: 700, width: '25%', textAlign: 'center' }}>금액(원)</th>
            </tr>
          </thead>
          <tbody>
            {pad(payItems).map((pay, i) => {
              const ded = pad(deductItems)[i]
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  {pay ? (
                    <>
                      <td style={{ border: BRD_LIGHT, padding: '5px 10px' }}>
                        {pay.label}
                        {pay.sub && <span style={{ display: 'block', fontSize: 10, color: '#555' }}>{pay.sub}</span>}
                      </td>
                      <td style={{ border: BRD_LIGHT, padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {W(pay.val)}
                      </td>
                    </>
                  ) : (
                    <><td style={{ border: BRD_LIGHT, padding: '5px 10px' }}>&nbsp;</td><td style={{ border: BRD_LIGHT }} /></>
                  )}
                  {ded ? (
                    <>
                      <td style={{ border: BRD_LIGHT, padding: '5px 10px' }}>{ded.label}</td>
                      <td style={{ border: BRD_LIGHT, padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {W(ded.val)}
                      </td>
                    </>
                  ) : (
                    <><td style={{ border: BRD_LIGHT, padding: '5px 10px' }}>&nbsp;</td><td style={{ border: BRD_LIGHT }} /></>
                  )}
                </tr>
              )
            })}
            {/* 합계행 */}
            <tr style={{ background: '#e8e8e8', fontWeight: 700 }}>
              <td style={{ border: BRD, padding: '6px 10px', textAlign: 'center', letterSpacing: 1 }}>지 급 합 계</td>
              <td style={{ border: BRD, padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{W(p.gross_pay)}</td>
              <td style={{ border: BRD, padding: '6px 10px', textAlign: 'center', letterSpacing: 1 }}>공 제 합 계</td>
              <td style={{ border: BRD, padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{W(p.total_deduct)}</td>
            </tr>
          </tbody>
        </table>

        {/* 차감지급액 */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <tbody>
            <tr>
              <td style={{ border: '2px solid #000', background: '#000', color: '#fff',
                padding: '8px 16px', fontWeight: 700, fontSize: 13, letterSpacing: 3, width: '40%', textAlign: 'center' }}>
                차  감  지  급  액
              </td>
              <td style={{ border: '2px solid #000', padding: '8px 20px',
                textAlign: 'right', fontSize: 20, fontWeight: 700, letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>
                {W(p.net_pay)} 원
              </td>
            </tr>
          </tbody>
        </table>

        {/* 서명란 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 60, fontSize: 12, color: '#333', marginBottom: 8 }}>
          <span>확&nbsp;&nbsp;인&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(인)</span>
          <span>수&nbsp;령&nbsp;인&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(인)</span>
        </div>

        <div className="modal-footer ps-no-print" style={{ marginTop: 16 }}>
          <button className="btn btn-outline" onClick={onClose}>닫기</button>
          <button className="btn btn-primary" onClick={() => window.print()}>인쇄</button>
        </div>
      </div>
    </div>
  )
}
