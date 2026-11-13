import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../api'

const now = new Date()

export default function HrAttendance() {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [empFilter, setEmpFilter] = useState('')
  const [employees, setEmployees] = useState([])
  const [summary, setSummary] = useState([])
  const [detail, setDetail] = useState([])
  const [viewMode, setViewMode] = useState('summary')  // summary | detail
  const [modal, setModal] = useState(null)
  const [bulkHolidayModal, setBulkHolidayModal] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const fileRef = useRef()

  const setLeave = async (attId, leaveType) => {
    try {
      await api.patch(`/hr/attendance/${attId}/leave`, { leave_type: leaveType })
      loadDetail()
      loadSummary()
    } catch (err) {
      alert('처리 실패: ' + (err.response?.data?.detail || err.message))
    }
  }

  const loadEmployees = useCallback(() => {
    api.get('/hr/employees').then(r => setEmployees(r.data)).catch(() => {})
  }, [])

  const loadSummary = useCallback(() => {
    api.get(`/hr/attendance/summary?year=${year}&month=${month}`).then(r => setSummary(r.data)).catch(() => setSummary([]))
  }, [year, month])

  const loadDetail = useCallback(() => {
    const p = empFilter ? `&emp_id=${empFilter}` : ''
    api.get(`/hr/attendance?year=${year}&month=${month}${p}`).then(r => setDetail(r.data)).catch(() => setDetail([]))
  }, [year, month, empFilter])

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  useEffect(() => {
    if (viewMode === 'summary') loadSummary()
    else loadDetail()
  }, [viewMode, loadSummary, loadDetail])

  const uploadCaps = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await api.post(`/hr/attendance/upload-caps?year=${year}&month=${month}`, fd)
      setUploadResult(r.data)
      loadSummary()
      loadDetail()
    } catch (err) {
      alert('업로드 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      e.target.value = ''
    }
  }

  const delAtt = async (id) => {
    await api.delete(`/hr/attendance/${id}`).catch(() => {})
    loadDetail()
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>출퇴근 관리</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-control" value={year} onChange={e => setYear(+e.target.value)} style={{ width: 90 }}>
            {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="form-control" value={month} onChange={e => setMonth(+e.target.value)} style={{ width: 70 }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m}>{m}</option>)}
          </select>
          <span style={{ fontSize: 13, color: '#64748b' }}>월</span>
        </div>
      </div>

      {/* 캡스 업로드 배너 */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        borderRadius: 10, padding: '14px 20px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ color: '#fff' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>캡스(CAPS) 출퇴근 Excel 업로드</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            가로형 월간표 (부서|직급|이름|사원번호|구분|1~31) — 현재 선택된 연/월로 처리됩니다
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            className="btn"
            style={{ background: '#7c3aed', color: '#fff', border: 'none' }}
            onClick={() => setBulkHolidayModal(true)}
          >
            주말 특근 등록
          </button>
          <button
            className="btn"
            style={{ background: '#3b82f6', color: '#fff', border: 'none' }}
            onClick={() => fileRef.current?.click()}
          >
            Excel 업로드
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={uploadCaps} />
        </div>
      </div>

      {/* 업로드 결과 */}
      {uploadResult && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
          <span style={{ color: '#16a34a', fontWeight: 700 }}>업로드 완료 </span>
          신규 {uploadResult.created}건 / 수정 {uploadResult.updated}건
          {uploadResult.payroll_recalculated > 0 && (
            <span style={{ color: '#2563eb', marginLeft: 10, fontWeight: 600 }}>
              💰 급여 자동재계산 {uploadResult.payroll_recalculated}명
            </span>
          )}
          {uploadResult.skipped_exempt > 0 && (
            <span style={{ color: '#64748b', marginLeft: 10 }}>제외(대표급) {uploadResult.skipped_exempt}명</span>
          )}
          {uploadResult.unmatched?.length > 0 && (
            <span style={{ color: '#f59e0b', marginLeft: 10 }}>
              미매칭 {uploadResult.unmatched.length}명: {uploadResult.unmatched.slice(0, 3).join(', ')}
            </span>
          )}
          {uploadResult.warnings_52h?.length > 0 && (
            <span style={{ color: '#ea580c', marginLeft: 10 }}>
              ⚠ 주52h초과 {uploadResult.warnings_52h.length}건: {uploadResult.warnings_52h.slice(0, 2).map(w => w.emp).join(', ')}
            </span>
          )}
          {uploadResult.errors?.length > 0 && (
            <span style={{ color: '#dc2626', marginLeft: 10 }}>
              오류 {uploadResult.errors.length}건: {uploadResult.errors.slice(0, 2).map(e => e.msg).join(' / ')}
            </span>
          )}
          <button style={{ marginLeft: 12, fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setUploadResult(null)}>닫기</button>
        </div>
      )}

      {/* 뷰 전환 + 수기 등록 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <div className="qdate-bar">
          {[['summary','월간 집계'],['detail','일별 상세']].map(([v,l]) => (
            <button key={v} className={`qdate-btn${viewMode===v?' active':''}`} onClick={() => setViewMode(v)}>{l}</button>
          ))}
        </div>
        {viewMode === 'detail' && (
          <>
            <select className="form-control" value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={{ width: 150 }}>
              <option value="">전체 사원</option>
              {employees.map(e => <option key={e.emp_id} value={e.emp_id}>{e.name} ({e.emp_id})</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => setModal({})}>＋ 수기 등록</button>
          </>
        )}
      </div>

      {/* 월간 집계 */}
      {viewMode === 'summary' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>사번</th>
                <th>이름</th>
                <th>부서</th>
                <th>고용형태</th>
                <th style={{ textAlign: 'right' }}>근무일수</th>
                <th style={{ textAlign: 'right' }}>총근무(h)</th>
                <th style={{ textAlign: 'right' }}>연장</th>
                <th style={{ textAlign: 'right' }}>야간(h)</th>
                <th style={{ textAlign: 'right' }}>결근</th>
                <th style={{ textAlign: 'right' }}>휴일근무</th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>데이터 없음</td></tr>}
              {summary.map(s => (
                <tr key={s.emp_id}>
                  <td><code style={{ fontSize: 11 }}>{s.emp_id}</code></td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.dept || '—'}</td>
                  <td><span style={{
                    padding: '1px 7px', borderRadius: 20, fontSize: 11,
                    background: s.emp_type === 'annual' ? '#dbeafe' : '#fef9c3',
                    color: s.emp_type === 'annual' ? '#1d4ed8' : '#a16207',
                  }}>{s.emp_type === 'annual' ? '연봉' : '시급'}</span></td>
                  <td style={{ textAlign: 'right' }}>{s.days}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.total_work}h</td>
                  <td style={{ textAlign: 'right', color: (s.total_ot_hrs > 0 || s.total_ot_min > 0) ? '#d97706' : undefined }}>
                    {s.total_ot_hrs}h{s.total_ot_min > 0 ? ` ${s.total_ot_min}m` : ''}
                  </td>
                  <td style={{ textAlign: 'right', color: s.total_night_hrs > 0 ? '#7c3aed' : undefined }}>{s.total_night_hrs}h</td>
                  <td style={{ textAlign: 'right', color: s.absents > 0 ? '#dc2626' : undefined }}>{s.absents}</td>
                  <td style={{ textAlign: 'right' }}>{s.holidays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 일별 상세 */}
      {viewMode === 'detail' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>사번</th>
                <th>이름</th>
                <th>출근</th>
                <th>퇴근</th>
                <th style={{ textAlign: 'right' }}>근무(h)</th>
                <th style={{ textAlign: 'right' }}>연장</th>
                <th>특기</th>
                <th>출처</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {detail.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>데이터 없음</td></tr>}
              {detail.map(a => {
                const empName = employees.find(e => e.emp_id === a.emp_id)?.name || '—'
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.work_date}</td>
                    <td><code style={{ fontSize: 11 }}>{a.emp_id}</code></td>
                    <td>{empName}</td>
                    <td style={{ color: '#1d4ed8' }}>{a.check_in ? a.check_in.slice(0,5) : '—'}</td>
                    <td style={{ color: '#475569' }}>{a.check_out ? a.check_out.slice(0,5) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{a.work_hrs}h</td>
                    <td style={{ textAlign: 'right', color: (a.ot_hrs > 0 || a.ot_min > 0) ? '#d97706' : undefined }}>
                      {a.ot_hrs}h{a.ot_min > 0 ? ` ${a.ot_min}m` : ''}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {a.leave_type
                        ? <span style={{
                            padding: '1px 7px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                            background: a.leave_type === '연차' ? '#dcfce7' : a.leave_type === '반차' ? '#fef9c3' : '#f0f9ff',
                            color:      a.leave_type === '연차' ? '#16a34a' : a.leave_type === '반차' ? '#a16207' : '#0369a1',
                          }}>{a.leave_type}</span>
                        : <>
                          {a.absent && <span style={{ color: '#dc2626', marginRight: 4 }}>결근</span>}
                          {a.holiday && <span style={{ color: '#7c3aed', marginRight: 4 }}>휴일</span>}
                          {a.late && <span style={{ color: '#ea580c', marginRight: 4 }}>지각</span>}
                          {a.half_day && <span style={{ color: '#d97706' }}>반차</span>}
                        </>}
                    </td>
                    <td>
                      <span style={{ fontSize: 10, color: a.source === 'caps_excel' ? '#16a34a' : '#94a3b8' }}>
                        {a.source === 'caps_excel' ? 'CAPS' : '수기'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {/* 결근인 경우: 연차/반차/병가로 전환 가능 */}
                      {a.absent && !a.leave_type && <>
                        {['연차','반차','병가','공가'].map(lt => (
                          <button key={lt} className="btn btn-sm"
                            style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: 10, padding: '2px 6px' }}
                            onClick={() => setLeave(a.id, lt)}>{lt}</button>
                        ))}
                      </>}
                      {/* 연차 등이 설정된 경우: 취소 버튼 */}
                      {a.leave_type && (
                        <button className="btn btn-sm"
                          style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', fontSize: 10, padding: '2px 6px' }}
                          onClick={() => setLeave(a.id, null)}>취소</button>
                      )}
                      <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: 'none' }}
                        onClick={() => delAtt(a.id)}>삭제</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 수기 등록 모달 */}
      {modal !== null && (
        <AttendanceModal
          employees={employees}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadDetail() }}
        />
      )}

      {/* 주말 특근 일괄 등록 모달 */}
      {bulkHolidayModal && (
        <BulkHolidayModal
          year={year}
          month={month}
          employees={employees}
          onClose={() => setBulkHolidayModal(false)}
          onSaved={() => { setBulkHolidayModal(false); loadSummary(); loadDetail() }}
        />
      )}
    </div>
  )
}

function AttendanceModal({ employees, onClose, onSaved }) {
  const today = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  const [form, setForm] = useState({
    emp_id: '', work_date: today(), check_in: '08:30', check_out: '17:30',
    ot_hrs: 0, ot_min: 0,
    night_hrs: 0, night_min: 0,
    holiday_hrs: 0, holiday_min: 0,
    holiday: false, absent: false, half_day: false, note: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.emp_id) return alert('사원을 선택하세요')
    try {
      await api.post('/hr/attendance', form)
      onSaved()
    } catch (e) {
      alert('저장 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>수기 출퇴근 등록</h3>
        <div className="grid-2">
          <div className="form-group">
            <label>사원 *</label>
            <select className="form-control" value={form.emp_id} onChange={e => set('emp_id', e.target.value)}>
              <option value="">선택</option>
              {employees.map(e => <option key={e.emp_id} value={e.emp_id}>{e.name} ({e.emp_id})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>날짜</label>
            <input type="date" className="form-control" value={form.work_date} onChange={e => set('work_date', e.target.value)} />
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>출근시간</label>
            <input className="form-control" value={form.check_in} onChange={e => set('check_in', e.target.value)} placeholder="08:30" disabled={form.absent} />
          </div>
          <div className="form-group">
            <label>퇴근시간</label>
            <input className="form-control" value={form.check_out} onChange={e => set('check_out', e.target.value)} placeholder="17:30" disabled={form.absent} />
          </div>
        </div>
        {/* 연장/야간/휴일 시간+분 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
          {[
            { label: '연장', hk: 'ot_hrs', mk: 'ot_min' },
            { label: '야간(심야)', hk: 'night_hrs', mk: 'night_min' },
            { label: '휴일', hk: 'holiday_hrs', mk: 'holiday_min' },
          ].map(({ label, hk, mk }) => (
            <div key={hk} style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{label}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number" min={0} max={23}
                  className="form-control" style={{ width: 56, textAlign: 'center', padding: '4px 6px' }}
                  value={form[hk]} onChange={e => set(hk, Math.max(0, +e.target.value))}
                />
                <span style={{ fontSize: 12, color: '#475569' }}>h</span>
                <input
                  type="number" min={0} max={59}
                  className="form-control" style={{ width: 56, textAlign: 'center', padding: '4px 6px' }}
                  value={form[mk]} onChange={e => set(mk, Math.max(0, Math.min(59, +e.target.value)))}
                />
                <span style={{ fontSize: 12, color: '#475569' }}>m</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          {[['absent','결근'],['holiday','휴일근무'],['half_day','반차']].map(([k,l]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} />
              {l}
            </label>
          ))}
        </div>
        <div className="form-group">
          <label>비고</label>
          <input className="form-control" value={form.note} onChange={e => set('note', e.target.value)} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  )
}

function BulkHolidayModal({ year, month, employees, onClose, onSaved }) {
  // 해당 월의 토·일 목록 자동 계산
  const weekends = (() => {
    const list = []
    const daysInMonth = new Date(year, month, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month - 1, d).getDay()
      if (dow === 0 || dow === 6) {
        list.push({
          date: `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
          day: d,
          dow: dow === 6 ? '토' : '일',
        })
      }
    }
    return list
  })()

  const prodEmps = employees.filter(e => e.is_active !== false)

  // { [date]: { [emp_id]: bool } }
  const [sel, setSel] = useState({})
  const [checkOut, setCheckOut] = useState('17:30')
  const [loading, setLoading] = useState(false)

  const toggleEmp = (date, empId) =>
    setSel(prev => ({ ...prev, [date]: { ...(prev[date] || {}), [empId]: !(prev[date]?.[empId]) } }))

  const toggleAllDate = (date, on) => {
    const m = {}
    prodEmps.forEach(e => { m[e.emp_id] = on })
    setSel(prev => ({ ...prev, [date]: m }))
  }

  const totalCount = Object.values(sel).reduce(
    (sum, dm) => sum + Object.values(dm).filter(Boolean).length, 0
  )

  const submit = async () => {
    setLoading(true)
    let created = 0, updated = 0
    try {
      for (const [date, dm] of Object.entries(sel)) {
        const ids = Object.entries(dm).filter(([,v]) => v).map(([k]) => k)
        if (!ids.length) continue
        const r = await api.post('/hr/attendance/bulk-holiday', {
          year, month, work_date: date, emp_ids: ids, check_out: checkOut,
        })
        created += r.data.created
        updated += r.data.updated
      }
      alert(`등록 완료: 신규 ${created}건 / 수정 ${updated}건`)
      onSaved()
    } catch (e) {
      alert('저장 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 580, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{year}년 {month}월 주말 특근 일괄 등록</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>퇴근시간</span>
            <input
              className="form-control" style={{ width: 80, padding: '4px 8px', fontSize: 13 }}
              value={checkOut} onChange={e => setCheckOut(e.target.value)} placeholder="17:30"
            />
          </div>
        </div>

        {/* 날짜별 직원 선택 */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {weekends.map(({ date, day, dow }) => {
            const dateSel = sel[date] || {}
            const checkedCount = Object.values(dateSel).filter(Boolean).length
            return (
              <div key={date} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                {/* 날짜 헤더 */}
                <div style={{
                  background: dow === '토' ? '#eff6ff' : '#fdf4ff',
                  padding: '7px 12px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: dow === '토' ? '#1d4ed8' : '#7c3aed' }}>
                    {month}월 {day}일 ({dow}요일)
                    {checkedCount > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600,
                        color: '#16a34a', background: '#dcfce7', padding: '1px 7px', borderRadius: 20 }}>
                        {checkedCount}명
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-sm btn-outline" style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => toggleAllDate(date, true)}>전체</button>
                    <button className="btn btn-sm btn-outline" style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => toggleAllDate(date, false)}>해제</button>
                  </div>
                </div>
                {/* 직원 칩 */}
                <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 44 }}>
                  {prodEmps.length === 0 && (
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>생산부 직원 없음</span>
                  )}
                  {prodEmps.map(e => {
                    const on = !!dateSel[e.emp_id]
                    return (
                      <button key={e.emp_id} onClick={() => toggleEmp(date, e.emp_id)} style={{
                        padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                        border: `1px solid ${on ? '#86efac' : '#e2e8f0'}`,
                        background: on ? '#dcfce7' : '#f8fafc',
                        fontWeight: on ? 700 : 400,
                        color: on ? '#16a34a' : '#374151',
                        transition: 'all .15s',
                      }}>
                        {e.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
          출근 08:30 고정 · 클릭으로 직원 선택 · 총 {totalCount}건 등록 예정
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" style={{ background: '#7c3aed', border: 'none' }}
            onClick={submit} disabled={loading || totalCount === 0}>
            {loading ? '등록 중...' : `총 ${totalCount}건 특근 등록`}
          </button>
        </div>
      </div>
    </div>
  )
}
