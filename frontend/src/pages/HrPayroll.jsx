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

/* ── 대기업형 A4 급여명세서 ─────────────────────────────────────────── */
function PayslipModal({ payroll: p, onClose }) {
  const W = (n) => Number(n || 0).toLocaleString()
  const fmtTime = (h, m) => (h || m) ? (m ? `${h}h ${m}m` : `${h}h`) : null
  const payDate = `${p.year}년 ${String(p.month).padStart(2,'0')}월 25일`

  const payItems = [
    { label: '기  본  급',    sub: p.std_hourly ? `시급 ${W(p.std_hourly)}×${p.std_hrs||209}h` : null, val: p.base_pay },
    { label: '연  장  수  당', sub: fmtTime(p.pay_ot_hrs, p.pay_ot_min) ? `${fmtTime(p.pay_ot_hrs, p.pay_ot_min)} × 1.5` : null, val: p.ot_pay },
    { label: '심  야  수  당', sub: p.pay_night_hrs ? `${p.pay_night_hrs}h × 0.5` : null, val: p.night_pay },
    { label: '휴  일  수  당', sub: fmtTime(p.pay_holiday_hrs, p.pay_holiday_min) ? `${fmtTime(p.pay_holiday_hrs, p.pay_holiday_min)} × 1.5` : null, val: p.holiday_pay },
    { label: '식       대',   sub: '비과세', val: p.meal_allow },
    { label: '차 량 유 지 비', sub: '비과세', val: p.vehicle_allow },
    { label: '성  과 / 상  여', sub: null, val: p.bonus },
  ].filter(r => Number(r.val) > 0)

  const deductItems = [
    { label: '국  민  연  금', val: p.deduct_pension },
    { label: '건  강  보  험', val: p.deduct_health },
    { label: '장  기  요  양', val: p.deduct_lcare },
    { label: '고  용  보  험', val: p.deduct_employ },
    { label: '갑    근    세', val: p.deduct_income_tax },
    { label: '주    민    세', val: p.deduct_local_tax },
  ].filter(r => Number(r.val) > 0)

  const rows = Math.max(payItems.length, deductItems.length, 6)
  const pad = (arr) => [...arr, ...Array(Math.max(0, rows - arr.length)).fill(null)]
  const taxable = Number(p.gross_pay||0) - Number(p.meal_allow||0) - Number(p.vehicle_allow||0)
  const nontax  = Number(p.meal_allow||0) + Number(p.vehicle_allow||0)

  const B = '1px solid #555'
  const BL = '1px solid #bbb'
  const TH = { background: '#444', color: '#fff', border: B, padding: '4px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11 }
  const TD = { border: BL, padding: '3px 8px' }
  const TDR = { border: BL, padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <style>{`
        @media print {
          body > *:not(.ps-wrap) { display: none !important; }
          .ps-wrap { position: static !important; background: none !important; display: block !important; padding: 0 !important; }
          .ps-modal { box-shadow: none !important; border: none !important; max-width: 100% !important; margin: 0; }
          .ps-no-print { display: none !important; }
          @page { margin: 12mm 14mm; size: A4 portrait; }
        }
        .ps-wrap { z-index: 9999; }
      `}</style>

      <div className="modal ps-modal ps-wrap"
        style={{ maxWidth: 660, width: '100%', background: '#fff', color: '#000',
          fontFamily: '"Malgun Gothic","Apple SD Gothic Neo",sans-serif', fontSize: 11, lineHeight: 1.4 }}
        onClick={e => e.stopPropagation()}>

        {/* ── 헤더 ── */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#444', letterSpacing: 1, marginBottom: 2 }}>조이산업 주식회사</div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 12,
            borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '5px 0', margin: '4px 0' }}>
            급 여 명 세 서
          </div>
          <div style={{ fontSize: 10, color: '#444', marginTop: 3, letterSpacing: 1 }}>
            {p.year}년 {String(p.month).padStart(2,'0')}월 &nbsp;(지급일 : {payDate})
          </div>
        </div>

        {/* ── 인적사항 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <tbody>
            <tr>
              <th style={{ ...TH, width: '14%' }}>사   번</th>
              <td style={{ ...TD, width: '19%' }}>{p.emp_id}</td>
              <th style={{ ...TH, width: '12%' }}>성   명</th>
              <td style={{ ...TD, width: '19%' }}>{p.name}</td>
              <th style={{ ...TH, width: '12%' }}>부   서</th>
              <td style={TD}>{p.dept || '—'}</td>
            </tr>
            <tr>
              <th style={TH}>직   급</th>
              <td style={TD}>{p.position || '—'}</td>
              <th style={TH}>고용형태</th>
              <td style={TD}>{p.emp_type === 'annual' ? '연봉제' : '시급제'}</td>
              <th style={TH}>통상시급</th>
              <td style={TD}>{p.std_hourly ? `${W(p.std_hourly)} 원` : '—'}</td>
            </tr>
            <tr>
              <th style={TH}>소정근로</th>
              <td style={TD}>{p.std_hrs || 209} h</td>
              <th style={TH}>연장근로</th>
              <td style={TD}>{fmtTime(p.pay_ot_hrs, p.pay_ot_min) || '0h'}</td>
              <th style={TH}>휴일근로</th>
              <td style={TD}>{fmtTime(p.pay_holiday_hrs, p.pay_holiday_min) || '0h'}</td>
            </tr>
          </tbody>
        </table>

        {/* ── 지급 / 공제 테이블 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr>
              <th colSpan={2} style={{ background: '#222', color: '#fff', border: B, padding: '5px', textAlign: 'center', letterSpacing: 3, fontSize: 11 }}>
                지   급   내   역
              </th>
              <th colSpan={2} style={{ background: '#222', color: '#fff', border: B, padding: '5px', textAlign: 'center', letterSpacing: 3, fontSize: 11 }}>
                공   제   내   역
              </th>
            </tr>
            <tr style={{ background: '#ddd' }}>
              <th style={{ border: BL, padding: '3px 8px', textAlign: 'center', width: '26%', fontWeight: 700 }}>항&nbsp;&nbsp;&nbsp;목</th>
              <th style={{ border: BL, padding: '3px 8px', textAlign: 'right', width: '24%', fontWeight: 700 }}>금&nbsp;&nbsp;&nbsp;액</th>
              <th style={{ border: BL, padding: '3px 8px', textAlign: 'center', width: '26%', fontWeight: 700 }}>항&nbsp;&nbsp;&nbsp;목</th>
              <th style={{ border: BL, padding: '3px 8px', textAlign: 'right', width: '24%', fontWeight: 700 }}>금&nbsp;&nbsp;&nbsp;액</th>
            </tr>
          </thead>
          <tbody>
            {pad(payItems).map((pay, i) => {
              const ded = pad(deductItems)[i]
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f7f7f7' }}>
                  {pay ? (
                    <>
                      <td style={TD}>
                        {pay.label}
                        {pay.sub && <span style={{ fontSize: 9, color: '#666', marginLeft: 4 }}>{pay.sub}</span>}
                      </td>
                      <td style={TDR}>{W(pay.val)}</td>
                    </>
                  ) : (
                    <><td style={{ ...TD, color: '#ccc' }}>—</td><td style={TD} /></>
                  )}
                  {ded ? (
                    <>
                      <td style={TD}>{ded.label}</td>
                      <td style={TDR}>{W(ded.val)}</td>
                    </>
                  ) : (
                    <><td style={{ ...TD, color: '#ccc' }}>—</td><td style={TD} /></>
                  )}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#ddd', fontWeight: 700 }}>
              <td style={{ border: B, padding: '4px 8px', textAlign: 'center', letterSpacing: 2 }}>지 급 합 계</td>
              <td style={{ border: B, padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{W(p.gross_pay)}</td>
              <td style={{ border: B, padding: '4px 8px', textAlign: 'center', letterSpacing: 2 }}>공 제 합 계</td>
              <td style={{ border: B, padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{W(p.total_deduct)}</td>
            </tr>
          </tfoot>
        </table>

        {/* ── 차감지급액 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <tbody>
            <tr>
              <td style={{ background: '#111', color: '#fff', border: '1px solid #000', padding: '7px 12px',
                textAlign: 'center', fontWeight: 700, fontSize: 12, letterSpacing: 4, width: '36%' }}>
                차  감  지  급  액
              </td>
              <td style={{ border: '2px solid #000', padding: '7px 16px',
                textAlign: 'right', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {W(p.net_pay)} 원
              </td>
              <td style={{ border: '1px solid #aaa', padding: '6px 10px', fontSize: 10, color: '#444', width: '26%' }}>
                과 세 표 준 : {W(taxable)} 원<br />
                비 과 세 합 계 : {W(nontax)} 원
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── 서명란 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 8 }}>
          <tbody>
            <tr>
              {[['확 인 자',''], ['대 표 이 사',''], ['수 령 인','']].map(([label]) => (
                <td key={label} style={{ border: '1px solid #aaa', padding: '5px 12px', textAlign: 'center', width: '33%' }}>
                  <div style={{ marginBottom: 18 }}>{label}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>(인)</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <div style={{ textAlign: 'center', fontSize: 9, color: '#888', borderTop: '1px solid #ddd', paddingTop: 6 }}>
          본 명세서는 소득세법 시행규칙 제100조에 의거 발행한 급여명세서입니다.
        </div>

        <div className="modal-footer ps-no-print" style={{ marginTop: 14 }}>
          <button className="btn btn-outline" onClick={onClose}>닫기</button>
          <button className="btn btn-primary" onClick={() => window.print()}>인쇄</button>
        </div>
      </div>
    </div>
  )
}
