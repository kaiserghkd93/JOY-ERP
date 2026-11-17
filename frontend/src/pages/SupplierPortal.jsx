import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
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

/* ── QR 명세서 모달 ─────────────────────────────────────── */
function DeliveryStatementModal({ receipts, partnerName, onClose }) {
  const [qrUrls, setQrUrls] = useState({})

  useEffect(() => {
    receipts.forEach(async r => {
      const text = `${r.gr_no}\nLOT:${r.lot_no || '-'}\n${r.part_no}|${r.qty}EA|${r.receipt_date}`
      try {
        const url = await QRCode.toDataURL(text, { width: 160, margin: 1, errorCorrectionLevel: 'M' })
        setQrUrls(prev => ({ ...prev, [r.gr_no]: url }))
      } catch {}
    })
  }, [receipts])

  const totalAmount = receipts.reduce((s, r) => s + (r.amount || 0), 0)

  const printStatement = () => {
    const win = window.open('', '_blank', 'width=700,height=900')
    const rows = receipts.map(r => `
      <tr>
        <td>${r.part_no}</td><td>${r.item_name}</td>
        <td style="text-align:right">${r.qty.toLocaleString()} ${r.item_unit||'EA'}</td>
        <td style="text-align:right">₩${(r.unit_price||0).toLocaleString()}</td>
        <td style="text-align:right">₩${(r.amount||0).toLocaleString()}</td>
        <td style="font-size:10px;color:#666">${r.lot_no||'-'}</td>
      </tr>`).join('')
    const qrHtml = receipts.map(r => qrUrls[r.gr_no]
      ? `<div style="text-align:center;margin:4px 8px;display:inline-block">
           <img src="${qrUrls[r.gr_no]}" style="width:100px;height:100px"/>
           <div style="font-size:9px;margin-top:3px">${r.gr_no}</div>
         </div>` : '').join('')
    win.document.write(`<html><head><title>납품명세서</title>
      <style>body{font-family:'Malgun Gothic',sans-serif;padding:30px;font-size:12px}
      h2{text-align:center;font-size:16px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th,td{border:1px solid #ccc;padding:6px 8px}
      th{background:#f1f5f9;font-weight:700}.total{font-weight:700;text-align:right}
      .info{display:flex;gap:24px;margin-bottom:16px;font-size:12px}
      .info-box{flex:1;background:#f8fafc;padding:10px;border-radius:6px}
      .qr-row{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px}</style>
      </head><body>
      <h2>납품 명세서</h2>
      <div class="info">
        <div class="info-box"><strong>수신:</strong> (주)조이산업<br/><strong>발신:</strong> ${partnerName}</div>
        <div class="info-box"><strong>납품일:</strong> ${receipts[0]?.receipt_date || '-'}<br/><strong>품목 수:</strong> ${receipts.length}건</div>
      </div>
      <table><thead><tr><th>품번</th><th>품명</th><th style="text-align:right">수량</th><th style="text-align:right">단가</th><th style="text-align:right">금액</th><th>LOT</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4" class="total">합계</td><td style="text-align:right;font-weight:700">₩${totalAmount.toLocaleString()}</td><td></td></tr></tfoot></table>
      <div class="qr-row"><strong>QR 코드 (스캔 → LOT 추적)</strong><br/>${qrHtml}</div>
      <div style="margin-top:12px;font-size:10px;color:#888">※ 본 명세서는 수입검사 완료 후 입고 처리됩니다.</div>
      </body></html>`)
    win.document.close()
    win.print()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8' }}>납품 명세서 발행</div>
          <span style={{ background: '#dcfce7', color: '#15803d', fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>✓ 등록완료</span>
        </div>

        {/* 품목별 명세 */}
        {receipts.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#f8fafc', borderRadius: 8, padding: '12px 14px', marginBottom: 10, border: '1px solid #e2e8f0' }}>
            {/* 텍스트 정보 */}
            <div style={{ flex: 1, fontSize: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#dbeafe', color: '#1d4ed8', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>{r.gr_no}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>LOT: {r.lot_no || '-'}</span>
              </div>
              <div><strong>품번:</strong> {r.part_no} &nbsp; <strong>품명:</strong> {r.item_name}</div>
              <div style={{ marginTop: 2 }}>
                <strong>수량:</strong> {r.qty.toLocaleString()} {r.item_unit || 'EA'} &nbsp;
                <strong>단가:</strong> ₩{(r.unit_price||0).toLocaleString()} &nbsp;
                <strong>금액:</strong> <span style={{ color: '#1d4ed8', fontWeight: 700 }}>₩{(r.amount||0).toLocaleString()}</span>
              </div>
              <div style={{ marginTop: 2, color: '#64748b' }}><strong>납품일:</strong> {r.receipt_date}</div>
            </div>
            {/* QR 코드 */}
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              {qrUrls[r.gr_no]
                ? <img src={qrUrls[r.gr_no]} alt="QR" style={{ width: 80, height: 80 }} />
                : <div style={{ width: 80, height: 80, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>QR 생성중...</div>
              }
              <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>스캔 → LOT 추적</div>
            </div>
          </div>
        ))}

        {/* 합계 */}
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, padding: '8px 14px', background: '#eff6ff', borderRadius: 6, marginBottom: 16 }}>
          합계: ₩{totalAmount.toLocaleString()}
        </div>

        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 16, padding: '8px 12px', background: '#fefce8', borderRadius: 6, border: '1px solid #fde68a' }}>
          ※ QR 코드 스캔 시 입고번호·LOT번호·품번·수량·납품일 정보가 표시됩니다.<br/>
          ※ 납품물에 명세서를 부착해 주세요. 수입검사 완료 후 입고 처리됩니다.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={printStatement}
            style={{ flex: 2, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 7, padding: '10px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            🖨️ 명세서 인쇄
          </button>
          <button onClick={onClose}
            style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 7, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 납품 등록 ──────────────────────────────────────────── */
function DeliverTab() {
  const today = () => new Date().toISOString().slice(0, 10)
  const [orders, setOrders] = useState([])
  const [allItems, setAllItems] = useState([])
  const [deliveryDate, setDeliveryDate] = useState(today())
  const [lines, setLines] = useState([{ po_no: '', part_no: '', item_name: '', qty: '', unit_price: '', direct: false }])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [statement, setStatement] = useState(null) // 명세서 모달
  const [partnerName, setPartnerName] = useState('')

  useEffect(() => {
    api.get('/portal/orders').then(r => setOrders(r.data)).catch(() => {})
    api.get('/portal/all-items').then(r => setAllItems(r.data)).catch(() => {})
    const stored = localStorage.getItem('user')
    if (stored) {
      const u = JSON.parse(stored)
      setPartnerName(u.display_name || u.username || '협력사')
    }
  }, [])

  const setLine = (i, k, v) => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l))

  const selectPo = (i, po_no) => {
    const sel = orders.find(o => o.po_no === po_no)
    setLines(prev => prev.map((l, idx) => idx === i ? {
      ...l, po_no, part_no: sel?.part_no || '', item_name: sel?.part_name || '',
      unit_price: sel ? String(sel.unit_price || '') : l.unit_price, direct: false,
    } : l))
  }

  const addLine = () => setLines(prev => [...prev, { po_no: '', part_no: '', item_name: '', qty: '', unit_price: '', direct: false }])
  const removeLine = (i) => setLines(prev => prev.filter((_, idx) => idx !== i))

  const submit = async () => {
    const validLines = lines.filter(l => l.qty && Number(l.qty) > 0)
    if (!validLines.length) return alert('납품 수량을 입력하세요')
    if (!deliveryDate) return alert('납품일을 입력하세요')

    const payload = {
      delivery_date: deliveryDate,
      lines: validLines.map(l => ({
        po_no: l.po_no || null,
        part_no: l.part_no || null,
        item_name: l.direct ? l.item_name : null,
        item_unit: 'EA',
        qty: Number(l.qty),
        unit_price: l.unit_price ? Number(l.unit_price) : null,
      })),
      note: note || null,
    }

    setSubmitting(true)
    try {
      const res = await api.post('/portal/deliver', payload)
      setStatement(res.data.receipts)
      setLines([{ po_no: '', part_no: '', item_name: '', qty: '', unit_price: '', direct: false }])
      setNote('')
    } catch (e) {
      alert('납품 등록 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>납품 명세서 등록</div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
        {/* 납품일 */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>납품일</label>
            <input type="date" className="form-control" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
          </div>
          <div style={{ flex: 2 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>전체 비고</label>
            <input className="form-control" value={note} onChange={e => setNote(e.target.value)} placeholder="납품 전반 특이사항" />
          </div>
        </div>

        {/* 납품 품목 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>납품 품목</label>
            <button onClick={addLine} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #1d4ed8', color: '#1d4ed8', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>+ 품목 추가</button>
          </div>

          {lines.map((line, i) => {
            const selOrd = orders.find(o => o.po_no === line.po_no)
            return (
              <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px', marginBottom: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', minWidth: 24 }}>#{i+1}</span>
                  <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={line.direct}
                      onChange={e => setLine(i, 'direct', e.target.checked)} />
                    발주 없는 직접 추가
                  </label>
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(i)} style={{ marginLeft: 'auto', fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>✕ 삭제</button>
                  )}
                </div>

                {!line.direct ? (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>발주 선택</label>
                    <select className="form-control" value={line.po_no} onChange={e => selectPo(i, e.target.value)} style={{ fontSize: 12 }}>
                      <option value="">— 발주번호 선택 —</option>
                      {orders.map(o => (
                        <option key={o.po_no} value={o.po_no}>{o.po_no} · {o.item_name} (잔: {o.remaining_qty}개)</option>
                      ))}
                    </select>
                    {selOrd && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                        {selOrd.part_no} | 단가: ₩{(selOrd.unit_price||0).toLocaleString()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>품명</label>
                      <input className="form-control" value={line.item_name} onChange={e => setLine(i, 'item_name', e.target.value)} placeholder="품명 입력" style={{ fontSize: 12 }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>단가</label>
                      <input type="number" className="form-control" value={line.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)} placeholder="0" style={{ fontSize: 12 }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>납품 수량 *</label>
                    <input type="number" className="form-control" value={line.qty} onChange={e => setLine(i, 'qty', e.target.value)} placeholder="수량" min="1" style={{ fontSize: 12 }} />
                  </div>
                  {line.po_no && line.qty && (
                    <div style={{ flex: 1, fontSize: 11, color: '#1d4ed8', paddingTop: 20, fontWeight: 600 }}>
                      금액: ₩{((Number(line.qty)||0) * (selOrd?.unit_price||0)).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button disabled={submitting} onClick={submit}
          style={{ width: '100%', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 7, padding: '11px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? '처리 중...' : '📄 납품 등록 → 명세서 발행'}
        </button>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
          등록 후 QR 코드가 포함된 납품명세서를 바로 출력할 수 있습니다
        </div>
      </div>

      {statement && (
        <DeliveryStatementModal
          receipts={statement}
          partnerName={partnerName}
          onClose={() => setStatement(null)}
        />
      )}
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
