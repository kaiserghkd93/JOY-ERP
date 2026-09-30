import { useState, useEffect, useCallback } from 'react'
import api from '../api'

const STATUS_COLOR = {
  '대기':   { bg: '#f1f5f9', color: '#64748b' },
  '진행중': { bg: '#dbeafe', color: '#1d4ed8' },
  '완료':   { bg: '#dcfce7', color: '#15803d' },
  '외주중': { bg: '#fef9c3', color: '#a16207' },
}

const TRIAL_RESULT = {
  'OK':      { bg: '#dcfce7', color: '#15803d' },
  'NG':      { bg: '#fee2e2', color: '#dc2626' },
  '조건부OK': { bg: '#fef9c3', color: '#a16207' },
}

function StatusBadge({ status }) {
  const s = STATUS_COLOR[status] || { bg: '#f1f5f9', color: '#64748b' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: s.bg, color: s.color }}>
      {status}
    </span>
  )
}

function DDay({ d }) {
  const color = d < 0 ? '#dc2626' : d <= 5 ? '#ea580c' : d <= 10 ? '#ca8a04' : '#15803d'
  const label = d < 0 ? `D+${Math.abs(d)} 지연` : d === 0 ? 'D-DAY' : `D-${d}`
  return <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
}

function ProgressBar({ pct }) {
  const color = pct >= 100 ? '#15803d' : pct >= 60 ? '#1d4ed8' : pct >= 30 ? '#ca8a04' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4,
          transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 32 }}>{pct}%</span>
    </div>
  )
}

// 공정 행
function ProcessRow({ proc, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({})

  const open = () => { setForm({ ...proc }); setEditing(true) }

  const save = async () => {
    await onUpdate(proc.id, form)
    setEditing(false)
  }

  const quickStatus = async (status) => {
    await onUpdate(proc.id, { status })
  }

  const s = STATUS_COLOR[proc.status] || STATUS_COLOR['대기']

  return (
    <>
      <tr style={{ background: proc.status === '완료' ? '#f8fafc' : 'white' }}>
        <td style={{ paddingLeft: 16, color: '#94a3b8', fontSize: 11 }}>{proc.seq}</td>
        <td style={{ fontWeight: 500 }}>{proc.process_name}</td>
        <td>
          <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99,
            background: proc.process_type === '외주' ? '#fef9c3' : '#f0fdf4',
            color: proc.process_type === '외주' ? '#a16207' : '#15803d' }}>
            {proc.process_type}
          </span>
        </td>
        <td style={{ fontSize: 12, color: '#475569' }}>
          {proc.process_type === '외주'
            ? (proc.partner_name || '-')
            : (proc.assignee || '-')}
        </td>
        <td style={{ fontSize: 11, color: '#94a3b8' }}>
          {proc.plan_start ? `${proc.plan_start} ~ ${proc.plan_end || '?'}` : '-'}
        </td>
        <td style={{ fontSize: 11, color: '#475569' }}>
          {proc.actual_start ? (
            <div>
              <div>{proc.actual_start}{proc.actual_start_time ? ` ${proc.actual_start_time}` : ''}</div>
              {proc.actual_end && (
                <div>~ {proc.actual_end}{proc.actual_end_time ? ` ${proc.actual_end_time}` : ''}</div>
              )}
            </div>
          ) : '-'}
        </td>
        <td style={{ fontSize: 11 }}>
          <StatusBadge status={proc.status} />
          {proc.duration_min != null && (
            <div style={{ fontSize: 10, color: '#1d4ed8', marginTop: 2, fontWeight: 600 }}>
              {proc.duration_min >= 60
                ? `${Math.floor(proc.duration_min / 60)}h ${proc.duration_min % 60}m`
                : `${proc.duration_min}분`}
            </div>
          )}
        </td>
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            {proc.status === '대기' && (
              <button className="btn btn-sm btn-outline"
                style={{ fontSize: 11, color: '#1d4ed8', borderColor: '#1d4ed8' }}
                onClick={() => quickStatus('진행중')}>시작</button>
            )}
            {proc.status === '진행중' && (
              <>
                <button className="btn btn-sm"
                  style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}
                  onClick={() => quickStatus('완료')}>완료</button>
                <button className="btn btn-sm btn-outline"
                  style={{ fontSize: 11, color: '#a16207', borderColor: '#a16207' }}
                  onClick={() => quickStatus('외주중')}>외주</button>
              </>
            )}
            {proc.status === '외주중' && (
              <button className="btn btn-sm"
                style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}
                onClick={() => quickStatus('완료')}>입고완료</button>
            )}
            <button className="btn btn-sm btn-outline" style={{ fontSize: 11 }}
              onClick={open}>✎</button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={8} style={{ background: '#f8fafc', padding: '12px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <label style={{ fontSize: 12 }}>
                공정유형
                <select value={form.process_type || '자체'}
                  onChange={e => setForm(f => ({ ...f, process_type: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }}>
                  <option>자체</option>
                  <option>외주</option>
                </select>
              </label>
              {form.process_type === '외주' ? (
                <label style={{ fontSize: 12 }}>
                  외주처
                  <input value={form.partner_id || ''} placeholder="외주처 ID"
                    onChange={e => setForm(f => ({ ...f, partner_id: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} />
                </label>
              ) : (
                <label style={{ fontSize: 12 }}>
                  담당자
                  <input value={form.assignee || ''} placeholder="담당자명"
                    onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} />
                </label>
              )}
              <label style={{ fontSize: 12 }}>
                계획 시작
                <input type="date" value={form.plan_start || ''}
                  onChange={e => setForm(f => ({ ...f, plan_start: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                계획 완료
                <input type="date" value={form.plan_end || ''}
                  onChange={e => setForm(f => ({ ...f, plan_end: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                실제 시작 (날짜)
                <input type="date" value={form.actual_start || ''}
                  onChange={e => setForm(f => ({ ...f, actual_start: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                시작 시각
                <input type="time" value={form.actual_start_time || ''}
                  onChange={e => setForm(f => ({ ...f, actual_start_time: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                실제 완료 (날짜)
                <input type="date" value={form.actual_end || ''}
                  onChange={e => setForm(f => ({ ...f, actual_end: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                완료 시각
                <input type="time" value={form.actual_end_time || ''}
                  onChange={e => setForm(f => ({ ...f, actual_end_time: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, gridColumn: 'span 2' }}>
                비고
                <input value={form.note || ''} placeholder="비고"
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={save}>저장</button>
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(false)}>취소</button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// 금형 상세 카드
function MoldDetail({ order, onUpdate, onRefresh, onDelete }) {
  const [showTrialForm, setShowTrialForm] = useState(false)
  const [trialForm, setTrialForm]         = useState({ trial_no: 'T0', trial_date: '', result: 'NG', sample_qty: 0, customer_attended: false, issues: '', note: '' })
  const [addingPart, setAddingPart]       = useState(false)
  const [newPartName, setNewPartName]     = useState('')

  const updateProcess = async (id, data) => {
    await api.patch(`/mold/process/${id}`, data)
    onRefresh()
  }

  const addTrial = async () => {
    if (!trialForm.trial_date) return alert('시사출 날짜를 입력하세요')
    await api.post(`/mold/orders/${order.mold_no}/trials`, trialForm)
    setShowTrialForm(false)
    setTrialForm({ trial_no: 'T0', trial_date: '', result: 'NG', sample_qty: 0, customer_attended: false, issues: '', note: '' })
    onRefresh()
  }

  const deleteTrial = async (tid) => {
    if (!window.confirm('시사출 이력을 삭제하시겠습니까?')) return
    await api.delete(`/mold/orders/${order.mold_no}/trials/${tid}`)
    onRefresh()
  }

  const addPart = async () => {
    if (!newPartName.trim()) return
    await api.post(`/mold/orders/${order.mold_no}/parts`, { part_name: newPartName })
    setAddingPart(false)
    setNewPartName('')
    onRefresh()
  }

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{order.mold_no}</span>
            <StatusBadge status={order.status} />
            <DDay d={order.d_day} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{order.mold_name}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
            {order.customer_name} · {order.cavity}캐비티
            {order.material && ` · ${order.material}`}
            {order.mold_fee && ` · 금형비 ₩${order.mold_fee.toLocaleString()}`}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 160 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>전체 진행률</div>
          <ProgressBar pct={order.total_pct} />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            납기 {order.due_date}
          </div>
          <button
            onClick={() => { if (window.confirm(`${order.mold_no} 수주를 삭제하시겠습니까?`)) onDelete(order.mold_no) }}
            style={{ marginTop: 8, fontSize: 11, padding: '3px 10px', background: 'none',
              border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, cursor: 'pointer' }}>
            삭제
          </button>
        </div>
      </div>

      {/* 부품별 공정 */}
      {order.parts.map(part => (
        <div key={part.id} style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {/* 부품 헤더 */}
          <div style={{ background: '#f8fafc', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{part.part_name}</span>
            <StatusBadge status={part.status} />
            <span style={{ fontSize: 12, color: '#64748b' }}>현재: <b>{part.current_process}</b></span>
            <div style={{ flex: 1 }} />
            <div style={{ width: 120 }}><ProgressBar pct={part.pct} /></div>
          </div>

          {/* 공정 테이블 */}
          <div className="table-wrap" style={{ margin: 0 }}>
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>공정</th>
                  <th style={{ width: 60 }}>유형</th>
                  <th style={{ width: 100 }}>담당/외주처</th>
                  <th style={{ width: 160 }}>계획일정</th>
                  <th style={{ width: 160 }}>실제일정</th>
                  <th style={{ width: 70 }}>상태</th>
                  <th style={{ width: 130 }}>처리</th>
                </tr>
              </thead>
              <tbody>
                {part.processes.map(proc => (
                  <ProcessRow key={proc.id} proc={proc} onUpdate={updateProcess} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* 부품 추가 */}
      <div style={{ marginBottom: 16 }}>
        {addingPart ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={newPartName} placeholder="부품명 (예: 슬라이드)"
              onChange={e => setNewPartName(e.target.value)}
              style={{ width: 200 }} />
            <button className="btn btn-primary btn-sm" onClick={addPart}>추가</button>
            <button className="btn btn-outline btn-sm" onClick={() => setAddingPart(false)}>취소</button>
          </div>
        ) : (
          <button className="btn btn-outline btn-sm" onClick={() => setAddingPart(true)}
            style={{ color: '#475569' }}>+ 부품 추가</button>
        )}
      </div>

      {/* 시사출 이력 */}
      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>시사출 이력</span>
          <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }}
            onClick={() => setShowTrialForm(t => !t)}>+ 시사출 등록</button>
        </div>

        {order.trials.length === 0 && !showTrialForm && (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>시사출 이력 없음</div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {order.trials.map(t => {
            const rc = TRIAL_RESULT[t.result] || {}
            return (
              <div key={t.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{t.trial_no}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
                    background: rc.bg, color: rc.color }}>{t.result}</span>
                  {t.customer_attended && (
                    <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8',
                      padding: '1px 5px', borderRadius: 99 }}>고객입회</span>
                  )}
                  <button style={{ marginLeft: 'auto', background: 'none', border: 'none',
                    cursor: 'pointer', color: '#dc2626', fontSize: 14 }}
                    onClick={() => deleteTrial(t.id)}>×</button>
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{t.trial_date}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>샘플 {t.sample_qty}개</div>
                {t.issues && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4, lineHeight: 1.4 }}>
                    ⚠ {t.issues}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {showTrialForm && (
          <div style={{ marginTop: 12, background: '#f8fafc', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <label style={{ fontSize: 12 }}>
                차수
                <select value={trialForm.trial_no}
                  onChange={e => setTrialForm(f => ({ ...f, trial_no: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }}>
                  <option>T0</option><option>T1</option><option>T2</option><option>T3</option>
                </select>
              </label>
              <label style={{ fontSize: 12 }}>
                시사출일 *
                <input type="date" value={trialForm.trial_date}
                  onChange={e => setTrialForm(f => ({ ...f, trial_date: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                결과
                <select value={trialForm.result}
                  onChange={e => setTrialForm(f => ({ ...f, result: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }}>
                  <option>NG</option><option>OK</option><option>조건부OK</option>
                </select>
              </label>
              <label style={{ fontSize: 12 }}>
                샘플수량
                <input type="number" value={trialForm.sample_qty}
                  onChange={e => setTrialForm(f => ({ ...f, sample_qty: +e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <input type="checkbox" checked={trialForm.customer_attended}
                  onChange={e => setTrialForm(f => ({ ...f, customer_attended: e.target.checked }))} />
                고객 입회
              </label>
              <label style={{ fontSize: 12, gridColumn: 'span 3' }}>
                지적사항
                <input value={trialForm.issues} placeholder="수정 필요 항목"
                  onChange={e => setTrialForm(f => ({ ...f, issues: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={addTrial}>등록</button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowTrialForm(false)}>취소</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 신규 수주 등록 모달
function NewOrderModal({ onClose, onCreated, partners }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    customer_id: '', mold_name: '', cavity: 1,
    material: '', order_date: today, due_date: '', mold_fee: '', note: '',
  })
  const [partNames, setPartNames] = useState(['상형(Core)', '하형(Cavity)'])
  const [newPart, setNewPart]     = useState('')

  const submit = async () => {
    if (!form.customer_id || !form.mold_name || !form.due_date) {
      return alert('고객사, 금형명, 납기일은 필수입니다')
    }
    const res = await api.post('/mold/orders', { ...form, parts: partNames })
    onCreated(res.data)
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3>금형 수주 등록</h3>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              고객사 *
              <select value={form.customer_id}
                onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                <option value="">선택</option>
                {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
              </select>
            </label>
            <label>
              금형명 *
              <input value={form.mold_name} placeholder="예: 차단기 하우징 상형"
                onChange={e => setForm(f => ({ ...f, mold_name: e.target.value }))} />
            </label>
            <label>
              캐비티 수
              <input type="number" value={form.cavity} min={1}
                onChange={e => setForm(f => ({ ...f, cavity: +e.target.value }))} />
            </label>
            <label>
              금형강 재질
              <input value={form.material} placeholder="예: NAK80, KP4, S136"
                onChange={e => setForm(f => ({ ...f, material: e.target.value }))} />
            </label>
            <label>
              수주일 *
              <input type="date" value={form.order_date}
                onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))} />
            </label>
            <label>
              납기일 *
              <input type="date" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              금형비 (₩)
              <input type="number" value={form.mold_fee} placeholder="0"
                onChange={e => setForm(f => ({ ...f, mold_fee: e.target.value }))} />
            </label>
          </div>

          {/* 부품 구성 */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>부품 구성</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {partNames.map((n, i) => (
                <div key={i} style={{ background: '#f1f5f9', borderRadius: 6, padding: '4px 10px',
                  fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {n}
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer',
                    color: '#94a3b8', fontSize: 14 }}
                    onClick={() => setPartNames(p => p.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={newPart} placeholder="부품명 추가 (예: 슬라이드)"
                onChange={e => setNewPart(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newPart.trim()) { setPartNames(p => [...p, newPart.trim()]); setNewPart('') } }}
                style={{ width: 200 }} />
              <button className="btn btn-outline btn-sm"
                onClick={() => { if (newPart.trim()) { setPartNames(p => [...p, newPart.trim()]); setNewPart('') } }}>
                추가
              </button>
            </div>
          </div>

          <label style={{ marginTop: 12, display: 'block' }}>
            비고
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>등록</button>
        </div>
      </div>
    </div>
  )
}

export default function Mold() {
  const [orders,   setOrders]   = useState([])
  const [partners, setPartners] = useState([])
  const [showNew,  setShowNew]  = useState(false)
  const [filter,   setFilter]   = useState('전체')
  const [search,   setSearch]   = useState('')

  const load = useCallback(async () => {
    const [ordRes, parRes] = await Promise.all([
      api.get('/mold/orders'),
      api.get('/master/partners'),
    ])
    setOrders(ordRes.data)
    setPartners(parRes.data.filter(p => ['고객', '공용'].includes(p.partner_type)))
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = orders.filter(o => {
    const matchStatus = filter === '전체' || o.status === filter
    const matchSearch = !search || o.mold_name.includes(search) || o.customer_name.includes(search)
    return matchStatus && matchSearch
  })

  const stats = {
    total:    orders.length,
    progress: orders.filter(o => o.status === '진행중').length,
    delayed:  orders.filter(o => o.d_day < 0 && o.status === '진행중').length,
    done:     orders.filter(o => o.status === '완료').length,
  }

  return (
    <div>
      <div className="toolbar">
        <div style={{ display: 'flex', gap: 6 }}>
          {['전체', '진행중', '완료', '지연', '취소'].map(s => (
            <button key={s} className={`btn ${filter === s ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter(s)} style={{ fontSize: 13 }}>{s}</button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="금형명 / 고객사 검색"
          style={{ width: 200, marginLeft: 8 }} />
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ 금형 수주 등록</button>
      </div>

      {/* KPI 요약 */}
      <div style={{ display: 'flex', gap: 12, margin: '12px 0', flexWrap: 'wrap' }}>
        {[
          { label: '전체', value: stats.total, color: '#64748b' },
          { label: '진행중', value: stats.progress, color: '#1d4ed8' },
          { label: '납기지연', value: stats.delayed, color: '#dc2626' },
          { label: '완료', value: stats.done, color: '#15803d' },
        ].map(k => (
          <div key={k.label} style={{ background: 'white', border: '1px solid #e2e8f0',
            borderRadius: 10, padding: '12px 20px', minWidth: 100 }}>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* 금형 목록 */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 60, fontSize: 14 }}>
          등록된 금형 수주가 없습니다
        </div>
      )}
      {filtered.map(order => (
        <MoldDetail key={order.mold_no} order={order} onRefresh={load}
          onDelete={async (mold_no) => { await api.delete(`/mold/orders/${mold_no}`); load() }} />
      ))}

      {showNew && (
        <NewOrderModal
          partners={partners}
          onClose={() => setShowNew(false)}
          onCreated={() => load()}
        />
      )}
    </div>
  )
}
