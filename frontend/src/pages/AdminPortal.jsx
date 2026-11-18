import { useState, useEffect, useCallback, useRef } from 'react'
import QRCode from 'qrcode'

const API = import.meta.env.VITE_API_URL || ''
const tok = () => sessionStorage.getItem('jwt_token') || ''
const hdr = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` })

const STATUS_LABEL = { pending: '검사대기', confirmed: '입고확정', cancelled: '취소' }
const STATUS_CLASS = { pending: 'badge badge-amber', confirmed: 'badge badge-green', cancelled: 'badge badge-red' }

function fmt(n) { return Number(n || 0).toLocaleString() }
function fmtDate(s) { return s ? s.slice(0, 10) : '—' }

// ── 납품 명세표 모달 (QR 포함) ──────────────────────────────────────
function DeliveryStatementModal({ receipts, partnerName, onClose }) {
  const [qrUrls, setQrUrls] = useState({})

  useEffect(() => {
    receipts.forEach(async r => {
      const url = `${window.location.origin}/api/portal/receipt/${r.gr_no}/view`
      try {
        const dataUrl = await QRCode.toDataURL(url, { width: 160, margin: 1, errorCorrectionLevel: 'M' })
        setQrUrls(prev => ({ ...prev, [r.gr_no]: dataUrl }))
      } catch {}
    })
  }, [receipts])

  const handlePrint = () => {
    const rows = receipts.map(r => `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:20px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-size:11px;color:#64748b;margin-bottom:4px;">입고번호</div>
            <div style="font-family:monospace;font-size:14px;font-weight:700;color:#1e40af">${r.gr_no}</div>
            <div style="font-size:11px;color:#6366f1;font-family:monospace;margin-top:4px;">LOT: ${r.lot_no || '—'}</div>
            <div style="margin-top:12px;font-size:13px;font-weight:600;">${r.item_name || r.part_no}</div>
            <div style="font-size:12px;color:#64748b;">${r.part_no}</div>
            <div style="margin-top:8px;font-size:13px;">
              수량: <strong>${fmt(r.qty)} ${r.item_unit || 'EA'}</strong>&nbsp;&nbsp;
              단가: <strong>${fmt(r.unit_price)}원</strong>&nbsp;&nbsp;
              금액: <strong>${fmt(r.amount)}원</strong>
            </div>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">납품일: ${r.receipt_date}</div>
          </div>
          ${qrUrls[r.gr_no] ? `<img src="${qrUrls[r.gr_no]}" width="120" height="120" style="border:1px solid #e2e8f0;border-radius:6px;padding:4px;" />` : ''}
        </div>
      </div>
    `).join('')

    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html lang="ko"><head>
      <meta charset="UTF-8">
      <title>납품 명세표 — ${partnerName}</title>
      <style>
        body { font-family: 'Malgun Gothic', sans-serif; padding: 32px; max-width: 700px; margin: 0 auto; }
        @media print { body { padding: 16px; } }
      </style>
    </head><body>
      <div style="text-align:center;margin-bottom:28px;">
        <div style="font-size:22px;font-weight:800;color:#1e293b;">납 품 명 세 표</div>
        <div style="font-size:14px;color:#64748b;margin-top:6px;">
          협력사: <strong>${partnerName}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;
          발행일: <strong>${new Date().toLocaleDateString('ko-KR')}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;
          총 ${receipts.length}건
        </div>
      </div>
      ${rows}
      <div style="margin-top:32px;text-align:right;font-size:12px;color:#94a3b8;">
        ※ QR코드를 스캔하면 LOT 추적 및 입고 확정이 가능합니다.
      </div>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28, width: '90%', maxWidth: 680,
        maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>납품 명세표</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              협력사: <strong>{partnerName}</strong> | 총 {receipts.length}건
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handlePrint}
              style={{
                padding: '8px 20px', background: '#1e40af', color: '#fff',
                border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13,
              }}
            >🖨️ 인쇄 / PDF</button>
            <button onClick={onClose}
              style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              닫기
            </button>
          </div>
        </div>

        {receipts.map(r => (
          <div key={r.gr_no} style={{
            border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 14,
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#1e40af',
                  background: '#eff6ff', padding: '3px 10px', borderRadius: 6,
                }}>📦 {r.gr_no}</span>
                <span style={{
                  fontFamily: 'monospace', fontSize: 12, color: '#6366f1',
                  background: '#eef2ff', padding: '3px 10px', borderRadius: 6,
                }}>🏷️ {r.lot_no || '—'}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{r.item_name || r.part_no}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{r.part_no}</div>
              <div style={{ marginTop: 8, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>수량 <strong>{fmt(r.qty)} {r.item_unit || 'EA'}</strong></span>
                <span>단가 <strong>{fmt(r.unit_price)}원</strong></span>
                <span>금액 <strong style={{ color: '#16a34a' }}>{fmt(r.amount)}원</strong></span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>납품일: {r.receipt_date}</div>
            </div>
            <div style={{ marginLeft: 16, flexShrink: 0, textAlign: 'center' }}>
              {qrUrls[r.gr_no]
                ? <img src={qrUrls[r.gr_no]} width={120} height={120}
                    style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 3 }} />
                : <div style={{ width: 120, height: 120, background: '#f8fafc', borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#94a3b8' }}>QR 생성중...</div>
              }
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>스캔 → 입고확정</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 협력사 현황 카드 ────────────────────────────────────────────────
function PartnersTab({ partners, onSelectPartner }) {
  if (!partners.length) return <p style={{ color: 'var(--text-xs)', padding: 24 }}>협력사 없음</p>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, padding: '16px 0' }}>
      {partners.map(p => (
        <div
          key={p.partner_id}
          className="card"
          style={{ padding: 16, cursor: 'pointer' }}
          onClick={() => onSelectPartner(p.partner_id)}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>{p.partner_name}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className={p.pending_po_count > 0 ? 'badge badge-amber' : 'badge badge-green'}>
              미납 발주 {p.pending_po_count}건
            </span>
            <span className="badge badge-blue" style={{ '--badge-bg': '#e0f2fe', '--badge-txt': '#0369a1' }}>
              미납 수량 {fmt(p.pending_po_qty)}
            </span>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-xs)' }}>
            최근 30일 납품: {p.recent_receipt_count}건
            (검사대기 {p.pending_receipt_count} / 확정 {p.confirmed_receipt_count})
          </div>
          <button
            className="btn-sm btn-primary"
            style={{ marginTop: 12, width: '100%' }}
            onClick={e => { e.stopPropagation(); onSelectPartner(p.partner_id) }}
          >
            상세 보기 →
          </button>
        </div>
      ))}
    </div>
  )
}

// ── 발주·납품 현황 테이블 ───────────────────────────────────────────
function OrdersReceiptsTab({ partners }) {
  const [tab, setTab] = useState('orders')
  const [partnerId, setPartnerId] = useState('')
  const [orders, setOrders] = useState([])
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = partnerId ? `?partner_id=${encodeURIComponent(partnerId)}` : ''
    try {
      const [oRes, rRes] = await Promise.all([
        fetch(`${API}/portal/admin/orders${qs}`, { headers: hdr() }),
        fetch(`${API}/portal/admin/receipts${qs}`, { headers: hdr() }),
      ])
      if (oRes.ok) setOrders(await oRes.json())
      if (rRes.ok) setReceipts(await rRes.json())
    } finally {
      setLoading(false)
    }
  }, [partnerId])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <select
          value={partnerId}
          onChange={e => setPartnerId(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
        >
          <option value="">전체 협력사</option>
          {partners.map(p => (
            <option key={p.partner_id} value={p.partner_id}>{p.partner_name}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={tab === 'orders' ? 'btn-sm btn-primary' : 'btn-sm'} onClick={() => setTab('orders')}>
            발주 현황 ({orders.length})
          </button>
          <button className={tab === 'receipts' ? 'btn-sm btn-primary' : 'btn-sm'} onClick={() => setTab('receipts')}>
            납품 이력 ({receipts.length})
          </button>
        </div>
        <button className="btn-sm" onClick={load} disabled={loading}>↻ 새로고침</button>
      </div>

      {loading && <p style={{ color: 'var(--text-xs)', fontSize: 13 }}>로딩 중...</p>}

      {tab === 'orders' && !loading && (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>발주번호</th><th>협력사</th><th>품목</th><th>발주수량</th>
                <th>확정수량</th><th>잔여수량</th><th>단가</th>
                <th>납기일</th><th>상태</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-xs)' }}>발주 없음</td></tr>
              )}
              {orders.map(o => (
                <tr key={o.po_no}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.po_no}</td>
                  <td>{o.partner_name}</td>
                  <td>{o.item_name}<br /><span style={{ fontSize: 11, color: 'var(--text-xs)' }}>{o.part_no}</span></td>
                  <td style={{ textAlign: 'right' }}>{fmt(o.qty)} {o.item_unit}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(o.confirmed_qty)}</td>
                  <td style={{ textAlign: 'right', color: o.remaining_qty > 0 ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                    {fmt(o.remaining_qty)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmt(o.unit_price)}</td>
                  <td>{fmtDate(o.due_date)}</td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
                      background: o.status.includes('open') ? '#fef3c7' : o.status.includes('closed') ? '#dcfce7' : '#e0f2fe',
                      color: o.status.includes('open') ? '#92400e' : o.status.includes('closed') ? '#15803d' : '#0369a1',
                    }}>
                      {o.status.replace('POStatus.', '')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'receipts' && !loading && (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>입고번호</th><th>LOT번호</th><th>협력사</th><th>품목</th>
                <th>수량</th><th>단가</th><th>금액</th><th>납품일</th><th>상태</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-xs)' }}>납품 이력 없음</td></tr>
              )}
              {receipts.map(r => (
                <tr key={r.gr_no}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.gr_no}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6366f1' }}>{r.lot_no || '—'}</td>
                  <td>{r.partner_name}</td>
                  <td>{r.item_name}<br /><span style={{ fontSize: 11, color: 'var(--text-xs)' }}>{r.part_no}</span></td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.qty)} {r.item_unit}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.unit_price)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.amount)}</td>
                  <td>{fmtDate(r.receipt_date)}</td>
                  <td><span className={STATUS_CLASS[r.status] || 'badge'}>{STATUS_LABEL[r.status] || r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 납품 등록 (관리자용) ────────────────────────────────────────────
const EMPTY_LINE = { po_no: '', part_no: '', item_name: '', qty: '', unit_price: '', direct: false }

function DeliverAdminTab({ partners, onDone }) {
  const [partnerId, setPartnerId] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  const [partnerOrders, setPartnerOrders] = useState([])
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [showStatement, setShowStatement] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!partnerId) { setPartnerOrders([]); return }
    fetch(`${API}/portal/admin/orders?partner_id=${encodeURIComponent(partnerId)}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setPartnerOrders(data.filter(o => o.remaining_qty > 0)))
      .catch(() => setPartnerOrders([]))
  }, [partnerId])

  const setLine = (idx, field, val) => {
    setLines(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: val }
      if (field === 'po_no' && val) {
        const po = partnerOrders.find(o => o.po_no === val)
        if (po) {
          next[idx].part_no = po.part_no
          next[idx].item_name = po.item_name
          next[idx].unit_price = String(po.unit_price)
          next[idx].qty = String(po.remaining_qty)
          next[idx].direct = false
        }
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if (!partnerId) { setErr('협력사를 선택하세요'); return }
    if (lines.some(l => !l.qty || Number(l.qty) <= 0)) { setErr('수량을 입력하세요'); return }
    setSaving(true); setErr('')
    try {
      const payload = {
        partner_id: partnerId,
        delivery_date: deliveryDate,
        note,
        lines: lines.map(l => ({
          po_no: l.direct ? null : l.po_no || null,
          part_no: l.part_no || null,
          item_name: l.item_name || null,
          qty: Number(l.qty),
          unit_price: l.unit_price ? Number(l.unit_price) : null,
        })),
      }
      const res = await fetch(`${API}/portal/admin/deliver`, {
        method: 'POST', headers: hdr(), body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '오류')
      setResult(data.receipts)
      setLines([{ ...EMPTY_LINE }])
      setNote('')
      if (onDone) onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {result && (
        <>
          {showStatement && (
            <DeliveryStatementModal
              receipts={result}
              partnerName={partners.find(p => p.partner_id === partnerId)?.partner_name || partnerId}
              onClose={() => setShowStatement(false)}
            />
          )}
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 8 }}>✅ 납품 등록 완료</div>
            {result.map(r => (
              <div key={r.gr_no} style={{ fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontFamily: 'monospace', marginRight: 8 }}>{r.gr_no}</span>
                <span style={{ color: '#6366f1', fontFamily: 'monospace', marginRight: 8 }}>{r.lot_no}</span>
                {r.item_name} {fmt(r.qty)}{r.item_unit} — {fmt(r.amount)}원
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setShowStatement(true)}
                style={{ padding: '8px 20px', background: '#1e40af', color: '#fff',
                  border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                🖨️ 납품 명세표 발행
              </button>
              <button className="btn-sm" onClick={() => { setResult(null); setShowStatement(false) }}>닫기</button>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <label style={{ fontSize: 13 }}>
          협력사 <span style={{ color: '#ef4444' }}>*</span>
          <select
            value={partnerId}
            onChange={e => { setPartnerId(e.target.value); setLines([{ ...EMPTY_LINE }]) }}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--border)', fontSize: 13 }}
          >
            <option value="">— 선택 —</option>
            {partners.map(p => (
              <option key={p.partner_id} value={p.partner_id}>{p.partner_name}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          납품일
          <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--border)', fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          비고
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="관리자 메모"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--border)', fontSize: 13 }} />
        </label>
      </div>

      {/* 납품 품목 라인 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr style={{ background: 'var(--table-head)', fontSize: 12 }}>
            <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid var(--border)' }}>직납여부</th>
            <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid var(--border)', minWidth: 160 }}>발주번호</th>
            <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid var(--border)' }}>품목명</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', border: '1px solid var(--border)', width: 90 }}>수량</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', border: '1px solid var(--border)', width: 110 }}>단가</th>
            <th style={{ padding: '6px 10px', border: '1px solid var(--border)', width: 36 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={idx}>
              <td style={{ padding: '4px 8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <input type="checkbox" checked={line.direct}
                  onChange={e => setLine(idx, 'direct', e.target.checked)} />
              </td>
              <td style={{ padding: '4px 8px', border: '1px solid var(--border)' }}>
                {line.direct ? (
                  <span style={{ color: 'var(--text-xs)', fontSize: 12 }}>직납</span>
                ) : (
                  <select
                    value={line.po_no}
                    onChange={e => setLine(idx, 'po_no', e.target.value)}
                    disabled={!partnerId}
                    style={{ width: '100%', padding: '4px 6px', borderRadius: 4,
                      border: '1px solid var(--border)', fontSize: 12 }}
                  >
                    <option value="">— 발주 선택 —</option>
                    {partnerOrders.map(o => (
                      <option key={o.po_no} value={o.po_no}>
                        {o.po_no} · {o.item_name} (잔여 {fmt(o.remaining_qty)})
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td style={{ padding: '4px 8px', border: '1px solid var(--border)' }}>
                <input
                  value={line.item_name}
                  onChange={e => setLine(idx, 'item_name', e.target.value)}
                  placeholder={line.direct ? '품목명 직접 입력' : '자동입력'}
                  readOnly={!line.direct && !!line.po_no}
                  style={{ width: '100%', padding: '4px 6px', borderRadius: 4,
                    border: '1px solid var(--border)', fontSize: 12,
                    background: !line.direct && line.po_no ? 'var(--bg-subtle)' : undefined }}
                />
              </td>
              <td style={{ padding: '4px 8px', border: '1px solid var(--border)' }}>
                <input
                  type="number" value={line.qty}
                  onChange={e => setLine(idx, 'qty', e.target.value)}
                  style={{ width: '100%', padding: '4px 6px', borderRadius: 4,
                    border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }}
                />
              </td>
              <td style={{ padding: '4px 8px', border: '1px solid var(--border)' }}>
                <input
                  type="number" value={line.unit_price}
                  onChange={e => setLine(idx, 'unit_price', e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '4px 6px', borderRadius: 4,
                    border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }}
                />
              </td>
              <td style={{ padding: '4px 8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                {lines.length > 1 && (
                  <button onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                    style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-sm" onClick={() => setLines(prev => [...prev, { ...EMPTY_LINE }])}>
          + 품목 추가
        </button>
        <button
          className="btn-primary"
          style={{ padding: '8px 24px', borderRadius: 8, fontWeight: 700 }}
          onClick={handleSubmit}
          disabled={saving || !partnerId}
        >
          {saving ? '처리 중...' : '납품 등록'}
        </button>
        {err && <span style={{ color: '#ef4444', fontSize: 13, alignSelf: 'center' }}>{err}</span>}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────────
export default function AdminPortal() {
  const [tab, setTab] = useState('partners')
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterPartner, setFilterPartner] = useState('')

  const loadPartners = useCallback(() => {
    setLoading(true)
    fetch(`${API}/portal/admin/partners`, { headers: hdr() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setPartners(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadPartners() }, [loadPartners])

  const TABS = [
    { id: 'partners', label: '협력사 현황' },
    { id: 'orders', label: '발주·납품 현황' },
    { id: 'deliver', label: '납품 등록' },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>외주협력 관리자 포탈</h2>
        <span className="badge badge-amber">관리자 전용</span>
        {loading && <span style={{ fontSize: 12, color: 'var(--text-xs)' }}>로딩 중...</span>}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 20px', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none', fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? 'var(--accent)' : 'var(--text-sm)',
              fontSize: 14, marginBottom: -1,
            }}
          >
            {t.label}
            {t.id === 'partners' && partners.length > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--accent)', color: '#fff',
                borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
                {partners.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'partners' && (
        <PartnersTab
          partners={partners}
          onSelectPartner={id => { setFilterPartner(id); setTab('orders') }}
        />
      )}
      {tab === 'orders' && (
        <OrdersReceiptsTab partners={partners} initialPartner={filterPartner} />
      )}
      {tab === 'deliver' && (
        <DeliverAdminTab partners={partners} onDone={loadPartners} />
      )}
    </div>
  )
}
