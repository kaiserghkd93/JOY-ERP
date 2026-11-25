import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const now = new Date()
const WEEK_LABEL = ['1주차', '2주차', '3주차', '4주차', '5주차']

const fmtDate = (d) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d)

export default function ProductionPlanWeekly() {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [activeWeek, setActiveWeek] = useState(1)
  const [weeks, setWeeks] = useState([])
  const [plans, setPlans] = useState([])
  const [items, setItems] = useState([])
  const [employees, setEmployees] = useState([])

  // 계획 추가 모달
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ part_no: '', planned_qty: '' })
  const [partSearch, setPartSearch] = useState('')
  const [partOpen, setPartOpen] = useState(false)

  // 실적 입력 모달
  const [actualModal, setActualModal] = useState(null) // { plan: {...}, actuals: [...] }
  const [actualForm, setActualForm] = useState({ prod_date: fmtDate(now), actual_qty: '', worker_id: '', machine_no: '', note: '' })
  const [editingActual, setEditingActual] = useState(null)
  const [actualLoading, setActualLoading] = useState(false)

  // 가용성 검사
  const [avail, setAvail] = useState(null)
  const [availLoading, setAvailLoading] = useState(false)

  const loadWeeks = useCallback(() => {
    api.get(`/production/weekly-plans/weeks?year=${year}&month=${month}`)
      .then(r => { setWeeks(r.data); setActiveWeek(w => Math.min(w, r.data.length) || 1) })
      .catch(() => {})
  }, [year, month])

  const loadPlans = useCallback(() => {
    api.get(`/production/weekly-plans?year=${year}&month=${month}`)
      .then(r => setPlans(r.data))
      .catch(() => setPlans([]))
  }, [year, month])

  useEffect(() => {
    loadWeeks()
    loadPlans()
    api.get('/master/items?active_only=true').then(r => setItems(r.data)).catch(() => {})
    api.get('/hr/employees?active_only=true').then(r => setEmployees(r.data)).catch(() => {})
    setAvail(null)
  }, [loadWeeks, loadPlans])

  // 주차 변경 시 가용성 초기화
  useEffect(() => { setAvail(null) }, [activeWeek])

  const weekPlans = plans.filter(p => p.week_no === activeWeek)
  const currentWeek = weeks[activeWeek - 1]

  // ── 계획 등록 ──
  const submit = async () => {
    if (!form.part_no) return alert('품번을 선택하세요')
    if (!form.planned_qty || +form.planned_qty <= 0) return alert('계획수량을 입력하세요')
    try {
      await api.post(`/production/weekly-plans?year=${year}&month=${month}&week_no=${activeWeek}`, {
        part_no: form.part_no, planned_qty: +form.planned_qty,
      })
      setShowForm(false)
      setForm({ part_no: '', planned_qty: '' })
      setPartSearch('')
      loadPlans()
    } catch (e) {
      alert('등록 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  const deletePlan = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return
    await api.delete(`/production/weekly-plans/${id}`).catch(() => {})
    loadPlans()
  }

  const filteredItems = items.filter(it =>
    !partSearch || it.part_no.includes(partSearch) || (it.name || '').includes(partSearch)
  ).slice(0, 20)

  // ── 실적 모달 열기 ──
  const openActualModal = async (plan) => {
    if (!currentWeek) return
    setActualLoading(true)
    setActualModal({ plan, actuals: [] })
    setActualForm({ prod_date: currentWeek.start, actual_qty: '', worker_id: '', machine_no: '', note: '' })
    setEditingActual(null)
    try {
      const r = await api.get(`/production/weekly-plans/actual`, {
        params: { year, month, part_no: plan.part_no, week_start: currentWeek.start, week_end: currentWeek.end }
      })
      setActualModal({ plan, actuals: r.data })
    } catch {}
    setActualLoading(false)
  }

  const refreshActuals = async (plan) => {
    if (!currentWeek) return
    try {
      const r = await api.get(`/production/weekly-plans/actual`, {
        params: { year, month, part_no: plan.part_no, week_start: currentWeek.start, week_end: currentWeek.end }
      })
      setActualModal(m => ({ ...m, actuals: r.data }))
    } catch {}
    loadPlans()
  }

  // ── 실적 등록 (신규) ──
  const submitActual = async () => {
    if (!actualForm.actual_qty || +actualForm.actual_qty < 0) return alert('수량을 입력하세요')
    const plan = actualModal.plan
    try {
      await api.post('/production/weekly-plans/actual', {
        part_no: plan.part_no, year, month,
        prod_date: actualForm.prod_date,
        actual_qty: +actualForm.actual_qty,
        worker_id: actualForm.worker_id || null,
        machine_no: actualForm.machine_no || null,
        note: actualForm.note || null,
      })
      setActualForm(f => ({ ...f, actual_qty: '', worker_id: '', machine_no: '', note: '' }))
      await refreshActuals(plan)
    } catch (e) {
      alert('등록 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  // ── 실적 수정 ──
  const saveEdit = async () => {
    if (!editingActual) return
    try {
      await api.put(`/production/weekly-plans/actual/${editingActual.id}`, {
        actual_qty: +editingActual.actual_qty,
        worker_id: editingActual.worker_id || null,
        machine_no: editingActual.machine_no || null,
        note: editingActual.note || null,
      })
      setEditingActual(null)
      await refreshActuals(actualModal.plan)
    } catch (e) {
      alert('수정 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  // ── 실적 삭제 ──
  const deleteActual = async (id) => {
    if (!window.confirm('이 실적을 삭제하시겠습니까?')) return
    try {
      await api.delete(`/production/monthly-plans/actual/${id}`)
      await refreshActuals(actualModal.plan)
    } catch (e) {
      alert('삭제 실패')
    }
  }

  // ── 가용성 검사 ──
  const checkAvailability = async () => {
    setAvailLoading(true)
    setAvail(null)
    try {
      const r = await api.get('/production/weekly-plans/availability', {
        params: { year, month, week_no: activeWeek }
      })
      setAvail(r.data)
    } catch (e) {
      alert('가용성 검사 실패: ' + (e.response?.data?.detail || e.message))
    }
    setAvailLoading(false)
  }

  // 월 집계
  const allSummary = plans.reduce((acc, p) => {
    if (!acc[p.part_no]) acc[p.part_no] = { part_no: p.part_no, part_name: p.part_name, planned: 0, actual: 0 }
    acc[p.part_no].planned += p.planned_qty
    acc[p.part_no].actual += p.actual_qty
    return acc
  }, {})

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>주단위 생산계획</h2>
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

      {/* 주차 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {weeks.map((w, i) => {
          const wno = i + 1
          const wPlans = plans.filter(p => p.week_no === wno)
          const totalPlanned = wPlans.reduce((s, p) => s + p.planned_qty, 0)
          const totalActual = wPlans.reduce((s, p) => s + p.actual_qty, 0)
          const pct = totalPlanned > 0 ? Math.round(totalActual / totalPlanned * 100) : 0
          const isActive = activeWeek === wno
          return (
            <button key={wno} onClick={() => setActiveWeek(wno)} style={{
              padding: '8px 14px', borderRadius: 8, border: isActive ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
              background: isActive ? '#eff6ff' : '#fff', cursor: 'pointer', textAlign: 'left', minWidth: 110,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#1d4ed8' : '#374151' }}>{WEEK_LABEL[i]}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>{w.start} ~ {w.end}</div>
              {totalPlanned > 0 && (
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  <span style={{ color: pct >= 100 ? '#16a34a' : '#d97706', fontWeight: 600 }}>{pct}%</span>
                  <span style={{ color: '#94a3b8' }}> ({totalPlanned.toLocaleString()})</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* 선택 주차 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <strong>{WEEK_LABEL[activeWeek - 1]}</strong>
          {currentWeek && <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>{currentWeek.start} ~ {currentWeek.end}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ fontSize: 12, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}
            onClick={checkAvailability} disabled={availLoading}>
            {availLoading ? '검사중...' : '가용성 검사'}
          </button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowForm(true)}>+ 계획 추가</button>
        </div>
      </div>

      {/* 주차별 계획 테이블 */}
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>품번</th>
              <th>품명</th>
              <th style={{ textAlign: 'right' }}>계획수량</th>
              <th style={{ textAlign: 'right' }}>실적수량</th>
              <th style={{ textAlign: 'right' }}>달성률</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {weekPlans.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>이번 주차 계획 없음</td></tr>
            ) : weekPlans.map(p => {
              const color = p.achieve_rate >= 100 ? '#16a34a' : p.achieve_rate >= 70 ? '#d97706' : '#dc2626'
              return (
                <tr key={p.id}>
                  <td><code style={{ fontSize: 11 }}>{p.part_no}</code></td>
                  <td style={{ fontWeight: 500 }}>{p.part_name}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{p.planned_qty.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{p.actual_qty.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color }}>{p.achieve_rate.toFixed(1)}%</span>
                    <div style={{ marginTop: 2, height: 4, background: '#e5e7eb', borderRadius: 2 }}>
                      <div style={{ width: `${Math.min(p.achieve_rate, 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', fontSize: 11 }}
                        onClick={() => openActualModal(p)}>실적 입력</button>
                      <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: 'none', fontSize: 11 }}
                        onClick={() => deletePlan(p.id)}>삭제</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 가용성 검사 결과 */}
      {avail && (
        <div style={{ marginBottom: 24, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: avail.has_shortage ? '#fef2f2' : '#f0fdf4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: avail.has_shortage ? '#dc2626' : '#16a34a' }}>
              {WEEK_LABEL[activeWeek - 1]} 가용성 검사 결과 — {avail.has_shortage ? '⚠ 자재 부족 있음' : '✓ 모든 자재 충분'}
            </span>
            <button onClick={() => setAvail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>✕</button>
          </div>
          {avail.components.length === 0 ? (
            <div style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>BOM 정보 없음 — 가용성 확인 불가</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>자재 품번</th>
                    <th>품명</th>
                    <th style={{ textAlign: 'right' }}>필요수량</th>
                    <th style={{ textAlign: 'right' }}>현재고</th>
                    <th style={{ textAlign: 'right' }}>부족량</th>
                    <th style={{ textAlign: 'center' }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {avail.components.map(c => (
                    <tr key={c.part_no} style={{ background: c.ok ? undefined : '#fff5f5' }}>
                      <td><code style={{ fontSize: 11 }}>{c.part_no}</code></td>
                      <td>{c.part_name}</td>
                      <td style={{ textAlign: 'right' }}>{c.required_qty.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>{c.stock_qty.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: c.ok ? '#94a3b8' : '#dc2626', fontWeight: c.ok ? 400 : 700 }}>
                        {c.ok ? '—' : c.shortage_qty.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                          background: c.ok ? '#dcfce7' : '#fee2e2', color: c.ok ? '#16a34a' : '#dc2626' }}>
                          {c.ok ? '충분' : '부족'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 월 전체 집계 */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#374151' }}>월 전체 품번별 집계</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>품번</th><th>품명</th>
                <th style={{ textAlign: 'right' }}>월계획</th>
                <th style={{ textAlign: 'right' }}>월실적</th>
                <th style={{ textAlign: 'right' }}>달성률</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(allSummary).length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 16 }}>데이터 없음</td></tr>
              ) : Object.values(allSummary).map(s => {
                const r = s.planned > 0 ? s.actual / s.planned * 100 : 0
                const color = r >= 100 ? '#16a34a' : r >= 70 ? '#d97706' : '#dc2626'
                return (
                  <tr key={s.part_no}>
                    <td><code style={{ fontSize: 11 }}>{s.part_no}</code></td>
                    <td>{s.part_name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{s.planned.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{s.actual.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color }}>{r.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 계획 추가 모달 */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, minWidth: 320 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>{WEEK_LABEL[activeWeek - 1]} 계획 추가</h3>
            <div className="form-group" style={{ position: 'relative' }}>
              <label>품번 *</label>
              <input className="form-control" value={form.part_no || partSearch}
                onChange={e => { setPartSearch(e.target.value); setForm(f => ({ ...f, part_no: '' })); setPartOpen(true) }}
                onFocus={() => setPartOpen(true)}
                placeholder="품번 또는 품명 검색" />
              {partOpen && filteredItems.length > 0 && !form.part_no && (
                <div style={{ position: 'absolute', zIndex: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, width: '100%', maxHeight: 160, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                  {filteredItems.map(it => (
                    <div key={it.part_no} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                      onMouseDown={() => { setForm(f => ({ ...f, part_no: it.part_no })); setPartSearch(`${it.part_no} — ${it.name}`); setPartOpen(false) }}>
                      <span style={{ fontWeight: 600 }}>{it.part_no}</span> {it.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="form-group">
              <label>계획수량 *</label>
              <input className="form-control" type="number" min="1" value={form.planned_qty}
                onChange={e => setForm(f => ({ ...f, planned_qty: e.target.value }))} />
            </div>
            <div className="modal-footer" style={{ marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => { setShowForm(false); setPartSearch('') }}>취소</button>
              <button className="btn btn-primary" onClick={submit}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* 실적 입력/수정 모달 */}
      {actualModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>실적 입력 — {actualModal.plan.part_no}</h3>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{actualModal.plan.part_name} · {currentWeek?.start} ~ {currentWeek?.end}</div>
              </div>
              <button onClick={() => { setActualModal(null); setEditingActual(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8' }}>✕</button>
            </div>

            {/* 기존 실적 목록 */}
            {actualLoading ? (
              <div style={{ padding: '12px 0', color: '#94a3b8', fontSize: 13 }}>불러오는 중...</div>
            ) : actualModal.actuals.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>등록된 실적</div>
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>날짜</th><th style={{ textAlign: 'right' }}>수량</th>
                      <th>작업자</th><th>설비</th>
                      <th style={{ textAlign: 'right' }}>노무비</th>
                      <th>비고</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {actualModal.actuals.map(a => editingActual?.id === a.id ? (
                      <tr key={a.id} style={{ background: '#fffbeb' }}>
                        <td style={{ fontSize: 11, color: '#64748b' }}>{a.prod_date}</td>
                        <td>
                          <input type="number" className="form-control" style={{ width: 72, padding: '2px 6px', fontSize: 12 }}
                            value={editingActual.actual_qty}
                            onChange={e => setEditingActual(x => ({ ...x, actual_qty: e.target.value }))} />
                        </td>
                        <td>
                          <select className="form-control" style={{ width: 100, padding: '2px 4px', fontSize: 12 }}
                            value={editingActual.worker_id || ''}
                            onChange={e => setEditingActual(x => ({ ...x, worker_id: e.target.value }))}>
                            <option value="">—</option>
                            {employees.map(e => <option key={e.emp_id} value={e.emp_id}>{e.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <input className="form-control" style={{ width: 72, padding: '2px 6px', fontSize: 12 }}
                            value={editingActual.machine_no || ''}
                            onChange={e => setEditingActual(x => ({ ...x, machine_no: e.target.value }))} />
                        </td>
                        <td style={{ color: '#94a3b8', fontSize: 11 }}>저장 후 계산</td>
                        <td>
                          <input className="form-control" style={{ width: 72, padding: '2px 6px', fontSize: 12 }}
                            value={editingActual.note || ''}
                            onChange={e => setEditingActual(x => ({ ...x, note: e.target.value }))} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm" style={{ background: '#1d4ed8', color: '#fff', border: 'none', fontSize: 11 }} onClick={saveEdit}>저장</button>
                            <button className="btn btn-sm" style={{ background: '#e5e7eb', color: '#374151', border: 'none', fontSize: 11 }} onClick={() => setEditingActual(null)}>취소</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={a.id}>
                        <td style={{ fontSize: 11, color: '#64748b' }}>{a.prod_date}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{(+a.actual_qty).toLocaleString()}</td>
                        <td style={{ color: '#374151' }}>{a.worker || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                        <td style={{ color: '#374151' }}>{a.machine_no || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, color: a.labor_cost_won > 0 ? '#166534' : '#94a3b8' }}>
                          {a.labor_cost_won > 0 ? `${Math.round(a.labor_cost_won).toLocaleString()}원` : '—'}
                        </td>
                        <td style={{ color: '#94a3b8', fontSize: 11 }}>{a.note || ''}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm" style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', fontSize: 11 }}
                              onClick={() => setEditingActual({ id: a.id, actual_qty: a.actual_qty, worker_id: a.worker_id, machine_no: a.machine_no, note: a.note })}>
                              수정
                            </button>
                            <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: 'none', fontSize: 11 }}
                              onClick={() => deleteActual(a.id)}>삭제</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 새 실적 입력 폼 */}
            <div style={{ borderTop: actualModal.actuals.length > 0 ? '1px solid #e5e7eb' : 'none', paddingTop: actualModal.actuals.length > 0 ? 16 : 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>새 실적 입력</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label style={{ fontSize: 12 }}>날짜 *</label>
                  <input className="form-control" type="date" value={actualForm.prod_date}
                    min={currentWeek?.start} max={currentWeek?.end}
                    onChange={e => setActualForm(f => ({ ...f, prod_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: 12 }}>실적수량 *</label>
                  <input className="form-control" type="number" min="0" value={actualForm.actual_qty}
                    onChange={e => setActualForm(f => ({ ...f, actual_qty: e.target.value }))}
                    placeholder="0" />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: 12 }}>작업자 <span style={{ color: '#94a3b8', fontWeight: 400 }}>(사원 선택 시 노무비 자동계산)</span></label>
                  <select className="form-control" value={actualForm.worker_id}
                    onChange={e => setActualForm(f => ({ ...f, worker_id: e.target.value }))}>
                    <option value="">— 선택 —</option>
                    {employees.map(e => (
                      <option key={e.emp_id} value={e.emp_id}>{e.name} ({e.dept || e.position || e.emp_id})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label style={{ fontSize: 12 }}>설비번호</label>
                  <input className="form-control" value={actualForm.machine_no}
                    onChange={e => setActualForm(f => ({ ...f, machine_no: e.target.value }))}
                    placeholder="설비 ID" />
                </div>
              </div>
              {actualForm.worker_id && (() => {
                const emp = employees.find(e => e.emp_id === actualForm.worker_id)
                if (!emp) return null
                const stdHrs = emp.std_monthly_hours || 209
                const hourly = emp.emp_type === 'hourly'
                  ? (emp.hourly_rate || 0)
                  : Math.round((emp.base_salary || 0) / stdHrs)
                return (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 12, color: '#166534' }}>
                    통상시급 <strong>{hourly.toLocaleString()}원</strong> × 근무시간(근태 or 8h) → 노무비 자동 계산됩니다
                  </div>
                )
              })()}
              <div className="form-group">
                <label style={{ fontSize: 12 }}>비고</label>
                <input className="form-control" value={actualForm.note}
                  onChange={e => setActualForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="선택사항" />
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => { setActualModal(null); setEditingActual(null) }}>닫기</button>
              <button className="btn btn-primary" onClick={submitActual}>실적 등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
