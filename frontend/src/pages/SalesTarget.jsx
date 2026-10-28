import { useEffect, useState, useRef } from 'react'
import api from '../api'

export default function SalesTarget() {
  const now = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [rows, setRows]       = useState([])
  const [edited, setEdited]   = useState({})   // { partner_id: amount_string }
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    setEdited({})
    api.get(`/sales-targets?year=${year}&month=${month}`)
      .then(r => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year, month])

  const handleChange = (partnerId, val) => {
    setEdited(prev => ({ ...prev, [partnerId]: val }))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    const dirty = Object.keys(edited)
    try {
      await Promise.all(dirty.map(pid =>
        api.put(`/sales-targets/${pid}?year=${year}&month=${month}`, {
          target_amount: Number(String(edited[pid]).replace(/,/g, '')) || 0,
        })
      ))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      load()
    } finally {
      setSaving(false)
    }
  }

  const getValue = (row) => {
    if (edited[row.partner_id] !== undefined) return edited[row.partner_id]
    return row.target_amount > 0 ? String(row.target_amount) : ''
  }

  const hasEdits = Object.keys(edited).length > 0

  const totalTarget = rows.reduce((s, r) => {
    const v = edited[r.partner_id] !== undefined
      ? Number(String(edited[r.partner_id]).replace(/,/g, ''))
      : r.target_amount
    return s + (isNaN(v) ? 0 : v)
  }, 0)

  return (
    <div>
      <div className="erp-panel" style={{marginBottom:8}}>
        <div className="erp-grid-2" style={{gridTemplateColumns:'auto 1fr auto 1fr'}}>
          <div className="erp-label">연도</div>
          <div className="erp-value">
            <select value={year} onChange={e=>setYear(+e.target.value)} style={{border:'none',background:'transparent',fontSize:13}}>
              {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="erp-label">월</div>
          <div className="erp-value">
            <select value={month} onChange={e=>setMonth(+e.target.value)} style={{border:'none',background:'transparent',fontSize:13}}>
              {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
        </div>
        <div className="erp-actions">
          <button className="btn btn-sm btn-outline" onClick={load} disabled={loading}>{loading?'...':'⟳ 불러오기'}</button>
          <div className="spacer"/>
          <span style={{fontSize:12,color:'var(--text-sm)'}}>목표 합계: <strong>₩{Math.round(totalTarget).toLocaleString()}</strong></span>
          <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving||!hasEdits}>
            {saving?'저장 중...':saved?'✓ 저장완료':'저장'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="section-title" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          {year}년 {month}월 거래처별 매출 목표 설정
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>거래처 ID</th>
                <th>거래처명</th>
                <th className="text-right">목표 매출 (원)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={3} className="text-center text-muted">
                  {loading ? '불러오는 중...' : '등록된 고객 거래처가 없습니다.'}
                </td></tr>
              )}
              {rows.map(row => (
                <tr key={row.partner_id}>
                  <td>{row.partner_id}</td>
                  <td style={{ fontWeight: 600 }}>{row.partner_name}</td>
                  <td className="text-right" style={{ padding: '4px 8px' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      style={{
                        width: 160, textAlign: 'right',
                        border: edited[row.partner_id] !== undefined
                          ? '1px solid var(--primary)' : '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: '3px 8px', fontSize: 13,
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                      value={getValue(row)}
                      placeholder="0"
                      onChange={e => handleChange(row.partner_id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--bg)' }}>
                  <td colSpan={2} style={{ paddingLeft: 10 }}>합계</td>
                  <td className="text-right" style={{ color: 'var(--primary)' }}>
                    ₩{Math.round(totalTarget).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
