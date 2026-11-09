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
  const [loading, setLoading] = useState(false)
  const [calcLoading, setCalcLoading] = useState(false)
  const [selected, setSelected] = useState(null)  // 명세서 팝업

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

  const confirm = async (id) => {
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
      {/* 헤더 */}
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

      {/* 집계 요약 */}
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

      {/* 급여 테이블 */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>사번</th>
              <th>이름</th>
              <th>부서</th>
              <th>고용형태</th>
              <th style={{ textAlign: 'right' }}>기본급</th>
              <th style={{ textAlign: 'right' }}>연장수당</th>
              <th style={{ textAlign: 'right' }}>총지급</th>
              <th style={{ textAlign: 'right' }}>총공제</th>
              <th style={{ textAlign: 'right' }}>실수령액</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payrolls.length === 0 && (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                  급여 데이터가 없습니다. <strong>자동 계산</strong> 버튼을 눌러 계산하세요.
                </td>
              </tr>
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
                        onClick={() => confirm(p.id)}>확정</button>
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

      {/* 명세서 팝업 */}
      {selected && <PayslipModal payroll={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function PayslipModal({ payroll: p, onClose }) {
  const print = () => window.print()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, width: '100%' }} onClick={e => e.stopPropagation()}>
        <style>{`
          @media print {
            body > *:not(.modal-overlay) { display: none !important; }
            .modal-overlay { position: static !important; background: none !important; }
            .modal { box-shadow: none !important; border: 1px solid #ccc; max-width: 100% !important; }
            .no-print { display: none !important; }
          }
        `}</style>

        {/* 명세서 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #1d4ed8', paddingBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8' }}>급 여 명 세 서</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{p.year}년 {p.month}월분</div>
        </div>

        {/* 사원 정보 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16, fontSize: 13 }}>
          {[['사번', p.emp_id], ['이름', p.name], ['부서', p.dept || '—'], ['직급', p.position || '—']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#64748b', width: 36 }}>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>

        {/* 지급/공제 2단 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {/* 지급 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 8, borderBottom: '1px solid #bfdbfe', paddingBottom: 4 }}>지 급 항 목</div>
            {[
              ['기본급', p.base_pay],
              ['연장수당', p.ot_pay],
              ['야간수당', p.night_pay],
              ['휴일수당', p.holiday_pay],
              ['식대', p.meal_allow],
              ['교통비', p.trans_allow],
              ['성과/상여', p.bonus],
            ].filter(([,v]) => Number(v) > 0).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: '#475569' }}>{k}</span>
                <span>{Number(v).toLocaleString()}원</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: '#1d4ed8', borderTop: '1px solid #bfdbfe', paddingTop: 6, marginTop: 4 }}>
              <span>지급합계</span>
              <span>{Number(p.gross_pay).toLocaleString()}원</span>
            </div>
          </div>

          {/* 공제 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 8, borderBottom: '1px solid #fecaca', paddingBottom: 4 }}>공 제 항 목</div>
            {[
              ['국민연금', p.deduct_pension],
              ['건강보험', p.deduct_health],
              ['장기요양', p.deduct_lcare],
              ['고용보험', p.deduct_employ],
              ['소득세', p.deduct_income_tax],
              ['지방소득세', p.deduct_local_tax],
            ].filter(([,v]) => Number(v) > 0).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: '#475569' }}>{k}</span>
                <span>{Number(v).toLocaleString()}원</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: '#dc2626', borderTop: '1px solid #fecaca', paddingTop: 6, marginTop: 4 }}>
              <span>공제합계</span>
              <span>{Number(p.total_deduct).toLocaleString()}원</span>
            </div>
          </div>
        </div>

        {/* 실수령액 */}
        <div style={{ background: '#eff6ff', borderRadius: 8, padding: '12px 16px', textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>실 수 령 액</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#1d4ed8' }}>
            {Number(p.net_pay).toLocaleString()}원
          </div>
        </div>

        <div className="modal-footer no-print">
          <button className="btn btn-outline" onClick={onClose}>닫기</button>
          <button className="btn btn-primary" onClick={print}>인쇄</button>
        </div>
      </div>
    </div>
  )
}
