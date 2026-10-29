/**
 * IATF 16949 / VDA 6.3 고도화 품질 패널 모음
 * Quality.jsx에서 import해서 사용
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../api'
import { getRole } from '../auth'

const isManager = () => ['admin', 'quality_manager', 'owner'].includes(getRole())
const today = () => new Date().toISOString().slice(0, 10)

// ── 공통 컬러 유틸 ─────────────────────────────────────────────────
const cpkColor = (v) => v == null ? 'var(--text-sm)' : v >= 1.67 ? '#16a34a' : v >= 1.33 ? '#2563eb' : v >= 1.0 ? '#d97706' : '#dc2626'
const rpnColor = (v) => v >= 200 ? '#dc2626' : v >= 100 ? '#d97706' : '#16a34a'
const statusColor = { '합격': 'badge-green', '주의': 'badge-amber', '불합격': 'badge-red', '교정초과': 'badge-red', '교정임박': 'badge-amber', '사용중': 'badge-green', '교정중': 'badge-blue', '폐기': 'badge-gray' }

// ══════════════════════════════════════════════════════════════════
// 1. SPC 관리도
// ══════════════════════════════════════════════════════════════════
export function SpcPanel() {
  const [charts, setCharts] = useState([])
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [measurements, setMeasurements] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [showChartModal, setShowChartModal] = useState(false)
  const [showMeasModal, setShowMeasModal] = useState(false)
  const [chartForm, setChartForm] = useState({ part_no: '', characteristic: '', unit: '', usl: '', lsl: '', subgroup_size: 5, note: '' })
  const [measForm, setMeasForm] = useState({ measured_at: today() + 'T00:00', values: ['', '', '', '', ''], note: '' })

  useEffect(() => {
    api.get('/quality-adv/spc/charts').then(r => setCharts(r.data)).catch(() => {})
    api.get('/master/items').then(r => setItems(r.data)).catch(() => {})
  }, [])

  const selectChart = async (c) => {
    setSelected(c)
    const [m, a] = await Promise.all([
      api.get(`/quality-adv/spc/charts/${c.id}/measurements`).then(r => r.data).catch(() => []),
      api.get(`/quality-adv/spc/charts/${c.id}/analysis`).then(r => r.data).catch(() => null),
    ])
    setMeasurements(m)
    setAnalysis(a)
  }

  const saveChart = async () => {
    const payload = { ...chartForm, subgroup_size: +chartForm.subgroup_size,
      usl: chartForm.usl ? +chartForm.usl : null, lsl: chartForm.lsl ? +chartForm.lsl : null }
    await api.post('/quality-adv/spc/charts', payload)
    const r = await api.get('/quality-adv/spc/charts')
    setCharts(r.data); setShowChartModal(false)
    setChartForm({ part_no: '', characteristic: '', unit: '', usl: '', lsl: '', subgroup_size: 5, note: '' })
  }

  const saveMeasurement = async () => {
    if (!selected) return
    const vals = measForm.values.filter(v => v !== '').map(Number)
    if (vals.length === 0) return alert('측정값을 입력하세요')
    await api.post(`/quality-adv/spc/charts/${selected.id}/measurements`, {
      measured_at: measForm.measured_at + ':00',
      values: vals, note: measForm.note,
    })
    setShowMeasModal(false)
    await selectChart(selected)
  }

  const setCF = (k, v) => setChartForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12 }}>
      {/* 좌측: 차트 목록 */}
      <div className="erp-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="section-title">관리도 목록</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowChartModal(true)}>＋ 추가</button>
        </div>
        {charts.length === 0 && <div style={{ color: 'var(--text-sm)', fontSize: 12, padding: 8 }}>등록된 관리도 없음</div>}
        {charts.map(c => (
          <div key={c.id} onClick={() => selectChart(c)}
            style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
              background: selected?.id === c.id ? 'var(--primary-light, #eff6ff)' : 'var(--surface)',
              border: `1px solid ${selected?.id === c.id ? 'var(--primary)' : 'var(--border)'}` }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{c.characteristic}</div>
            <div style={{ fontSize: 11, color: 'var(--text-sm)' }}>{c.part_no} {c.unit && `(${c.unit})`}</div>
            {c.usl && <div style={{ fontSize: 10, color: 'var(--text-sm)' }}>USL {c.usl} / LSL {c.lsl}</div>}
          </div>
        ))}
      </div>

      {/* 우측: 분석 + 측정값 */}
      <div>
        {!selected ? (
          <div className="erp-panel" style={{ textAlign: 'center', padding: 60, color: 'var(--text-sm)' }}>
            좌측에서 관리도를 선택하세요
          </div>
        ) : (
          <>
            {/* Cp/Cpk 요약 */}
            {analysis && !analysis.error && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                {[
                  { label: '데이터수', value: analysis.n },
                  { label: '평균 (X̄)', value: analysis.mean?.toFixed(4) },
                  { label: 'Cp', value: analysis.cp?.toFixed(3), color: cpkColor(analysis.cp), sub: analysis.cp_result },
                  { label: 'Cpk', value: analysis.cpk?.toFixed(3), color: cpkColor(analysis.cpk), sub: analysis.cpk_result },
                ].map(k => (
                  <div key={k.label} className="erp-panel" style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-sm)' }}>{k.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: k.color || 'var(--text)' }}>{k.value ?? '—'}</div>
                    {k.sub && <div style={{ fontSize: 10 }}>{k.sub}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* 측정값 테이블 */}
            <div className="erp-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="section-title">{selected.characteristic} 측정값</span>
                <button className="btn btn-sm btn-primary" onClick={() => setShowMeasModal(true)}>＋ 측정 입력</button>
              </div>
              <div className="table-wrap" style={{ maxHeight: 320 }}>
                <table>
                  <thead><tr><th>측정일시</th><th>측정자</th><th>측정값</th><th style={{ textAlign: 'right' }}>X̄</th><th style={{ textAlign: 'right' }}>R</th><th>상태</th></tr></thead>
                  <tbody>
                    {measurements.length === 0 && <tr><td colSpan={6} className="empty">측정값 없음</td></tr>}
                    {measurements.map(m => {
                      const usl = selected.usl, lsl = selected.lsl
                      const outOfSpec = usl && m.values.some(v => v > usl || v < lsl)
                      return (
                        <tr key={m.id} style={{ background: outOfSpec ? '#fef2f2' : undefined }}>
                          <td style={{ fontSize: 11 }}>{new Date(m.measured_at).toLocaleString('ko-KR')}</td>
                          <td style={{ fontSize: 11 }}>{m.measured_by || '—'}</td>
                          <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{m.values.join(', ')}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{m.xbar?.toFixed(4)}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.r?.toFixed(4)}</td>
                          <td>{outOfSpec ? <span className="badge badge-red" style={{ fontSize: 10 }}>규격초과</span> : <span className="badge badge-green" style={{ fontSize: 10 }}>OK</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 관리도 등록 모달 */}
      {showChartModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <h3>관리도 등록</h3>
            <div className="grid-2">
              <div className="form-group"><label>품번</label>
                <select value={chartForm.part_no} onChange={e => setCF('part_no', e.target.value)}>
                  <option value="">선택</option>
                  {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>관리특성</label><input value={chartForm.characteristic} onChange={e => setCF('characteristic', e.target.value)} placeholder="외경, 두께, 중량..." /></div>
              <div className="form-group"><label>단위</label><input value={chartForm.unit} onChange={e => setCF('unit', e.target.value)} placeholder="mm, g" /></div>
              <div className="form-group"><label>소그룹 크기</label><input type="number" value={chartForm.subgroup_size} onChange={e => setCF('subgroup_size', e.target.value)} /></div>
              <div className="form-group"><label>USL (규격 상한)</label><input type="number" step="0.001" value={chartForm.usl} onChange={e => setCF('usl', e.target.value)} /></div>
              <div className="form-group"><label>LSL (규격 하한)</label><input type="number" step="0.001" value={chartForm.lsl} onChange={e => setCF('lsl', e.target.value)} /></div>
            </div>
            <div className="form-group"><label>비고</label><input value={chartForm.note} onChange={e => setCF('note', e.target.value)} /></div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowChartModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={saveChart}>등록</button>
            </div>
          </div>
        </div>
      )}

      {/* 측정값 입력 모달 */}
      {showMeasModal && selected && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <h3>측정값 입력 — {selected.characteristic}</h3>
            <div className="form-group"><label>측정일시</label><input type="datetime-local" value={measForm.measured_at} onChange={e => setMeasForm(f => ({ ...f, measured_at: e.target.value }))} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
              {Array.from({ length: selected.subgroup_size }).map((_, i) => (
                <div key={i} className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 10 }}>#{i + 1}</label>
                  <input type="number" step="0.001" value={measForm.values[i] ?? ''}
                    onChange={e => setMeasForm(f => { const v = [...f.values]; v[i] = e.target.value; return { ...f, values: v } })}
                    style={{ fontSize: 12 }} />
                </div>
              ))}
            </div>
            {(selected.usl || selected.lsl) && (
              <div style={{ fontSize: 11, color: 'var(--text-sm)', marginBottom: 8 }}>
                규격: {selected.lsl ?? '—'} ~ {selected.usl ?? '—'} {selected.unit}
              </div>
            )}
            <div className="form-group"><label>비고</label><input value={measForm.note} onChange={e => setMeasForm(f => ({ ...f, note: e.target.value }))} /></div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowMeasModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={saveMeasurement}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// 2. 관리계획서 (Control Plan)
// ══════════════════════════════════════════════════════════════════
const CHAR_TYPES = ['일반', 'KPC', 'KCC', '특별특성']
const CONTROL_METHODS = ['SPC(관리도)', '버니어캘리퍼스', '마이크로미터', '투영기', '3차원측정기', '하이트게이지', '육안검사', '게이지(GO/NOGO)', '중량측정', '기타']

export function ControlPlanPanel() {
  const [plans, setPlans] = useState([])
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showItemModal, setShowItemModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ part_no: '', customer: '', revision: 'A', plan_type: '양산', effective_date: '', note: '' })
  const [itemForm, setItemForm] = useState({ process_no: '', process_name: '', operation: '', machine: '', characteristic_name: '', char_type: '일반', spec_nominal: '', spec_upper: '', spec_lower: '', unit: 'mm', sample_size: '5ea', sample_freq: '2시간마다', control_method: 'SPC(관리도)', reaction_plan: '', sort_order: 0 })

  const load = useCallback(() => {
    api.get('/quality-adv/control-plan').then(r => setPlans(r.data)).catch(() => {})
    api.get('/master/items').then(r => setItems(r.data)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const selectPlan = (p) => api.get(`/quality-adv/control-plan/${p.id}`).then(r => setSelected(r.data)).catch(() => {})

  const savePlan = async () => {
    await api.post('/quality-adv/control-plan', form).catch(e => alert(e.response?.data?.detail || '오류'))
    load(); setShowModal(false)
    setForm({ part_no: '', customer: '', revision: 'A', plan_type: '양산', effective_date: '', note: '' })
  }

  const saveItem = async () => {
    if (!selected) return
    const payload = { ...itemForm,
      spec_nominal: itemForm.spec_nominal ? +itemForm.spec_nominal : null,
      spec_upper: itemForm.spec_upper ? +itemForm.spec_upper : null,
      spec_lower: itemForm.spec_lower ? +itemForm.spec_lower : null,
      sort_order: +itemForm.sort_order,
    }
    if (editItem) {
      await api.put(`/quality-adv/control-plan/items/${editItem.id}`, payload)
    } else {
      await api.post(`/quality-adv/control-plan/${selected.id}/items`, payload)
    }
    const r = await api.get(`/quality-adv/control-plan/${selected.id}`)
    setSelected(r.data)
    setShowItemModal(false); setEditItem(null)
    setItemForm({ process_no: '', process_name: '', operation: '', machine: '', characteristic_name: '', char_type: '일반', spec_nominal: '', spec_upper: '', spec_lower: '', unit: 'mm', sample_size: '5ea', sample_freq: '2시간마다', control_method: 'SPC(관리도)', reaction_plan: '', sort_order: 0 })
  }

  const deleteItem = async (id) => {
    if (!confirm('삭제?')) return
    await api.delete(`/quality-adv/control-plan/items/${id}`)
    const r = await api.get(`/quality-adv/control-plan/${selected.id}`)
    setSelected(r.data)
  }

  const startEditItem = (it) => {
    setEditItem(it)
    setItemForm({ ...it, spec_nominal: it.spec_nominal ?? '', spec_upper: it.spec_upper ?? '', spec_lower: it.spec_lower ?? '' })
    setShowItemModal(true)
  }

  const approvePlan = async (id) => {
    await api.patch(`/quality-adv/control-plan/${id}/approve`)
    load()
    if (selected?.id === id) { const r = await api.get(`/quality-adv/control-plan/${id}`); setSelected(r.data) }
  }

  const IF = (k, v) => setItemForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12 }}>
      <div className="erp-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="section-title">관리계획서 목록</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowModal(true)}>＋ 작성</button>
        </div>
        {plans.map(p => (
          <div key={p.id} onClick={() => selectPlan(p)}
            style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
              background: selected?.id === p.id ? 'var(--primary-light, #eff6ff)' : 'var(--surface)',
              border: `1px solid ${selected?.id === p.id ? 'var(--primary)' : 'var(--border)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{p.cp_no}</span>
              <span className={`badge ${p.status === '승인완료' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>{p.status}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-sm)' }}>{p.part_no} Rev.{p.revision}</div>
            <div style={{ fontSize: 11, color: 'var(--text-sm)' }}>{p.part_name}</div>
          </div>
        ))}
        {plans.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-sm)', padding: 8 }}>없음</div>}
      </div>

      <div>
        {!selected ? (
          <div className="erp-panel" style={{ textAlign: 'center', padding: 60, color: 'var(--text-sm)' }}>좌측에서 관리계획서를 선택하세요</div>
        ) : (
          <div className="erp-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{selected.cp_no}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-sm)' }}>{selected.part_no} — {selected.part_name} Rev.{selected.revision}</span>
                <span className={`badge ${selected.status === '승인완료' ? 'badge-green' : 'badge-gray'}`} style={{ marginLeft: 8, fontSize: 10 }}>{selected.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isManager() && selected.status !== '승인완료' && (
                  <button className="btn btn-sm btn-success" onClick={() => approvePlan(selected.id)}>승인</button>
                )}
                <button className="btn btn-sm btn-primary" onClick={() => { setEditItem(null); setShowItemModal(true) }}>＋ 항목 추가</button>
              </div>
            </div>
            <div className="table-wrap" style={{ maxHeight: 420 }}>
              <table>
                <thead><tr>
                  <th>공정No</th><th>공정명</th><th>설비</th><th>관리특성</th>
                  <th>특성유형</th><th>규격</th><th>샘플</th><th>주기</th>
                  <th>관리방법</th><th>반응계획</th><th>관리</th>
                </tr></thead>
                <tbody>
                  {(selected.items || []).length === 0 && <tr><td colSpan={11} className="empty">항목 없음</td></tr>}
                  {(selected.items || []).map(it => (
                    <tr key={it.id}>
                      <td style={{ fontSize: 11 }}>{it.process_no || '—'}</td>
                      <td style={{ fontWeight: 500 }}>{it.process_name}</td>
                      <td style={{ fontSize: 11 }}>{it.machine || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{it.characteristic_name}</td>
                      <td>
                        <span className={`badge ${it.char_type === 'KPC' ? 'badge-red' : it.char_type === 'KCC' ? 'badge-amber' : it.char_type === '특별특성' ? 'badge-purple' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                          {it.char_type}
                        </span>
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {it.spec_nominal != null ? `${it.spec_nominal}` : ''}
                        {it.spec_upper != null ? ` +${it.spec_upper}` : ''}
                        {it.spec_lower != null ? ` ${it.spec_lower}` : ''}
                        {it.unit ? ` ${it.unit}` : ''}
                      </td>
                      <td style={{ fontSize: 11 }}>{it.sample_size}</td>
                      <td style={{ fontSize: 11 }}>{it.sample_freq}</td>
                      <td style={{ fontSize: 11 }}>{it.control_method}</td>
                      <td style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.reaction_plan}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-sm btn-outline" style={{ fontSize: 10 }} onClick={() => startEditItem(it)}>수정</button>
                          <button className="btn btn-sm" style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', border: 'none' }} onClick={() => deleteItem(it.id)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <h3>관리계획서 작성</h3>
            <div className="grid-2">
              <div className="form-group"><label>품번 *</label>
                <select value={form.part_no} onChange={e => setForm(f => ({ ...f, part_no: e.target.value }))}>
                  <option value="">선택</option>
                  {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>계획 유형</label>
                <select value={form.plan_type} onChange={e => setForm(f => ({ ...f, plan_type: e.target.value }))}>
                  {['시작', '시제', '양산'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group"><label>고객사</label><input value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} placeholder="현대, 기아..." /></div>
              <div className="form-group"><label>Rev</label><input value={form.revision} onChange={e => setForm(f => ({ ...f, revision: e.target.value }))} /></div>
              <div className="form-group"><label>적용일</label><input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={savePlan}>작성</button>
            </div>
          </div>
        </div>
      )}

      {showItemModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 640 }}>
            <h3>{editItem ? '항목 수정' : '항목 추가'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 8 }}>
              <div className="form-group"><label>공정No</label><input value={itemForm.process_no} onChange={e => IF('process_no', e.target.value)} placeholder="10" /></div>
              <div className="form-group"><label>공정명 *</label><input value={itemForm.process_name} onChange={e => IF('process_name', e.target.value)} placeholder="사출성형, 조립..." /></div>
              <div className="form-group"><label>작업내용</label><input value={itemForm.operation} onChange={e => IF('operation', e.target.value)} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
              <div className="form-group"><label>관리특성 *</label><input value={itemForm.characteristic_name} onChange={e => IF('characteristic_name', e.target.value)} placeholder="외경, 두께, 외관..." /></div>
              <div className="form-group"><label>특성유형</label>
                <select value={itemForm.char_type} onChange={e => IF('char_type', e.target.value)}>
                  {CHAR_TYPES.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group"><label>단위</label><input value={itemForm.unit} onChange={e => IF('unit', e.target.value)} placeholder="mm" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div className="form-group"><label>기준값</label><input type="number" step="0.001" value={itemForm.spec_nominal} onChange={e => IF('spec_nominal', e.target.value)} /></div>
              <div className="form-group"><label>상한 (+)</label><input type="number" step="0.001" value={itemForm.spec_upper} onChange={e => IF('spec_upper', e.target.value)} /></div>
              <div className="form-group"><label>하한 (-)</label><input type="number" step="0.001" value={itemForm.spec_lower} onChange={e => IF('spec_lower', e.target.value)} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
              <div className="form-group"><label>샘플 크기</label><input value={itemForm.sample_size} onChange={e => IF('sample_size', e.target.value)} placeholder="5ea" /></div>
              <div className="form-group"><label>샘플 주기</label><input value={itemForm.sample_freq} onChange={e => IF('sample_freq', e.target.value)} placeholder="2시간마다" /></div>
              <div className="form-group"><label>관리방법</label>
                <select value={itemForm.control_method} onChange={e => IF('control_method', e.target.value)}>
                  {CONTROL_METHODS.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label>이상 반응계획</label><input value={itemForm.reaction_plan} onChange={e => IF('reaction_plan', e.target.value)} placeholder="생산중지, 책임자 보고, 전수검사..." /></div>
            <div className="form-group"><label>설비/기계</label><input value={itemForm.machine} onChange={e => IF('machine', e.target.value)} placeholder="IMM-01, 조립라인 1" /></div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setShowItemModal(false); setEditItem(null) }}>취소</button>
              <button className="btn btn-primary" onClick={saveItem}>{editItem ? '수정' : '추가'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// 3. PFMEA
// ══════════════════════════════════════════════════════════════════
const SOD_COLORS = { 1: '#16a34a', 2: '#16a34a', 3: '#16a34a', 4: '#2563eb', 5: '#2563eb', 6: '#d97706', 7: '#d97706', 8: '#dc2626', 9: '#dc2626', 10: '#991b1b' }

export function PfmeaPanel() {
  const [list, setList] = useState([])
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showItemModal, setShowItemModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ part_no: '', revision: 'A' })
  const [itemForm, setItemForm] = useState({
    process_step: '', function: '', failure_mode: '', failure_effect: '',
    severity: 5, failure_cause: '', occurrence: 5, current_control: '',
    detection: 5, action_required: '', responsible: '', target_date: '',
    action_taken: '', new_severity: '', new_occurrence: '', new_detection: '',
    sort_order: 0,
  })

  const load = useCallback(() => {
    api.get('/quality-adv/pfmea').then(r => setList(r.data)).catch(() => {})
    api.get('/master/items').then(r => setItems(r.data)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const selectPfmea = (p) => api.get(`/quality-adv/pfmea/${p.id}`).then(r => setSelected(r.data)).catch(() => {})

  const savePfmea = async () => {
    await api.post('/quality-adv/pfmea', form).catch(e => alert(e.response?.data?.detail || '오류'))
    load(); setShowModal(false)
    setForm({ part_no: '', revision: 'A' })
  }

  const IF = (k, v) => setItemForm(f => ({ ...f, [k]: v }))
  const rpn = itemForm.severity * itemForm.occurrence * itemForm.detection
  const newRpn = (itemForm.new_severity && itemForm.new_occurrence && itemForm.new_detection)
    ? itemForm.new_severity * itemForm.new_occurrence * itemForm.new_detection : null

  const saveItem = async () => {
    if (!selected || !itemForm.process_step || !itemForm.failure_mode) return alert('공정단계와 잠재적 고장형태는 필수입니다')
    const payload = { ...itemForm,
      severity: +itemForm.severity, occurrence: +itemForm.occurrence, detection: +itemForm.detection,
      new_severity: itemForm.new_severity ? +itemForm.new_severity : null,
      new_occurrence: itemForm.new_occurrence ? +itemForm.new_occurrence : null,
      new_detection: itemForm.new_detection ? +itemForm.new_detection : null,
      target_date: itemForm.target_date || null,
    }
    if (editItem) {
      await api.put(`/quality-adv/pfmea/items/${editItem.id}`, payload)
    } else {
      await api.post(`/quality-adv/pfmea/${selected.id}/items`, payload)
    }
    const r = await api.get(`/quality-adv/pfmea/${selected.id}`)
    setSelected(r.data); setShowItemModal(false); setEditItem(null)
    setItemForm({ process_step: '', function: '', failure_mode: '', failure_effect: '', severity: 5, failure_cause: '', occurrence: 5, current_control: '', detection: 5, action_required: '', responsible: '', target_date: '', action_taken: '', new_severity: '', new_occurrence: '', new_detection: '', sort_order: 0 })
  }

  const startEditItem = (it) => {
    setEditItem(it)
    setItemForm({ ...it, target_date: it.target_date || '', new_severity: it.new_severity ?? '', new_occurrence: it.new_occurrence ?? '', new_detection: it.new_detection ?? '' })
    setShowItemModal(true)
  }

  const deleteItem = async (id) => {
    if (!confirm('삭제?')) return
    await api.delete(`/quality-adv/pfmea/items/${id}`)
    const r = await api.get(`/quality-adv/pfmea/${selected.id}`)
    setSelected(r.data)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
      <div className="erp-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="section-title">PFMEA 목록</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowModal(true)}>＋ 신규</button>
        </div>
        {list.map(p => (
          <div key={p.id} onClick={() => selectPfmea(p)}
            style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
              background: selected?.id === p.id ? 'var(--primary-light,#eff6ff)' : 'var(--surface)',
              border: `1px solid ${selected?.id === p.id ? 'var(--primary)' : 'var(--border)'}` }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{p.pfmea_no}</div>
            <div style={{ fontSize: 11, color: 'var(--text-sm)' }}>{p.part_no} Rev.{p.revision}</div>
            <div style={{ fontSize: 11, color: 'var(--text-sm)' }}>{p.part_name}</div>
            <span className={`badge ${p.status === '승인완료' ? 'badge-green' : p.status === '검토완료' ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize: 10 }}>{p.status}</span>
          </div>
        ))}
      </div>

      <div>
        {!selected ? (
          <div className="erp-panel" style={{ textAlign: 'center', padding: 60, color: 'var(--text-sm)' }}>좌측에서 PFMEA를 선택하세요</div>
        ) : (
          <div className="erp-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{selected.pfmea_no}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-sm)' }}>{selected.part_no} — {selected.part_name}</span>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => { setEditItem(null); setShowItemModal(true) }}>＋ 항목 추가</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 440 }}>
              <table>
                <thead><tr>
                  <th>공정단계</th><th>잠재적 고장형태</th><th>고장영향</th>
                  <th style={{ textAlign: 'center' }}>S</th><th>고장원인</th>
                  <th style={{ textAlign: 'center' }}>O</th><th>현 관리방법</th>
                  <th style={{ textAlign: 'center' }}>D</th><th style={{ textAlign: 'center' }}>RPN</th>
                  <th>개선조치</th><th style={{ textAlign: 'center' }}>개선 RPN</th><th>관리</th>
                </tr></thead>
                <tbody>
                  {(selected.items || []).length === 0 && <tr><td colSpan={12} className="empty">항목 없음</td></tr>}
                  {(selected.items || []).map(it => (
                    <tr key={it.id} style={{ background: it.rpn >= 200 ? '#fef2f2' : it.rpn >= 100 ? '#fffbeb' : undefined }}>
                      <td style={{ fontWeight: 500 }}>{it.process_step}</td>
                      <td>{it.failure_mode}</td>
                      <td style={{ fontSize: 11 }}>{it.failure_effect}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: SOD_COLORS[it.severity] }}>{it.severity}</td>
                      <td style={{ fontSize: 11 }}>{it.failure_cause}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: SOD_COLORS[it.occurrence] }}>{it.occurrence}</td>
                      <td style={{ fontSize: 11 }}>{it.current_control}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: SOD_COLORS[it.detection] }}>{it.detection}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: rpnColor(it.rpn) }}>{it.rpn}</span>
                      </td>
                      <td style={{ fontSize: 11 }}>{it.action_taken || it.action_required || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {it.new_rpn ? <span style={{ fontWeight: 700, color: rpnColor(it.new_rpn) }}>{it.new_rpn}</span> : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-sm btn-outline" style={{ fontSize: 10 }} onClick={() => startEditItem(it)}>수정</button>
                          <button className="btn btn-sm" style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', border: 'none' }} onClick={() => deleteItem(it.id)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3>PFMEA 신규 작성</h3>
            <div className="grid-2">
              <div className="form-group"><label>품번 *</label>
                <select value={form.part_no} onChange={e => setForm(f => ({ ...f, part_no: e.target.value }))}>
                  <option value="">선택</option>
                  {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Rev</label><input value={form.revision} onChange={e => setForm(f => ({ ...f, revision: e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={savePfmea}>작성</button>
            </div>
          </div>
        </div>
      )}

      {showItemModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 700, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>{editItem ? '항목 수정' : '항목 추가'}</h3>
            <div style={{ background: 'var(--surface)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-sm)', marginBottom: 4 }}>현재 RPN = S × O × D</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: rpnColor(rpn) }}>{rpn}</span>
                {newRpn && <><span style={{ fontSize: 12 }}>→ 개선 후:</span><span style={{ fontSize: 20, fontWeight: 700, color: rpnColor(newRpn) }}>{newRpn}</span></>}
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label>공정단계 *</label><input value={itemForm.process_step} onChange={e => IF('process_step', e.target.value)} placeholder="사출성형, 게이트컷, 조립..." /></div>
              <div className="form-group"><label>기능</label><input value={itemForm.function} onChange={e => IF('function', e.target.value)} /></div>
              <div className="form-group"><label>잠재적 고장형태 *</label><input value={itemForm.failure_mode} onChange={e => IF('failure_mode', e.target.value)} placeholder="미성형, 버발생, 치수불량..." /></div>
              <div className="form-group"><label>고장 영향</label><input value={itemForm.failure_effect} onChange={e => IF('failure_effect', e.target.value)} placeholder="조립불가, 고객클레임..." /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 3fr 1fr 3fr 1fr', gap: 8, alignItems: 'end' }}>
              <div className="form-group"><label>고장 원인</label><input value={itemForm.failure_cause} onChange={e => IF('failure_cause', e.target.value)} placeholder="금형마모, 수지불량..." /></div>
              <div className="form-group"><label>심각도 S</label><input type="number" min={1} max={10} value={itemForm.severity} onChange={e => IF('severity', +e.target.value)} /></div>
              <div className="form-group"><label>현 관리방법</label><input value={itemForm.current_control} onChange={e => IF('current_control', e.target.value)} placeholder="전수검사, 치구관리..." /></div>
              <div className="form-group"><label>발생도 O</label><input type="number" min={1} max={10} value={itemForm.occurrence} onChange={e => IF('occurrence', +e.target.value)} /></div>
              <div className="form-group"><label>검출방법</label><input value={itemForm.detection ? itemForm.detection : ''} onChange={e => IF('detection', +e.target.value)} /></div>
              <div className="form-group"><label>검출도 D</label><input type="number" min={1} max={10} value={itemForm.detection} onChange={e => IF('detection', +e.target.value)} /></div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label>권고 개선조치</label><input value={itemForm.action_required} onChange={e => IF('action_required', e.target.value)} /></div>
              <div className="form-group"><label>담당자</label><input value={itemForm.responsible} onChange={e => IF('responsible', e.target.value)} /></div>
              <div className="form-group"><label>목표일</label><input type="date" value={itemForm.target_date} onChange={e => IF('target_date', e.target.value)} /></div>
              <div className="form-group"><label>실시한 조치</label><input value={itemForm.action_taken} onChange={e => IF('action_taken', e.target.value)} /></div>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-sm)' }}>개선 후 평가</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div className="form-group"><label>개선 심각도 S'</label><input type="number" min={1} max={10} value={itemForm.new_severity} onChange={e => IF('new_severity', e.target.value)} /></div>
                <div className="form-group"><label>개선 발생도 O'</label><input type="number" min={1} max={10} value={itemForm.new_occurrence} onChange={e => IF('new_occurrence', e.target.value)} /></div>
                <div className="form-group"><label>개선 검출도 D'</label><input type="number" min={1} max={10} value={itemForm.new_detection} onChange={e => IF('new_detection', e.target.value)} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setShowItemModal(false); setEditItem(null) }}>취소</button>
              <button className="btn btn-primary" onClick={saveItem}>{editItem ? '수정' : '추가'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// 4. 교정 관리
// ══════════════════════════════════════════════════════════════════
const INST_TYPES = ['버니어캘리퍼스', '마이크로미터', '하이트게이지', '다이얼게이지', '투영기', '3차원측정기', '경도계', '인장시험기', '압력게이지', '온도계', '저울/체중계', '기타']

export function CalibrationPanel() {
  const [insts, setInsts] = useState([])
  const [summary, setSummary] = useState(null)
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState([])
  const [showInstModal, setShowInstModal] = useState(false)
  const [showCalibModal, setShowCalibModal] = useState(null)
  const [instForm, setInstForm] = useState({ name: '', instrument_type: '버니어캘리퍼스', manufacturer: '', model_no: '', serial_no: '', location: '', calibration_interval: 365, last_calibrated: '', accuracy_spec: '', note: '' })
  const [calibForm, setCalibForm] = useState({ calibrated_at: today(), calibrated_by: '', agency: '', result: '합격', certificate_no: '', note: '' })

  const load = useCallback(() => {
    api.get('/quality-adv/instruments').then(r => setInsts(r.data)).catch(() => {})
    api.get('/quality-adv/instruments/summary').then(r => setSummary(r.data)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const selectInst = (inst) => {
    setSelected(inst)
    api.get(`/quality-adv/instruments/${inst.id}/history`).then(r => setHistory(r.data)).catch(() => {})
  }

  const saveInst = async () => {
    const payload = { ...instForm, calibration_interval: +instForm.calibration_interval, last_calibrated: instForm.last_calibrated || null }
    await api.post('/quality-adv/instruments', payload).catch(e => alert(e.response?.data?.detail || '오류'))
    load(); setShowInstModal(false)
    setInstForm({ name: '', instrument_type: '버니어캘리퍼스', manufacturer: '', model_no: '', serial_no: '', location: '', calibration_interval: 365, last_calibrated: '', accuracy_spec: '', note: '' })
  }

  const saveCalib = async () => {
    if (!showCalibModal) return
    await api.post(`/quality-adv/instruments/${showCalibModal.id}/calibrate`, calibForm)
    load(); setShowCalibModal(null)
    selectInst(showCalibModal)
    setCalibForm({ calibrated_at: today(), calibrated_by: '', agency: '', result: '합격', certificate_no: '', note: '' })
  }

  const IF = (k, v) => setInstForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      {/* 요약 카드 */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: '전체 기기', value: summary.total, color: 'var(--text)', bg: 'var(--surface)' },
            { label: '교정 초과', value: summary.overdue, color: '#dc2626', bg: '#fef2f2' },
            { label: '교정 임박 (30일)', value: summary.due_soon, color: '#d97706', bg: '#fffbeb' },
            { label: '정상', value: summary.active, color: '#16a34a', bg: '#f0fdf4' },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-sm)' }}>{k.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 12 }}>
        <div className="erp-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="section-title">측정기기 목록</span>
            <button className="btn btn-sm btn-primary" onClick={() => setShowInstModal(true)}>＋ 기기 등록</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>관리번호</th><th>기기명</th><th>유형</th><th>위치</th><th>최근교정일</th><th>차기교정일</th><th>상태</th><th>교정</th></tr></thead>
              <tbody>
                {insts.length === 0 && <tr><td colSpan={8} className="empty">등록된 기기 없음</td></tr>}
                {insts.map(i => (
                  <tr key={i.id} onClick={() => selectInst(i)} style={{ cursor: 'pointer', background: selected?.id === i.id ? 'var(--primary-light,#eff6ff)' : undefined }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{i.instrument_no}</td>
                    <td style={{ fontWeight: 500 }}>{i.name}</td>
                    <td style={{ fontSize: 11 }}>{i.instrument_type}</td>
                    <td style={{ fontSize: 11 }}>{i.location || '—'}</td>
                    <td style={{ fontSize: 11 }}>{i.last_calibrated || '—'}</td>
                    <td style={{ fontSize: 11, fontWeight: i.status === '교정초과' ? 700 : 400, color: i.status === '교정초과' ? '#dc2626' : i.status === '교정임박' ? '#d97706' : undefined }}>
                      {i.next_due || '—'}
                    </td>
                    <td><span className={`badge ${statusColor[i.status] || 'badge-gray'}`} style={{ fontSize: 10 }}>{i.status}</span></td>
                    <td><button className="btn btn-sm btn-primary" style={{ fontSize: 10 }} onClick={e => { e.stopPropagation(); setShowCalibModal(i) }}>교정 등록</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 교정 이력 */}
        {selected && (
          <div className="erp-panel">
            <div className="section-title" style={{ marginBottom: 8 }}>{selected.name} 교정이력</div>
            {history.length === 0 ? <div style={{ color: 'var(--text-sm)', fontSize: 12 }}>교정 이력 없음</div> : history.map(h => (
              <div key={h.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{h.calibrated_at}</span>
                  <span className={`badge ${h.result === '합격' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>{h.result}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-sm)' }}>기관: {h.agency || '—'} | 성적서: {h.certificate_no || '—'}</div>
                <div style={{ fontSize: 11 }}>차기: {h.next_due}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInstModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <h3>측정기기 등록</h3>
            <div className="grid-2">
              <div className="form-group"><label>기기명 *</label><input value={instForm.name} onChange={e => IF('name', e.target.value)} placeholder="외경 버니어캘리퍼스 1호" /></div>
              <div className="form-group"><label>유형</label>
                <select value={instForm.instrument_type} onChange={e => IF('instrument_type', e.target.value)}>
                  {INST_TYPES.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group"><label>제조사</label><input value={instForm.manufacturer} onChange={e => IF('manufacturer', e.target.value)} placeholder="Mitutoyo, 기타" /></div>
              <div className="form-group"><label>모델번호</label><input value={instForm.model_no} onChange={e => IF('model_no', e.target.value)} /></div>
              <div className="form-group"><label>시리얼번호</label><input value={instForm.serial_no} onChange={e => IF('serial_no', e.target.value)} /></div>
              <div className="form-group"><label>보관위치</label><input value={instForm.location} onChange={e => IF('location', e.target.value)} placeholder="품질실 선반 1" /></div>
              <div className="form-group"><label>교정주기 (일)</label><input type="number" value={instForm.calibration_interval} onChange={e => IF('calibration_interval', e.target.value)} /></div>
              <div className="form-group"><label>최근 교정일</label><input type="date" value={instForm.last_calibrated} onChange={e => IF('last_calibrated', e.target.value)} /></div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}><label>정확도 사양</label><input value={instForm.accuracy_spec} onChange={e => IF('accuracy_spec', e.target.value)} placeholder="±0.02mm" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowInstModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={saveInst}>등록</button>
            </div>
          </div>
        </div>
      )}

      {showCalibModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <h3>교정 결과 등록 — {showCalibModal.name}</h3>
            <div className="grid-2">
              <div className="form-group"><label>교정일 *</label><input type="date" value={calibForm.calibrated_at} onChange={e => setCalibForm(f => ({ ...f, calibrated_at: e.target.value }))} /></div>
              <div className="form-group"><label>판정</label>
                <select value={calibForm.result} onChange={e => setCalibForm(f => ({ ...f, result: e.target.value }))}>
                  <option>합격</option><option>불합격</option>
                </select>
              </div>
              <div className="form-group"><label>교정기관</label><input value={calibForm.agency} onChange={e => setCalibForm(f => ({ ...f, agency: e.target.value }))} placeholder="한국교정기관, 내부교정" /></div>
              <div className="form-group"><label>성적서 번호</label><input value={calibForm.certificate_no} onChange={e => setCalibForm(f => ({ ...f, certificate_no: e.target.value }))} /></div>
              <div className="form-group"><label>교정자</label><input value={calibForm.calibrated_by} onChange={e => setCalibForm(f => ({ ...f, calibrated_by: e.target.value }))} /></div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-sm)', marginBottom: 8 }}>
              차기 교정일: {calibForm.calibrated_at ? new Date(new Date(calibForm.calibrated_at).getTime() + showCalibModal.calibration_interval * 86400000).toLocaleDateString('ko-KR') : '—'}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCalibModal(null)}>취소</button>
              <button className="btn btn-primary" onClick={saveCalib}>등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// 5. 내부감사
// ══════════════════════════════════════════════════════════════════
const FINDING_BADGE = { '중대부적합': 'badge-red', '경미부적합': 'badge-amber', '관찰사항': 'badge-blue', '강점': 'badge-green' }
const FINDING_STATUS_BADGE = { '열림': 'badge-red', '시정중': 'badge-amber', '완료': 'badge-blue', '효과확인': 'badge-green' }

export function AuditPanel() {
  const [audits, setAudits] = useState([])
  const [selected, setSelected] = useState(null)
  const [findings, setFindings] = useState([])
  const [showAuditModal, setShowAuditModal] = useState(false)
  const [showFindModal, setShowFindModal] = useState(false)
  const [editFinding, setEditFinding] = useState(null)
  const [auditForm, setAuditForm] = useState({ audit_type: '내부감사', standard: 'IATF16949', scope: '', audit_date: today(), auditor: '', auditee_dept: '', note: '' })
  const [findForm, setFindForm] = useState({ clause_no: '', clause_title: '', finding_type: '경미부적합', description: '', evidence: '', due_date: '' })
  const [actionForm, setActionForm] = useState({ root_cause: '', corrective_action: '', responsible: '', completion_date: '', effectiveness_result: '', verified_by: '', verified_at: '', status: '' })
  const [showActionModal, setShowActionModal] = useState(null)

  const load = useCallback(() => {
    api.get('/quality-adv/audits').then(r => setAudits(r.data)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const selectAudit = (a) => {
    setSelected(a)
    api.get(`/quality-adv/audits/${a.id}/findings`).then(r => setFindings(r.data)).catch(() => {})
  }

  const saveAudit = async () => {
    await api.post('/quality-adv/audits', auditForm).catch(e => alert(e.response?.data?.detail || '오류'))
    load(); setShowAuditModal(false)
    setAuditForm({ audit_type: '내부감사', standard: 'IATF16949', scope: '', audit_date: today(), auditor: '', auditee_dept: '', note: '' })
  }

  const saveFinding = async () => {
    if (!selected || !findForm.description) return alert('지적내용은 필수입니다')
    const payload = { ...findForm, due_date: findForm.due_date || null }
    await api.post(`/quality-adv/audits/${selected.id}/findings`, payload)
    api.get(`/quality-adv/audits/${selected.id}/findings`).then(r => setFindings(r.data))
    setShowFindModal(false)
    setFindForm({ clause_no: '', clause_title: '', finding_type: '경미부적합', description: '', evidence: '', due_date: '' })
  }

  const saveAction = async () => {
    if (!showActionModal) return
    const payload = Object.fromEntries(Object.entries(actionForm).filter(([, v]) => v !== ''))
    await api.patch(`/quality-adv/findings/${showActionModal.id}`, payload)
    api.get(`/quality-adv/audits/${selected.id}/findings`).then(r => setFindings(r.data))
    setShowActionModal(null)
  }

  const AF = (k, v) => setAuditForm(f => ({ ...f, [k]: v }))
  const FF = (k, v) => setFindForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12 }}>
      <div className="erp-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="section-title">감사 계획</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowAuditModal(true)}>＋ 등록</button>
        </div>
        {audits.map(a => (
          <div key={a.id} onClick={() => selectAudit(a)}
            style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
              background: selected?.id === a.id ? 'var(--primary-light,#eff6ff)' : 'var(--surface)',
              border: `1px solid ${selected?.id === a.id ? 'var(--primary)' : 'var(--border)'}` }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{a.audit_no}</div>
            <div style={{ fontSize: 11, color: 'var(--text-sm)' }}>{a.audit_date} | {a.audit_type}</div>
            <div style={{ fontSize: 11 }}>{a.auditee_dept || a.scope}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
              <span className={`badge ${a.open_count > 0 ? 'badge-red' : 'badge-gray'}`} style={{ fontSize: 10 }}>지적 {a.finding_count}건</span>
              {a.open_count > 0 && <span className="badge badge-amber" style={{ fontSize: 10 }}>미결 {a.open_count}</span>}
            </div>
          </div>
        ))}
        {audits.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-sm)', padding: 8 }}>없음</div>}
      </div>

      <div>
        {!selected ? (
          <div className="erp-panel" style={{ textAlign: 'center', padding: 60, color: 'var(--text-sm)' }}>좌측에서 감사를 선택하세요</div>
        ) : (
          <div className="erp-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{selected.audit_no}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-sm)' }}>{selected.audit_date} | {selected.standard} | 감사원: {selected.auditor}</span>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => setShowFindModal(true)}>＋ 지적사항</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 440 }}>
              <table>
                <thead><tr>
                  <th>조항번호</th><th>조항명</th><th>유형</th><th>지적내용</th>
                  <th>근거/증거</th><th>시정기한</th><th>시정조치</th><th>상태</th><th>효과확인</th>
                </tr></thead>
                <tbody>
                  {findings.length === 0 && <tr><td colSpan={9} className="empty">지적사항 없음</td></tr>}
                  {findings.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{f.clause_no || '—'}</td>
                      <td style={{ fontSize: 11 }}>{f.clause_title || '—'}</td>
                      <td><span className={`badge ${FINDING_BADGE[f.finding_type] || 'badge-gray'}`} style={{ fontSize: 10 }}>{f.finding_type}</span></td>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.description}</td>
                      <td style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.evidence || '—'}</td>
                      <td style={{ fontSize: 11 }}>{f.due_date || '—'}</td>
                      <td style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.corrective_action || '—'}</td>
                      <td><span className={`badge ${FINDING_STATUS_BADGE[f.status] || 'badge-gray'}`} style={{ fontSize: 10 }}>{f.status}</span></td>
                      <td>
                        <button className="btn btn-sm btn-outline" style={{ fontSize: 10 }}
                          onClick={() => { setShowActionModal(f); setActionForm({ root_cause: f.root_cause || '', corrective_action: f.corrective_action || '', responsible: f.responsible || '', completion_date: f.completion_date || '', effectiveness_result: f.effectiveness_result || '', verified_by: f.verified_by || '', verified_at: f.verified_at || '', status: f.status }) }}>
                          시정처리
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showAuditModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 500 }}>
            <h3>감사 등록</h3>
            <div className="grid-2">
              <div className="form-group"><label>감사 유형</label>
                <select value={auditForm.audit_type} onChange={e => AF('audit_type', e.target.value)}>
                  {['내부감사', 'VDA6.3 공정감사', '고객감사', '인증기관감사'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group"><label>기준</label>
                <select value={auditForm.standard} onChange={e => AF('standard', e.target.value)}>
                  {['IATF16949', 'VDA6.3', 'ISO9001', '사내기준'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group"><label>감사일 *</label><input type="date" value={auditForm.audit_date} onChange={e => AF('audit_date', e.target.value)} /></div>
              <div className="form-group"><label>감사원 *</label><input value={auditForm.auditor} onChange={e => AF('auditor', e.target.value)} placeholder="홍길동" /></div>
              <div className="form-group"><label>피감사 부서</label><input value={auditForm.auditee_dept} onChange={e => AF('auditee_dept', e.target.value)} placeholder="생산팀, 품질팀..." /></div>
              <div className="form-group"><label>범위/공정</label><input value={auditForm.scope} onChange={e => AF('scope', e.target.value)} placeholder="사출공정 전체" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowAuditModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={saveAudit}>등록</button>
            </div>
          </div>
        </div>
      )}

      {showFindModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 500 }}>
            <h3>지적사항 등록</h3>
            <div className="grid-2">
              <div className="form-group"><label>조항번호</label><input value={findForm.clause_no} onChange={e => FF('clause_no', e.target.value)} placeholder="8.5.1" /></div>
              <div className="form-group"><label>조항명</label><input value={findForm.clause_title} onChange={e => FF('clause_title', e.target.value)} placeholder="생산 및 서비스 제공 관리" /></div>
              <div className="form-group"><label>유형</label>
                <select value={findForm.finding_type} onChange={e => FF('finding_type', e.target.value)}>
                  {['중대부적합', '경미부적합', '관찰사항', '강점'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group"><label>시정기한</label><input type="date" value={findForm.due_date} onChange={e => FF('due_date', e.target.value)} /></div>
            </div>
            <div className="form-group"><label>지적내용 *</label><textarea rows={3} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', resize: 'vertical' }} value={findForm.description} onChange={e => FF('description', e.target.value)} /></div>
            <div className="form-group"><label>근거/증거</label><input value={findForm.evidence} onChange={e => FF('evidence', e.target.value)} placeholder="현장 확인, 문서 검토..." /></div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowFindModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={saveFinding}>등록</button>
            </div>
          </div>
        </div>
      )}

      {showActionModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3>시정조치 처리</h3>
            <div style={{ background: 'var(--surface)', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
              <strong>{showActionModal.finding_type}</strong>: {showActionModal.description}
            </div>
            <div className="form-group"><label>상태</label>
              <select value={actionForm.status} onChange={e => setActionForm(f => ({ ...f, status: e.target.value }))}>
                {['열림', '시정중', '완료', '효과확인'].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group"><label>근본원인</label><textarea rows={2} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', resize: 'vertical' }} value={actionForm.root_cause} onChange={e => setActionForm(f => ({ ...f, root_cause: e.target.value }))} /></div>
            <div className="form-group"><label>시정조치</label><textarea rows={2} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', resize: 'vertical' }} value={actionForm.corrective_action} onChange={e => setActionForm(f => ({ ...f, corrective_action: e.target.value }))} /></div>
            <div className="grid-2">
              <div className="form-group"><label>담당자</label><input value={actionForm.responsible} onChange={e => setActionForm(f => ({ ...f, responsible: e.target.value }))} /></div>
              <div className="form-group"><label>완료일</label><input type="date" value={actionForm.completion_date} onChange={e => setActionForm(f => ({ ...f, completion_date: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label>효과검증 결과</label><input value={actionForm.effectiveness_result} onChange={e => setActionForm(f => ({ ...f, effectiveness_result: e.target.value }))} placeholder="재발 없음 확인, 후속 검사 결과..." /></div>
            <div className="grid-2">
              <div className="form-group"><label>검증자</label><input value={actionForm.verified_by} onChange={e => setActionForm(f => ({ ...f, verified_by: e.target.value }))} /></div>
              <div className="form-group"><label>검증일</label><input type="date" value={actionForm.verified_at} onChange={e => setActionForm(f => ({ ...f, verified_at: e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowActionModal(null)}>취소</button>
              <button className="btn btn-primary" onClick={saveAction}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// 6. PPAP
// ══════════════════════════════════════════════════════════════════
const PPAP_STATUS_BADGE = { '준비중': 'badge-gray', '제출': 'badge-blue', '승인': 'badge-green', '거절': 'badge-red', '조건부승인': 'badge-amber' }
const ELEM_STATUS_COLOR = { '해당없음': '#94a3b8', '준비중': '#d97706', '완료': '#16a34a', '거절': '#dc2626' }

export function PpapPanel() {
  const [list, setList] = useState([])
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ part_no: '', partner_id: '', customer: '', submission_level: 3, reason: '', note: '' })
  const [partners, setPartners] = useState([])

  const load = useCallback(() => {
    api.get('/quality-adv/ppap').then(r => setList(r.data)).catch(() => {})
    api.get('/master/items').then(r => setItems(r.data)).catch(() => {})
    api.get('/master/partners').then(r => setPartners(r.data)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const selectPpap = (p) => api.get(`/quality-adv/ppap/${p.id}`).then(r => setSelected(r.data)).catch(() => {})

  const savePpap = async () => {
    await api.post('/quality-adv/ppap', { ...form, submission_level: +form.submission_level })
    load(); setShowModal(false)
    setForm({ part_no: '', partner_id: '', customer: '', submission_level: 3, reason: '', note: '' })
  }

  const updateElem = async (elemId, status) => {
    await api.patch(`/quality-adv/ppap/elements/${elemId}?status=${encodeURIComponent(status)}`)
    const r = await api.get(`/quality-adv/ppap/${selected.id}`)
    setSelected(r.data)
  }

  const submitPpap = async () => {
    await api.patch(`/quality-adv/ppap/${selected.id}/submit`)
    load(); const r = await api.get(`/quality-adv/ppap/${selected.id}`); setSelected(r.data)
  }

  const completedCount = (selected?.elements || []).filter(e => e.status === '완료').length
  const totalActive = (selected?.elements || []).filter(e => e.status !== '해당없음').length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
      <div className="erp-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="section-title">PPAP 목록</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowModal(true)}>＋ 신규</button>
        </div>
        {list.map(p => (
          <div key={p.id} onClick={() => selectPpap(p)}
            style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
              background: selected?.id === p.id ? 'var(--primary-light,#eff6ff)' : 'var(--surface)',
              border: `1px solid ${selected?.id === p.id ? 'var(--primary)' : 'var(--border)'}` }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{p.ppap_no}</div>
            <div style={{ fontSize: 11, color: 'var(--text-sm)' }}>Lv.{p.submission_level} | {p.part_no}</div>
            <div style={{ fontSize: 11 }}>{p.part_name}</div>
            <span className={`badge ${PPAP_STATUS_BADGE[p.status] || 'badge-gray'}`} style={{ fontSize: 10 }}>{p.status}</span>
          </div>
        ))}
        {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-sm)', padding: 8 }}>없음</div>}
      </div>

      <div>
        {!selected ? (
          <div className="erp-panel" style={{ textAlign: 'center', padding: 60, color: 'var(--text-sm)' }}>좌측에서 PPAP를 선택하세요</div>
        ) : (
          <div className="erp-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{selected.ppap_no}</span>
                <span style={{ marginLeft: 8, fontSize: 12 }}>Lv.{selected.submission_level} | {selected.part_no} — {selected.part_name}</span>
                <span className={`badge ${PPAP_STATUS_BADGE[selected.status]}`} style={{ marginLeft: 8, fontSize: 10 }}>{selected.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-sm)' }}>{completedCount}/{totalActive} 완료</span>
                {selected.status === '준비중' && (
                  <button className="btn btn-sm btn-primary" onClick={submitPpap}>제출</button>
                )}
              </div>
            </div>
            {/* 진행바 */}
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, marginBottom: 12 }}>
              <div style={{ height: '100%', borderRadius: 3, background: completedCount === totalActive ? '#16a34a' : 'var(--primary)', width: totalActive > 0 ? `${completedCount / totalActive * 100}%` : '0%', transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>
              {(selected.elements || []).map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sm)', minWidth: 20 }}>{e.element_no}</span>
                  <span style={{ flex: 1, fontSize: 12 }}>{e.element_name}</span>
                  <select value={e.status} onChange={ev => updateElem(e.id, ev.target.value)}
                    style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', color: ELEM_STATUS_COLOR[e.status] || 'var(--text)', fontWeight: 600 }}>
                    {['해당없음', '준비중', '완료', '거절'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <h3>PPAP 신규 등록</h3>
            <div className="grid-2">
              <div className="form-group"><label>품번 *</label>
                <select value={form.part_no} onChange={e => setForm(f => ({ ...f, part_no: e.target.value }))}>
                  <option value="">선택</option>
                  {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>협력업체</label>
                <select value={form.partner_id} onChange={e => setForm(f => ({ ...f, partner_id: e.target.value }))}>
                  <option value="">없음</option>
                  {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>고객사</label><input value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} placeholder="현대모비스, 현대기아차..." /></div>
              <div className="form-group"><label>제출 레벨 (1-5)</label>
                <select value={form.submission_level} onChange={e => setForm(f => ({ ...f, submission_level: e.target.value }))}>
                  {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>레벨 {v}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}><label>변경 사유</label><input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="신규 양산, 설계변경, 공정변경..." /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={savePpap}>등록 (18개 항목 자동생성)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// 7. MSA
// ══════════════════════════════════════════════════════════════════
export function MsaPanel() {
  const [studies, setStudies] = useState([])
  const [items, setItems] = useState([])
  const [instruments, setInstruments] = useState([])
  const [selected, setSelected] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showMeasModal, setShowMeasModal] = useState(false)
  const [form, setForm] = useState({ part_no: '', characteristic: '', instrument_id: '', study_type: 'Gage R&R', appraiser_count: 3, part_count: 10, trial_count: 2, tolerance: '', note: '' })
  // 측정값 입력: appraiser별, part별, trial별
  const [appraiserNames, setAppraiserNames] = useState(['A', 'B', 'C'])
  const [measGrid, setMeasGrid] = useState({}) // {appraiser: {part_seq: {trial: value}}}
  const [calcResult, setCalcResult] = useState(null)

  const load = useCallback(() => {
    api.get('/quality-adv/msa').then(r => setStudies(r.data)).catch(() => {})
    api.get('/master/items').then(r => setItems(r.data)).catch(() => {})
    api.get('/quality-adv/instruments').then(r => setInstruments(r.data)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const selectStudy = async (s) => {
    const r = await api.get(`/quality-adv/msa/${s.id}`)
    setSelected(r.data)
    // 기존 측정값을 그리드로 변환
    const grid = {}
    for (const m of r.data.measurements) {
      if (!grid[m.appraiser]) grid[m.appraiser] = {}
      if (!grid[m.appraiser][m.part_seq]) grid[m.appraiser][m.part_seq] = {}
      grid[m.appraiser][m.part_seq][m.trial] = m.value
    }
    setMeasGrid(grid)
    setCalcResult(null)
  }

  const saveStudy = async () => {
    await api.post('/quality-adv/msa', {
      ...form,
      instrument_id: form.instrument_id ? +form.instrument_id : null,
      appraiser_count: +form.appraiser_count,
      part_count: +form.part_count,
      trial_count: +form.trial_count,
      tolerance: form.tolerance ? +form.tolerance : null,
    })
    load(); setShowModal(false)
    setForm({ part_no: '', characteristic: '', instrument_id: '', study_type: 'Gage R&R', appraiser_count: 3, part_count: 10, trial_count: 2, tolerance: '', note: '' })
  }

  const saveMeasurements = async () => {
    if (!selected) return
    const promises = []
    for (const [app, parts] of Object.entries(measGrid)) {
      for (const [partSeq, trials] of Object.entries(parts)) {
        for (const [trial, value] of Object.entries(trials)) {
          if (value !== '' && value != null) {
            promises.push(api.post(`/quality-adv/msa/${selected.id}/measurements`, {
              appraiser: app, part_seq: +partSeq, trial: +trial, value: +value,
            }))
          }
        }
      }
    }
    await Promise.all(promises)
    setShowMeasModal(false)
    await selectStudy(selected)
  }

  const calculate = async () => {
    const r = await api.post(`/quality-adv/msa/${selected.id}/calculate`).catch(e => { alert(e.response?.data?.detail || '계산 실패'); return null })
    if (r) { setCalcResult(r.data); await selectStudy(selected); load() }
  }

  const initMeasGrid = (s) => {
    const appraisers = appraiserNames.slice(0, s.appraiser_count)
    const grid = {}
    for (const app of appraisers) {
      grid[app] = {}
      for (let p = 1; p <= s.part_count; p++) {
        grid[app][p] = {}
        for (let t = 1; t <= s.trial_count; t++) {
          grid[app][p][t] = measGrid[app]?.[p]?.[t] ?? ''
        }
      }
    }
    setMeasGrid(grid)
  }

  const SF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
      <div className="erp-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="section-title">MSA 연구 목록</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowModal(true)}>＋ 신규</button>
        </div>
        {studies.map(s => (
          <div key={s.id} onClick={() => selectStudy(s)}
            style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
              background: selected?.id === s.id ? 'var(--primary-light,#eff6ff)' : 'var(--surface)',
              border: `1px solid ${selected?.id === s.id ? 'var(--primary)' : 'var(--border)'}` }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{s.study_no}</div>
            <div style={{ fontSize: 11, color: 'var(--text-sm)' }}>{s.characteristic}</div>
            <div style={{ fontSize: 11 }}>{s.study_type}</div>
            {s.grr_pct != null && (
              <span className={`badge ${s.result === '합격' ? 'badge-green' : s.result === '주의' ? 'badge-amber' : 'badge-red'}`} style={{ fontSize: 10 }}>
                %R&R {s.grr_pct?.toFixed(1)}%
              </span>
            )}
          </div>
        ))}
      </div>

      <div>
        {!selected ? (
          <div className="erp-panel" style={{ textAlign: 'center', padding: 60, color: 'var(--text-sm)' }}>좌측에서 MSA 연구를 선택하세요</div>
        ) : (
          <div className="erp-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{selected.study_no}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-sm)' }}>{selected.characteristic} | {selected.study_type}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-outline" onClick={() => { initMeasGrid(selected); setShowMeasModal(true) }}>측정값 입력</button>
                {selected.measurements?.length > 0 && (
                  <button className="btn btn-sm btn-primary" onClick={calculate}>Gage R&R 계산</button>
                )}
              </div>
            </div>

            {/* 결과 카드 */}
            {(calcResult || selected.grr_pct != null) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
                {[
                  { label: '% R&R (TV)', value: (calcResult?.grr_pct ?? selected.grr_pct)?.toFixed(2) + '%', color: ((calcResult?.grr_pct ?? selected.grr_pct) > 30 ? '#dc2626' : (calcResult?.grr_pct ?? selected.grr_pct) > 10 ? '#d97706' : '#16a34a') },
                  { label: 'NDC', value: calcResult?.ndc ?? selected.ndc, sub: 'ndc≥5 권장' },
                  { label: 'EV (반복성)', value: calcResult?.sigma_equipment?.toFixed(5) ?? '—' },
                  { label: 'AV (재현성)', value: calcResult?.sigma_appraiser?.toFixed(5) ?? '—' },
                ].map(k => (
                  <div key={k.label} className="erp-panel" style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-sm)' }}>{k.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: k.color || 'var(--text)' }}>{k.value ?? '—'}</div>
                    {k.sub && <div style={{ fontSize: 10, color: 'var(--text-sm)' }}>{k.sub}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* 판정 기준 */}
            {(calcResult || selected.result) && (
              <div style={{ background: 'var(--surface)', borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 8 }}>
                <strong>판정:</strong>&nbsp;
                <span className={`badge ${(calcResult?.result ?? selected.result) === '합격' ? 'badge-green' : (calcResult?.result ?? selected.result) === '주의' ? 'badge-amber' : 'badge-red'}`}>
                  {calcResult?.result ?? selected.result}
                </span>
                <span style={{ marginLeft: 12, color: 'var(--text-sm)' }}>
                  기준: %R&R {'<'} 10% = 합격 | 10~30% = 주의 | {'>'} 30% = 불합격
                </span>
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--text-sm)' }}>
              측정자 {selected.appraiser_count}명 × 부품 {selected.part_count}개 × {selected.trial_count}회 | 총 측정수: {selected.measurements?.length || 0}
              / {selected.appraiser_count * selected.part_count * selected.trial_count}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <h3>MSA 연구 신규 등록</h3>
            <div className="grid-2">
              <div className="form-group"><label>품번</label>
                <select value={form.part_no} onChange={e => SF('part_no', e.target.value)}>
                  <option value="">없음</option>
                  {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>관리특성 *</label><input value={form.characteristic} onChange={e => SF('characteristic', e.target.value)} placeholder="외경, 두께..." /></div>
              <div className="form-group"><label>사용 측정기</label>
                <select value={form.instrument_id} onChange={e => SF('instrument_id', e.target.value)}>
                  <option value="">선택</option>
                  {instruments.map(i => <option key={i.id} value={i.id}>{i.instrument_no} {i.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>연구 유형</label>
                <select value={form.study_type} onChange={e => SF('study_type', e.target.value)}>
                  {['Gage R&R', '편의분석', '선형성분석'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group"><label>측정자 수</label><input type="number" value={form.appraiser_count} onChange={e => SF('appraiser_count', e.target.value)} min={2} max={5} /></div>
              <div className="form-group"><label>부품 수</label><input type="number" value={form.part_count} onChange={e => SF('part_count', e.target.value)} min={5} max={20} /></div>
              <div className="form-group"><label>반복 횟수</label><input type="number" value={form.trial_count} onChange={e => SF('trial_count', e.target.value)} min={2} max={5} /></div>
              <div className="form-group"><label>공차 (USL-LSL)</label><input type="number" step="0.001" value={form.tolerance} onChange={e => SF('tolerance', e.target.value)} placeholder="선택사항" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={saveStudy}>등록</button>
            </div>
          </div>
        </div>
      )}

      {showMeasModal && selected && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: Math.min(900, 120 + selected.part_count * 70), maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>측정값 입력 — {selected.characteristic}</h3>
            <div style={{ marginBottom: 8 }}>
              {Array.from({ length: selected.appraiser_count }, (_, i) => appraiserNames[i] || String.fromCharCode(65 + i)).map((app, ai) => (
                <div key={app} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4, color: 'var(--primary)' }}>측정자 {app}</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>시도</th>
                          {Array.from({ length: selected.part_count }, (_, i) => (
                            <th key={i} style={{ padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 60 }}>부품{i + 1}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: selected.trial_count }, (_, ti) => (
                          <tr key={ti}>
                            <td style={{ padding: '4px 8px', border: '1px solid var(--border)', fontWeight: 600 }}>Trial {ti + 1}</td>
                            {Array.from({ length: selected.part_count }, (_, pi) => (
                              <td key={pi} style={{ padding: 2, border: '1px solid var(--border)' }}>
                                <input type="number" step="0.001"
                                  value={measGrid[app]?.[pi + 1]?.[ti + 1] ?? ''}
                                  onChange={e => setMeasGrid(g => {
                                    const ng = { ...g }
                                    if (!ng[app]) ng[app] = {}
                                    if (!ng[app][pi + 1]) ng[app][pi + 1] = {}
                                    ng[app][pi + 1][ti + 1] = e.target.value
                                    return ng
                                  })}
                                  style={{ width: 60, padding: '2px 4px', fontSize: 11, border: 'none', textAlign: 'right' }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowMeasModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={saveMeasurements}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
