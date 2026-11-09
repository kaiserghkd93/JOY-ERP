import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const STATUS_BADGE = {
  '대기':   { bg: '#f1f5f9', color: '#475569' },
  '진행':   { bg: '#dbeafe', color: '#1d4ed8' },
  '완료':   { bg: '#dcfce7', color: '#15803d' },
  '취소':   { bg: '#fee2e2', color: '#dc2626' },
}

export default function MesWorkOrders() {
  const [wos, setWos] = useState([])
  const [machines, setMachines] = useState([])
  const [items, setItems] = useState([])
  const [filters, setFilters] = useState({ plan_date: today(), machine_id: '', status: '' })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ part_no: '', machine_id: '', target_qty: '', plan_date: today(), mold_no: '', note: '' })
  const [partSearch, setPartSearch] = useState('')
  const [partOpen, setPartOpen] = useState(false)

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (filters.plan_date) p.set('plan_date', filters.plan_date)
    if (filters.machine_id) p.set('machine_id', filters.machine_id)
    if (filters.status) p.set('status', filters.status)
    api.get(`/mes-floor/work-orders?${p}`).then(r => setWos(r.data)).catch(() => setWos([]))
  }, [filters])

  useEffect(() => {
    load()
    api.get('/mes-floor/machines').then(r => setMachines(r.data)).catch(() => {})
    api.get('/master/items?active_only=true').then(r => setItems(r.data)).catch(() => {})
  }, [load])

  const submit = async () => {
    if (!form.part_no) return alert('품번을 선택하세요')
    if (!form.machine_id) return alert('호기를 선택하세요')
    if (!form.target_qty || +form.target_qty <= 0) return alert('목표수량을 입력하세요')
    try {
      await api.post('/mes-floor/work-orders', {
        part_no: form.part_no,
        machine_id: form.machine_id,
        target_qty: +form.target_qty,
        plan_date: form.plan_date,
        mold_no: form.mold_no || null,
        note: form.note || null,
      })
      setShowForm(false)
      setForm({ part_no: '', machine_id: '', target_qty: '', plan_date: today(), mold_no: '', note: '' })
      setPartSearch('')
      load()
    } catch (e) {
      alert('등록 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  const filteredItems = items.filter(it =>
    !partSearch || it.part_no.includes(partSearch) || (it.name || '').includes(partSearch)
  ).slice(0, 20)

  const summary = {
    total: wos.length,
    pending: wos.filter(w => w.status === '대기').length,
    running: wos.filter(w => w.status === '진행').length,
    done: wos.filter(w => w.status === '완료').length,
    totalGood: wos.reduce((s, w) => s + (w.good_qty || 0), 0),
    totalTarget: wos.reduce((s, w) => s + (w.target_qty || 0), 0),
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>작업지시 관리</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ 작업지시 발행</button>
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>계획일</label>
          <input type="date" className="form-control" value={filters.plan_date}
            onChange={e => setFilters(f => ({ ...f, plan_date: e.target.value }))} style={{ width: 140 }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>호기</label>
          <select className="form-control" value={filters.machine_id}
            onChange={e => setFilters(f => ({ ...f, machine_id: e.target.value }))} style={{ width: 120 }}>
            <option value="">전체</option>
            {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>상태</label>
          <select className="form-control" value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={{ width: 100 }}>
            <option value="">전체</option>
            {['대기','진행','완료','취소'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* 요약 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        {[
          { label: '전체', value: summary.total, color: '#475569' },
          { label: '대기', value: summary.pending, color: '#64748b' },
          { label: '진행', value: summary.running, color: '#1d4ed8' },
          { label: '완료', value: summary.done, color: '#16a34a' },
          { label: '총양품/목표', value: `${summary.totalGood.toLocaleString()} / ${summary.totalTarget.toLocaleString()}`, color: '#7c3aed' },
        ].map(k => (
          <div key={k.label} style={{
            border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 12px',
            fontSize: 12, background: '#fff',
          }}>
            <span style={{ color: '#94a3b8' }}>{k.label} </span>
            <strong style={{ color: k.color }}>{k.value}</strong>
          </div>
        ))}
      </div>

      {/* 테이블 */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>WO 번호</th>
              <th>품번</th>
              <th>품명</th>
              <th>호기</th>
              <th style={{ textAlign: 'right' }}>목표</th>
              <th style={{ textAlign: 'right' }}>양품</th>
              <th style={{ textAlign: 'right' }}>불량</th>
              <th style={{ textAlign: 'right' }}>달성률</th>
              <th>계획일</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {wos.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>작업지시 없음</td></tr>
            ) : wos.map(w => {
              const ach = w.target_qty > 0 ? Math.round((w.good_qty || 0) / w.target_qty * 100) : 0
              const sc = STATUS_BADGE[w.status] || STATUS_BADGE['대기']
              return (
                <tr key={w.wo_no}>
                  <td><code style={{ fontSize: 11 }}>{w.wo_no}</code></td>
                  <td><code style={{ fontSize: 11 }}>{w.part_no}</code></td>
                  <td>{w.part_name}</td>
                  <td>{w.machine_name}</td>
                  <td style={{ textAlign: 'right' }}>{(w.target_qty || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: '#1d4ed8', fontWeight: 600 }}>{(w.good_qty || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: w.defect_qty > 0 ? '#dc2626' : undefined }}>{(w.defect_qty || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: ach >= 100 ? '#16a34a' : ach >= 70 ? '#d97706' : '#dc2626' }}>
                      {ach}%
                    </span>
                  </td>
                  <td>{w.plan_date}</td>
                  <td>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>
                      {w.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 작업지시 발행 모달 */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, minWidth: 360, maxWidth: 460 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>작업지시 발행</h3>

            {/* 품번 검색 */}
            <div className="form-group" style={{ position: 'relative' }}>
              <label>품번 *</label>
              <input className="form-control" value={form.part_no || partSearch}
                onChange={e => { setPartSearch(e.target.value); setForm(f => ({ ...f, part_no: '' })); setPartOpen(true) }}
                onFocus={() => setPartOpen(true)}
                placeholder="품번 또는 품명 검색" />
              {partOpen && filteredItems.length > 0 && !form.part_no && (
                <div style={{ position: 'absolute', zIndex: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, width: '100%', maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                  {filteredItems.map(it => (
                    <div key={it.part_no} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
                      onMouseDown={() => { setForm(f => ({ ...f, part_no: it.part_no })); setPartSearch(`${it.part_no} — ${it.name}`); setPartOpen(false) }}>
                      <span style={{ fontWeight: 600 }}>{it.part_no}</span> {it.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>호기 *</label>
                <select className="form-control" value={form.machine_id}
                  onChange={e => setForm(f => ({ ...f, machine_id: e.target.value }))}>
                  <option value="">선택</option>
                  {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>목표수량 *</label>
                <input className="form-control" type="number" min="1" value={form.target_qty}
                  onChange={e => setForm(f => ({ ...f, target_qty: e.target.value }))} />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>계획일</label>
                <input type="date" className="form-control" value={form.plan_date}
                  onChange={e => setForm(f => ({ ...f, plan_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>금형번호</label>
                <input className="form-control" value={form.mold_no}
                  onChange={e => setForm(f => ({ ...f, mold_no: e.target.value }))} placeholder="선택" />
              </div>
            </div>

            <div className="form-group">
              <label>비고</label>
              <input className="form-control" value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>

            <div className="modal-footer" style={{ marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => { setShowForm(false); setPartSearch('') }}>취소</button>
              <button className="btn btn-primary" onClick={submit}>발행</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
