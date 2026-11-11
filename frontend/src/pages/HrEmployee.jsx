import { useEffect, useState, useCallback } from 'react'  // useCallback used in KpiModal too
import api from '../api'
import { getRole } from '../auth'

const EMP_TYPE    = { annual: '연봉제', hourly: '시급제' }
const DEPT_LIST   = ['생산', '품질', '영업', '구매', '관리', '경영', '금형']
const POS_LIST    = ['사원', '주임', '대리', '과장', '차장', '부장', '실장', '이사', '상무이사', '전무이사', '대표']
const COMPANY_LIST = ['조이산업', '넥스젬']
const GRADE_COLOR = { S: ['#fef9c3','#a16207'], A: ['#dcfce7','#15803d'], B: ['#dbeafe','#1d4ed8'], C: ['#fed7aa','#c2410c'], D: ['#fee2e2','#dc2626'] }

function fmt(n) {
  return n ? Number(n).toLocaleString() : '—'
}

export default function HrEmployee() {
  const [employees, setEmployees] = useState([])
  const [modal, setModal] = useState(null)
  const [detailModal, setDetailModal] = useState(null)  // { emp, tab }
  const [latestKpi, setLatestKpi] = useState({})  // emp_id → kpi
  const [q, setQ] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const isAdmin = getRole() === 'admin'

  const load = useCallback(() => {
    api.get('/hr/employees?active_only=false').then(r => setEmployees(r.data)).catch(() => {})
  }, [])

  const loadKpi = useCallback(() => {
    api.get('/hr/kpi/latest').then(r => {
      const map = {}
      r.data.forEach(k => { map[k.emp_id] = k })
      setLatestKpi(map)
    }).catch(() => {})
  }, [])

  useEffect(() => { load(); loadKpi() }, [load, loadKpi])

  const del = async (emp_id) => {
    if (!window.confirm(`[${emp_id}] 사원을 퇴직 처리하시겠습니까?`)) return
    await api.delete(`/hr/employees/${emp_id}`).catch(e => alert(e.response?.data?.detail || e.message))
    load()
  }

  const filtered = employees.filter(e => {
    const matchQ = !q || e.emp_id.includes(q) || e.name.includes(q)
    const matchD = !deptFilter || e.dept === deptFilter
    const matchT = !typeFilter || e.emp_type === typeFilter
    const matchC = !companyFilter || (e.company || '조이산업') === companyFilter
    return matchQ && matchD && matchT && matchC
  })

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>사원 마스터</h2>
        <button className="btn btn-primary" onClick={() => setModal({})}>＋ 사원 등록</button>
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="form-control" placeholder="사번/이름" value={q} onChange={e => setQ(e.target.value)} style={{ width: 160 }} />
        <select className="form-control" value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ width: 100 }}>
          <option value="">부서 전체</option>
          {DEPT_LIST.map(d => <option key={d}>{d}</option>)}
        </select>
        <select className="form-control" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 100 }}>
          <option value="">고용형태</option>
          <option value="annual">연봉제</option>
          <option value="hourly">시급제</option>
        </select>
        <select className="form-control" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} style={{ width: 110 }}>
          <option value="">법인 전체</option>
          {COMPANY_LIST.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>사번</th>
              <th>이름</th>
              <th>법인</th>
              <th>부서</th>
              <th>직급</th>
              <th>고용형태</th>
              <th style={{ textAlign: 'right' }}>기본급/시급</th>
              <th>입사일</th>
              <th>연락처</th>
              <th style={{ textAlign: 'center' }}>KPI</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={12} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>사원 없음</td></tr>}
            {filtered.map(e => {
              const kpi = latestKpi[e.emp_id]
              const gc = kpi?.grade ? GRADE_COLOR[kpi.grade] : null
              return (
              <tr key={e.emp_id} style={!e.is_active ? { opacity: 0.4 } : {}}>
                <td><code style={{ fontSize: 11 }}>{e.emp_id}</code></td>
                <td style={{ fontWeight: 600, cursor: 'pointer', color: '#1d4ed8' }}
                  onClick={() => setDetailModal({ emp: e, tab: 'info' })}>{e.name}</td>
                <td style={{ fontSize: 12 }}>
                  <span style={{
                    padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                    background: e.company === '넥스젬' ? '#ede9fe' : '#dcfce7',
                    color: e.company === '넥스젬' ? '#6d28d9' : '#15803d',
                  }}>{e.company || '조이산업'}</span>
                </td>
                <td>{e.dept || '—'}</td>
                <td>{e.position || '—'}</td>
                <td>
                  <span style={{
                    padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: e.emp_type === 'annual' ? '#dbeafe' : '#fef9c3',
                    color: e.emp_type === 'annual' ? '#1d4ed8' : '#a16207',
                  }}>{EMP_TYPE[e.emp_type] || e.emp_type}</span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {e.emp_type === 'annual'
                    ? `${fmt(e.base_salary)}원`
                    : `${fmt(e.hourly_rate)}원/h`}
                </td>
                <td style={{ fontSize: 12, color: '#475569' }}>{e.hire_date || '—'}</td>
                <td style={{ fontSize: 12 }}>{e.phone || '—'}</td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => setDetailModal({ emp: e, tab: 'kpi' })}
                    style={{
                      border: 'none', cursor: 'pointer', borderRadius: 6,
                      padding: '3px 10px', fontSize: 11, fontWeight: 700,
                      background: gc ? gc[0] : '#f1f5f9',
                      color: gc ? gc[1] : '#94a3b8',
                    }}
                  >
                    {kpi ? `${kpi.grade} · ${kpi.total_score != null ? Math.round(kpi.total_score) : '—'}점` : '미평가'}
                  </button>
                </td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, color: e.is_active ? '#16a34a' : '#94a3b8' }}>
                    {e.is_active ? '재직' : '퇴직'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-sm" style={{ marginRight: 4 }} onClick={() => setModal(e)}>수정</button>
                  {e.is_active && (
                    <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: 'none' }}
                      onClick={() => del(e.emp_id)}>퇴직</button>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <EmployeeModal
          employee={modal.emp_id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
      {detailModal && (
        <EmployeeDetailModal
          emp={detailModal.emp}
          initialTab={detailModal.tab}
          isAdmin={isAdmin}
          onClose={() => setDetailModal(null)}
          onEdit={(emp) => { setDetailModal(null); setModal(emp) }}
          onKpiSaved={() => loadKpi()}
        />
      )}
    </div>
  )
}

const SENIOR_POS = new Set(['과장', '차장', '부장', '이사', '상무이사', '전무이사', '대표'])

function EmployeeModal({ employee, onClose, onSaved }) {
  const editing = !!employee
  const [form, setForm] = useState(employee || {
    emp_id: '', name: '', dept: '', position: '', hire_date: '', retire_date: '',
    emp_type: 'hourly', job_grade: '', company: '조이산업', base_salary: '', hourly_rate: '', weekly_hours: 40,
    fixed_ot_hrs: 0, fixed_holiday_hrs: 0,
    fixed_income_tax: 0, fixed_local_tax: 0,
    birth_date: '', foreman_allow_fixed: 0, vehicle_allow_fixed: 200000,
    resident_no: '', phone: '', bank: '', bank_account: '', email: '', note: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handlePositionChange = (pos) => {
    const isSenior = SENIOR_POS.has(pos)
    setForm(f => ({
      ...f,
      position: pos,
      fixed_ot_hrs: isSenior ? 50 : 0,
      fixed_holiday_hrs: isSenior ? 16 : 0,
    }))
  }

  const submit = async () => {
    if (!form.emp_id) return alert('사번을 입력하세요')
    if (!form.name) return alert('이름을 입력하세요')
    const payload = {
      ...form,
      base_salary: +form.base_salary || 0,
      hourly_rate: +form.hourly_rate || 0,
      weekly_hours: +form.weekly_hours || 40,
      fixed_ot_hrs: +form.fixed_ot_hrs || 0,
      fixed_holiday_hrs: +form.fixed_holiday_hrs || 0,
      fixed_income_tax: +form.fixed_income_tax || 0,
      fixed_local_tax: +form.fixed_local_tax || 0,
      birth_date: form.birth_date || null,
      foreman_allow_fixed: +form.foreman_allow_fixed || 0,
      vehicle_allow_fixed: +form.vehicle_allow_fixed ?? 200000,
      meal_allow_fixed: 0,
      hire_date: form.hire_date || null,
      retire_date: form.retire_date || null,
    }
    try {
      if (editing) await api.patch(`/hr/employees/${form.emp_id}`, payload)
      else await api.post('/hr/employees', payload)
      onSaved()
    } catch (e) {
      alert('저장 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3>{editing ? '사원 수정' : '사원 등록'}</h3>

        <div className="grid-2">
          <div className="form-group">
            <label>사번 *</label>
            <input className="form-control" value={form.emp_id} onChange={e => set('emp_id', e.target.value)} disabled={editing} placeholder="EMP-001" />
          </div>
          <div className="form-group">
            <label>이름 *</label>
            <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>부서</label>
            <select className="form-control" value={form.dept || ''} onChange={e => set('dept', e.target.value)}>
              <option value="">선택</option>
              {DEPT_LIST.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>직급</label>
            <select className="form-control" value={form.position || ''} onChange={e => handlePositionChange(e.target.value)}>
              <option value="">선택</option>
              {POS_LIST.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>입사일</label>
            <input type="date" className="form-control" value={form.hire_date || ''} onChange={e => set('hire_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>고용형태</label>
            <select className="form-control" value={form.emp_type} onChange={e => set('emp_type', e.target.value)}>
              <option value="annual">연봉제</option>
              <option value="hourly">시급제</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>호봉 (CL)</label>
          <select className="form-control" value={form.job_grade || ''} onChange={e => set('job_grade', e.target.value)}>
            <option value="">선택</option>
            <option value="CL1">CL1</option>
            <option value="CL2">CL2</option>
            <option value="CL3">CL3</option>
            <option value="CL4">CL4</option>
            <option value="CL5">CL5</option>
            <option value="CL6">CL6</option>
          </select>
        </div>

        <div className="form-group">
          <label>소속 법인</label>
          <select className="form-control" value={form.company || '조이산업'} onChange={e => set('company', e.target.value)}>
            {COMPANY_LIST.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {form.emp_type === 'annual' ? (
          <div className="form-group">
            <label>월 기본급 (원)</label>
            <input className="form-control" type="number" min="0" value={form.base_salary} onChange={e => set('base_salary', e.target.value)} placeholder="3000000" />
          </div>
        ) : (
          <div className="grid-2">
            <div className="form-group">
              <label>시급 (원/h)</label>
              <input className="form-control" type="number" min="0" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} placeholder="12000" />
            </div>
            <div className="form-group">
              <label>주 소정근로(h)</label>
              <input className="form-control" type="number" min="0" max="52" value={form.weekly_hours} onChange={e => set('weekly_hours', e.target.value)} />
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 8, marginBottom: 8, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
          수당 설정
          <span style={{ marginLeft: 8, fontWeight: 400, color: '#94a3b8' }}>※ 과장급 이상 자동: 고정연장 50h / 고정특근 16h</span>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>고정 연장시간 (h/월)</label>
            <input className="form-control" type="number" min="0" value={form.fixed_ot_hrs ?? 0} onChange={e => set('fixed_ot_hrs', +e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <label>고정 특근시간 (h/월)</label>
            <input className="form-control" type="number" min="0" value={form.fixed_holiday_hrs ?? 0} onChange={e => set('fixed_holiday_hrs', +e.target.value)} placeholder="0" />
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>반장수당 (원/월, 과세)</label>
            <input className="form-control" type="number" min="0" value={form.foreman_allow_fixed ?? 0} onChange={e => set('foreman_allow_fixed', +e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <label>차량유지비 (원/월, 비과세)</label>
            <input className="form-control" type="number" min="0" value={form.vehicle_allow_fixed ?? 200000} onChange={e => set('vehicle_allow_fixed', +e.target.value)} placeholder="200000" />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 8, marginBottom: 8, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
          소득세 고정 설정
          <span style={{ marginLeft: 8, fontWeight: 400, color: '#94a3b8' }}>※ 0이면 간이세액표 자동계산</span>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>소득세 고정 (원)</label>
            <input className="form-control" type="number" min="0" value={form.fixed_income_tax ?? 0} onChange={e => set('fixed_income_tax', +e.target.value)} placeholder="0 (자동계산)" />
          </div>
          <div className="form-group">
            <label>지방소득세 고정 (원)</label>
            <input className="form-control" type="number" min="0" value={form.fixed_local_tax ?? 0} onChange={e => set('fixed_local_tax', +e.target.value)} placeholder="0 (자동계산)" />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 4, marginBottom: 8, fontSize: 11, color: '#64748b', fontWeight: 600 }}>개인정보</div>

        <div className="grid-2">
          <div className="form-group">
            <label>
              생년월일
              <span style={{ marginLeft: 6, fontWeight: 400, color: '#94a3b8', fontSize: 10 }}>※ 만 60세 이상 국민연금 면제</span>
            </label>
            <input type="date" className="form-control" value={form.birth_date || ''} onChange={e => set('birth_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>연락처</label>
            <input className="form-control" value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="010-0000-0000" />
          </div>
          <div className="form-group">
            <label>이메일</label>
            <input className="form-control" value={form.email || ''} onChange={e => set('email', e.target.value)} />
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>은행</label>
            <input className="form-control" value={form.bank || ''} onChange={e => set('bank', e.target.value)} placeholder="국민은행" />
          </div>
          <div className="form-group">
            <label>계좌번호</label>
            <input className="form-control" value={form.bank_account || ''} onChange={e => set('bank_account', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>비고</label>
          <input className="form-control" value={form.note || ''} onChange={e => set('note', e.target.value)} />
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  )
}

// ── 상수 ──────────────────────────────────────────────────────────────
const now = new Date()
const GRADE_OPTIONS = ['S', 'A', 'B', 'C', 'D']
const KPI_LABELS = {
  score_production: '생산목표 달성률',
  score_quality:    '품질',
  score_attendance: '출근율',
  score_attitude:   '업무태도',
}
const TABS = [
  { key: 'info', label: '기본정보' },
  { key: 'att',  label: '출퇴근 이력' },
  { key: 'pay',  label: '급여 이력' },
  { key: 'kpi',  label: 'KPI 평가' },
]

// ── 사원 상세 모달 ─────────────────────────────────────────────────────
function EmployeeDetailModal({ emp: initialEmp, initialTab = 'info', isAdmin, onClose, onEdit, onKpiSaved }) {
  const [emp] = useState(initialEmp)
  const [tab, setTab] = useState(initialTab)
  const [year, setYear] = useState(now.getFullYear())
  const [attData, setAttData] = useState([])
  const [payData, setPayData] = useState([])
  const [kpiData, setKpiData] = useState([])
  const [kpiMonth, setKpiMonth] = useState(now.getMonth() + 1)
  const [kpiForm, setKpiForm] = useState({ score_production: '', score_quality: '', score_attendance: '', score_attitude: '', grade: '', note: '' })
  const [saving, setSaving] = useState(false)

  // 출퇴근 연간 집계
  const loadAtt = useCallback(() => {
    api.get(`/hr/attendance/year-summary?year=${year}&emp_id=${emp.emp_id}`)
      .then(r => setAttData(r.data)).catch(() => setAttData([]))
  }, [year, emp.emp_id])

  // 급여 이력
  const loadPay = useCallback(() => {
    api.get(`/hr/payroll?year=${year}&emp_id=${emp.emp_id}`)
      .then(r => setPayData(r.data)).catch(() => setPayData([]))
  }, [year, emp.emp_id])

  // KPI 이력
  const loadKpi = useCallback(() => {
    api.get(`/hr/kpi?year=${year}&emp_id=${emp.emp_id}`)
      .then(r => setKpiData(r.data)).catch(() => setKpiData([]))
  }, [year, emp.emp_id])

  useEffect(() => {
    if (tab === 'att') loadAtt()
    else if (tab === 'pay') loadPay()
    else if (tab === 'kpi') loadKpi()
  }, [tab, loadAtt, loadPay, loadKpi])

  // KPI 월 변경 시 기존 데이터 채우기
  useEffect(() => {
    const existing = kpiData.find(k => k.month === kpiMonth)
    if (existing) {
      setKpiForm({
        score_production: existing.score_production ?? '',
        score_quality:    existing.score_quality ?? '',
        score_attendance: existing.score_attendance ?? '',
        score_attitude:   existing.score_attitude ?? '',
        grade: existing.grade || '', note: existing.note || '',
      })
    } else {
      setKpiForm({ score_production: '', score_quality: '', score_attendance: '', score_attitude: '', grade: '', note: '' })
    }
  }, [kpiData, kpiMonth])

  const kpiScores = [kpiForm.score_production, kpiForm.score_quality, kpiForm.score_attendance, kpiForm.score_attitude]
    .map(Number).filter(v => !isNaN(v) && v > 0)
  const autoScore = kpiScores.length ? Math.round(kpiScores.reduce((a, b) => a + b, 0) / kpiScores.length) : null
  const autoGrade = autoScore != null ? (autoScore >= 90 ? 'S' : autoScore >= 80 ? 'A' : autoScore >= 70 ? 'B' : autoScore >= 60 ? 'C' : 'D') : null

  const submitKpi = async () => {
    setSaving(true)
    try {
      await api.post('/hr/kpi', {
        emp_id: emp.emp_id, year, month: kpiMonth,
        score_production: +kpiForm.score_production || null,
        score_quality:    +kpiForm.score_quality    || null,
        score_attendance: +kpiForm.score_attendance || null,
        score_attitude:   +kpiForm.score_attitude   || null,
        grade: kpiForm.grade || autoGrade || null, note: kpiForm.note || null,
      })
      loadKpi(); onKpiSaved?.()
    } catch (e) { alert('저장 실패: ' + (e.response?.data?.detail || e.message)) }
    finally { setSaving(false) }
  }

  const delKpi = async (id) => {
    if (!window.confirm('이 KPI 평가를 삭제하시겠습니까?')) return
    await api.delete(`/hr/kpi/${id}`).catch(e => alert(e.response?.data?.detail || e.message))
    loadKpi(); onKpiSaved?.()
  }

  const gc = (grade) => GRADE_COLOR[grade] || ['#f1f5f9', '#64748b']
  const W = (n) => n ? Math.round(Number(n)).toLocaleString() : '—'

  /* ── 기본정보 탭 ── */
  const infoRows = [
    ['사번', emp.emp_id],               ['이름', emp.name],
    ['법인', emp.company || '조이산업'], ['부서', emp.dept || '—'],
    ['직급', emp.position || '—'],      ['호봉', emp.job_grade || '—'],
    ['고용형태', emp.emp_type === 'annual' ? '연봉제' : '시급제'],
    ['기본급/시급', emp.emp_type === 'annual' ? `${fmt(emp.base_salary)}원` : `${fmt(emp.hourly_rate)}원/h`],
    ['입사일', emp.hire_date || '—'],   ['퇴직일', emp.retire_date || '—'],
    ['고정연장(h)', emp.fixed_ot_hrs || 0], ['고정특근(h)', emp.fixed_holiday_hrs || 0],
    ['반장수당', emp.foreman_allow_fixed ? `${fmt(emp.foreman_allow_fixed)}원` : '—'],
    ['차량유지비', emp.vehicle_allow_fixed ? `${fmt(emp.vehicle_allow_fixed)}원` : '—'],
    ['생년월일', emp.birth_date || '—'], ['연락처', emp.phone || '—'],
    ['이메일', emp.email || '—'],       ['은행', emp.bank ? `${emp.bank} ${emp.bank_account || ''}` : '—'],
    ['비고', emp.note || '—'],
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 820, width: '96%', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{ padding: '16px 20px 0', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{emp.name}</span>
              <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>{emp.emp_id}</span>
              <span style={{ marginLeft: 8 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: emp.company === '넥스젬' ? '#ede9fe' : '#dcfce7',
                  color: emp.company === '넥스젬' ? '#6d28d9' : '#15803d',
                }}>{emp.company || '조이산업'}</span>
              </span>
              <span style={{ marginLeft: 6, fontSize: 13, color: '#475569' }}>{emp.dept || ''} · {emp.position || ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isAdmin && <button className="btn btn-sm" onClick={() => onEdit(emp)}>정보 수정</button>}
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }} onClick={onClose}>✕</button>
            </div>
          </div>

          {/* 탭 */}
          <div style={{ display: 'flex', gap: 0 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: tab === t.key ? 700 : 400, fontSize: 13,
                color: tab === t.key ? '#1d4ed8' : '#64748b',
                borderBottom: tab === t.key ? '2px solid #1d4ed8' : '2px solid transparent',
                marginBottom: -1,
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* 연도 선택 (att/pay/kpi 탭) */}
        {tab !== 'info' && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="form-control" value={year} onChange={e => setYear(+e.target.value)} style={{ width: 100, fontSize: 13 }}>
              {[now.getFullYear()-2, now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y}>{y}</option>)}
            </select>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>년</span>
          </div>
        )}

        {/* 본문 */}
        <div style={{ padding: '16px 20px' }}>

          {/* ── 기본정보 ── */}
          {tab === 'info' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
              {infoRows.map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                  <span style={{ minWidth: 90, fontSize: 11, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 13, color: '#1e293b', wordBreak: 'break-all' }}>{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── 출퇴근 이력 ── */}
          {tab === 'att' && (
            <table className="table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>월</th>
                  <th style={{ textAlign: 'right' }}>근무일</th>
                  <th style={{ textAlign: 'right' }}>연장(h)</th>
                  <th style={{ textAlign: 'right' }}>야간(h)</th>
                  <th style={{ textAlign: 'right' }}>특근(h)</th>
                  <th style={{ textAlign: 'right' }}>결근</th>
                </tr>
              </thead>
              <tbody>
                {attData.map(r => (
                  <tr key={r.month} style={r.days === 0 ? { opacity: 0.35 } : {}}>
                    <td style={{ fontWeight: 600 }}>{r.month}월</td>
                    <td style={{ textAlign: 'right' }}>{r.days}일</td>
                    <td style={{ textAlign: 'right', color: r.total_ot_hrs > 0 ? '#d97706' : undefined }}>{r.total_ot_hrs}h</td>
                    <td style={{ textAlign: 'right', color: r.total_night_hrs > 0 ? '#7c3aed' : undefined }}>{r.total_night_hrs}h</td>
                    <td style={{ textAlign: 'right' }}>{r.total_hol_hrs}h</td>
                    <td style={{ textAlign: 'right', color: r.absents > 0 ? '#dc2626' : undefined }}>{r.absents}</td>
                  </tr>
                ))}
                {attData.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>데이터 없음</td></tr>}
              </tbody>
            </table>
          )}

          {/* ── 급여 이력 ── */}
          {tab === 'pay' && (
            <table className="table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>월</th>
                  <th style={{ textAlign: 'right' }}>기본급</th>
                  <th style={{ textAlign: 'right' }}>연장수당</th>
                  <th style={{ textAlign: 'right' }}>총지급</th>
                  <th style={{ textAlign: 'right' }}>총공제</th>
                  <th style={{ textAlign: 'right' }}>실수령</th>
                  <th style={{ textAlign: 'center' }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {payData.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>급여 데이터 없음</td></tr>}
                {payData.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.month}월</td>
                    <td style={{ textAlign: 'right' }}>{W(p.base_pay)}</td>
                    <td style={{ textAlign: 'right', color: Number(p.ot_pay) > 0 ? '#d97706' : undefined }}>{W(p.ot_pay)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{W(p.gross_pay)}</td>
                    <td style={{ textAlign: 'right', color: '#dc2626' }}>{W(p.total_deduct)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{W(p.net_pay)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600,
                        color: p.status === '지급완료' ? '#16a34a' : p.status === '확정' ? '#1d4ed8' : '#a16207' }}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {payData.length > 0 && (
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td>합계</td>
                    <td style={{ textAlign: 'right' }}>{W(payData.reduce((s, p) => s + Number(p.base_pay || 0), 0))}</td>
                    <td style={{ textAlign: 'right' }}>{W(payData.reduce((s, p) => s + Number(p.ot_pay || 0), 0))}</td>
                    <td style={{ textAlign: 'right', color: '#1d4ed8' }}>{W(payData.reduce((s, p) => s + Number(p.gross_pay || 0), 0))}</td>
                    <td style={{ textAlign: 'right', color: '#dc2626' }}>{W(payData.reduce((s, p) => s + Number(p.total_deduct || 0), 0))}</td>
                    <td style={{ textAlign: 'right', color: '#16a34a' }}>{W(payData.reduce((s, p) => s + Number(p.net_pay || 0), 0))}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* ── KPI ── */}
          {tab === 'kpi' && (
            <div>
              {/* 연간 현황 */}
              {kpiData.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>{year}년 평가 현황</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {kpiData.map(k => {
                      const [bg, color] = gc(k.grade)
                      return (
                        <div key={k.id} onClick={() => setKpiMonth(k.month)} style={{
                          padding: '8px 14px', borderRadius: 10, background: bg,
                          border: `1px solid ${color}30`, cursor: 'pointer', minWidth: 80, textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{k.month === 0 ? '연간' : `${k.month}월`}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color }}>{k.grade}</div>
                          {k.total_score != null && <div style={{ fontSize: 11, color: '#64748b' }}>{Math.round(k.total_score)}점</div>}
                          {k.note && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{k.note}</div>}
                          {isAdmin && <button onClick={e => { e.stopPropagation(); delKpi(k.id) }}
                            style={{ marginTop: 4, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11 }}>삭제</button>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 입력 폼 — 관리자만 */}
              {isAdmin ? (
                <div style={{ borderTop: kpiData.length > 0 ? '1px solid #e2e8f0' : 'none', paddingTop: kpiData.length > 0 ? 14 : 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <select className="form-control" value={kpiMonth} onChange={e => setKpiMonth(+e.target.value)} style={{ width: 110 }}>
                      <option value={0}>연간 평가</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                    </select>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>평가 등록/수정</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    {Object.entries(KPI_LABELS).map(([key, label]) => (
                      <div key={key} className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: 12 }}>{label} (0-100)</label>
                        <input className="form-control" type="number" min={0} max={100}
                          value={kpiForm[key]} onChange={e => setKpiForm(f => ({ ...f, [key]: e.target.value }))}
                          placeholder="미입력 시 제외" />
                      </div>
                    ))}
                  </div>
                  {autoScore != null && (
                    <div style={{ marginBottom: 10, padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 12 }}>
                      자동 계산 — 종합점수: <strong>{autoScore}점</strong> / 등급: <strong style={{ color: gc(autoGrade)[1] }}>{autoGrade}</strong>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>등급 (미입력 시 자동)</label>
                      <select className="form-control" value={kpiForm.grade} onChange={e => setKpiForm(f => ({ ...f, grade: e.target.value }))}>
                        <option value="">자동</option>
                        {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>비고</label>
                      <input className="form-control" value={kpiForm.note}
                        onChange={e => setKpiForm(f => ({ ...f, note: e.target.value }))} placeholder="평가 의견" />
                    </div>
                  </div>
                  <div style={{ marginTop: 14, textAlign: 'right' }}>
                    <button className="btn btn-primary" onClick={submitKpi} disabled={saving}>
                      {saving ? '저장중...' : 'KPI 저장'}
                    </button>
                  </div>
                </div>
              ) : (
                kpiData.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>아직 KPI 평가가 없습니다.</div>
                )
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}


