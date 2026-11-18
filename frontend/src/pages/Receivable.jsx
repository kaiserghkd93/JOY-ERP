import { useState, useEffect, useCallback } from 'react'
import { getUser } from '../auth'

const API = import.meta.env.VITE_API_URL || ''
const tok = () => sessionStorage.getItem('jwt_token') || ''
const hdr = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` })

function fmt(n) { return Number(n || 0).toLocaleString() }
function fmtDate(s) { return s ? s.slice(0, 10) : '—' }

const AGING_COLORS = {
  '미도래':    { bg: '#f0fdf4', color: '#15803d' },
  '0-30일':   { bg: '#fef9c3', color: '#854d0e' },
  '31-60일':  { bg: '#fef3c7', color: '#92400e' },
  '61-90일':  { bg: '#ffedd5', color: '#c2410c' },
  '90일 초과': { bg: '#fee2e2', color: '#dc2626' },
  '완납':      { bg: '#f0fdf4', color: '#15803d' },
}

function AgingBadge({ bucket, amount }) {
  const c = AGING_COLORS[bucket] || { bg: '#f1f5f9', color: '#475569' }
  if (amount !== undefined && amount <= 0 && bucket !== '완납') return null
  return (
    <span style={{
      background: c.bg, color: c.color,
      padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>{bucket}</span>
  )
}

// ── 미수금 현황 탭 ────────────────────────────────────────────────
function SummaryTab({ onSelectPartner }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/receivable/summary`, { headers: hdr() })
      if (res.ok) setRows(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => !search || r.partner_name.includes(search))
  const totals = filtered.reduce((acc, r) => ({
    invoiced: acc.invoiced + r.total_invoiced,
    paid: acc.paid + r.total_paid,
    outstanding: acc.outstanding + r.outstanding,
    '미도래': acc['미도래'] + (r.aging['미도래'] || 0),
    '0-30일': acc['0-30일'] + (r.aging['0-30일'] || 0),
    '31-60일': acc['31-60일'] + (r.aging['31-60일'] || 0),
    '61-90일': acc['61-90일'] + (r.aging['61-90일'] || 0),
    '90일 초과': acc['90일 초과'] + (r.aging['90일 초과'] || 0),
  }), { invoiced: 0, paid: 0, outstanding: 0, '미도래': 0, '0-30일': 0, '31-60일': 0, '61-90일': 0, '90일 초과': 0 })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="거래처 검색..."
          style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, width: 200 }}
        />
        <button className="btn-sm" onClick={load} disabled={loading}>↻ 새로고침</button>
        {loading && <span style={{ fontSize: 12, color: 'var(--text-xs)' }}>로딩 중...</span>}
      </div>

      {/* 에이징 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: '총 미수금', value: totals.outstanding, color: '#1e40af', bg: '#eff6ff' },
          { label: '미도래', value: totals['미도래'], ...AGING_COLORS['미도래'] },
          { label: '0-30일', value: totals['0-30일'], ...AGING_COLORS['0-30일'] },
          { label: '31-60일', value: totals['31-60일'], ...AGING_COLORS['31-60일'] },
          { label: '61-90일', value: totals['61-90일'], ...AGING_COLORS['61-90일'] },
          { label: '90일 초과', value: totals['90일 초과'], ...AGING_COLORS['90일 초과'] },
        ].map(c => (
          <div key={c.label} style={{
            background: c.bg, borderRadius: 10, padding: '12px 14px',
            border: `1px solid ${c.color}22`,
          }}>
            <div style={{ fontSize: 11, color: c.color, fontWeight: 700, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: c.color }}>₩{fmt(Math.round(c.value))}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>거래처</th>
              <th>결제조건</th>
              <th style={{ textAlign: 'right' }}>발행액</th>
              <th style={{ textAlign: 'right' }}>수금액</th>
              <th style={{ textAlign: 'right', color: '#1e40af' }}>미수금</th>
              <th style={{ textAlign: 'right' }}>미도래</th>
              <th style={{ textAlign: 'right' }}>0-30일</th>
              <th style={{ textAlign: 'right' }}>31-60일</th>
              <th style={{ textAlign: 'right' }}>61-90일</th>
              <th style={{ textAlign: 'right', color: '#dc2626' }}>90일+</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-xs)', padding: 24 }}>
                {search ? '검색 결과 없음' : '미수금 없음'}
              </td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.partner_id} style={{ cursor: 'pointer' }} onClick={() => onSelectPartner(r)}>
                <td style={{ fontWeight: 600 }}>{r.partner_name}</td>
                <td style={{ fontSize: 12, color: 'var(--text-xs)' }}>{r.payment_terms || '—'}</td>
                <td style={{ textAlign: 'right' }}>{fmt(Math.round(r.total_invoiced))}</td>
                <td style={{ textAlign: 'right', color: '#16a34a' }}>{fmt(Math.round(r.total_paid))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.outstanding > 0 ? '#1e40af' : '#16a34a' }}>
                  {fmt(Math.round(r.outstanding))}
                </td>
                {['미도래', '0-30일', '31-60일', '61-90일', '90일 초과'].map(b => (
                  <td key={b} style={{ textAlign: 'right', fontSize: 13 }}>
                    {r.aging[b] > 0 ? (
                      <span style={{ color: AGING_COLORS[b]?.color, fontWeight: 600 }}>
                        {fmt(Math.round(r.aging[b]))}
                      </span>
                    ) : <span style={{ color: 'var(--text-xs)' }}>—</span>}
                  </td>
                ))}
                <td>
                  <button
                    className="btn-sm btn-primary"
                    style={{ padding: '3px 10px', fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); onSelectPartner(r) }}
                  >수금 →</button>
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--table-head)' }}>
                <td colSpan={2} style={{ fontSize: 12, color: 'var(--text-xs)' }}>합 계</td>
                <td style={{ textAlign: 'right' }}>{fmt(Math.round(totals.invoiced))}</td>
                <td style={{ textAlign: 'right', color: '#16a34a' }}>{fmt(Math.round(totals.paid))}</td>
                <td style={{ textAlign: 'right', color: '#1e40af' }}>{fmt(Math.round(totals.outstanding))}</td>
                {['미도래', '0-30일', '31-60일', '61-90일', '90일 초과'].map(b => (
                  <td key={b} style={{ textAlign: 'right', color: AGING_COLORS[b]?.color }}>
                    {fmt(Math.round(totals[b]))}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── 수금 등록 탭 ──────────────────────────────────────────────────
function PaymentForm({ initialPartnerId, partners, onDone }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    partner_id: initialPartnerId || '',
    pay_date:   today,
    amount:     '',
    method:     '계좌이체',
    inv_no:     '',
    note:       '',
  })
  const [invoices, setInvoices] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!form.partner_id) { setInvoices([]); return }
    fetch(`${API}/receivable/invoices?partner_id=${encodeURIComponent(form.partner_id)}&unpaid_only=true`, { headers: hdr() })
      .then(r => r.ok ? r.json() : [])
      .then(setInvoices)
      .catch(() => setInvoices([]))
  }, [form.partner_id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.partner_id || !form.amount || Number(form.amount) <= 0) {
      setMsg('거래처와 수금액을 입력해주세요')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch(`${API}/receivable/payments`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          inv_no: form.inv_no || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
      setMsg(`✅ 수금 등록 완료 (${data.pay_no})`)
      setForm(f => ({ ...f, amount: '', inv_no: '', note: '' }))
      onDone?.()
    } catch (e) {
      setMsg('오류: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const selInv = invoices.find(i => i.inv_no === form.inv_no)

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 540 }}>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>수금 입력</div>

        <div style={{ display: 'grid', gap: 14 }}>
          <label>
            <div style={{ fontSize: 12, color: 'var(--text-xs)', marginBottom: 4 }}>거래처 *</div>
            <select
              value={form.partner_id}
              onChange={e => set('partner_id', e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13 }}
              required
            >
              <option value="">거래처 선택...</option>
              {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              <div style={{ fontSize: 12, color: 'var(--text-xs)', marginBottom: 4 }}>수금일 *</div>
              <input type="date" value={form.pay_date} onChange={e => set('pay_date', e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13 }}
                required />
            </label>
            <label>
              <div style={{ fontSize: 12, color: 'var(--text-xs)', marginBottom: 4 }}>수금 방법</div>
              <select value={form.method} onChange={e => set('method', e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13 }}>
                {['계좌이체', '현금', '어음', '카드', '상계'].map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
          </div>

          <label>
            <div style={{ fontSize: 12, color: 'var(--text-xs)', marginBottom: 4 }}>수금액 (원) *</div>
            <input
              type="number"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="0"
              style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 14, fontWeight: 600, textAlign: 'right' }}
              required
            />
          </label>

          {invoices.length > 0 && (
            <label>
              <div style={{ fontSize: 12, color: 'var(--text-xs)', marginBottom: 4 }}>연결 계산서 (선택)</div>
              <select value={form.inv_no} onChange={e => set('inv_no', e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13 }}>
                <option value="">계산서 선택 안 함</option>
                {invoices.map(i => (
                  <option key={i.inv_no} value={i.inv_no}>
                    {i.inv_no} · {fmtDate(i.issue_date)} · 미수 ₩{fmt(Math.round(i.outstanding))}
                  </option>
                ))}
              </select>
              {selInv && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-xs)', display: 'flex', gap: 12 }}>
                  <span>발행액 ₩{fmt(Math.round(selInv.amount))}</span>
                  <span>기수금 ₩{fmt(Math.round(selInv.paid))}</span>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>미수금 ₩{fmt(Math.round(selInv.outstanding))}</span>
                  <AgingBadge bucket={selInv.aging_bucket} />
                </div>
              )}
            </label>
          )}

          <label>
            <div style={{ fontSize: 12, color: 'var(--text-xs)', marginBottom: 4 }}>메모</div>
            <input
              value={form.note}
              onChange={e => set('note', e.target.value)}
              placeholder="입금 메모..."
              style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13 }}
            />
          </label>
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '10px 28px', background: '#1e40af', color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >{saving ? '등록 중...' : '수금 등록'}</button>
          {msg && (
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: msg.startsWith('✅') ? '#16a34a' : '#dc2626',
            }}>{msg}</span>
          )}
        </div>
      </div>
    </form>
  )
}

// ── 수금 이력 탭 ──────────────────────────────────────────────────
function PaymentHistory({ partnerId, refresh }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = partnerId ? `?partner_id=${encodeURIComponent(partnerId)}` : ''
    try {
      const res = await fetch(`${API}/receivable/payments${qs}`, { headers: hdr() })
      if (res.ok) setRows(await res.json())
    } finally { setLoading(false) }
  }, [partnerId, refresh])

  useEffect(() => { load() }, [load])

  const handleCancel = async (pay_no) => {
    if (!window.confirm(`수금 전표 ${pay_no}를 취소하시겠습니까?`)) return
    setCancelling(pay_no)
    try {
      const res = await fetch(`${API}/receivable/payments/${pay_no}/cancel`, {
        method: 'PATCH', headers: hdr(),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || '취소 실패')
      }
      load()
    } catch (e) {
      alert('오류: ' + e.message)
    } finally { setCancelling(null) }
  }

  const normal = rows.filter(r => r.status === '정상')
  const total = normal.reduce((s, r) => s + r.amount, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-xs)' }}>
          수금 {normal.length}건 &nbsp;|&nbsp; 합계 <strong style={{ color: '#16a34a' }}>₩{fmt(Math.round(total))}</strong>
        </span>
        <button className="btn-sm" onClick={load} disabled={loading}>↻ 새로고침</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>수금번호</th><th>거래처</th><th>수금일</th>
              <th style={{ textAlign: 'right' }}>수금액</th>
              <th>방법</th><th>연결 계산서</th><th>메모</th><th>상태</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text-xs)' }}>로딩 중...</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text-xs)' }}>수금 이력 없음</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.pay_no} style={{ opacity: r.status === '취소' ? 0.45 : 1 }}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.pay_no}</td>
                <td style={{ fontWeight: 600 }}>{r.partner_name}</td>
                <td>{fmtDate(r.pay_date)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.status === '취소' ? 'var(--text-xs)' : '#1e40af' }}>
                  {r.status === '취소' && <s>₩{fmt(Math.round(r.amount))}</s>}
                  {r.status !== '취소' && `₩${fmt(Math.round(r.amount))}`}
                </td>
                <td><span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>{r.method}</span></td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6366f1' }}>{r.inv_no || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-xs)' }}>{r.note || '—'}</td>
                <td>
                  <span className={r.status === '취소' ? 'badge badge-red' : 'badge badge-green'}>{r.status}</span>
                </td>
                <td>
                  {r.status === '정상' && (
                    <button
                      className="btn-sm"
                      style={{ color: '#dc2626', fontSize: 11 }}
                      onClick={() => handleCancel(r.pay_no)}
                      disabled={cancelling === r.pay_no}
                    >취소</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function Receivable() {
  const [tab, setTab] = useState('summary')
  const [selectedPartner, setSelectedPartner] = useState(null)
  const [partners, setPartners] = useState([])
  const [payRefresh, setPayRefresh] = useState(0)

  useEffect(() => {
    fetch(`${API}/master/partners`, { headers: hdr() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setPartners(data.filter(p => p.partner_type === '고객' || p.partner_type === 'customer' || p.partner_type === '공용')))
      .catch(() => {})
  }, [])

  const handleSelectPartner = (row) => {
    setSelectedPartner(row)
    setTab('pay')
  }

  const handlePayDone = () => {
    setPayRefresh(x => x + 1)
  }

  const TAB_LABELS = {
    summary: '미수금 현황',
    pay:     '수금 입력',
    history: '수금 이력',
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>수금 관리</div>
        <div style={{ fontSize: 13, color: 'var(--text-xs)' }}>
          고객사 미수금 에이징 · 수금 입력 · 수금 이력 (경리·구매 전용)
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 2 }}>
        {Object.entries(TAB_LABELS).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: '8px 8px 0 0',
              fontWeight: tab === k ? 700 : 400, fontSize: 13, cursor: 'pointer',
              background: tab === k ? 'var(--accent)' : 'var(--bg-subtle)',
              color: tab === k ? '#fff' : 'var(--text-sm)',
              borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2,
            }}
          >{label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <SummaryTab onSelectPartner={handleSelectPartner} />
      )}

      {tab === 'pay' && (
        <div>
          {selectedPartner && (
            <div style={{
              background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
              padding: '10px 16px', marginBottom: 16, fontSize: 13,
              display: 'flex', gap: 16, alignItems: 'center',
            }}>
              <span style={{ fontWeight: 700 }}>{selectedPartner.partner_name}</span>
              <span>미수금 <strong style={{ color: '#1e40af' }}>₩{fmt(Math.round(selectedPartner.outstanding))}</strong></span>
              <span style={{ color: 'var(--text-xs)', fontSize: 12 }}>결제조건: {selectedPartner.payment_terms || '—'}</span>
              <button
                style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 12, color: '#64748b', cursor: 'pointer' }}
                onClick={() => setSelectedPartner(null)}
              >✕ 선택 해제</button>
            </div>
          )}
          <PaymentForm
            initialPartnerId={selectedPartner?.partner_id || ''}
            partners={partners}
            onDone={handlePayDone}
          />
        </div>
      )}

      {tab === 'history' && (
        <PaymentHistory
          partnerId={selectedPartner?.partner_id}
          refresh={payRefresh}
        />
      )}
    </div>
  )
}
