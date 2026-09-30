import { useEffect, useState, useCallback } from 'react'
import api from '../api'

function ClaimModal({ onClose, onSaved }) {
  const [partners, setPartners] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState({
    partner_id: '', part_no: '', occur_date: '', defect_type: '', defect_qty: '',
    m4_category: 'Material(자재)', why1: '', why2: '', why3: '', why4: '', why5: '',
    corrective_action: '', preventive_action: '',
  })

  useEffect(() => {
    api.get('/master/partners').then(r => setPartners(r.data))
    api.get('/master/items').then(r => setItems(r.data))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = async () => {
    await api.post('/quality/claims', { ...form, defect_qty: +form.defect_qty })
    onSaved()
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <h3>품질 클레임 등록</h3>
        <div className="grid-2">
          <div className="form-group">
            <label>외주처/고객</label>
            <select value={form.partner_id} onChange={e => set('partner_id', e.target.value)}>
              <option value="">선택</option>
              {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>품번</label>
            <select value={form.part_no} onChange={e => set('part_no', e.target.value)}>
              <option value="">선택</option>
              {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} — {i.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>발생일</label><input type="date" value={form.occur_date} onChange={e => set('occur_date', e.target.value)} /></div>
          <div className="form-group"><label>불량수량</label><input type="number" value={form.defect_qty} onChange={e => set('defect_qty', e.target.value)} /></div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>불량유형</label><input value={form.defect_type} onChange={e => set('defect_type', e.target.value)} placeholder="치수불량, 외관불량…" /></div>
          <div className="form-group">
            <label>4M 구분</label>
            <select value={form.m4_category} onChange={e => set('m4_category', e.target.value)}>
              <option>Material(자재)</option>
              <option>Machine(설비)</option>
              <option>Method(방법)</option>
              <option>Man(작업자)</option>
            </select>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <div className="section-title">5WHY 분석</div>
          {[1,2,3,4,5].map(n => (
            <div className="form-group" key={n}>
              <label>WHY {n}</label>
              <input value={form[`why${n}`]} onChange={e => set(`why${n}`, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="form-group"><label>시정조치</label><textarea rows={2} value={form.corrective_action} onChange={e => set('corrective_action', e.target.value)} /></div>
        <div className="form-group"><label>재발방지</label><textarea rows={2} value={form.preventive_action} onChange={e => set('preventive_action', e.target.value)} /></div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  )
}

const STATUS_BADGE = { '접수': 'badge-blue', '조사중': 'badge-amber', '완료': 'badge-green', '보류': 'badge-gray' }

export default function Quality() {
  const [claims, setClaims] = useState([])
  const [defectRates, setDefectRates] = useState([])
  const [tab, setTab] = useState('claims')
  const [showModal, setShowModal] = useState(false)
  const [detailClaim, setDetailClaim] = useState(null)

  const load = useCallback(() => {
    api.get('/quality/claims').then(r => setClaims(r.data)).catch(() => {})
    api.get('/quality/defect-rate').then(r => setDefectRates(r.data)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const updateStatus = async (claim_no, status) => {
    await api.patch(`/quality/claims/${claim_no}`, { status })
    load()
  }

  return (
    <div>
      <div className="toolbar">
        <button className={`btn ${tab === 'claims' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('claims')}>클레임 목록</button>
        <button className={`btn ${tab === 'rates' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('rates')}>외주처별 불량율</button>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ 클레임 등록</button>
      </div>

      {tab === 'claims' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>클레임번호</th><th>외주처</th><th>품번</th><th>발생일</th><th>불량유형</th><th>수량</th><th>4M</th><th>상태</th><th>처리</th></tr></thead>
            <tbody>
              {claims.length === 0 && <tr><td colSpan={9} className="empty">클레임 없음</td></tr>}
              {claims.map(c => (
                <tr key={c.claim_no}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.claim_no}</td>
                  <td>{c.partner_id}</td>
                  <td>{c.part_no}</td>
                  <td>{c.occur_date}</td>
                  <td>{c.defect_type}</td>
                  <td>{c.defect_qty}</td>
                  <td><span className="badge badge-purple">{c.m4_category?.split('(')[0]}</span></td>
                  <td><span className={`badge ${STATUS_BADGE[c.status] || 'badge-gray'}`}>{c.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-outline" onClick={() => setDetailClaim(c)}>상세</button>
                      {c.status === '접수' && <button className="btn btn-sm btn-primary" onClick={() => updateStatus(c.claim_no, '조사중')}>조사</button>}
                      {c.status === '조사중' && <button className="btn btn-sm btn-success" onClick={() => updateStatus(c.claim_no, '완료')}>완료</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rates' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>외주처</th><th>총검사수</th><th>불합격수</th><th>불량율</th></tr></thead>
            <tbody>
              {defectRates.length === 0 && <tr><td colSpan={4} className="empty">데이터 없음</td></tr>}
              {defectRates.map(r => (
                <tr key={r.partner_id}>
                  <td>{r.partner_name || r.partner_id}</td>
                  <td>{r.total_inspect?.toLocaleString()}</td>
                  <td style={{ color: 'var(--danger)' }}>{r.total_fail?.toLocaleString()}</td>
                  <td>
                    <span className={`badge ${r.defect_rate <= 1 ? 'badge-green' : r.defect_rate <= 5 ? 'badge-amber' : 'badge-red'}`}>
                      {r.defect_rate?.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <ClaimModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load() }} />}

      {detailClaim && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <h3>클레임 상세 — {detailClaim.claim_no}</h3>
            <table>
              <tbody>
                <tr><td style={{ width: 120, color: 'var(--text-sm)', fontSize: 12 }}>불량유형</td><td>{detailClaim.defect_type}</td></tr>
                <tr><td>4M 구분</td><td>{detailClaim.m4_category}</td></tr>
                <tr><td>WHY 1</td><td>{detailClaim.why1 || '—'}</td></tr>
                <tr><td>WHY 2</td><td>{detailClaim.why2 || '—'}</td></tr>
                <tr><td>WHY 3</td><td>{detailClaim.why3 || '—'}</td></tr>
                <tr><td>WHY 4</td><td>{detailClaim.why4 || '—'}</td></tr>
                <tr><td>WHY 5</td><td>{detailClaim.why5 || '—'}</td></tr>
                <tr><td>시정조치</td><td>{detailClaim.corrective_action || '—'}</td></tr>
                <tr><td>재발방지</td><td>{detailClaim.preventive_action || '—'}</td></tr>
              </tbody>
            </table>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDetailClaim(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
