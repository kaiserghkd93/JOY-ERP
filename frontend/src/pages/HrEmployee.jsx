import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const EMP_TYPE = { annual: '연봉제', hourly: '시급제' }
const DEPT_LIST = ['생산', '품질', '영업', '구매', '관리', '경영']
const POS_LIST  = ['사원', '주임', '대리', '과장', '차장', '부장', '이사', '대표']

function fmt(n) {
  return n ? Number(n).toLocaleString() : '—'
}

export default function HrEmployee() {
  const [employees, setEmployees] = useState([])
  const [modal, setModal] = useState(null)
  const [q, setQ] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const load = useCallback(() => {
    api.get('/hr/employees?active_only=false').then(r => setEmployees(r.data)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const del = async (emp_id) => {
    if (!window.confirm(`[${emp_id}] 사원을 퇴직 처리하시겠습니까?`)) return
    await api.delete(`/hr/employees/${emp_id}`).catch(e => alert(e.response?.data?.detail || e.message))
    load()
  }

  const filtered = employees.filter(e => {
    const matchQ = !q || e.emp_id.includes(q) || e.name.includes(q)
    const matchD = !deptFilter || e.dept === deptFilter
    const matchT = !typeFilter || e.emp_type === typeFilter
    return matchQ && matchD && matchT
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
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>사번</th>
              <th>이름</th>
              <th>부서</th>
              <th>직급</th>
              <th>고용형태</th>
              <th style={{ textAlign: 'right' }}>기본급/시급</th>
              <th>입사일</th>
              <th>연락처</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>사원 없음</td></tr>}
            {filtered.map(e => (
              <tr key={e.emp_id} style={!e.is_active ? { opacity: 0.4 } : {}}>
                <td><code style={{ fontSize: 11 }}>{e.emp_id}</code></td>
                <td style={{ fontWeight: 600 }}>{e.name}</td>
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
            ))}
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
    </div>
  )
}

function EmployeeModal({ employee, onClose, onSaved }) {
  const editing = !!employee
  const [form, setForm] = useState(employee || {
    emp_id: '', name: '', dept: '', position: '', hire_date: '', retire_date: '',
    emp_type: 'annual', base_salary: '', hourly_rate: '', weekly_hours: 40, ot_rate: 1.5,
    resident_no: '', phone: '', bank: '', bank_account: '', email: '', note: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.emp_id) return alert('사번을 입력하세요')
    if (!form.name) return alert('이름을 입력하세요')
    const payload = {
      ...form,
      base_salary: +form.base_salary || 0,
      hourly_rate: +form.hourly_rate || 0,
      weekly_hours: +form.weekly_hours || 40,
      ot_rate: +form.ot_rate || 1.5,
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
            <select className="form-control" value={form.position || ''} onChange={e => set('position', e.target.value)}>
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

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 4, marginBottom: 8, fontSize: 11, color: '#64748b', fontWeight: 600 }}>개인정보</div>

        <div className="grid-2">
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
