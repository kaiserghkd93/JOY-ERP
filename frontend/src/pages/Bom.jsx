import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../api'

function PartSearchInput({ value, items, onChange, placeholder }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selected = items.find(i => i.part_no === value)
  const filtered = items.filter(i =>
    !search ||
    i.part_no.toLowerCase().includes(search.toLowerCase()) ||
    i.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 80)

  const handleSelect = (item) => {
    onChange(item.part_no)
    setSearch('')
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={open ? search : (selected ? `${selected.part_no} ${selected.name}` : value)}
        onChange={e => { setSearch(e.target.value); onChange(''); setOpen(true) }}
        onFocus={() => { setSearch(''); setOpen(true) }}
        placeholder={placeholder || '품번/품명 검색'}
        style={{ fontSize: 12, width: '100%', boxSizing: 'border-box' }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.13)', maxHeight: 260, overflowY: 'auto',
        }}>
          {filtered.length === 0
            ? <div style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 12 }}>검색 결과 없음</div>
            : filtered.map(i => (
              <div key={i.part_no} onMouseDown={() => handleSelect(i)}
                style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                  background: value === i.part_no ? '#dbeafe' : undefined }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                onMouseLeave={e => e.currentTarget.style.background = value === i.part_no ? '#dbeafe' : ''}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', marginRight: 8 }}>{i.part_no}</span>
                <span style={{ fontSize: 12 }}>{i.name}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

function MrpTable({ title, color, materials }) {
  if (materials.length === 0) return (
    <div style={{ marginBottom: 24, padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#94a3b8', fontSize: 13 }}>
      {title} — 소요량 없음
    </div>
  )
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color, marginBottom: 6, paddingLeft: 2 }}>{title}</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>품번</th><th>품명</th>
              <th style={{ textAlign: 'right' }}>필요량</th>
              <th style={{ textAlign: 'right' }}>현재고</th>
              <th style={{ textAlign: 'right' }}>발주필요량</th>
              <th>단위</th>
              <th style={{ textAlign: 'right' }}>단가</th>
              <th style={{ textAlign: 'right' }}>발주금액</th>
            </tr>
          </thead>
          <tbody>
            {materials.map(m => (
              <tr key={m.component_part_no} style={{ background: m.order_qty > 0 ? '#fff' : '#f0fdf4' }}>
                <td><code style={{ fontSize: 11 }}>{m.component_part_no}</code></td>
                <td>{m.component_name}</td>
                <td style={{ textAlign: 'right' }}>{Number(m.required_qty).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td style={{ textAlign: 'right', color: m.stock_qty < m.required_qty ? '#dc2626' : '#16a34a' }}>
                  {Number(m.stock_qty).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: m.order_qty > 0 ? '#dc2626' : '#16a34a' }}>
                  {m.order_qty > 0 ? Number(m.order_qty).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '충분'}
                </td>
                <td>{m.unit}</td>
                <td style={{ textAlign: 'right' }}>{m.buy_price ? `₩${Number(m.buy_price).toLocaleString()}` : '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {m.order_amount > 0 ? `₩${Number(m.order_amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Bom() {
  const [tab, setTab] = useState('bom')          // 'bom' | 'mrp'
  const [items, setItems] = useState([])
  const [selectedProd, setSelectedProd] = useState(null)
  const [bomLines, setBomLines] = useState([])
  const [prodSearch, setProdSearch] = useState('')
  const [ctForm, setCtForm] = useState({ machine_ct_sec: '', manual_ct_sec: '', cavity_count: '' })
  const [ctSaving, setCtSaving] = useState(false)
  const [form, setForm] = useState({
    component_part_no: '', qty_per: '', unit: 'kg', note: '',
    net_weight_g: '', runner_weight_g: '', std_defect_rate: '',
    std_purge_loss_kg: '', std_startup_loss_kg: '', regrind_ratio: '',
  })
  const [showInjection, setShowInjection] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [draftLines, setDraftLines] = useState([])   // 임시 추가 목록

  // MRP 상태
  const now = new Date()
  const [mrpYear, setMrpYear] = useState(now.getFullYear())
  const [mrpMonth, setMrpMonth] = useState(now.getMonth() + 1)
  const [mrpData, setMrpData] = useState(null)
  const [mrpLoading, setMrpLoading] = useState(false)
  const [mrpTab, setMrpTab] = useState('po') // 'po' | 'spare' | 'sub'

  useEffect(() => {
    api.get('/master/items?active_only=true').then(r => setItems(r.data)).catch(() => {})
  }, [])

  const loadBom = useCallback((partNo) => {
    api.get(`/bom/${partNo}`).then(r => setBomLines(r.data)).catch(() => setBomLines([]))
  }, [])

  const selectProd = (item) => {
    setSelectedProd(item)
    loadBom(item.part_no)
    resetForm()
    setEditId(null)
    setDraftLines([])
    setCtForm({
      machine_ct_sec: item.machine_ct_sec ?? '',
      manual_ct_sec: item.manual_ct_sec ?? '',
      cavity_count: item.cavity_count ?? '',
    })
  }

  const saveCtInfo = async () => {
    if (!selectedProd) return
    setCtSaving(true)
    try {
      const payload = {
        machine_ct_sec: ctForm.machine_ct_sec !== '' ? +ctForm.machine_ct_sec : null,
        manual_ct_sec: ctForm.manual_ct_sec !== '' ? +ctForm.manual_ct_sec : null,
        cavity_count: ctForm.cavity_count !== '' ? +ctForm.cavity_count : null,
      }
      await api.patch(`/master/items/${selectedProd.part_no}`, payload)
      setSelectedProd(p => ({ ...p, ...payload }))
      setItems(list => list.map(it => it.part_no === selectedProd.part_no ? { ...it, ...payload } : it))
    } catch (e) {
      alert('저장 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setCtSaving(false) }
  }

  const resetForm = () => setForm({
    component_part_no: '', qty_per: '', unit: 'kg', note: '',
    net_weight_g: '', runner_weight_g: '', std_defect_rate: '',
    std_purge_loss_kg: '', std_startup_loss_kg: '', regrind_ratio: '',
  })

  const buildPayload = (f) => ({
    component_part_no: f.component_part_no,
    qty_per: parseFloat(f.qty_per),
    unit: f.unit,
    note: f.note || '',
    net_weight_g: f.net_weight_g ? parseFloat(f.net_weight_g) : 0,
    runner_weight_g: f.runner_weight_g ? parseFloat(f.runner_weight_g) : 0,
    std_defect_rate: f.std_defect_rate ? parseFloat(f.std_defect_rate) : 0,
    std_purge_loss_kg: f.std_purge_loss_kg ? parseFloat(f.std_purge_loss_kg) : 0,
    std_startup_loss_kg: f.std_startup_loss_kg ? parseFloat(f.std_startup_loss_kg) : 0,
    regrind_ratio: f.regrind_ratio ? parseFloat(f.regrind_ratio) : 0,
  })

  // 임시추가: 로컬 draft에만 쌓기
  const addToDraft = () => {
    if (!form.component_part_no) { alert('품번을 드롭다운에서 선택해 주세요'); return }
    if (!form.qty_per) { alert('소요량을 입력해 주세요'); return }
    const compItem = items.find(i => i.part_no === form.component_part_no)
    setDraftLines(d => [...d, { ...buildPayload(form), _id: Date.now(), component_name: compItem?.name || '' }])
    resetForm()
  }

  // 전체 저장
  const saveAllDraft = async () => {
    if (draftLines.length === 0) return
    setSaving(true)
    try {
      for (const line of draftLines) {
        const { _id, component_name, ...payload } = line
        await api.post(`/bom/${selectedProd.part_no}`, payload)
      }
      setDraftLines([])
      loadBom(selectedProd.part_no)
    } catch (err) {
      alert('저장 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  // 기존 BOM 라인 수정 저장 (editId 모드에서만 직접 저장)
  const saveLine = async () => {
    if (!form.component_part_no) { alert('품번을 드롭다운에서 선택해 주세요'); return }
    if (!form.qty_per) { alert('소요량을 입력해 주세요'); return }
    setSaving(true)
    try {
      await api.put(`/bom/line/${editId}`, buildPayload(form))
      loadBom(selectedProd.part_no)
      resetForm()
      setEditId(null)
    } finally {
      setSaving(false)
    }
  }

  const deleteLine = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await api.delete(`/bom/line/${id}`)
    loadBom(selectedProd.part_no)
  }

  const startEdit = (line) => {
    setEditId(line.id)
    setForm({
      component_part_no: line.component_part_no,
      qty_per: String(line.qty_per),
      unit: line.unit,
      note: line.note || '',
      net_weight_g: line.net_weight_g > 0 ? String(line.net_weight_g) : '',
      runner_weight_g: line.runner_weight_g > 0 ? String(line.runner_weight_g) : '',
      std_defect_rate: line.std_defect_rate > 0 ? String(line.std_defect_rate) : '',
      std_purge_loss_kg: line.std_purge_loss_kg > 0 ? String(line.std_purge_loss_kg) : '',
      std_startup_loss_kg: line.std_startup_loss_kg > 0 ? String(line.std_startup_loss_kg) : '',
      regrind_ratio: line.regrind_ratio > 0 ? String(line.regrind_ratio) : '',
    })
    const hasInjection = line.net_weight_g > 0 || line.runner_weight_g > 0 || line.std_defect_rate > 0
    setShowInjection(hasInjection)
  }

  const runMrp = async () => {
    setMrpLoading(true)
    setMrpData(null)
    try {
      const r = await api.get(`/bom/mrp/plan?year=${mrpYear}&month=${mrpMonth}`)
      setMrpData(r.data)
    } catch {
      alert('계산 실패')
    } finally {
      setMrpLoading(false)
    }
  }

  const filteredProds = items.filter(i =>
    i.part_no.toLowerCase().includes(prodSearch.toLowerCase()) ||
    i.name.toLowerCase().includes(prodSearch.toLowerCase())
  )

  return (
    <div>
      <div className="erp-panel" style={{marginBottom:8}}>
        <div className="erp-actions">
          <div className="qdate-bar">
            {[['bom','BOM 관리'],['mrp','원재료 구매계획']].map(([v,l])=>(
              <button key={v} className={`qdate-btn${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOM 관리 탭 ── */}
      {tab === 'bom' && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

          {/* 좌측: 제품 목록 */}
          <div style={{ width: 320, flexShrink: 0 }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: '#f1f5f9' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>제품 선택</div>
                <input
                  placeholder="품번 / 품명 검색"
                  value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                {filteredProds.map(i => (
                  <div key={i.part_no}
                    onClick={() => selectProd(i)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                      background: selectedProd?.part_no === i.part_no ? '#dbeafe' : 'white',
                      transition: 'background 0.1s',
                    }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{i.part_no}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{i.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 우측: BOM 편집 */}
          <div style={{ flex: 1 }}>
            {!selectedProd ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', paddingTop: 80, fontSize: 14 }}>
                좌측에서 제품을 선택하세요
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{selectedProd.name}</span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{selectedProd.part_no}</span>
                  </div>
                </div>

                {/* 사이클타임 / 캐비티 편집 패널 */}
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 10 }}>⚙ 사이클타임 / 캐비티 (MES 이론생산량 계산 기준)</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 3 }}>설비 C/T (초)</div>
                      <input type="number" min="0" step="0.1" value={ctForm.machine_ct_sec}
                        onChange={e => setCtForm(f => ({ ...f, machine_ct_sec: e.target.value }))}
                        style={{ width: 90, padding: '5px 8px', borderRadius: 5, border: '1px solid #93c5fd', fontSize: 13 }}
                        placeholder="예: 25" />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 3 }}>공수 C/T (초)</div>
                      <input type="number" min="0" step="0.1" value={ctForm.manual_ct_sec}
                        onChange={e => setCtForm(f => ({ ...f, manual_ct_sec: e.target.value }))}
                        style={{ width: 90, padding: '5px 8px', borderRadius: 5, border: '1px solid #93c5fd', fontSize: 13 }}
                        placeholder="예: 30" />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 3 }}>캐비티 수</div>
                      <input type="number" min="1" step="1" value={ctForm.cavity_count}
                        onChange={e => setCtForm(f => ({ ...f, cavity_count: e.target.value }))}
                        style={{ width: 70, padding: '5px 8px', borderRadius: 5, border: '1px solid #93c5fd', fontSize: 13 }}
                        placeholder="예: 4" />
                    </div>
                    <button onClick={saveCtInfo} disabled={ctSaving}
                      style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {ctSaving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>

                {/* BOM 라인 테이블 */}
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>구성품 품번</th><th>품명</th>
                        <th style={{textAlign:'right'}}>소요량</th><th>단위</th>
                        <th style={{textAlign:'right',fontSize:10}}>순중량(g)</th>
                        <th style={{textAlign:'right',fontSize:10}}>러너(g)</th>
                        <th style={{textAlign:'right',fontSize:10}}>불량률%</th>
                        <th>비고</th><th>수정</th><th>삭제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bomLines.length === 0 && (
                        <tr><td colSpan={10} className="empty">BOM 구성 없음 — 아래에서 추가하세요</td></tr>
                      )}
                      {bomLines.map(l => (
                        <tr key={l.id}>
                          <td><code style={{ fontSize: 11 }}>{l.component_part_no}</code></td>
                          <td>{l.component_name || <span style={{ color: '#ef4444' }}>미등록 품목</span>}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(l.qty_per).toLocaleString()}</td>
                          <td>{l.unit}</td>
                          <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-sm)' }}>
                            {l.net_weight_g > 0 ? l.net_weight_g : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-sm)' }}>
                            {l.runner_weight_g > 0 ? l.runner_weight_g : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-sm)' }}>
                            {l.std_defect_rate > 0 ? `${l.std_defect_rate}%` : '—'}
                          </td>
                          <td style={{ fontSize: 12, color: '#64748b' }}>{l.note}</td>
                          <td><button className="btn btn-sm btn-outline" onClick={() => startEdit(l)}>수정</button></td>
                          <td><button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: 'none' }} onClick={() => deleteLine(l.id)}>삭제</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 임시 추가 목록 (draft) */}
                {draftLines.length > 0 && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>
                        📋 저장 대기 중 {draftLines.length}건 — 아직 저장되지 않았습니다
                      </span>
                      <button
                        className="btn btn-primary"
                        onClick={saveAllDraft}
                        disabled={saving}
                        style={{ background: '#16a34a', borderColor: '#15803d' }}
                      >
                        {saving ? '저장 중...' : `✓ 전체 저장 (${draftLines.length}건)`}
                      </button>
                    </div>
                    <table style={{ fontSize: 12, width: '100%' }}>
                      <thead>
                        <tr style={{ background: '#fef3c7' }}>
                          <th style={{ textAlign: 'left', padding: '4px 8px' }}>품번</th>
                          <th style={{ textAlign: 'left', padding: '4px 8px' }}>품명</th>
                          <th style={{ textAlign: 'right', padding: '4px 8px' }}>소요량</th>
                          <th style={{ padding: '4px 8px' }}>단위</th>
                          <th style={{ padding: '4px 8px' }}>비고</th>
                          <th style={{ padding: '4px 8px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftLines.map((d, idx) => (
                          <tr key={d._id} style={{ borderTop: '1px solid #fde68a' }}>
                            <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8' }}>{d.component_part_no}</td>
                            <td style={{ padding: '4px 8px' }}>{d.component_name}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{d.qty_per}</td>
                            <td style={{ padding: '4px 8px' }}>{d.unit}</td>
                            <td style={{ padding: '4px 8px', color: '#64748b' }}>{d.note}</td>
                            <td style={{ padding: '4px 8px' }}>
                              <button
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                                onClick={() => setDraftLines(d => d.filter((_, i) => i !== idx))}
                              >✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 추가/수정 폼 */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                    {editId ? '구성품 수정' : '구성품 추가'}
                    {!editId && <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>품번 선택 → 소요량 입력 → 임시추가 반복, 완료 후 전체 저장</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ margin: 0, flex: '2 1 200px' }}>
                      <label style={{ fontSize: 11 }}>품번 (원재료/인서트)</label>
                      <PartSearchInput
                        value={form.component_part_no}
                        items={items}
                        onChange={v => setForm(f => ({ ...f, component_part_no: v }))}
                        placeholder="품번/품명 검색 후 클릭 선택"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0, flex: '1 1 90px' }}>
                      <label style={{ fontSize: 11 }}>소요량</label>
                      <input
                        type="number" step="0.0001"
                        value={form.qty_per}
                        onChange={e => setForm(f => ({ ...f, qty_per: e.target.value }))}
                        placeholder="예: 12.5"
                        style={{ fontSize: 12 }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0, flex: '1 1 70px' }}>
                      <label style={{ fontSize: 11 }}>단위</label>
                      <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={{ fontSize: 12 }}>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="EA">EA</option>
                        <option value="개">개</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0, flex: '2 1 140px' }}>
                      <label style={{ fontSize: 11 }}>비고</label>
                      <input
                        value={form.note}
                        onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="인서트, 러너포함 등"
                        style={{ fontSize: 12 }}
                      />
                    </div>
                    {editId ? (
                      <>
                        <button className="btn btn-primary" onClick={saveLine} disabled={saving || !form.component_part_no || !form.qty_per} style={{ height: 36 }}>
                          {saving ? '저장 중...' : '수정 저장'}
                        </button>
                        <button className="btn btn-outline" onClick={() => { setEditId(null); resetForm(); setShowInjection(false) }} style={{ height: 36 }}>
                          취소
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={addToDraft}
                        disabled={!form.component_part_no || !form.qty_per}
                        style={{ height: 36, opacity: (!form.component_part_no || !form.qty_per) ? 0.45 : 1 }}
                      >
                        ＋ 임시추가
                      </button>
                    )}
                  </div>

                  {/* 사출 특화 설정 (토글) */}
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setShowInjection(v => !v)}
                      style={{ fontSize: 11, padding: '3px 10px' }}
                    >
                      {showInjection ? '▲ 사출 특화 설정 접기' : '▼ 사출 특화 설정 펼치기'}
                    </button>
                    {showInjection && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10,
                        padding: '10px 12px', background: '#f0f9ff', borderRadius: 6, border: '1px solid #bae6fd' }}>
                        {[
                          { key: 'net_weight_g',      label: '순중량 (g)',       step: '0.01' },
                          { key: 'runner_weight_g',   label: '러너 중량 (g)',    step: '0.01' },
                          { key: 'std_defect_rate',   label: '표준 불량률 (%)',  step: '0.01', max: 100 },
                          { key: 'std_purge_loss_kg', label: '퍼지 손실 (kg/교체)', step: '0.001' },
                          { key: 'std_startup_loss_kg', label: '시동 손실 (kg/일)', step: '0.001' },
                          { key: 'regrind_ratio',     label: '재분쇄 혼입률 (%)' , step: '0.1', max: 100 },
                        ].map(({ key, label, step, max }) => (
                          <div key={key} className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 10 }}>{label}</label>
                            <input
                              type="number" step={step} min="0" max={max}
                              value={form[key]}
                              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                              placeholder="0"
                              style={{ fontSize: 12 }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 원재료 구매계획 탭 ── */}
      {tab === 'mrp' && (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            <select value={mrpYear} onChange={e => setMrpYear(+e.target.value)} style={{ fontSize: 14 }}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={mrpMonth} onChange={e => setMrpMonth(+e.target.value)} style={{ fontSize: 14 }}>
              {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
            <button className="btn btn-primary" onClick={runMrp} disabled={mrpLoading}>
              {mrpLoading ? '계산 중...' : '소요량 계산'}
            </button>
          </div>

          {mrpData && (
            <>
              {/* KPI */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                  { label: '수주 대상 제품', value: mrpData.product_count + '종', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
                  { label: '발주 제품 수', value: (mrpData.po_product_count || 0) + '종', color: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
                  { label: '발주품 원재료 소요', value: (mrpData.po_materials || []).length + '종', color: '#065f46', bg: '#f0fdf4', border: '#bbf7d0' },
                  { label: 'Spare Part 원재료', value: (mrpData.spare_materials || []).length + '종', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
                  { label: '부자재 발주필요', value: (mrpData.sub_materials || []).filter(m => m.order_qty > 0).length + '종', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
                ].map(k => (
                  <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 8, padding: '10px 16px', minWidth: 140 }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{k.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* 구분 탭 */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
                {[
                  { key: 'so',    label: '수주 기준 전체',       count: (mrpData.materials || []).length,       color: '#1d4ed8' },
                  { key: 'po',    label: '외주처 발주품 BOM',    count: (mrpData.po_materials || []).length,    color: '#059669' },
                  { key: 'spare', label: 'Spare Part BOM',       count: (mrpData.spare_materials || []).length, color: '#b45309' },
                  { key: 'sub',   label: '부자재',                count: (mrpData.sub_materials || []).length,   color: '#7c3aed' },
                ].map(t => (
                  <button key={t.key} onClick={() => setMrpTab(t.key)} style={{
                    padding: '7px 18px', fontSize: 13, fontWeight: mrpTab === t.key ? 700 : 400,
                    border: 'none', borderBottom: mrpTab === t.key ? `3px solid ${t.color}` : '3px solid transparent',
                    background: 'none', cursor: 'pointer',
                    color: mrpTab === t.key ? t.color : '#64748b',
                    marginBottom: -2,
                  }}>
                    {t.label}
                    <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>{t.count}</span>
                  </button>
                ))}
              </div>

              {/* 탭별 테이블 */}
              {mrpTab === 'so' && (
                <MrpTable title="수주 기준 원재료 전체 소요량" color="#1d4ed8"
                  materials={mrpData.materials || []} />
              )}
              {mrpTab === 'po' && (
                <MrpTable title={`외주처 발주 ${mrpData.po_product_count || 0}종 → BOM 원재료 소요량`} color="#059669"
                  materials={mrpData.po_materials || []} />
              )}
              {mrpTab === 'spare' && (
                <MrpTable title={`Spare Part ${mrpData.spare_product_count || 0}종 → BOM 원재료 소요량`} color="#b45309"
                  materials={mrpData.spare_materials || []} />
              )}
              {mrpTab === 'sub' && (
                <MrpTable title="부자재 (볼트·나사류)" color="#7c3aed"
                  materials={mrpData.sub_materials || []} />
              )}
            </>
          )}

          {!mrpData && !mrpLoading && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 60, fontSize: 14 }}>
              연월을 선택하고 "소요량 계산" 버튼을 누르세요
            </div>
          )}
        </div>
      )}
    </div>
  )
}
