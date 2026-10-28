import { useState } from 'react'
import api from '../api'

const fmt = n => Number(n||0).toLocaleString()
const fmtW = n => `₩${Number(n||0).toLocaleString()}`

const TYPE_LABEL = { raw:'원재료', sub:'부자재', outsourced:'외주품', semi:'반제품', finished:'완제품' }

function ReqTable({ rows, selected, onToggle, onFieldChange, partners, type }) {
  const isBuy = type === 'buy'
  return (
    <div className="table-wrap" style={{marginBottom:16}}>
      <table>
        <thead>
          <tr>
            <th style={{width:32}}></th>
            <th>품번</th><th>품명</th><th>유형</th>
            <th style={{textAlign:'right'}}>총소요</th>
            <th style={{textAlign:'right'}}>현재고</th>
            <th style={{textAlign:'right'}}>{isBuy ? '오픈PO' : '진행생산'}</th>
            <th style={{textAlign:'right'}}>안전재고</th>
            <th style={{textAlign:'right'}}>순소요</th>
            <th style={{textAlign:'right'}}>{isBuy ? '발주제안' : '생산제안'}</th>
            {isBuy && <th style={{textAlign:'right'}}>단가</th>}
            {isBuy && <th style={{textAlign:'right'}}>예상금액</th>}
            {isBuy && <th style={{width:150}}>거래처</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={isBuy ? 13 : 10} className="empty">해당 없음</td></tr>
          )}
          {rows.map(req => {
            const sel = selected[req.part_no] || {}
            const checked = !!sel.checked
            return (
              <tr key={req.part_no} style={{
                background: req.need_order ? (checked ? '#fefce8' : '#fff') : '#f9fafb',
                opacity: req.need_order ? 1 : 0.55,
              }}>
                <td style={{textAlign:'center'}}>
                  {req.need_order && (
                    <input type="checkbox" checked={checked} onChange={() => onToggle(req.part_no)} />
                  )}
                </td>
                <td style={{fontFamily:'monospace',fontSize:11}}>{req.part_no}</td>
                <td style={{fontSize:12}}>{req.item_name}</td>
                <td style={{fontSize:11,color:'#64748b'}}>{TYPE_LABEL[req.item_type] || req.item_type}</td>
                <td style={{textAlign:'right',fontSize:12}}>{fmt(req.gross_requirement)}</td>
                <td style={{textAlign:'right',fontSize:12,color:req.current_stock>0?'#16a34a':'#94a3b8'}}>{fmt(req.current_stock)}</td>
                <td style={{textAlign:'right',fontSize:12,color:req.on_supply_qty>0?'#d97706':'#94a3b8'}}>{fmt(req.on_supply_qty)}</td>
                <td style={{textAlign:'right',fontSize:12}}>{fmt(req.safety_stock)}</td>
                <td style={{textAlign:'right',fontSize:12,fontWeight:req.net_requirement>0?700:400,
                  color:req.net_requirement>0?'#dc2626':'#94a3b8'}}>
                  {fmt(req.net_requirement)}
                </td>
                <td style={{textAlign:'right',fontSize:12}}>
                  {req.need_order ? (
                    <input type="number" value={sel.qty ?? req.order_qty}
                      onChange={e => onFieldChange(req.part_no,'qty',e.target.value)}
                      disabled={!checked}
                      style={{width:70,textAlign:'right',border:'1px solid #e2e8f0',borderRadius:3,fontSize:12,padding:'2px 4px'}}/>
                  ) : '—'}
                </td>
                {isBuy && (
                  <td style={{textAlign:'right',fontSize:12}}>
                    {req.avg_cost ? fmtW(req.avg_cost) : (req.std_price ? fmtW(req.std_price) : '—')}
                  </td>
                )}
                {isBuy && (
                  <td style={{textAlign:'right',fontSize:12,fontWeight:req.need_order?600:400}}>
                    {req.need_order ? fmtW(req.estimated_amount) : '—'}
                  </td>
                )}
                {isBuy && (
                  <td>
                    {req.need_order && (
                      <select value={sel.partner_id ?? ''} disabled={!checked}
                        onChange={e => onFieldChange(req.part_no,'partner_id',e.target.value)}
                        style={{width:'100%',fontSize:11,padding:'2px 4px',border:'1px solid #e2e8f0',borderRadius:3}}>
                        <option value="">거래처 선택</option>
                        {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
                      </select>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Mrp() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [buySelected, setBuySelected] = useState({})
  const [prodSelected, setProdSelected] = useState({})
  const [partners, setPartners] = useState([])
  const [generating, setGenerating] = useState(false)
  const [generatedBuy, setGeneratedBuy] = useState(null)
  const [generatedProd, setGeneratedProd] = useState(null)

  const runMrp = async () => {
    setLoading(true); setResult(null); setBuySelected({}); setProdSelected({})
    setGeneratedBuy(null); setGeneratedProd(null)
    try {
      const r = await api.get(`/mrp/run?year=${year}&month=${month}`)
      setResult(r.data)
      api.get('/master/partners').then(p => setPartners(p.data.filter(x => x.partner_type !== '고객'))).catch(() => {})

      // 기본 선택 — 발주 필요 항목 체크
      const buyS = {}
      for (const req of r.data.purchase_requirements || []) {
        if (req.need_order) {
          buyS[req.part_no] = { checked: true, qty: req.order_qty, partner_id: '', unit_price: req.avg_cost || req.std_price || 0 }
        }
      }
      setBuySelected(buyS)

      const prodS = {}
      for (const req of r.data.production_requirements || []) {
        if (req.need_order) {
          prodS[req.part_no] = { checked: true, qty: req.order_qty }
        }
      }
      setProdSelected(prodS)
    } catch (e) {
      alert(e.response?.data?.detail || 'MRP 실행 실패')
    } finally { setLoading(false) }
  }

  const generateBuyOrders = async () => {
    const lines = Object.entries(buySelected)
      .filter(([, v]) => v.checked && v.qty > 0 && v.partner_id)
      .map(([part_no, v]) => ({ part_no, qty: parseInt(v.qty), partner_id: v.partner_id, unit_price: parseFloat(v.unit_price || 0) }))
    if (!lines.length) return alert('거래처를 지정한 항목이 없습니다')
    setGenerating(true)
    try {
      const r = await api.post('/mrp/generate-orders', { year, month, lines })
      setGeneratedBuy(r.data)
    } catch (e) {
      alert(e.response?.data?.detail || '구매발주 생성 실패')
    } finally { setGenerating(false) }
  }

  const generateProdOrders = async () => {
    const lines = Object.entries(prodSelected)
      .filter(([, v]) => v.checked && v.qty > 0)
      .map(([part_no, v]) => ({ part_no, qty: parseInt(v.qty) }))
    if (!lines.length) return alert('생산오더 생성할 항목이 없습니다')
    setGenerating(true)
    try {
      const r = await api.post('/mrp/generate-production-orders', { year, month, lines })
      setGeneratedProd(r.data)
    } catch (e) {
      alert(e.response?.data?.detail || '생산오더 생성 실패')
    } finally { setGenerating(false) }
  }

  const toggleBuy  = p => setBuySelected(s => ({...s, [p]: {...s[p], checked: !s[p]?.checked}}))
  const toggleProd = p => setProdSelected(s => ({...s, [p]: {...s[p], checked: !s[p]?.checked}}))
  const setBuyField  = (p,k,v) => setBuySelected(s => ({...s, [p]: {...s[p], [k]: v}}))
  const setProdField = (p,k,v) => setProdSelected(s => ({...s, [p]: {...s[p], [k]: v}}))

  const s = result?.summary || {}
  const buyRows  = result?.purchase_requirements  || []
  const prodRows = result?.production_requirements || []
  const demandRows = result?.product_demand || []

  const buyNeedCount  = buyRows.filter(r => r.need_order).length
  const prodNeedCount = prodRows.filter(r => r.need_order).length
  const buyCheckedWithPartner = Object.values(buySelected).filter(v => v.checked && v.partner_id).length
  const prodChecked = Object.values(prodSelected).filter(v => v.checked).length

  return (
    <div style={{padding:'0 0 32px'}}>
      <div style={{fontWeight:800,fontSize:18,color:'#1e3a5f',marginBottom:16}}>MRP — 자재소요량계획</div>

      {/* 조건 */}
      <div className="erp-panel" style={{marginBottom:12}}>
        <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:13,color:'#64748b'}}>연도</span>
            <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))}
              style={{width:80,padding:'5px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}/>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:13,color:'#64748b'}}>월</span>
            <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
              style={{padding:'5px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}>
              {Array.from({length:12},(_,i)=>i+1).map(m => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={runMrp} disabled={loading}>
            {loading ? 'MRP 계산 중...' : 'MRP 실행'}
          </button>
        </div>
      </div>

      {result && (
        <>
          {/* KPI */}
          <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
            {[
              {label:'제품 수요', val:`${demandRows.length}품목`, bg:'#eff6ff',border:'#bfdbfe',color:'#1d4ed8'},
              {label:'구매발주 필요', val:`${s.need_purchase_count||0}품목`, bg:'#fef2f2',border:'#fecaca',color:'#dc2626'},
              {label:'예상 발주금액', val:fmtW(s.estimated_purchase_amount||0), bg:'#1e3a5f',border:'#1e40af',color:'#fff'},
              {label:'생산오더 필요', val:`${s.need_production_count||0}품목`, bg:'#f0fdf4',border:'#bbf7d0',color:'#15803d'},
            ].map(({label,val,bg,border,color}) => (
              <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:8,padding:'10px 18px',minWidth:150}}>
                <div style={{fontSize:11,color:color==='#fff'?'#93c5fd':color,fontWeight:600,marginBottom:4}}>{label}</div>
                <div style={{fontSize:16,fontWeight:800,color}}>{val}</div>
              </div>
            ))}
          </div>

          {/* 제품 수요 칩 */}
          {demandRows.length > 0 && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:'#475569',marginBottom:6}}>수요 소스 ({year}년 {month}월)</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {demandRows.map(d => (
                  <div key={d.part_no} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:6,padding:'4px 10px',fontSize:12}}>
                    <span style={{fontFamily:'monospace',color:'#1d4ed8'}}>{d.part_no}</span>
                    <span style={{color:'#64748b',marginLeft:6}}>{fmt(d.qty)}EA</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 구매발주 섹션 ── */}
          <div style={{fontWeight:700,fontSize:13,color:'#dc2626',marginBottom:6,display:'flex',alignItems:'center',gap:8}}>
            <span>📦 구매발주 추천 ({buyRows.length}품목, 발주 필요 {buyNeedCount}건)</span>
            <span style={{fontSize:11,color:'#64748b',fontWeight:400}}>raw / sub / outsourced</span>
          </div>
          <ReqTable rows={buyRows} selected={buySelected}
            onToggle={toggleBuy} onFieldChange={setBuyField}
            partners={partners} type="buy" />

          {buyNeedCount > 0 && !generatedBuy && (
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginBottom:24}}>
              <button className="btn btn-primary" onClick={generateBuyOrders} disabled={generating}>
                {generating ? '생성 중...' : `자재 구매발주 생성 (${buyCheckedWithPartner}건)`}
              </button>
            </div>
          )}
          {generatedBuy && (
            <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:14,marginBottom:20}}>
              <div style={{fontWeight:700,color:'#1d4ed8',marginBottom:6}}>구매발주 {generatedBuy.count}건 생성 완료</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {generatedBuy.created.map(c => (
                  <span key={c.po_no} style={{background:'#dbeafe',border:'1px solid #93c5fd',borderRadius:4,padding:'2px 8px',fontSize:12,fontFamily:'monospace'}}>
                    {c.po_no} ({c.part_no} × {fmt(c.qty)})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── 생산오더 섹션 ── */}
          <div style={{fontWeight:700,fontSize:13,color:'#15803d',marginBottom:6,display:'flex',alignItems:'center',gap:8}}>
            <span>🏭 생산오더 추천 ({prodRows.length}품목, 생산 필요 {prodNeedCount}건)</span>
            <span style={{fontSize:11,color:'#64748b',fontWeight:400}}>semi / finished</span>
          </div>
          <ReqTable rows={prodRows} selected={prodSelected}
            onToggle={toggleProd} onFieldChange={setProdField}
            partners={[]} type="make" />

          {prodNeedCount > 0 && !generatedProd && (
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginBottom:24}}>
              <button className="btn btn-primary" style={{background:'#15803d',borderColor:'#15803d'}}
                onClick={generateProdOrders} disabled={generating}>
                {generating ? '생성 중...' : `생산오더 생성 (${prodChecked}건)`}
              </button>
            </div>
          )}
          {generatedProd && (
            <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:14,marginBottom:20}}>
              <div style={{fontWeight:700,color:'#15803d',marginBottom:6}}>생산오더 {generatedProd.count}건 생성 완료</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {generatedProd.created.map(c => (
                  <span key={c.pord_no} style={{background:'#dcfce7',border:'1px solid #86efac',borderRadius:4,padding:'2px 8px',fontSize:12,fontFamily:'monospace'}}>
                    {c.pord_no} ({c.part_no} × {fmt(c.qty)})
                  </span>
                ))}
              </div>
              <div style={{marginTop:6,fontSize:12,color:'#64748b'}}>생산 관리 → 생산오더에서 확인하세요</div>
            </div>
          )}
        </>
      )}

      {!result && !loading && (
        <div style={{textAlign:'center',color:'#94a3b8',padding:'60px 0',fontSize:14}}>
          연도·월을 선택하고 MRP 실행을 클릭하세요<br/>
          <span style={{fontSize:12}}>수주 + 생산계획 → BOM 전개 → Buy(구매발주) / Make(생산오더) 분기</span>
        </div>
      )}
    </div>
  )
}
