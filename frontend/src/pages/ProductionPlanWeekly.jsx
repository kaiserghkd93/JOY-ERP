import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const now = new Date()

const WEEK_LABEL = ['1주차', '2주차', '3주차', '4주차', '5주차']

export default function ProductionPlanWeekly() {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [activeWeek, setActiveWeek] = useState(1)
  const [weeks, setWeeks] = useState([])
  const [plans, setPlans] = useState([])
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ part_no: '', planned_qty: '' })
  const [partSearch, setPartSearch] = useState('')
  const [partOpen, setPartOpen] = useState(false)

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
  }, [loadWeeks, loadPlans])

  const weekPlans = plans.filter(p => p.week_no === activeWeek)
  const currentWeek = weeks[activeWeek - 1]

  const submit = async () => {
    if (!form.part_no) return alert('품번을 선택하세요')
    if (!form.planned_qty || +form.planned_qty <= 0) return alert('계획수량을 입력하세요')
    try {
      await api.post(`/production/weekly-plans?year=${year}&month=${month}&week_no=${activeWeek}`, {
        part_no: form.part_no,
        planned_qty: +form.planned_qty,
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

  // 전체 주차 집계
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
            <button
              key={wno}
              onClick={() => setActiveWeek(wno)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: isActive ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
                background: isActive ? '#eff6ff' : '#fff', cursor: 'pointer', textAlign: 'left',
                minWidth: 110,
              }}
            >
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
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowForm(true)}>+ 계획 추가</button>
      </div>

      {/* 주차별 계획 테이블 */}
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="table">
          <thead>
            <tr>
              <th>품번</th>
              <th>품명</th>
              <th style={{ textAlign: 'right' }}>계획수량</th>
              <th style={{ textAlign: 'right' }}>실적수량</th>
              <th style={{ textAlign: 'right' }}>달성률</th>
              <th></th>
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
                    <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: 'none' }}
                      onClick={() => deletePlan(p.id)}>삭제</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 월 전체 집계 */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#374151' }}>월 전체 품번별 집계</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>품번</th>
                <th>품명</th>
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
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>
              {WEEK_LABEL[activeWeek - 1]} 계획 추가
            </h3>

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
    </div>
  )
}
