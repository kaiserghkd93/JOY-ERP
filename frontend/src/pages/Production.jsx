import { useEffect, useState, useCallback } from 'react'
import api from '../api'

function PordModal({ onClose, onSaved }) {
  const [items, setItems] = useState([])
  const [molds, setMolds] = useState([])
  const [form, setForm] = useState({ part_no: '', planned_qty: '', plan_date: '', mold_no: '' })

  useEffect(() => {
    api.get('/master/items').then(r => setItems(r.data))
    api.get('/production/molds').then(r => setMolds(r.data)).catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = async () => {
    const payload = { ...form, planned_qty: +form.planned_qty }
    if (!payload.mold_no) delete payload.mold_no
    await api.post('/production/orders', payload)
    onSaved()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>생산오더 등록</h3>
        <div className="form-group">
          <label>품번</label>
          <select value={form.part_no} onChange={e => set('part_no', e.target.value)}>
            <option value="">선택</option>
            {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
          </select>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>계획수량</label><input type="number" value={form.planned_qty} onChange={e => set('planned_qty', e.target.value)} /></div>
          <div className="form-group"><label>계획일</label><input type="date" value={form.plan_date} onChange={e => set('plan_date', e.target.value)} /></div>
        </div>
        <div className="form-group">
          <label>금형 (선택)</label>
          <select value={form.mold_no} onChange={e => set('mold_no', e.target.value)}>
            <option value="">없음</option>
            {molds.map(m => <option key={m.mold_no} value={m.mold_no}>{m.mold_no}</option>)}
          </select>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  )
}

function ResultModal({ pord, onClose, onSaved }) {
  const [form, setForm] = useState({ actual_qty: '', complete_date: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = async () => {
    await api.post(`/production/orders/${pord.pord_no}/result`, { actual_qty: +form.actual_qty, complete_date: form.complete_date })
    onSaved()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>생산 실적 등록 — {pord.pord_no}</h3>
        <div className="grid-2">
          <div className="form-group"><label>실적수량</label><input type="number" value={form.actual_qty} onChange={e => set('actual_qty', e.target.value)} /></div>
          <div className="form-group"><label>완료일</label><input type="date" value={form.complete_date} onChange={e => set('complete_date', e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>실적 등록</button>
        </div>
      </div>
    </div>
  )
}

function MoldModal({ onClose, onSaved }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ mold_no: '', owner: 'HD현대일렉트릭', part_no: '', location: '' })

  useEffect(() => { api.get('/master/items').then(r => setItems(r.data)) }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = async () => {
    await api.post('/production/molds', form)
    onSaved()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>금형 등록</h3>
        <div className="form-group"><label>금형번호</label><input value={form.mold_no} onChange={e => set('mold_no', e.target.value)} /></div>
        <div className="form-group"><label>소유자</label><input value={form.owner} onChange={e => set('owner', e.target.value)} /></div>
        <div className="form-group">
          <label>해당 품번</label>
          <select value={form.part_no} onChange={e => set('part_no', e.target.value)}>
            <option value="">선택</option>
            {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>보관위치</label><input value={form.location} onChange={e => set('location', e.target.value)} /></div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  )
}

function PartMapModal({ onClose, onSaved }) {
  const [maps, setMaps] = useState([])
  const [form, setForm] = useState({ mes_part_no: '', erp_part_no: '', note: '' })
  const [items, setItems] = useState([])

  useEffect(() => {
    api.get('/mes/part-map').then(r => setMaps(r.data)).catch(() => {})
    api.get('/master/items').then(r => setItems(r.data)).catch(() => {})
  }, [])

  const add = async () => {
    if (!form.mes_part_no || !form.erp_part_no) return
    await api.post('/mes/part-map', form)
    const r = await api.get('/mes/part-map')
    setMaps(r.data)
    setForm({ mes_part_no: '', erp_part_no: '', note: '' })
  }

  const del = async (id) => {
    await api.delete(`/mes/part-map/${id}`)
    setMaps(maps.filter(m => m.id !== id))
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 700, width: '95vw' }}>
        <h3>MES ↔ ERP 품번 매핑 관리</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          MES 품번이 ERP 품번과 다를 때 여기서 연결해주세요. 업로드 시 자동 변환됩니다.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="MES 품번" value={form.mes_part_no}
            onChange={e => setForm(f => ({ ...f, mes_part_no: e.target.value }))}
            style={{ flex: 1, minWidth: 140, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)' }} />
          <select value={form.erp_part_no}
            onChange={e => setForm(f => ({ ...f, erp_part_no: e.target.value }))}
            style={{ flex: 2, minWidth: 200, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)' }}>
            <option value="">ERP 품번 선택</option>
            {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
          </select>
          <input placeholder="비고 (선택)" value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            style={{ flex: 1, minWidth: 100, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)' }} />
          <button className="btn btn-primary" onClick={add}>추가</button>
        </div>
        <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table>
            <thead><tr><th>MES 품번</th><th>ERP 품번</th><th>비고</th><th></th></tr></thead>
            <tbody>
              {maps.length === 0 && <tr><td colSpan={4} className="empty">등록된 매핑 없음</td></tr>}
              {maps.map(m => (
                <tr key={m.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.mes_part_no}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.erp_part_no}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.note || '—'}</td>
                  <td><button className="btn btn-sm btn-outline" onClick={() => del(m.id)}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={() => { onSaved?.(); onClose() }}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function ExcelUpload({ onDone }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState([])
  const [daily, setDaily] = useState([])
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10))
  const [showMap, setShowMap] = useState(false)

  useEffect(() => {
    api.get('/mes/logs').then(r => setLogs(r.data)).catch(() => {})
  }, [result])

  useEffect(() => {
    if (!dailyDate) return
    api.get(`/mes/daily?prod_date=${dailyDate}`).then(r => setDaily(r.data)).catch(() => {})
  }, [dailyDate, result])

  const upload = async () => {
    if (!file) return
    setLoading(true); setError(''); setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await api.post('/mes/upload-excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(r.data)
      onDone && onDone()
    } catch (e) {
      setError(e.response?.data?.detail || '업로드 오류')
    } finally { setLoading(false) }
  }

  return (
    <div>
      {/* 업로드 카드 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h4 style={{ marginBottom: 12 }}>생산실적 엑셀 업로드</h4>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          MES에서 내보낸 생산계획대비실적 파일을 업로드하면 ERP 실적에 자동 반영됩니다.
          <br />필수 컬럼: <b>계획일</b>, <b>품목코드</b>, <b>실적수량</b>
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
            파일 선택
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { setFile(e.target.files[0]); setResult(null); setError('') }} />
          </label>
          {file && <span style={{ fontSize: 13 }}>{file.name}</span>}
          <button className="btn btn-primary" onClick={upload} disabled={!file || loading}>
            {loading ? '업로드 중...' : '업로드'}
          </button>
          <div className="spacer" />
          <button className="btn btn-outline" onClick={() => setShowMap(true)}>품번 매핑 관리</button>
        </div>
        {error && <p style={{ color: 'var(--danger)', marginTop: 8, fontSize: 13 }}>{error}</p>}
        {result && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-alt)', borderRadius: 6, fontSize: 13 }}>
            <b style={{ color: 'var(--success)' }}>업로드 완료!</b>{' '}
            총 {result.rows_fetched}행 중 성공 {result.rows_ok}행
            {result.rows_err > 0 && <span style={{ color: 'var(--danger)' }}> / 오류 {result.rows_err}행</span>}
            {result.dates?.length > 0 && <span> — 날짜: {result.dates.join(', ')}</span>}
            {result.errors?.length > 0 && (
              <ul style={{ marginTop: 6, color: 'var(--danger)' }}>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {result.unmapped_parts?.length > 0 && (
              <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 4 }}>
                <b style={{ color: '#ca8a04' }}>ERP 미등록 품번 {result.unmapped_parts.length}개</b> (실적은 저장됐지만 ERP 생산지시 연동 안 됨)
                <br />{result.unmapped_parts.join(', ')}
                <br /><button className="btn btn-sm btn-outline" style={{ marginTop: 4 }} onClick={() => setShowMap(true)}>품번 매핑 등록하기</button>
              </div>
            )}
            <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
              인식된 컬럼: {Object.entries(result.col_mapping || {}).map(([k, v]) => `${k}→"${v}"`).join(', ')}
            </div>
          </div>
        )}
      </div>

      {/* 날짜별 조회 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>날짜별 실적 조회</h4>
          <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)' }} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>품번</th><th>품명</th><th>설비</th><th>교대</th>
                <th>계획</th><th>실적</th><th>불량</th><th>불량률</th>
                <th>ERP연동</th>
              </tr>
            </thead>
            <tbody>
              {daily.length === 0 && <tr><td colSpan={9} className="empty">해당 날짜 실적 없음</td></tr>}
              {daily.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.part_no}</td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.part_name || '—'}</td>
                  <td>{r.machine_no || '—'}</td>
                  <td>{r.shift || '—'}</td>
                  <td>{r.plan_qty?.toLocaleString()}</td>
                  <td><b>{r.actual_qty?.toLocaleString()}</b></td>
                  <td>{r.defect_qty > 0 ? r.defect_qty.toLocaleString() : '—'}</td>
                  <td>{r.defect_rate > 0 ? `${r.defect_rate}%` : '—'}</td>
                  <td>{r.synced_to_erp
                    ? <span className="badge badge-green">연동완료</span>
                    : <span className="badge badge-gray">미연동</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 업로드 이력 */}
      <div className="card">
        <h4 style={{ marginBottom: 12 }}>업로드 이력</h4>
        <div className="table-wrap">
          <table>
            <thead><tr><th>업로드 일시</th><th>대상 날짜</th><th>전체</th><th>성공</th><th>오류</th><th>상태</th></tr></thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan={6} className="empty">이력 없음</td></tr>}
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontSize: 12 }}>{l.sync_at}</td>
                  <td>{l.target_date}</td>
                  <td>{l.rows_fetched}</td>
                  <td>{l.rows_ok}</td>
                  <td>{l.rows_err}</td>
                  <td><span className={`badge ${l.status === 'success' ? 'badge-green' : l.status === 'partial' ? 'badge-amber' : 'badge-red'}`}>{l.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showMap && <PartMapModal onClose={() => setShowMap(false)} />}
    </div>
  )
}

function CostAnalysis() {
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  const [start, setStart] = useState(monthStart)
  const [end, setEnd] = useState(today)
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [r1, r2] = await Promise.all([
        api.get(`/mes/cost-report?start=${start}&end=${end}`),
        api.get(`/mes/cost-summary?start=${start}&end=${end}`),
      ])
      setRows(r1.data)
      setSummary(r2.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const fmt = (n) => n != null ? Math.round(n).toLocaleString() : '—'
  const fmtR = (n) => n != null ? n.toFixed(1) + '%' : '—'

  return (
    <div>
      {/* 기간 필터 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>시작일</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>종료일</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? '조회 중...' : '조회'}
          </button>
        </div>
      </div>

      {/* 요약 KPI */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: '총 생산수량', value: fmt(summary.total_qty) + ' EA', color: '#2563eb' },
            { label: '총 원자재비', value: fmt(summary.total_material_cost) + ' 원', color: '#dc2626' },
            { label: '총 공수비', value: fmt(summary.total_labor_cost) + ' 원', color: '#d97706' },
            { label: '총 매출', value: fmt(summary.total_revenue) + ' 원', color: '#059669' },
            { label: '총 마진', value: fmt(summary.total_margin) + ' 원', color: summary.total_margin >= 0 ? '#059669' : '#dc2626' },
            { label: '마진율', value: fmtR(summary.margin_rate), color: summary.margin_rate >= 0 ? '#059669' : '#dc2626' },
          ].map(k => (
            <div key={k.label} className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {summary && (summary.bom_missing_count > 0 || summary.bom_ok_count === 0) && (
        <div className="card" style={{ background: '#fffbeb', border: '1px solid #f59e0b', marginBottom: 16, padding: '10px 16px', fontSize: 13 }}>
          ⚠️ BOM 미등록 {summary.bom_missing_count}건 — 해당 품목은 원자재비·재고 차감 없이 계산됩니다. 마스터 &gt; BOM 등록을 확인하세요.
        </div>
      )}

      {/* 상세 테이블 */}
      <div className="card">
        <h4 style={{ marginBottom: 12 }}>품목별 원가 · 마진 상세</h4>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>품번</th>
                <th>품명</th>
                <th style={{ textAlign: 'right' }}>실적수량</th>
                <th style={{ textAlign: 'right' }}>원자재비</th>
                <th style={{ textAlign: 'right' }}>공수비</th>
                <th style={{ textAlign: 'right' }}>매출</th>
                <th style={{ textAlign: 'right' }}>마진</th>
                <th style={{ textAlign: 'right' }}>마진율</th>
                <th>BOM</th>
                <th>공수표준</th>
                <th>재고차감</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={12} className="empty">데이터 없음</td></tr>}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 12 }}>{r.prod_date}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.part_no}</td>
                  <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.part_name || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.actual_qty?.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: '#dc2626' }}>{fmt(r.material_cost)}</td>
                  <td style={{ textAlign: 'right', color: '#d97706' }}>{fmt(r.labor_cost)}</td>
                  <td style={{ textAlign: 'right', color: '#059669' }}>{fmt(r.revenue)}</td>
                  <td style={{ textAlign: 'right', color: r.margin >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>{fmt(r.margin)}</td>
                  <td style={{ textAlign: 'right', color: r.margin_rate >= 0 ? '#059669' : '#dc2626' }}>{fmtR(r.margin_rate)}</td>
                  <td style={{ textAlign: 'center' }}>{r.bom_ok ? '✅' : '❌'}</td>
                  <td style={{ textAlign: 'center' }}>{r.labor_ok ? '✅' : '❌'}</td>
                  <td style={{ textAlign: 'center' }}>{r.stock_deducted ? '✅' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const STATUS_BADGE = { '계획': 'badge-blue', '진행중': 'badge-amber', '완료': 'badge-green', '취소': 'badge-gray' }

const fmt = n => Number(n||0).toLocaleString()
const TYPE_COLOR = { raw:'#94a3b8', sub:'#94a3b8', outsourced:'#d97706', semi:'#7c3aed', finished:'#1d4ed8' }

function FeasibilityPanel() {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState({})

  const load = () => {
    setLoading(true)
    api.get('/production/orders/feasibility')
      .then(r => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const toggle = no => setExpanded(e => ({...e, [no]: !e[no]}))

  if (loading) return <div style={{textAlign:'center',padding:40,color:'#94a3b8'}}>분석 중...</div>
  if (!rows) return null

  const canMake  = rows.filter(r => r.available === true)
  const cantMake = rows.filter(r => r.available === false)
  const noBom    = rows.filter(r => r.available === null)

  return (
    <div style={{padding:'0 0 32px'}}>
      {/* KPI */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        {[
          {label:'즉시 생산 가능', val:`${canMake.length}건`, bg:'#f0fdf4',border:'#bbf7d0',color:'#15803d'},
          {label:'자재 부족', val:`${cantMake.length}건`, bg:'#fef2f2',border:'#fecaca',color:'#dc2626'},
          {label:'BOM 미등록', val:`${noBom.length}건`, bg:'#fefce8',border:'#fde68a',color:'#92400e'},
        ].map(({label,val,bg,border,color}) => (
          <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:8,padding:'10px 18px',minWidth:140}}>
            <div style={{fontSize:11,color,fontWeight:600,marginBottom:4}}>{label}</div>
            <div style={{fontSize:20,fontWeight:800,color}}>{val}</div>
          </div>
        ))}
        <button className="btn btn-sm btn-outline" style={{alignSelf:'center',marginLeft:'auto'}} onClick={load}>새로고침</button>
      </div>

      {/* 자재 부족 오더 */}
      {cantMake.length > 0 && (
        <>
          <div style={{fontWeight:700,fontSize:13,color:'#dc2626',marginBottom:8}}>⚠ 자재 부족 — 생산 불가 오더</div>
          {cantMake.map(order => (
            <div key={order.pord_no} style={{border:'1px solid #fecaca',borderRadius:8,marginBottom:10,overflow:'hidden'}}>
              <div style={{background:'#fef2f2',padding:'10px 14px',display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}
                onClick={() => toggle(order.pord_no)}>
                <span style={{fontFamily:'monospace',fontSize:12,color:'#dc2626',fontWeight:700}}>{order.pord_no}</span>
                <span style={{fontSize:13,fontWeight:600}}>{order.item_name}</span>
                <span style={{fontSize:12,color:'#64748b'}}>잔여 {fmt(order.remaining_qty)}EA</span>
                <span style={{fontSize:12,color:'#64748b'}}>{order.plan_date}</span>
                <span style={{fontSize:11,background:'#fecaca',color:'#dc2626',borderRadius:4,padding:'1px 6px',fontWeight:700}}>
                  부족 {order.shortage_items.length}개
                </span>
                <span style={{marginLeft:'auto',fontSize:12,color:'#94a3b8'}}>{expanded[order.pord_no] ? '▲' : '▼'}</span>
              </div>
              {expanded[order.pord_no] && (
                <div style={{padding:'0 0 8px'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr style={{background:'#f8fafc'}}>
                        <th style={{padding:'6px 14px',textAlign:'left',fontWeight:600,color:'#475569',borderBottom:'1px solid #e2e8f0'}}>품번</th>
                        <th style={{padding:'6px 8px',textAlign:'left',fontWeight:600,color:'#475569',borderBottom:'1px solid #e2e8f0'}}>품명</th>
                        <th style={{padding:'6px 8px',textAlign:'right',fontWeight:600,color:'#475569',borderBottom:'1px solid #e2e8f0'}}>소요량</th>
                        <th style={{padding:'6px 8px',textAlign:'right',fontWeight:600,color:'#475569',borderBottom:'1px solid #e2e8f0'}}>현재고</th>
                        <th style={{padding:'6px 8px',textAlign:'right',fontWeight:600,color:'#dc2626',borderBottom:'1px solid #e2e8f0'}}>부족량</th>
                        <th style={{padding:'6px 8px',textAlign:'center',borderBottom:'1px solid #e2e8f0'}}>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.components.map(c => (
                        <tr key={c.part_no} style={{background: c.ok ? '#fff' : '#fff5f5'}}>
                          <td style={{padding:'5px 14px',fontFamily:'monospace',fontSize:11,color: TYPE_COLOR[c.item_type]||'#475569'}}>{c.part_no}</td>
                          <td style={{padding:'5px 8px'}}>{c.item_name}</td>
                          <td style={{padding:'5px 8px',textAlign:'right'}}>{fmt(c.required_qty)} {c.unit}</td>
                          <td style={{padding:'5px 8px',textAlign:'right',color:c.current_stock>0?'#16a34a':'#94a3b8'}}>{fmt(c.current_stock)}</td>
                          <td style={{padding:'5px 8px',textAlign:'right',fontWeight:c.ok?400:700,color:c.ok?'#94a3b8':'#dc2626'}}>
                            {c.ok ? '—' : fmt(c.shortage_qty)}
                          </td>
                          <td style={{padding:'5px 8px',textAlign:'center'}}>
                            {c.ok
                              ? <span style={{fontSize:11,color:'#15803d',fontWeight:600}}>✓ 충족</span>
                              : <span style={{fontSize:11,color:'#dc2626',fontWeight:600}}>✗ 부족</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* 생산 가능 오더 */}
      {canMake.length > 0 && (
        <>
          <div style={{fontWeight:700,fontSize:13,color:'#15803d',marginBottom:8,marginTop:16}}>✓ 즉시 생산 가능 오더</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>오더번호</th><th>품번</th><th>품명</th><th style={{textAlign:'right'}}>잔여수량</th><th>계획일</th><th>상태</th></tr></thead>
              <tbody>
                {canMake.map(o => (
                  <tr key={o.pord_no}>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{o.pord_no}</td>
                    <td style={{fontSize:11}}>{o.part_no}</td>
                    <td>{o.item_name}</td>
                    <td style={{textAlign:'right'}}>{fmt(o.remaining_qty)}EA</td>
                    <td>{o.plan_date}</td>
                    <td><span className="badge badge-green">{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {noBom.length > 0 && (
        <>
          <div style={{fontWeight:700,fontSize:13,color:'#92400e',marginBottom:8,marginTop:16}}>BOM 미등록 오더</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {noBom.map(o => (
              <div key={o.pord_no} style={{background:'#fefce8',border:'1px solid #fde68a',borderRadius:6,padding:'6px 12px',fontSize:12}}>
                <span style={{fontFamily:'monospace',color:'#92400e'}}>{o.pord_no}</span>
                <span style={{color:'#64748b',marginLeft:8}}>{o.item_name}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {rows.length === 0 && (
        <div style={{textAlign:'center',color:'#94a3b8',padding:'60px 0'}}>진행중인 생산오더가 없습니다</div>
      )}
    </div>
  )
}

export default function Production() {
  const [orders, setOrders] = useState([])
  const [molds, setMolds] = useState([])
  const [tab, setTab] = useState('orders')
  const [showPord, setShowPord] = useState(false)
  const [showMold, setShowMold] = useState(false)
  const [resultPord, setResultPord] = useState(null)

  const load = useCallback(() => {
    api.get('/production/orders').then(r => setOrders(r.data)).catch(() => {})
    api.get('/production/molds').then(r => setMolds(r.data)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="erp-panel" style={{marginBottom:8}}>
        <div className="erp-actions">
          <div className="qdate-bar">
            {[['orders','생산오더'],['feasibility','가용성 검사'],['molds','금형 관리'],['upload','실적 업로드'],['cost','원가분석']].map(([v,l])=>(
              <button key={v} className={`qdate-btn${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
            ))}
          </div>
          <div className="spacer"/>
          {tab==='orders' && <button className="btn btn-sm btn-primary" onClick={()=>setShowPord(true)}>＋ 오더 등록</button>}
          {tab==='molds' && <button className="btn btn-sm btn-primary" onClick={()=>setShowMold(true)}>＋ 금형 등록</button>}
        </div>
      </div>

      {tab === 'orders' && (
        <>
        <div className="result-bar">
          <span className="result-bar-title">생산오더</span>
          <span className="result-bar-count">{orders.length}건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>오더번호</th><th>품번</th><th>계획수량</th><th>실적수량</th><th>금형</th><th>계획일</th><th>상태</th><th>실적등록</th></tr></thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={8} className="empty">생산오더 없음</td></tr>}
              {orders.map(o => (
                <tr key={o.pord_no}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.pord_no}</td>
                  <td>{o.part_no}</td>
                  <td>{o.planned_qty?.toLocaleString()}</td>
                  <td>{o.actual_qty != null ? o.actual_qty.toLocaleString() : '—'}</td>
                  <td>{o.mold_no || '—'}</td>
                  <td>{o.plan_date}</td>
                  <td><span className={`badge ${STATUS_BADGE[o.status] || 'badge-gray'}`}>{o.status}</span></td>
                  <td>{(o.status === '계획' || o.status === '진행중') && <button className="btn btn-sm btn-primary" onClick={() => setResultPord(o)}>실적</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === 'feasibility' && <FeasibilityPanel />}

      {tab === 'molds' && (
        <>
        <div className="result-bar">
          <span className="result-bar-title">금형 관리</span>
          <span className="result-bar-count">{molds.length}건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>금형번호</th><th>소유자</th><th>해당품번</th><th>보관위치</th><th>누적샷수</th><th>상태</th></tr></thead>
            <tbody>
              {molds.length === 0 && <tr><td colSpan={6} className="empty">금형 없음</td></tr>}
              {molds.map(m => (
                <tr key={m.mold_no}>
                  <td style={{ fontFamily: 'monospace' }}>{m.mold_no}</td>
                  <td>{m.owner}</td>
                  <td>{m.part_no}</td>
                  <td>{m.location || '—'}</td>
                  <td>{m.total_shots?.toLocaleString()}</td>
                  <td><span className={`badge ${m.status === '정상' ? 'badge-green' : m.status === '수리중' ? 'badge-amber' : 'badge-gray'}`}>{m.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === 'upload' && <ExcelUpload onDone={load} />}
      {tab === 'cost' && <CostAnalysis />}

      {showPord && <PordModal onClose={() => setShowPord(false)} onSaved={() => { setShowPord(false); load() }} />}
      {showMold && <MoldModal onClose={() => setShowMold(false)} onSaved={() => { setShowMold(false); load() }} />}
      {resultPord && <ResultModal pord={resultPord} onClose={() => setResultPord(null)} onSaved={() => { setResultPord(null); load() }} />}
    </div>
  )
}
