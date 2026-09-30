import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') }
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const now = new Date()

// 요일 한글
const DOW = ['월', '화', '수', '목', '금', '토']

function PlanRow({ plan, onEdit, onDelete, onSelect, selected }) {
  const rate = plan.achieve_rate
  const color = rate >= 100 ? '#16a34a' : rate >= 70 ? '#d97706' : '#dc2626'
  return (
    <tr
      onClick={() => onSelect(plan)}
      style={{ cursor: 'pointer', background: selected ? '#dbeafe' : undefined }}
    >
      <td><code style={{ fontSize: 11 }}>{plan.part_no}</code></td>
      <td style={{ fontWeight: 500 }}>{plan.part_name}</td>
      <td style={{ textAlign: 'right', fontWeight: 700 }}>{plan.planned_qty.toLocaleString()}</td>
      <td style={{ textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{plan.actual_qty.toLocaleString()}</td>
      <td style={{ textAlign: 'right' }}>
        <span style={{ fontWeight: 700, color }}>{rate.toFixed(1)}%</span>
        <div style={{ marginTop: 2, height: 4, background: '#e5e7eb', borderRadius: 2 }}>
          <div style={{ width: `${Math.min(rate, 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
        </div>
      </td>
      <td style={{ textAlign: 'center' }}>
        <button className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); onEdit(plan) }}>수정</button>
        <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: 'none', marginLeft: 4 }}
          onClick={e => { e.stopPropagation(); onDelete(plan.id) }}>삭제</button>
      </td>
    </tr>
  )
}

export default function ProductionPlan() {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [plans, setPlans] = useState([])
  const [items, setItems] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [daily, setDaily] = useState(null)

  // 계획 추가/수정 폼
  const [showForm, setShowForm] = useState(false)
  const [editPlan, setEditPlan] = useState(null)
  const [formPartNo, setFormPartNo] = useState('')
  const [formQty, setFormQty] = useState('')
  const [partSearch, setPartSearch] = useState('')
  const [partOpen, setPartOpen] = useState(false)

  // 실적 입력
  const [actualInputs, setActualInputs] = useState({}) // date → qty string

  const loadPlans = useCallback(() => {
    api.get(`/production/monthly-plans?year=${year}&month=${month}`)
      .then(r => setPlans(r.data)).catch(() => setPlans([]))
  }, [year, month])

  useEffect(() => {
    api.get('/master/items?active_only=true').then(r => setItems(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    loadPlans()
    setSelectedPlan(null)
    setDaily(null)
  }, [loadPlans])

  const loadDaily = useCallback((planId) => {
    api.get(`/production/monthly-plans/${planId}/daily`)
      .then(r => {
        setDaily(r.data)
        const inputs = {}
        r.data.rows.forEach(row => {
          if (row.day_actual !== null) inputs[row.date] = String(row.day_actual)
        })
        setActualInputs(inputs)
      }).catch(() => setDaily(null))
  }, [])

  const selectPlan = (plan) => {
    setSelectedPlan(plan)
    loadDaily(plan.id)
  }

  const openAdd = () => {
    setEditPlan(null)
    setFormPartNo('')
    setFormQty('')
    setPartSearch('')
    setShowForm(true)
  }

  const openEdit = (plan) => {
    setEditPlan(plan)
    setFormPartNo(plan.part_no)
    setFormQty(String(plan.planned_qty))
    setPartSearch('')
    setShowForm(true)
  }

  const submitForm = async () => {
    if (!formPartNo || !formQty) return
    await api.post(`/production/monthly-plans?year=${year}&month=${month}`, {
      part_no: formPartNo, planned_qty: parseInt(formQty)
    })
    setShowForm(false)
    loadPlans()
    if (selectedPlan?.part_no === formPartNo) loadDaily(selectedPlan.id)
  }

  const deletePlan = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await api.delete(`/production/monthly-plans/${id}`)
    loadPlans()
    if (selectedPlan?.id === id) { setSelectedPlan(null); setDaily(null) }
  }

  const saveActual = async (row) => {
    const val = actualInputs[row.date]
    if (val === undefined || val === '') {
      if (row.actual_id) {
        await api.delete(`/production/monthly-plans/actual/${row.actual_id}`)
        loadDaily(selectedPlan.id)
        loadPlans()
      }
      return
    }
    const qty = parseInt(val)
    if (isNaN(qty)) return
    await api.post(`/production/monthly-plans/${selectedPlan.id}/actual`, {
      prod_date: row.date, actual_qty: qty, note: row.note || null
    })
    loadDaily(selectedPlan.id)
    loadPlans()
  }

  const filteredItems = items.filter(i =>
    !partSearch || i.part_no.toLowerCase().includes(partSearch.toLowerCase()) ||
    i.name.toLowerCase().includes(partSearch.toLowerCase())
  ).slice(0, 60)

  const selectedItem = items.find(i => i.part_no === formPartNo)

  // 요약 합계
  const totalPlanned = plans.reduce((s, p) => s + p.planned_qty, 0)
  const totalActual = plans.reduce((s, p) => s + p.actual_qty, 0)
  const totalRate = totalPlanned ? (totalActual / totalPlanned * 100).toFixed(1) : 0

  return (
    <div>
      {/* 헤더 - 연월 선택 */}
      <div className="toolbar" style={{ marginBottom: 16, alignItems: 'center' }}>
        <select value={year} onChange={e => setYear(+e.target.value)} style={{ fontSize: 14 }}>
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={{ fontSize: 14 }}>
          {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <button className="btn btn-primary" onClick={openAdd}>+ 계획 추가</button>

        {/* 요약 KPI */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          {[
            { label: '월 계획', value: totalPlanned.toLocaleString() + '개', color: '#1d4ed8' },
            { label: '월 실적', value: totalActual.toLocaleString() + '개', color: '#16a34a' },
            { label: '달성률', value: totalRate + '%', color: totalRate >= 100 ? '#16a34a' : totalRate >= 70 ? '#d97706' : '#dc2626' },
          ].map(k => (
            <div key={k.label} style={{ textAlign: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 16px' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 1 }}>{k.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* 좌측: 월 계획 목록 */}
        <div style={{ width: 560, flexShrink: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>품번</th><th>품명</th>
                  <th style={{ textAlign: 'right' }}>계획</th>
                  <th style={{ textAlign: 'right' }}>실적</th>
                  <th style={{ textAlign: 'right' }}>달성률</th>
                  <th style={{ textAlign: 'center' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {plans.length === 0 && (
                  <tr><td colSpan={6} className="empty">계획 없음 — + 계획 추가를 누르세요</td></tr>
                )}
                {plans.map(p => (
                  <PlanRow key={p.id} plan={p}
                    onEdit={openEdit} onDelete={deletePlan}
                    onSelect={selectPlan}
                    selected={selectedPlan?.id === p.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 우측: 일별 계획·실적 */}
        <div style={{ flex: 1 }}>
          {!selectedPlan ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', paddingTop: 80, fontSize: 14 }}>
              좌측에서 제품을 클릭하면 일별 계획이 표시됩니다
            </div>
          ) : daily ? (
            <>
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{daily.part_name}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{daily.part_no}</span>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#555' }}>
                  영업일 <b>{daily.work_days}일</b> &nbsp;·&nbsp;
                  월 계획 <b style={{ color: '#1d4ed8' }}>{daily.planned_qty.toLocaleString()}개</b> &nbsp;·&nbsp;
                  실적 <b style={{ color: '#16a34a' }}>{daily.total_actual.toLocaleString()}개</b>
                </div>
              </div>

              <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
                <table>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th>날짜</th><th>요일</th>
                      <th style={{ textAlign: 'right' }}>일 계획</th>
                      <th style={{ textAlign: 'right' }}>일 실적</th>
                      <th style={{ textAlign: 'right' }}>누적 계획</th>
                      <th style={{ textAlign: 'right' }}>누적 실적</th>
                      <th style={{ width: 80 }}>저장</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.rows.map(row => {
                      const d = new Date(row.date)
                      const dow = DOW[d.getDay() === 0 ? 6 : d.getDay() - 1]
                      const isSat = d.getDay() === 6
                      const isToday = row.date === today()
                      const hasActual = row.day_actual !== null
                      const inputVal = actualInputs[row.date] ?? ''
                      const diff = hasActual ? row.day_actual - row.day_plan : null

                      return (
                        <tr key={row.date} style={{
                          background: isToday ? '#fffbeb' : isSat ? '#f8fafc' : undefined,
                        }}>
                          <td style={{ fontWeight: isToday ? 700 : 400, color: isToday ? '#92400e' : undefined }}>
                            {row.date.slice(5)}
                          </td>
                          <td style={{ textAlign: 'center', color: isSat ? '#1d4ed8' : undefined, fontWeight: 600 }}>
                            {dow}
                          </td>
                          <td style={{ textAlign: 'right', color: '#555' }}>{row.day_plan.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              value={inputVal}
                              onChange={e => setActualInputs(a => ({ ...a, [row.date]: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && saveActual(row)}
                              style={{
                                width: 70, textAlign: 'right', fontSize: 12,
                                padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4,
                                background: hasActual ? '#f0fdf4' : '#fff',
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 12, color: '#64748b' }}>
                            {row.cumul_plan.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>
                            {row.cumul_actual !== null ? (
                              <span style={{ fontWeight: 600, color: row.cumul_actual >= row.cumul_plan ? '#16a34a' : '#dc2626' }}>
                                {row.cumul_actual.toLocaleString()}
                              </span>
                            ) : <span style={{ color: '#d1d5db' }}>—</span>}
                          </td>
                          <td>
                            <button className="btn btn-sm btn-primary"
                              style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={() => saveActual(row)}>
                              저장
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* 계획 추가/수정 모달 */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>
              {editPlan ? '계획 수정' : `${year}년 ${month}월 생산계획 추가`}
            </div>

            <div className="form-group">
              <label>제품 선택</label>
              <div style={{ position: 'relative' }}>
                <input
                  value={partOpen ? partSearch : (selectedItem ? `${selectedItem.part_no} ${selectedItem.name}` : formPartNo)}
                  onChange={e => { setPartSearch(e.target.value); setFormPartNo(''); setPartOpen(true) }}
                  onFocus={() => { setPartSearch(''); setPartOpen(true) }}
                  placeholder="품번 또는 품명 검색"
                  disabled={!!editPlan}
                />
                {partOpen && !editPlan && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto'
                  }}>
                    {filteredItems.map(i => (
                      <div key={i.part_no}
                        onMouseDown={() => { setFormPartNo(i.part_no); setPartSearch(''); setPartOpen(false) }}
                        style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', marginRight: 8 }}>{i.part_no}</span>
                        <span style={{ fontSize: 12 }}>{i.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>월 계획 수량 (개)</label>
              <input
                type="number"
                value={formQty}
                onChange={e => setFormQty(e.target.value)}
                placeholder="예: 500"
                onKeyDown={e => e.key === 'Enter' && submitForm()}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>취소</button>
              <button className="btn btn-primary" onClick={submitForm}
                disabled={!formPartNo || !formQty}>
                {editPlan ? '수정' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
