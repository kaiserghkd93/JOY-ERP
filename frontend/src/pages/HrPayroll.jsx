import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const now = new Date()
const COMPANY_LIST = ['조이산업', '넥스젬']
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
  const [excelCompany, setExcelCompany] = useState('')

  // 결근자 확인 모달
  const [absentModal, setAbsentModal] = useState(false)
  const [absents, setAbsents] = useState([])   // [{emp_id, name, dept, dates:[{id, work_date}]}]
  const [leaveChoices, setLeaveChoices] = useState({})  // {attendanceId: leaveType|null}

  const [excelLoading, setExcelLoading] = useState(false)

  const downloadExcel = async () => {
    const params = new URLSearchParams({ year, month })
    if (excelCompany) params.set('company', excelCompany)
    setExcelLoading(true)
    try {
      const res = await api.get(`/hr/payroll/export-excel?${params}`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const co = excelCompany ? `_${excelCompany}` : ''
      a.download = `${year}${String(month).padStart(2,'0')}_급여정산표${co}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch(e) {
      let msg = e.message
      if (e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text()
          const json = JSON.parse(text)
          msg = json.detail || text
        } catch { msg = await e.response.data.text().catch(() => e.message) }
      } else if (e.response?.data?.detail) {
        msg = e.response.data.detail
      }
      alert('다운로드 실패:\n' + msg)
    } finally {
      setExcelLoading(false)
    }
  }

  const load = useCallback(() => {
    api.get(`/hr/payroll?year=${year}&month=${month}`).then(r => setPayrolls(r.data)).catch(() => setPayrolls([]))
  }, [year, month])

  useEffect(() => { load() }, [load])

  const calculate = async () => {
    // 결근자 먼저 확인
    try {
      const { data } = await api.get(`/hr/attendance/absents?year=${year}&month=${month}`)
      if (data.length > 0) {
        const init = {}
        data.forEach(emp => emp.dates.forEach(d => { init[d.id] = null }))
        setAbsents(data)
        setLeaveChoices(init)
        setAbsentModal(true)
        return
      }
    } catch { /* 조회 실패 시 그냥 진행 */ }
    doCalculate()
  }

  const doCalculate = async () => {
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

  const applyLeavesAndCalculate = async () => {
    const patches = Object.entries(leaveChoices).filter(([, v]) => v !== null)
    for (const [id, action] of patches) {
      if (action === '출근') {
        await api.post(`/hr/attendance/${id}/mark-present`).catch(() => {})
      } else {
        await api.patch(`/hr/attendance/${id}`, { leave_type: action }).catch(() => {})
      }
    }
    setAbsentModal(false)
    doCalculate()
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
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 8, borderLeft: '1px solid #e2e8f0', paddingLeft: 12 }}>
            <select className="form-control" value={excelCompany} onChange={e => setExcelCompany(e.target.value)} style={{ width: 100, fontSize: 12 }}>
              <option value="">전체 법인</option>
              {COMPANY_LIST.map(c => <option key={c}>{c}</option>)}
            </select>
            <button className="btn" style={{ background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, whiteSpace: 'nowrap' }}
              onClick={downloadExcel} disabled={payrolls.length === 0 || excelLoading}>
              {excelLoading ? '생성중...' : '📥 엑셀 다운로드'}
            </button>
          </div>
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

      {selected && (
        <PayslipModal
          payroll={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { load(); setSelected(null) }}
        />
      )}

      {/* 결근자 확인 모달 */}
      {absentModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 560, maxWidth: '95vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800 }}>결근자 확인</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
              아래 결근 처리된 날짜에 연차/반차 등을 지정하면 급여 계산 시 반영됩니다.<br/>
              지정하지 않으면 결근으로 처리됩니다.
            </p>
            {absents.map(emp => (
              <div key={emp.emp_id} style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                  {emp.name} <span style={{ color: '#64748b', fontSize: 12, fontWeight: 400 }}>({emp.dept || '—'})</span>
                </div>
                {emp.dates.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, minWidth: 90, color: '#475569' }}>{d.work_date}</span>
                    {['출근', '연차', '반차', '병가', '공가'].map(lt => {
                      const isOut = lt === '출근'
                      const sel   = leaveChoices[d.id] === lt
                      return (
                        <button
                          key={lt}
                          onClick={() => setLeaveChoices(prev => ({ ...prev, [d.id]: prev[d.id] === lt ? null : lt }))}
                          style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid',
                            background: sel ? (isOut ? '#16a34a' : '#3b82f6') : '#fff',
                            color:      sel ? '#fff' : (isOut ? '#16a34a' : '#475569'),
                            borderColor: sel ? (isOut ? '#16a34a' : '#3b82f6') : (isOut ? '#bbf7d0' : '#cbd5e1'),
                            fontWeight: isOut ? 700 : 400,
                          }}
                        >{lt}</button>
                      )
                    })}
                    {leaveChoices[d.id] === null && (
                      <span style={{ fontSize: 11, color: '#dc2626' }}>결근 처리</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setAbsentModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={applyLeavesAndCalculate}>
                적용 후 급여 계산
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 급상여명세서 (사진 형식) ────────────────────────────────────────── */
function PayslipModal({ payroll: initialP, onClose, onSaved }) {
  const [p, setP] = useState(initialP)
  const [taxEdit, setTaxEdit] = useState({
    deduct_income_tax: Math.round(Number(initialP.deduct_income_tax || 0)),
    deduct_local_tax:  Math.round(Number(initialP.deduct_local_tax  || 0)),
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleTax = (key, val) => {
    setTaxEdit(prev => ({ ...prev, [key]: Math.round(Number(val) || 0) }))
    setDirty(true)
  }

  const saveTax = async () => {
    setSaving(true)
    try {
      const r = await api.patch(`/hr/payroll/${p.id}/update`, taxEdit)
      setP(prev => ({
        ...prev,
        deduct_income_tax: taxEdit.deduct_income_tax,
        deduct_local_tax:  taxEdit.deduct_local_tax,
        total_deduct: Number(prev.deduct_pension) + Number(prev.deduct_health) +
                      Number(prev.deduct_lcare) + Number(prev.deduct_employ) +
                      taxEdit.deduct_income_tax + taxEdit.deduct_local_tax,
        net_pay: r.data.net_pay,
      }))
      setDirty(false)
      onSaved?.()
    } catch(e) {
      alert('저장 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  const W  = (n) => Math.round(Number(n || 0)).toLocaleString()
  const fmtTime = (h, m) => (h || m) ? (m ? `${h}h ${m}m` : `${h}h`) : '—'
  const mm = String(p.month).padStart(2, '0')

  const payItems = [
    { label: '기본급',      sub: `시급 ${W(p.std_hourly)}×${p.std_hrs||209}h`, val: p.base_pay },
    { label: '연장근로수당', sub: `${fmtTime(p.pay_ot_hrs, p.pay_ot_min)} × 1.5`, val: p.ot_pay },
    { label: '심야수당',    sub: `${p.pay_night_hrs||0}h × 0.5`, val: p.night_pay },
    { label: '휴일근로수당', sub: `${fmtTime(p.pay_holiday_hrs, p.pay_holiday_min)} × 1.5`, val: p.holiday_pay },
    { label: '반장수당',    sub: '과세', val: p.foreman_allow },
    { label: '차량유지비',  sub: '비과세', val: p.vehicle_allow },
    { label: '식대',        sub: '비과세', val: p.meal_allow },
    { label: '상여',        sub: '', val: p.bonus },
  ].filter(r => Number(r.val) > 0)

  const deductItems = [
    { label: '국민연금',    val: p.deduct_pension,     editable: false },
    { label: '건강보험',    val: p.deduct_health,      editable: false },
    { label: '고용보험',    val: p.deduct_employ,      editable: false },
    { label: '장기요양보험료', val: p.deduct_lcare,    editable: false },
    { label: '소득세',      val: taxEdit.deduct_income_tax, editable: true, key: 'deduct_income_tax' },
    { label: '지방소득세',  val: taxEdit.deduct_local_tax,  editable: true, key: 'deduct_local_tax' },
  ]

  const calcRows = [
    { label: '기본급',      formula: `통상시급(${W(p.std_hourly)}원) × 소정근로시간(${p.std_hrs||209}h)`, val: p.base_pay },
    { label: '연장근로수당', formula: `통상시급 × 연장시간(${fmtTime(p.pay_ot_hrs, p.pay_ot_min)}) × 1.5`, val: p.ot_pay },
    { label: '심야수당',    formula: `통상시급 × 야간시간(${p.pay_night_hrs||0}h) × 0.5 (추가분)`, val: p.night_pay },
    { label: '휴일근로수당', formula: `통상시급 × 휴일시간(${fmtTime(p.pay_holiday_hrs, p.pay_holiday_min)}) × 1.5`, val: p.holiday_pay },
    { label: '차량유지비',  formula: '비과세 고정 지급', val: p.vehicle_allow },
  ].filter(r => Number(r.val) > 0)

  const BL = '1px solid #c8d0d8'
  const BLUE_BG = '#dce8f5'
  const BLUE_LABEL = '#c5d8ee'

  const cellLabel = {
    border: BL, padding: '4px 8px', fontSize: 11,
    background: BLUE_BG, textAlign: 'center', fontWeight: 700, color: '#1a3a5c',
  }
  const cellAmt = {
    border: BL, padding: '4px 10px', fontSize: 12, textAlign: 'right',
    fontVariantNumeric: 'tabular-nums', background: '#fff',
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <style>{`
        @media print {
          /* 모든 요소 숨기기 (DOM 구조와 무관) */
          body * { visibility: hidden !important; }
          /* 명세서 박스와 그 하위 요소만 표시 */
          .ps-box, .ps-box * { visibility: visible !important; }
          /* 명세서 박스를 인쇄 영역 최상단에 고정 */
          .ps-box {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 8mm 12mm !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          /* 버튼, 인풋 숨기기 */
          .ps-hide, .ps-hide * { visibility: hidden !important; display: none !important; }
          /* 인쇄 전용 텍스트 표시 */
          .ps-print-only { visibility: visible !important; display: inline !important; }
          @page { margin: 0; size: A4 portrait; }
        }
        @media screen {
          .ps-print-only { display: none !important; }
        }
        .ps-root { z-index: 9999; }
      `}</style>

      <div className="modal ps-box ps-root"
        style={{ maxWidth: 680, width: '100%', background: '#fff', color: '#000',
          fontFamily: '"Malgun Gothic","Apple SD Gothic Neo",sans-serif', fontSize: 11, lineHeight: 1.5 }}
        onClick={e => e.stopPropagation()}>

        {/* ── 제목 행 ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: '#555' }}>회사명 {p.company || '조이산업'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 2 }}>
            {p.year}년 {mm}월 급상여명세서
          </div>
          <div style={{ fontSize: 11, color: '#555' }}>지급일 {p.year}.{mm}.25</div>
        </div>

        {/* ── 인적사항 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, border: BL }}>
          <tbody>
            <tr>
              {[
                ['사원코드', p.emp_id], ['사원명', p.name], ['생년월일', p.birth_date ? p.birth_date.replace(/-/g,'').slice(2) : (p.resident_no ? p.resident_no.slice(0,6) : '—')]
              ].map(([k, v]) => (
                <><td key={k+'k'} style={{ ...cellLabel, width: '10%', fontSize: 10 }}>{k}</td>
                  <td key={k+'v'} style={{ border: BL, padding: '4px 10px', width: '23%' }}>{v}</td></>
              ))}
            </tr>
            <tr>
              {[
                ['부서', p.dept || '—'], ['직급', p.position || '—'], ['호봉', p.job_grade || '—']
              ].map(([k, v]) => (
                <><td key={k+'k'} style={{ ...cellLabel, fontSize: 10 }}>{k}</td>
                  <td key={k+'v'} style={{ border: BL, padding: '4px 10px' }}>{v}</td></>
              ))}
            </tr>
          </tbody>
        </table>

        {/* ── 근로시간 / 통상시급 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
          <thead>
            <tr>
              {['연장근로시간','야간근로시간','휴일근로시간','통상시급(원)'].map(h => (
                <th key={h} style={{ border: BL, padding: '4px 8px', background: '#eef2f7', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#1a3a5c' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: BL, padding: '5px 8px', textAlign: 'center' }}>{fmtTime(p.pay_ot_hrs, p.pay_ot_min)}</td>
              <td style={{ border: BL, padding: '5px 8px', textAlign: 'center' }}>{p.pay_night_hrs ? `${p.pay_night_hrs}h` : '—'}</td>
              <td style={{ border: BL, padding: '5px 8px', textAlign: 'center' }}>{fmtTime(p.pay_holiday_hrs, p.pay_holiday_min)}</td>
              <td style={{ border: BL, padding: '5px 8px', textAlign: 'center' }}>{W(p.std_hourly)}</td>
            </tr>
          </tbody>
        </table>

        {/* ── 지급내역 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ ...cellLabel, width: '10%', fontSize: 13, letterSpacing: 1, verticalAlign: 'middle', background: BLUE_LABEL }}>
                지급내역
              </td>
              {payItems.map((item, i) => (
                <td key={i} style={{ border: BL, padding: '4px 8px', textAlign: 'center', fontSize: 11,
                  background: '#eef2f7', fontWeight: 600, color: '#1a3a5c' }}>
                  {item.label}
                </td>
              ))}
              {Array(Math.max(0, 6 - payItems.length)).fill(null).map((_, i) => (
                <td key={'ep'+i} style={{ border: BL, background: '#eef2f7' }} />
              ))}
            </tr>
            <tr>
              {payItems.map((item, i) => (
                <td key={i} style={cellAmt}>{W(item.val)}</td>
              ))}
              {Array(Math.max(0, 6 - payItems.length)).fill(null).map((_, i) => (
                <td key={'ea'+i} style={{ border: BL }} />
              ))}
            </tr>
          </tbody>
        </table>

        {/* ── 공제내역 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, borderTop: 'none' }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ ...cellLabel, width: '10%', fontSize: 13, letterSpacing: 1, verticalAlign: 'middle', background: BLUE_LABEL }}>
                공제내역
              </td>
              {deductItems.map((item, i) => (
                <td key={i} style={{ border: BL, padding: '4px 8px', textAlign: 'center', fontSize: 11,
                  background: '#eef2f7', fontWeight: 600, color: '#1a3a5c' }}>
                  {item.label}
                </td>
              ))}
              {Array(Math.max(0, 6 - deductItems.length)).fill(null).map((_, i) => (
                <td key={'dp'+i} style={{ border: BL, background: '#eef2f7' }} />
              ))}
            </tr>
            <tr>
              {deductItems.map((item, i) => (
                <td key={i} style={{ ...cellAmt, padding: item.editable ? '2px 4px' : undefined }}>
                  {item.editable ? (
                    <>
                      <input
                        type="number"
                        value={item.val}
                        onChange={e => handleTax(item.key, e.target.value)}
                        className="ps-hide"
                        style={{ width: '100%', border: '1px solid #3b82f6', borderRadius: 3,
                          padding: '2px 6px', fontSize: 12, textAlign: 'right', background: '#eff6ff' }}
                      />
                      <span className="ps-print-only">{W(item.val)}</span>
                    </>
                  ) : W(item.val)}
                </td>
              ))}
              {Array(Math.max(0, 6 - deductItems.length)).fill(null).map((_, i) => (
                <td key={'da'+i} style={{ border: BL }} />
              ))}
            </tr>
          </tbody>
        </table>

        {/* ── 합계 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <tbody>
            <tr>
              <td style={{ ...cellLabel, width: '10%', fontSize: 13, background: '#b8cfe8', fontWeight: 700, verticalAlign: 'middle', textAlign: 'center' }}>
                합계
              </td>
              <td style={{ border: BL, background: '#eef2f7' }} colSpan={2} />
              <td style={{ border: BL, padding: '5px 10px', background: '#eef2f7', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#1a3a5c' }}>
                지급총액
              </td>
              <td style={{ border: BL, padding: '5px 10px', background: '#eef2f7', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#1a3a5c' }}>
                공제총액
              </td>
              <td style={{ border: BL, background: '#eef2f7' }} />
              <td style={{ border: BL, padding: '5px 10px', background: '#eef2f7', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#1a3a5c' }}>
                차인지급액
              </td>
            </tr>
            <tr>
              <td style={{ border: BL, background: '#b8cfe8' }} />
              <td style={{ border: BL }} colSpan={2} />
              <td style={{ ...cellAmt, fontWeight: 700, fontSize: 13 }}>{W(p.gross_pay)}</td>
              <td style={{ ...cellAmt, fontSize: 13 }}>{W(p.total_deduct)}</td>
              <td style={{ border: BL }} />
              <td style={{ ...cellAmt, fontWeight: 700, fontSize: 14, color: '#0a2a50' }}>{W(p.net_pay)}</td>
            </tr>
          </tbody>
        </table>

        {/* ── 계산방법 ── */}
        {calcRows.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: '#333' }}>· 계산방법</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
              <thead>
                <tr>
                  {['구분','산출식 또는 산출방법','지급액'].map(h => (
                    <th key={h} style={{ border: BL, padding: '4px 10px', background: '#eef2f7',
                      textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#1a3a5c' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calcRows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ border: BL, padding: '4px 10px', width: '15%', textAlign: 'center' }}>{r.label}</td>
                    <td style={{ border: BL, padding: '4px 10px', fontSize: 11, color: '#444' }}>{r.formula}</td>
                    <td style={{ border: BL, padding: '4px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{W(r.val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div style={{ textAlign: 'center', fontSize: 9, color: '#999', borderTop: '1px solid #ddd', paddingTop: 6, marginBottom: 4 }}>
          본 명세서는 소득세법 시행규칙 제100조에 의거 발행한 급여명세서입니다.
        </div>

        <div className="modal-footer ps-hide" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-outline" onClick={onClose}>닫기</button>
          <button className="btn btn-primary" onClick={() => window.print()}>인쇄</button>
          {dirty && (
            <button
              className="btn"
              style={{ background: '#3b82f6', color: '#fff', border: 'none', marginLeft: 'auto' }}
              onClick={saveTax}
              disabled={saving}
            >
              {saving ? '저장중...' : '이번달 소득세 저장'}
            </button>
          )}
          {dirty && (
            <button
              className="btn"
              style={{ background: '#7c3aed', color: '#fff', border: 'none' }}
              onClick={async () => {
                setSaving(true)
                try {
                  await api.patch(`/hr/employees/${p.emp_id}/tax`, {
                    fixed_income_tax: taxEdit.deduct_income_tax,
                    fixed_local_tax: taxEdit.deduct_local_tax,
                  })
                  await saveTax()
                  alert(`${p.name} 직원 소득세 고정값이 저장되었습니다.\n다음 달부터 자동 계산 시 고정값이 적용됩니다.`)
                } catch(e) {
                  setSaving(false)
                  alert('저장 실패: ' + (e.response?.data?.detail || e.message))
                }
              }}
              disabled={saving}
            >
              직원 고정값으로 저장 (매달 자동 적용)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
