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
  const [kpiModal, setKpiModal] = useState(null)  // { emp }
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
                <td style={{ fontWeight: 600 }}>{e.name}</td>
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
                    onClick={() => setKpiModal({ emp: e })}
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
      {kpiModal && (
        <KpiModal
          emp={kpiModal.emp}
          isAdmin={isAdmin}
          onClose={() => setKpiModal(null)}
          onSaved={() => { setKpiModal(null); loadKpi() }}
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

// ── KPI 모달 ──────────────────────────────────────────────────────────
const now = new Date()
const GRADE_OPTIONS = ['S', 'A', 'B', 'C', 'D']
const KPI_LABELS = {
  score_production: '생산목표 달성률',
  score_quality:    '품질',
  score_attendance: '출근율',
  score_attitude:   '업무태도',
}

function KpiModal({ emp, isAdmin, onClose, onSaved }) {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [history, setHistory] = useState([])
  const [form, setForm] = useState({
    score_production: '', score_quality: '', score_attendance: '', score_attitude: '',
    grade: '', note: '',
  })
  const [saving, setSaving] = useState(false)

  const loadHistory = useCallback(() => {
    api.get(`/hr/kpi?year=${year}&emp_id=${emp.emp_id}`)
      .then(r => setHistory(r.data))
      .catch(() => setHistory([]))
  }, [year, emp.emp_id])

  useEffect(() => { loadHistory() }, [loadHistory])

  // 해당 월 기존 데이터 로드
  useEffect(() => {
    const existing = history.find(k => k.month === month)
    if (existing) {
      setForm({
        score_production: existing.score_production ?? '',
        score_quality:    existing.score_quality ?? '',
        score_attendance: existing.score_attendance ?? '',
        score_attitude:   existing.score_attitude ?? '',
        grade: existing.grade || '',
        note:  existing.note || '',
      })
    } else {
      setForm({ score_production: '', score_quality: '', score_attendance: '', score_attitude: '', grade: '', note: '' })
    }
  }, [history, month])

  const scores = [form.score_production, form.score_quality, form.score_attendance, form.score_attitude]
    .map(Number).filter(v => !isNaN(v) && v !== 0)
  const autoScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const autoGrade = autoScore != null
    ? (autoScore >= 90 ? 'S' : autoScore >= 80 ? 'A' : autoScore >= 70 ? 'B' : autoScore >= 60 ? 'C' : 'D')
    : null

  const submit = async () => {
    setSaving(true)
    try {
      await api.post('/hr/kpi', {
        emp_id: emp.emp_id, year, month,
        score_production: +form.score_production || null,
        score_quality:    +form.score_quality    || null,
        score_attendance: +form.score_attendance || null,
        score_attitude:   +form.score_attitude   || null,
        grade: form.grade || autoGrade || null,
        note: form.note || null,
      })
      onSaved()
    } catch (e) {
      alert('저장 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  const delKpi = async (id) => {
    if (!window.confirm('이 KPI 평가를 삭제하시겠습니까?')) return
    await api.delete(`/hr/kpi/${id}`).catch(e => alert(e.response?.data?.detail || e.message))
    loadHistory()
  }

  const gc = (grade) => GRADE_COLOR[grade] || ['#f1f5f9', '#64748b']

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>KPI 평가 — {emp.name} ({emp.dept || '—'})</h3>
          <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }} onClick={onClose}>✕</button>
        </div>

        {/* 연도 선택 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
          <select className="form-control" value={year} onChange={e => setYear(+e.target.value)} style={{ width: 100 }}>
            {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y}>{y}</option>)}
          </select>
          <span style={{ fontSize: 13, color: '#64748b' }}>년</span>
        </div>

        {/* 연간 KPI 히스토리 */}
        {history.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>{year}년 평가 현황</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {history.map(k => {
                const [bg, color] = gc(k.grade)
                return (
                  <div key={k.id} style={{
                    padding: '6px 12px', borderRadius: 8, background: bg, border: `1px solid ${color}20`,
                    fontSize: 12, cursor: 'pointer', position: 'relative',
                  }} onClick={() => setMonth(k.month)}>
                    <span style={{ fontWeight: 700, color }}>{k.month === 0 ? '연간' : `${k.month}월`}</span>
                    <span style={{ marginLeft: 6, fontWeight: 800, color }}>{k.grade}</span>
                    {k.total_score != null && <span style={{ marginLeft: 4, color: '#64748b', fontSize: 11 }}>{Math.round(k.total_score)}점</span>}
                    {isAdmin && (
                      <button onClick={e => { e.stopPropagation(); delKpi(k.id) }}
                        style={{ marginLeft: 8, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 입력 폼 — 관리자만 */}
        {isAdmin ? (
          <>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <select className="form-control" value={month} onChange={e => setMonth(+e.target.value)} style={{ width: 100 }}>
                  <option value={0}>연간 평가</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                </select>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>평가 등록/수정</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {Object.entries(KPI_LABELS).map(([key, label]) => (
                  <div key={key} className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>{label} (0-100)</label>
                    <input className="form-control" type="number" min={0} max={100}
                      value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder="점수 미입력 시 제외" />
                  </div>
                ))}
              </div>

              {autoScore != null && (
                <div style={{ marginBottom: 10, padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 12 }}>
                  자동 계산 — 종합점수: <strong>{autoScore}점</strong> / 등급: <strong style={{ color: gc(autoGrade)[1] }}>{autoGrade}</strong>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>등급 (미입력 시 자동)</label>
                  <select className="form-control" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>
                    <option value="">자동</option>
                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>비고</label>
                  <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="평가 의견" />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={onClose}>닫기</button>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>
                {saving ? '저장중...' : '저장'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: '16px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            KPI 평가는 관리자만 수정 가능합니다.
            <div className="modal-footer" style={{ marginTop: 16 }}>
              <button className="btn btn-outline" onClick={onClose}>닫기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

