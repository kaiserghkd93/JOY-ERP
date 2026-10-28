import { useState } from 'react'
import api from '../api'

const fmt = n => Number(n||0).toLocaleString()
const fmtW = n => `₩${Number(n||0).toLocaleString()}`

export default function Mrp() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState({})  // { part_no: { checked, qty, partner_id, unit_price } }
  const [partners, setPartners] = useState([])
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(null)

  const runMrp = async () => {
    setLoading(true); setResult(null); setSelected({})
    try {
      const r = await api.get(`/mrp/run?year=${year}&month=${month}`)
      setResult(r.data)
      // 파트너 목록
      api.get('/master/partners').then(p => setPartners(p.data.filter(x=>x.partner_type !== '고객'))).catch(()=>{})
      // 발주 필요한 항목 기본 선택
      const sel = {}
      for (const req of r.data.requirements) {
        if (req.need_order) {
          sel[req.part_no] = {
            checked: true, qty: req.order_qty,
            partner_id: '', unit_price: req.avg_cost || req.std_price || 0,
          }
        }
      }
      setSelected(sel)
    } catch(e) {
      alert(e.response?.data?.detail || 'MRP 실행 실패')
    } finally { setLoading(false) }
  }

  const generateOrders = async () => {
    const lines = Object.entries(selected)
      .filter(([, v]) => v.checked && v.qty > 0 && v.partner_id)
      .map(([part_no, v]) => ({
        part_no, qty: parseInt(v.qty),
        partner_id: v.partner_id,
        unit_price: parseFloat(v.unit_price || 0),
      }))
    if (lines.length === 0) return alert('거래처를 지정한 항목이 없습니다')
    setGenerating(true)
    try {
      const r = await api.post('/mrp/generate-orders', { year, month, lines })
      setGenerated(r.data)
    } catch(e) {
      alert(e.response?.data?.detail || '발주 생성 실패')
    } finally { setGenerating(false) }
  }

  const toggle = (part_no) => setSelected(s => ({...s, [part_no]: {...s[part_no], checked: !s[part_no]?.checked}}))
  const setField = (part_no, k, v) => setSelected(s => ({...s, [part_no]: {...s[part_no], [k]: v}}))

  const needCount = result ? result.requirements.filter(r=>r.need_order).length : 0
  const totalAmt = result ? result.requirements.filter(r=>r.need_order).reduce((a,r)=>a+r.estimated_amount,0) : 0

  return (
    <div style={{padding:'0 0 32px'}}>
      <div style={{fontWeight:800,fontSize:18,color:'#1e3a5f',marginBottom:16}}>MRP — 자재소요량계획</div>

      {/* 조건 */}
      <div className="erp-panel" style={{marginBottom:12}}>
        <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:13,color:'#64748b'}}>연도</span>
            <input type="number" value={year} onChange={e=>setYear(parseInt(e.target.value))}
              style={{width:80,padding:'5px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}/>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:13,color:'#64748b'}}>월</span>
            <select value={month} onChange={e=>setMonth(parseInt(e.target.value))}
              style={{padding:'5px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}>
              {Array.from({length:12},(_,i)=>i+1).map(m=>(
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
          {/* 요약 KPI */}
          <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
            {[
              {label:'제품 수요 품목', val:`${result.product_demand.length}품목`, bg:'#eff6ff',border:'#bfdbfe',color:'#1d4ed8'},
              {label:'소요 자재 품목', val:`${result.requirements.length}품목`, bg:'#f0fdf4',border:'#bbf7d0',color:'#15803d'},
              {label:'발주 필요 품목', val:`${needCount}품목`, bg:'#fef2f2',border:'#fecaca',color:'#dc2626'},
              {label:'예상 발주금액', val:fmtW(totalAmt), bg:'#1e3a5f',border:'#1e40af',color:'#fff'},
            ].map(({label,val,bg,border,color})=>(
              <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:8,padding:'10px 18px',minWidth:160}}>
                <div style={{fontSize:11,color:color==='#fff'?'#93c5fd':color,fontWeight:600,marginBottom:4}}>{label}</div>
                <div style={{fontSize:16,fontWeight:800,color}}>{val}</div>
              </div>
            ))}
          </div>

          {/* 제품 수요 요약 */}
          {result.product_demand.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:'#475569',marginBottom:6}}>수요 소스 ({year}년 {month}월)</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {result.product_demand.map(d=>(
                  <div key={d.part_no} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:6,padding:'4px 10px',fontSize:12}}>
                    <span style={{fontFamily:'monospace',color:'#1d4ed8'}}>{d.part_no}</span>
                    <span style={{color:'#64748b',marginLeft:6}}>{fmt(d.qty)}EA</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 소요량 테이블 */}
          <div style={{fontWeight:700,fontSize:13,color:'#475569',marginBottom:6}}>자재 소요량 계산 결과</div>
          <div className="table-wrap" style={{marginBottom:16}}>
            <table>
              <thead>
                <tr>
                  <th style={{width:32}}></th>
                  <th>품번</th><th>품명</th>
                  <th style={{textAlign:'right'}}>총소요</th>
                  <th style={{textAlign:'right'}}>현재고</th>
                  <th style={{textAlign:'right'}}>오픈PO</th>
                  <th style={{textAlign:'right'}}>안전재고</th>
                  <th style={{textAlign:'right'}}>순소요</th>
                  <th style={{textAlign:'right'}}>발주제안</th>
                  <th style={{textAlign:'right'}}>이동평균단가</th>
                  <th style={{textAlign:'right'}}>예상금액</th>
                  <th style={{width:160}}>거래처</th>
                </tr>
              </thead>
              <tbody>
                {result.requirements.map(req=>(
                  <tr key={req.part_no} style={{
                    background: req.need_order ? (selected[req.part_no]?.checked ? '#fefce8' : '#fff') : '#f9fafb',
                    opacity: req.need_order ? 1 : 0.6,
                  }}>
                    <td style={{textAlign:'center'}}>
                      {req.need_order && (
                        <input type="checkbox"
                          checked={!!selected[req.part_no]?.checked}
                          onChange={()=>toggle(req.part_no)}/>
                      )}
                    </td>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{req.part_no}</td>
                    <td style={{fontSize:12}}>{req.item_name}</td>
                    <td style={{textAlign:'right',fontSize:12}}>{fmt(req.gross_requirement)} {req.item_unit}</td>
                    <td style={{textAlign:'right',fontSize:12,color:req.current_stock>0?'#16a34a':'#94a3b8'}}>{fmt(req.current_stock)}</td>
                    <td style={{textAlign:'right',fontSize:12,color:req.on_order_qty>0?'#d97706':'#94a3b8'}}>{fmt(req.on_order_qty)}</td>
                    <td style={{textAlign:'right',fontSize:12}}>{fmt(req.safety_stock)}</td>
                    <td style={{textAlign:'right',fontSize:12,fontWeight:req.net_requirement>0?700:400,color:req.net_requirement>0?'#dc2626':'#94a3b8'}}>
                      {fmt(req.net_requirement)}
                    </td>
                    <td style={{textAlign:'right',fontSize:12}}>
                      {req.need_order ? (
                        <input type="number" value={selected[req.part_no]?.qty ?? req.order_qty}
                          onChange={e=>setField(req.part_no,'qty',e.target.value)}
                          disabled={!selected[req.part_no]?.checked}
                          style={{width:70,textAlign:'right',border:'1px solid #e2e8f0',borderRadius:3,fontSize:12,padding:'2px 4px'}}/>
                      ) : '—'}
                    </td>
                    <td style={{textAlign:'right',fontSize:12}}>{req.avg_cost ? fmtW(req.avg_cost) : (req.std_price ? fmtW(req.std_price) : '—')}</td>
                    <td style={{textAlign:'right',fontSize:12,fontWeight:req.need_order?600:400}}>
                      {req.need_order ? fmtW(req.estimated_amount) : '—'}
                    </td>
                    <td>
                      {req.need_order && (
                        <select
                          value={selected[req.part_no]?.partner_id ?? ''}
                          onChange={e=>setField(req.part_no,'partner_id',e.target.value)}
                          disabled={!selected[req.part_no]?.checked}
                          style={{width:'100%',fontSize:11,padding:'2px 4px',border:'1px solid #e2e8f0',borderRadius:3}}>
                          <option value="">거래처 선택</option>
                          {partners.map(p=><option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 발주 생성 버튼 */}
          {needCount > 0 && !generated && (
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button className="btn btn-primary" onClick={generateOrders} disabled={generating}>
                {generating ? '발주 생성 중...' : `선택 항목 자재 발주 생성 (${Object.values(selected).filter(v=>v.checked&&v.partner_id).length}건)`}
              </button>
            </div>
          )}

          {generated && (
            <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:16}}>
              <div style={{fontWeight:700,color:'#15803d',marginBottom:8}}>자재 발주 {generated.count}건 생성 완료</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {generated.created.map(c=>(
                  <span key={c.po_no} style={{background:'#dcfce7',border:'1px solid #86efac',borderRadius:4,padding:'2px 8px',fontSize:12,fontFamily:'monospace'}}>
                    {c.po_no} ({c.part_no} × {fmt(c.qty)})
                  </span>
                ))}
              </div>
              <div style={{marginTop:8,fontSize:12,color:'#64748b'}}>
                자재구매 탭 → 자재 발주 목록에서 확인하세요
              </div>
            </div>
          )}
        </>
      )}

      {!result && !loading && (
        <div style={{textAlign:'center',color:'#94a3b8',padding:'60px 0',fontSize:14}}>
          연도·월을 선택하고 MRP 실행을 클릭하세요<br/>
          <span style={{fontSize:12}}>수주 + 생산계획 → BOM 전개 → 현재고 차감 → 발주제안</span>
        </div>
      )}
    </div>
  )
}
