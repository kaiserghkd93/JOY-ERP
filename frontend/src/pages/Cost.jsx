import { useState, useEffect, useCallback } from 'react'
import api from '../api'

const now = new Date()
const CUR_YEAR  = now.getFullYear()
const CUR_MONTH = now.getMonth() + 1

const OVERHEAD_CATS = ['전기세', '감가상각', '소모품', '기타']

export default function Cost() {
  const [tab, setTab] = useState('labor')

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          ['labor',    '임률 마스터'],
          ['stdcost',  '표준공수'],
          ['overhead', '월별 경비'],
          ['calc',     '원가 조회'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '7px 18px', fontSize: 13, cursor: 'pointer', border: 'none',
              background: tab === key ? '#c8102e' : '#1e293b',
              color: tab === key ? '#fff' : '#94a3b8',
              fontFamily: 'inherit', letterSpacing: 1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'labor'    && <LaborTab />}
      {tab === 'stdcost'  && <StdCostTab />}
      {tab === 'overhead' && <OverheadTab />}
      {tab === 'calc'     && <CalcTab />}
    </div>
  )
}


/* ── 임률 마스터 ─────────────────────────────────────────────────── */
function LaborTab() {
  const [rows, setRows]   = useState([])
  const [form, setForm]   = useState({ process_name: '', rate_per_hour: '', note: '', active: true })
  const [editId, setEditId] = useState(null)
  const [msg, setMsg]     = useState('')

  const load = useCallback(async () => {
    const r = await api.get('/cost/labor-rates')
    setRows(r.data)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.process_name || !form.rate_per_hour) return setMsg('공정명과 임률을 입력하세요')
    try {
      if (editId) {
        await api.put(`/cost/labor-rates/${editId}`, { ...form, rate_per_hour: parseFloat(form.rate_per_hour) })
      } else {
        await api.post('/cost/labor-rates', { ...form, rate_per_hour: parseFloat(form.rate_per_hour) })
      }
      setForm({ process_name: '', rate_per_hour: '', note: '', active: true })
      setEditId(null); setMsg('저장 완료'); load()
    } catch { setMsg('오류') }
  }

  const del = async (id) => {
    if (!confirm('삭제할까요?')) return
    await api.delete(`/cost/labor-rates/${id}`)
    load()
  }

  const startEdit = (r) => {
    setEditId(r.id)
    setForm({ process_name: r.process_name, rate_per_hour: r.rate_per_hour, note: r.note || '', active: r.active })
  }

  return (
    <div>
      <h3 style={{ color: '#e2e8f0', marginBottom: 16 }}>임률 마스터 (공정별 시간당 임률)</h3>

      {/* 입력폼 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input placeholder="공정명 (예: 사출성형)" value={form.process_name}
          onChange={e => setForm(f => ({...f, process_name: e.target.value}))}
          style={iStyle(160)} />
        <input placeholder="시간당 임률 (원)" type="number" value={form.rate_per_hour}
          onChange={e => setForm(f => ({...f, rate_per_hour: e.target.value}))}
          style={iStyle(160)} />
        <input placeholder="비고" value={form.note}
          onChange={e => setForm(f => ({...f, note: e.target.value}))}
          style={iStyle(200)} />
        <select value={form.active} onChange={e => setForm(f => ({...f, active: e.target.value === 'true'}))} style={iStyle(80)}>
          <option value="true">사용</option>
          <option value="false">중지</option>
        </select>
        <button onClick={save} style={btnStyle('#c8102e')}>{editId ? '수정' : '추가'}</button>
        {editId && <button onClick={() => { setEditId(null); setForm({ process_name: '', rate_per_hour: '', note: '', active: true }) }} style={btnStyle('#475569')}>취소</button>}
        {msg && <span style={{ color: '#94a3b8', fontSize: 12, alignSelf: 'center' }}>{msg}</span>}
      </div>

      <table style={tblStyle}>
        <thead>
          <tr>
            {['ID','공정명','시간당 임률','분당 임률','비고','상태',''].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={tdStyle}>{r.id}</td>
              <td style={tdStyle}>{r.process_name}</td>
              <td style={{...tdStyle, textAlign:'right'}}>{Number(r.rate_per_hour).toLocaleString()} 원/h</td>
              <td style={{...tdStyle, textAlign:'right', color:'#94a3b8'}}>{(r.rate_per_hour/60).toFixed(1)} 원/분</td>
              <td style={tdStyle}>{r.note || '-'}</td>
              <td style={{...tdStyle, color: r.active ? '#30d158' : '#ff3b30'}}>{r.active ? '사용' : '중지'}</td>
              <td style={tdStyle}>
                <button onClick={() => startEdit(r)} style={btnStyle('#334155', 11)}>수정</button>
                {' '}
                <button onClick={() => del(r.id)} style={btnStyle('#7f1d1d', 11)}>삭제</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} style={{...tdStyle, color:'#475569', textAlign:'center'}}>등록된 임률이 없습니다</td></tr>}
        </tbody>
      </table>
    </div>
  )
}


/* ── 표준공수 ─────────────────────────────────────────────────────── */
function StdCostTab() {
  const [rows, setRows]     = useState([])
  const [rates, setRates]   = useState([])
  const [items, setItems]   = useState([])
  const [form, setForm]     = useState({ part_no: '', process_id: '', std_labor_min: '', note: '' })
  const [msg, setMsg]       = useState('')

  const load = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      api.get('/cost/product-cost-std'),
      api.get('/cost/labor-rates'),
      api.get('/master/items'),
    ])
    setRows(r1.data)
    setRates(r2.data.filter(r => r.active))
    setItems(r3.data.filter(i => i.active))
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.part_no || !form.process_id || !form.std_labor_min) return setMsg('품목, 공정, 공수를 모두 입력하세요')
    try {
      await api.post('/cost/product-cost-std', {
        part_no: form.part_no,
        process_id: parseInt(form.process_id),
        std_labor_min: parseFloat(form.std_labor_min),
        note: form.note || null,
      })
      setForm({ part_no: '', process_id: '', std_labor_min: '', note: '' })
      setMsg('저장 완료'); load()
    } catch { setMsg('오류') }
  }

  const del = async (id) => {
    if (!confirm('삭제?')) return
    await api.delete(`/cost/product-cost-std/${id}`)
    load()
  }

  const selectedRate = rates.find(r => r.id === parseInt(form.process_id))
  const previewCost = selectedRate && form.std_labor_min
    ? (parseFloat(form.std_labor_min) / 60 * selectedRate.rate_per_hour).toFixed(0)
    : null

  return (
    <div>
      <h3 style={{ color: '#e2e8f0', marginBottom: 8 }}>표준공수 — 제품별 노무비 기준</h3>
      <p style={{ color: '#64748b', fontSize: 12, marginBottom: 16 }}>노무비 = 표준공수(분) ÷ 60 × 시간당 임률</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={form.part_no} onChange={e => setForm(f => ({...f, part_no: e.target.value}))} style={iStyle(220)}>
          <option value="">품목 선택</option>
          {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
        </select>
        <select value={form.process_id} onChange={e => setForm(f => ({...f, process_id: e.target.value}))} style={iStyle(160)}>
          <option value="">공정 선택</option>
          {rates.map(r => <option key={r.id} value={r.id}>{r.process_name} ({Number(r.rate_per_hour).toLocaleString()}원/h)</option>)}
        </select>
        <input placeholder="표준공수 (분/EA)" type="number" step="0.1" value={form.std_labor_min}
          onChange={e => setForm(f => ({...f, std_labor_min: e.target.value}))}
          style={iStyle(140)} />
        <input placeholder="비고" value={form.note}
          onChange={e => setForm(f => ({...f, note: e.target.value}))}
          style={iStyle(160)} />
        <button onClick={save} style={btnStyle('#c8102e')}>저장</button>
        {previewCost && (
          <span style={{ color: '#0a84ff', fontSize: 12, alignSelf: 'center' }}>
            → 노무비 약 {Number(previewCost).toLocaleString()} 원/EA
          </span>
        )}
        {msg && <span style={{ color: '#94a3b8', fontSize: 12, alignSelf: 'center' }}>{msg}</span>}
      </div>

      <table style={tblStyle}>
        <thead>
          <tr>
            {['품번','품명','공정','시간당임률','표준공수(분)','노무비/EA','비고',''].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const labor = r.rate_per_hour ? (r.std_labor_min / 60 * r.rate_per_hour) : 0
            return (
              <tr key={r.id}>
                <td style={{...tdStyle, color:'#94a3b8'}}>{r.part_no}</td>
                <td style={tdStyle}>{r.item_name || '-'}</td>
                <td style={tdStyle}>{r.process_name || '-'}</td>
                <td style={{...tdStyle, textAlign:'right'}}>{r.rate_per_hour ? Number(r.rate_per_hour).toLocaleString() + ' 원/h' : '-'}</td>
                <td style={{...tdStyle, textAlign:'right'}}>{r.std_labor_min} 분</td>
                <td style={{...tdStyle, textAlign:'right', color:'#0a84ff', fontWeight:600}}>{labor.toLocaleString('ko', {maximumFractionDigits:0})} 원</td>
                <td style={tdStyle}>{r.note || '-'}</td>
                <td style={tdStyle}><button onClick={() => del(r.id)} style={btnStyle('#7f1d1d', 11)}>삭제</button></td>
              </tr>
            )
          })}
          {rows.length === 0 && <tr><td colSpan={8} style={{...tdStyle, color:'#475569', textAlign:'center'}}>등록된 표준공수가 없습니다</td></tr>}
        </tbody>
      </table>
    </div>
  )
}


/* ── 월별 경비 ───────────────────────────────────────────────────── */
function OverheadTab() {
  const [year, setYear]   = useState(CUR_YEAR)
  const [month, setMonth] = useState(CUR_MONTH)
  const [rows, setRows]   = useState([])
  const [form, setForm]   = useState({ category: '전기세', amount: '', note: '' })
  const [editId, setEditId] = useState(null)
  const [msg, setMsg]     = useState('')

  const load = useCallback(async () => {
    const r = await api.get(`/cost/overhead?year=${year}&month=${month}`)
    setRows(r.data)
  }, [year, month])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.amount) return setMsg('금액을 입력하세요')
    try {
      const body = { year, month, category: form.category, amount: parseFloat(form.amount), note: form.note || null }
      if (editId) {
        await api.put(`/cost/overhead/${editId}`, body)
      } else {
        await api.post('/cost/overhead', body)
      }
      setForm({ category: '전기세', amount: '', note: '' })
      setEditId(null); setMsg('저장 완료'); load()
    } catch { setMsg('오류') }
  }

  const del = async (id) => {
    if (!confirm('삭제?')) return
    await api.delete(`/cost/overhead/${id}`)
    load()
  }

  const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0)

  return (
    <div>
      <h3 style={{ color: '#e2e8f0', marginBottom: 16 }}>월별 제조경비 입력</h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <select value={year} onChange={e => setYear(+e.target.value)} style={iStyle(80)}>
          {[CUR_YEAR-1, CUR_YEAR, CUR_YEAR+1].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={iStyle(70)}>
          {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} style={iStyle(120)}>
          {OVERHEAD_CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="금액 (원)" type="number" value={form.amount}
          onChange={e => setForm(f => ({...f, amount: e.target.value}))}
          style={iStyle(160)} />
        <input placeholder="비고 (예: 7월 전기요금)" value={form.note}
          onChange={e => setForm(f => ({...f, note: e.target.value}))}
          style={iStyle(220)} />
        <button onClick={save} style={btnStyle('#c8102e')}>{editId ? '수정' : '추가'}</button>
        {editId && <button onClick={() => { setEditId(null); setForm({ category: '전기세', amount: '', note: '' }) }} style={btnStyle('#475569')}>취소</button>}
        {msg && <span style={{ color: '#94a3b8', fontSize: 12, alignSelf: 'center' }}>{msg}</span>}
      </div>

      <table style={tblStyle}>
        <thead>
          <tr>
            {['구분','금액','비고',''].map(h => <th key={h} style={thStyle}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={tdStyle}>{r.category}</td>
              <td style={{...tdStyle, textAlign:'right', fontWeight:600}}>{Number(r.amount).toLocaleString()} 원</td>
              <td style={tdStyle}>{r.note || '-'}</td>
              <td style={tdStyle}>
                <button onClick={() => { setEditId(r.id); setForm({ category: r.category, amount: r.amount, note: r.note || '' }) }} style={btnStyle('#334155', 11)}>수정</button>
                {' '}
                <button onClick={() => del(r.id)} style={btnStyle('#7f1d1d', 11)}>삭제</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} style={{...tdStyle, color:'#475569', textAlign:'center'}}>등록된 경비가 없습니다</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td style={{...tdStyle, fontWeight:700, color:'#e2e8f0', background:'#1e293b'}}>합계</td>
              <td style={{...tdStyle, textAlign:'right', fontWeight:700, color:'#ff9f0a', background:'#1e293b'}}>{total.toLocaleString()} 원</td>
              <td colSpan={2} style={{...tdStyle, background:'#1e293b'}}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}


/* ── 원가 조회 ────────────────────────────────────────────────────── */
function CalcTab() {
  const [year, setYear]   = useState(CUR_YEAR)
  const [month, setMonth] = useState(CUR_MONTH)
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)

  const calc = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/cost/calculate?year=${year}&month=${month}`)
      setData(r.data)
    } catch { alert('조회 실패') }
    finally { setLoading(false) }
  }

  return (
    <div>
      <h3 style={{ color: '#e2e8f0', marginBottom: 16 }}>제조원가 조회 (재료비 + 노무비 + 경비)</h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <select value={year} onChange={e => setYear(+e.target.value)} style={iStyle(80)}>
          {[CUR_YEAR-1, CUR_YEAR, CUR_YEAR+1].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={iStyle(70)}>
          {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <button onClick={calc} disabled={loading} style={btnStyle('#c8102e')}>
          {loading ? '계산 중...' : '원가 계산'}
        </button>
      </div>

      {data && (
        <>
          {/* 요약 카드 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <Card label="월 총 경비" value={`${Number(data.total_overhead).toLocaleString()} 원`} color="#ff9f0a" />
            <Card label="월 총 생산수량" value={`${Number(data.total_actual_qty).toLocaleString()} EA`} color="#0a84ff" />
            {Object.entries(data.overhead_by_category).map(([cat, amt]) => (
              <Card key={cat} label={cat} value={`${Number(amt).toLocaleString()} 원`} color="#8e8e93" />
            ))}
          </div>

          <table style={tblStyle}>
            <thead>
              <tr>
                {['품번','품명','공정','생산실적','재료비/EA','노무비/EA','경비배부/EA','총원가/EA'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map(r => (
                <tr key={r.part_no}>
                  <td style={{...tdStyle, color:'#94a3b8'}}>{r.part_no}</td>
                  <td style={tdStyle}>{r.item_name}</td>
                  <td style={{...tdStyle, color:'#64748b'}}>{r.process_name || '미등록'}</td>
                  <td style={{...tdStyle, textAlign:'right'}}>{r.actual_qty.toLocaleString()} EA</td>
                  <td style={{...tdStyle, textAlign:'right'}}>{Number(r.mat_cost).toLocaleString()} 원</td>
                  <td style={{...tdStyle, textAlign:'right', color: r.labor_cost > 0 ? '#30d158' : '#475569'}}>
                    {r.labor_cost > 0 ? Number(r.labor_cost).toLocaleString() + ' 원' : '미등록'}
                  </td>
                  <td style={{...tdStyle, textAlign:'right', color: r.overhead_per_unit > 0 ? '#ff9f0a' : '#475569'}}>
                    {r.overhead_per_unit > 0 ? Number(r.overhead_per_unit).toLocaleString() + ' 원' : '-'}
                  </td>
                  <td style={{...tdStyle, textAlign:'right', fontWeight:700, color:'#0a84ff'}}>
                    {Number(r.total_cost).toLocaleString()} 원
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td colSpan={8} style={{...tdStyle, color:'#475569', textAlign:'center'}}>해당 월 생산 데이터 없음</td></tr>
              )}
            </tbody>
          </table>

          <p style={{ color: '#475569', fontSize: 11, marginTop: 12 }}>
            * 경비 배부 기준: 품목 생산수량 / 전체 생산수량 × 월 총 경비<br/>
            * 노무비가 '미등록'인 품목은 표준공수 탭에서 등록 필요
          </p>
        </>
      )}
    </div>
  )
}


function Card({ label, value, color }) {
  return (
    <div style={{ background: '#1e293b', padding: '12px 20px', minWidth: 160, borderLeft: `3px solid ${color}` }}>
      <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  )
}


/* ── 공통 스타일 ─────────────────────────────────────────────────── */
const tblStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const thStyle  = { background: '#1e293b', color: '#94a3b8', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }
const tdStyle  = { padding: '8px 10px', borderBottom: '1px solid #1e293b', color: '#cbd5e1' }

const iStyle = (w) => ({
  width: w, padding: '7px 10px', background: '#1e293b', border: '1px solid #334155',
  color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none',
})

const btnStyle = (bg, fs = 13) => ({
  padding: fs === 11 ? '4px 10px' : '7px 16px', background: bg, color: '#fff',
  border: 'none', cursor: 'pointer', fontSize: fs, fontFamily: 'inherit',
})
