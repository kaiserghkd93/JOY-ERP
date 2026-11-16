import { useEffect, useState } from 'react'
import api from '../api'

const TABS = [
  { k: 'orders', label: '📋 발주 현황' },
  { k: 'deliver', label: '📦 납품 등록' },
  { k: 'history', label: '📜 납품 이력' },
  { k: 'ncr', label: '⚠️ NCR' },
]

/* ── 발주 현황 + 납기 회신 ─────────────────────────────── */
function OrdersTab() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [ackModal, setAckModal] = useState(null)
  const [ackForm, setAckForm] = useState({ ack_status: 'possible', ack_date: '', ack_note: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get('/portal/orders').then(r => setOrders(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const openAck = (po) => {
    setAckModal(po)
    const d = new Date(); d.setDate(d.getDate() + 3)
    const def = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    setAckForm({ ack_status: 'possible', ack_date: def, ack_note: '' })
  }

  const submitAck = async () => {
    if (!ackForm.ack_date) return alert('회신 납기일을 입력하세요')
    setSubmitting(true)
    try {
      await api.post(`/portal/orders/${ackModal.po_no}/ack`, ackForm)
      alert('납기 회신이 완료되었습니다')
      setAckModal(null)
      api.get('/portal/orders').then(r => setOrders(r.data)).catch(() => {})
    } catch (e) {
      alert('회신 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>미납 발주 현황</div>
      {orders.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>발주 없음</div>
      ) : (
        <table className="table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>발주번호</th><th>품번</th><th>품명</th>
              <th style={{ textAlign: 'right' }}>발주량</th>
              <th style={{ textAlign: 'right' }}>미납</th>
              <th>납기요청일</th>
              <th>상태</th>
              <th>납기 회신</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const hasAck = o.note && o.note.includes('[협력사회신]')
              return (
                <tr key={o.po_no}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{o.po_no}</td>
                  <td style={{ fontSize: 11 }}>{o.part_no}</td>
                  <td>{o.part_name}</td>
                  <td style={{ textAlign: 'right' }}>{(o.order_qty||0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                    {(o.remaining_qty||0).toLocaleString()}
                  </td>
                  <td>{o.due_date || '—'}</td>
                  <td>
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 600,
                      background: o.status === 'closed' ? '#dcfce7' : o.status === 'partial' ? '#fef3c7' : '#dbeafe',
                      color: o.status === 'closed' ? '#15803d' : o.status === 'partial' ? '#92400e' : '#1d4ed8',
                    }}>{o.status}</span>
                  </td>
                  <td>
                    <button
                      onClick={() => openAck(o)}
                      style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                        background: hasAck ? '#f0fdf4' : '#1d4ed8',
                        color: hasAck ? '#15803d' : '#fff',
                        border: hasAck ? '1px solid #86efac' : 'none',
                        fontWeight: 600,
                      }}
                    >{hasAck ? '✓ 회신완료' : '납기 회신'}</button>
                  </td>
                  <td style={{ fontSize: 11, color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.note ? o.note.replace(/\[협력사회신\][^\n]*/g, '').trim() || '—' : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* 납기 회신 모달 */}
      {ackModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>납기 회신</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16, background: '#f8fafc', borderRadius: 6, padding: '8px 12px' }}>
              <div><strong>발주번호:</strong> {ackModal.po_no}</div>
              <div><strong>품명:</strong> {ackModal.part_name}</div>
              <div><strong>발주량:</strong> {(ackModal.order_qty||0).toLocaleString()}개</div>
              <div><strong>요청 납기:</strong> {ackModal.due_date || '—'}</div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>회신 상태</label>
              <select className="form-control" value={ackForm.ack_status}
                onChange={e => setAckForm(f => ({ ...f, ack_status: e.target.value }))}>
                <option value="possible">납기 가능</option>
                <option value="partial">부분 납품 가능</option>
                <option value="impossible">납기 불가</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>회신 납기일</label>
              <input type="date" className="form-control" value={ackForm.ack_date}
                onChange={e => setAckForm(f => ({ ...f, ack_date: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>메모 (선택)</label>
              <input className="form-control" value={ackForm.ack_note}
                onChange={e => setAckForm(f => ({ ...f, ack_note: e.target.value }))}
                placeholder="납기 지연 사유, 부분 납품 수량 등" />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setAckModal(null)} style={{ flex: 1 }}>취소</button>
              <button disabled={submitting} onClick={submitAck}
                style={{ flex: 2, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '8px', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? '전송 중...' : '회신 전송'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 납품 등록 ──────────────────────────────────────────── */
function DeliverTab() {
  const [orders, setOrders] = useState([])
  const [form, setForm] = useState({ po_no: '', part_no: '', qty: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/portal/orders').then(r => setOrders(r.data)).catch(() => {})
  }, [])

  const selectedOrder = orders.find(o => o.po_no === form.po_no)

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.po_no || !form.qty) return alert('발주번호와 납품수량을 입력하세요')
    setSubmitting(true)
    try {
      await api.post('/portal/deliver', {
        po_no: form.po_no,
        part_no: form.part_no || selectedOrder?.part_no,
        qty: Number(form.qty),
        note: form.note || null,
      })
      setMsg('✅ 납품 등록이 완료되었습니다. 수입검사 후 입고 처리됩니다.')
      setForm({ po_no: '', part_no: '', qty: '', note: '' })
    } catch (e) {
      alert('납품 등록 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>납품 등록</div>
      {msg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#15803d' }}>
          {msg}
        </div>
      )}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>발주번호 선택</label>
          <select className="form-control" value={form.po_no}
            onChange={e => {
              const sel = orders.find(o => o.po_no === e.target.value)
              setForm(f => ({ ...f, po_no: e.target.value, part_no: sel?.part_no || '' }))
            }}>
            <option value="">— 발주 선택 —</option>
            {orders.map(o => (
              <option key={o.po_no} value={o.po_no}>
                {o.po_no} · {o.part_name} (잔: {o.remaining_qty}개)
              </option>
            ))}
          </select>
        </div>

        {selectedOrder && (
          <div style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12 }}>
            <div><strong>품번:</strong> {selectedOrder.part_no} &nbsp; <strong>품명:</strong> {selectedOrder.part_name}</div>
            <div><strong>발주량:</strong> {selectedOrder.order_qty}개 &nbsp; <strong>잔여:</strong> {selectedOrder.remaining_qty}개</div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>납품수량</label>
          <input type="number" className="form-control" value={form.qty}
            onChange={e => setField('qty', e.target.value)} placeholder="납품 수량 입력" min="1" />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>비고 (선택)</label>
          <input className="form-control" value={form.note}
            onChange={e => setField('note', e.target.value)} placeholder="납품 관련 특이사항" />
        </div>

        <button disabled={submitting} onClick={submit}
          style={{ width: '100%', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 7, padding: '10px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? '처리 중...' : '납품 등록'}
        </button>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>
          납품 등록 후 수입검사를 거쳐 입고 처리됩니다
        </div>
      </div>
    </div>
  )
}

/* ── 납품 이력 ──────────────────────────────────────────── */
function HistoryTab() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/portal/history').then(r => setHistory(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>납품 이력</div>
      {history.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>납품 이력 없음</div>
      ) : (
        <table className="table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>입고번호</th><th>발주번호</th><th>품번</th><th>품명</th>
              <th style={{ textAlign: 'right' }}>납품량</th>
              <th>납품일</th>
              <th>검사상태</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{h.gr_no}</td>
                <td style={{ fontSize: 11 }}>{h.po_no}</td>
                <td style={{ fontSize: 11 }}>{h.part_no}</td>
                <td>{h.part_name}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{(h.qty||0).toLocaleString()}</td>
                <td>{h.receipt_date || '—'}</td>
                <td>
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 600,
                    background: h.insp_status === 'pass' ? '#dcfce7' : h.insp_status === 'fail' ? '#fee2e2' : '#fef3c7',
                    color: h.insp_status === 'pass' ? '#15803d' : h.insp_status === 'fail' ? '#dc2626' : '#92400e',
                  }}>{h.insp_status === 'pass' ? '합격' : h.insp_status === 'fail' ? '불합격' : '검사중'}</span>
                </td>
                <td style={{ fontSize: 11, color: '#64748b' }}>{h.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ── NCR ───────────────────────────────────────────────── */
function NcrTab() {
  const [ncrs, setNcrs] = useState([])
  const [loading, setLoading] = useState(true)
  const [appealModal, setAppealModal] = useState(null)
  const [appealNote, setAppealNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/portal/ncr').then(r => setNcrs(r.data)).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const submitAppeal = async () => {
    if (!appealNote.trim()) return alert('이의제기 내용을 입력하세요')
    setSubmitting(true)
    try {
      await api.post(`/portal/ncr/${appealModal.ncr_no}/appeal`, { note: appealNote })
      alert('이의제기가 접수되었습니다')
      setAppealModal(null)
      setAppealNote('')
      load()
    } catch (e) {
      alert('실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>부적합 보고서 (NCR)</div>
      {ncrs.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>NCR 없음</div>
      ) : (
        <table className="table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>NCR번호</th><th>품번</th><th>품명</th><th>불합격 사유</th>
              <th style={{ textAlign: 'right' }}>불합격량</th>
              <th>발생일</th><th>상태</th><th>이의제기</th>
            </tr>
          </thead>
          <tbody>
            {ncrs.map(n => (
              <tr key={n.ncr_no}>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{n.ncr_no}</td>
                <td style={{ fontSize: 11 }}>{n.part_no}</td>
                <td>{n.part_name}</td>
                <td style={{ color: '#dc2626' }}>{n.reason || '—'}</td>
                <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{(n.qty||0).toLocaleString()}</td>
                <td>{n.insp_date || '—'}</td>
                <td>
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 600,
                    background: n.status === 'closed' ? '#f1f5f9' : '#fee2e2',
                    color: n.status === 'closed' ? '#64748b' : '#dc2626',
                  }}>{n.status === 'closed' ? '종결' : '처리중'}</span>
                </td>
                <td>
                  {n.status !== 'closed' && (
                    <button onClick={() => { setAppealModal(n); setAppealNote('') }}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid #d97706', background: '#fff', color: '#d97706', cursor: 'pointer', fontWeight: 600 }}>
                      이의제기
                    </button>
                  )}
                  {n.appeal_note && (
                    <span style={{ fontSize: 11, color: '#16a34a', marginLeft: 4 }}>✓ 접수됨</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {appealModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>이의제기</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14, background: '#f8fafc', borderRadius: 6, padding: '8px 12px' }}>
              <div><strong>NCR번호:</strong> {appealModal.ncr_no}</div>
              <div><strong>불합격 사유:</strong> {appealModal.reason}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>이의제기 내용</label>
              <textarea className="form-control" rows={4} value={appealNote}
                onChange={e => setAppealNote(e.target.value)}
                placeholder="이의제기 사유 및 근거를 입력하세요" style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setAppealModal(null)} style={{ flex: 1 }}>취소</button>
              <button disabled={submitting} onClick={submitAppeal}
                style={{ flex: 2, background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, padding: '8px', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? '처리 중...' : '이의제기 접수'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 메인 포털 페이지 ─────────────────────────────────── */
export default function SupplierPortal() {
  const [tab, setTab] = useState('orders')
  const [user, setUser] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (stored) setUser(JSON.parse(stored))
  }, [])

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* 헤더 배너 */}
      <div style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', borderRadius: 12, padding: '18px 24px', marginBottom: 20, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>🏭 협력사 포털</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>
              {user?.display_name || user?.username || '협력사'} 님 환영합니다
            </div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, textAlign: 'right' }}>
            <div>조이산업 ERP</div>
            <div>납품·발주 관리 시스템</div>
          </div>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '9px 22px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: 'transparent',
            color: tab === t.k ? '#1d4ed8' : '#64748b',
            borderBottom: tab === t.k ? '2px solid #1d4ed8' : '2px solid transparent',
            marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'deliver' && <DeliverTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'ncr' && <NcrTab />}
    </div>
  )
}
