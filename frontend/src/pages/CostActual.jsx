import { useEffect, useState } from 'react'
import api from '../api'

const fmt = n => Number(n||0).toLocaleString()
const fmtW = n => `₩${Number(n||0).toLocaleString()}`

export default function CostActual() {
  const now = new Date()
  const [tab, setTab] = useState('avg-cost')
  const [avgCosts, setAvgCosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedPart, setSelectedPart] = useState('')
  const [rollup, setRollup] = useState(null)
  const [monthly, setMonthly] = useState(null)
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [itemType, setItemType] = useState('')

  const loadAvgCosts = () => {
    setLoading(true)
    let url = '/cost/actual/avg-cost'
    if (itemType) url += `?item_type=${itemType}`
    api.get(url).then(r => setAvgCosts(r.data.items || [])).catch(()=>{}).finally(()=>setLoading(false))
  }

  const loadRollup = (part_no) => {
    if (!part_no) return
    api.get(`/cost/actual/product-cost/${part_no}`).then(r => setRollup(r.data)).catch(()=>setRollup(null))
  }

  const loadMonthly = () => {
    const [y,m] = ym.split('-')
    api.get(`/cost/actual/monthly?year=${y}&month=${m}`).then(r => setMonthly(r.data)).catch(()=>setMonthly(null))
  }

  useEffect(() => {
    if (tab === 'avg-cost') loadAvgCosts()
    else if (tab === 'monthly') loadMonthly()
    else if (tab === 'variance') loadVariance()
    else if (tab === 'co-variance') loadCoVariance()
  }, [tab, ym])

  useEffect(() => { if (tab === 'avg-cost') loadAvgCosts() }, [itemType])

  const [variance, setVariance] = useState(null)
  const [coVariance, setCoVariance] = useState(null)

  const loadVariance = () => {
    const [y,m] = ym.split('-')
    api.get(`/cost/actual/production-variance?year=${y}&month=${m}`).then(r => setVariance(r.data)).catch(()=>setVariance(null))
  }

  const loadCoVariance = () => {
    const [y,m] = ym.split('-')
    api.get(`/cost/actual/co-variance?year=${y}&month=${m}`).then(r => setCoVariance(r.data)).catch(()=>setCoVariance(null))
  }

  const TABS = [
    ['avg-cost', '이동평균단가 현황'],
    ['rollup', '제품별 실원가 롤업'],
    ['monthly', '월별 실원가 집계'],
    ['variance', '생산원가 차이 분석'],
    ['co-variance', '📊 SAP CO 차이분석'],
  ]

  return (
    <div style={{padding:'0 0 32px'}}>
      <div style={{fontWeight:800,fontSize:18,color:'#1e3a5f',marginBottom:16}}>실원가 분석</div>

      <div className="erp-panel" style={{marginBottom:8}}>
        <div className="erp-actions">
          <div className="qdate-bar">
            {TABS.map(([v,l])=>(
              <button key={v} className={`qdate-btn${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 이동평균단가 현황 */}
      {tab === 'avg-cost' && (
        <>
          <div className="erp-panel" style={{marginBottom:8}}>
            <div className="erp-actions">
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontSize:12,color:'#64748b'}}>품목유형</span>
                <select value={itemType} onChange={e=>setItemType(e.target.value)}
                  style={{padding:'5px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}>
                  <option value="">전체</option>
                  <option value="raw">원재료</option>
                  <option value="sub">부자재</option>
                  <option value="outsourced">외주품</option>
                  <option value="semi">반제품</option>
                  <option value="finished">완제품</option>
                </select>
              </div>
              <div className="spacer"/>
              <button className="btn btn-sm btn-primary" onClick={loadAvgCosts}>새로고침</button>
            </div>
          </div>
          <div className="result-bar">
            <span className="result-bar-title">이동평균단가 현황</span>
            <span className="result-bar-count">{avgCosts.length}품목</span>
            <span style={{marginLeft:'auto',fontSize:12,color:'#64748b'}}>
              재고평가액 합계: {fmtW(avgCosts.reduce((a,i)=>a+i.stock_value,0))}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>품번</th><th>품명</th><th>유형</th>
                  <th style={{textAlign:'right'}}>현재고</th>
                  <th style={{textAlign:'right'}}>이동평균단가</th>
                  <th style={{textAlign:'right'}}>표준단가</th>
                  <th style={{textAlign:'right'}}>단가차이(%)</th>
                  <th style={{textAlign:'right'}}>재고평가액</th>
                </tr>
              </thead>
              <tbody>
                {avgCosts.length === 0 && <tr><td colSpan={8} className="empty">{loading?'조회 중...':'데이터 없음'}</td></tr>}
                {avgCosts.map(i=>(
                  <tr key={i.part_no}>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{i.part_no}</td>
                    <td style={{fontSize:12}}>{i.item_name}</td>
                    <td style={{fontSize:11,color:'#64748b'}}>{i.item_type}</td>
                    <td style={{textAlign:'right',fontSize:12}}>{fmt(i.current_stock)}</td>
                    <td style={{textAlign:'right',fontSize:12,fontWeight:600,color:'#1d4ed8'}}>{fmtW(i.avg_cost)}</td>
                    <td style={{textAlign:'right',fontSize:12}}>{fmtW(i.std_buy_price)}</td>
                    <td style={{textAlign:'right',fontSize:12, color:i.variance_pct==null?'#94a3b8':Math.abs(i.variance_pct)>10?'#dc2626':'#16a34a'}}>
                      {i.variance_pct != null ? `${i.variance_pct > 0 ? '+' : ''}${i.variance_pct}%` : '—'}
                    </td>
                    <td style={{textAlign:'right',fontSize:12,fontWeight:600}}>{fmtW(i.stock_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 제품별 실원가 롤업 */}
      {tab === 'rollup' && (
        <>
          <div className="erp-panel" style={{marginBottom:8}}>
            <div className="erp-actions">
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontSize:12,color:'#64748b'}}>제품 품번</span>
                <input type="text" placeholder="품번 입력..." value={selectedPart}
                  onChange={e=>setSelectedPart(e.target.value)}
                  style={{padding:'5px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13,width:160}}
                  onKeyDown={e=>e.key==='Enter'&&loadRollup(selectedPart)}/>
                <button className="btn btn-sm btn-primary" onClick={()=>loadRollup(selectedPart)}>조회</button>
              </div>
            </div>
          </div>
          {rollup && (
            <>
              <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
                {[
                  {label:'제품명', val:rollup.item_name, bg:'#f8fafc',border:'#e2e8f0',color:'#1e3a5f'},
                  {label:'BOM 실원가 (EA)', val:fmtW(rollup.total_material_cost), bg:'#eff6ff',border:'#bfdbfe',color:'#1d4ed8'},
                  {label:'판매단가', val:fmtW(rollup.std_sell_price), bg:'#f0fdf4',border:'#bbf7d0',color:'#15803d'},
                  {label:'예상 매출이익', val:rollup.gross_margin!=null?fmtW(rollup.gross_margin):'—',
                    bg: rollup.gross_margin>0?'#f0fdf4':'#fef2f2',
                    border: rollup.gross_margin>0?'#bbf7d0':'#fecaca',
                    color: rollup.gross_margin>0?'#15803d':'#dc2626'},
                  {label:'이익률', val:rollup.gross_margin_pct!=null?`${rollup.gross_margin_pct}%`:'—',
                    bg:'#fefce8',border:'#fde68a',color:'#92400e'},
                ].map(({label,val,bg,border,color})=>(
                  <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:8,padding:'10px 18px',minWidth:140}}>
                    <div style={{fontSize:11,color:'#64748b',fontWeight:600,marginBottom:4}}>{label}</div>
                    <div style={{fontSize:14,fontWeight:800,color}}>{val}</div>
                  </div>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>구성품번</th><th>구성품명</th><th>단위</th>
                      <th style={{textAlign:'right'}}>소요량/EA</th>
                      <th style={{textAlign:'right'}}>이동평균단가</th>
                      <th style={{textAlign:'right'}}>표준단가</th>
                      <th style={{textAlign:'right'}}>단가차이</th>
                      <th style={{textAlign:'right'}}>원가/EA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rollup.bom_lines.map(b=>(
                      <tr key={b.component_part_no}>
                        <td style={{fontFamily:'monospace',fontSize:11}}>{b.component_part_no}</td>
                        <td style={{fontSize:12}}>{b.component_name}</td>
                        <td style={{fontSize:11,color:'#64748b'}}>{b.unit}</td>
                        <td style={{textAlign:'right',fontSize:12}}>{fmt(b.qty_per)}</td>
                        <td style={{textAlign:'right',fontSize:12,color:'#1d4ed8',fontWeight:600}}>{fmtW(b.avg_cost)}</td>
                        <td style={{textAlign:'right',fontSize:12}}>{fmtW(b.std_price)}</td>
                        <td style={{textAlign:'right',fontSize:12,
                          color:b.variance_pct==null?'#94a3b8':b.variance_pct>5?'#dc2626':'#16a34a'}}>
                          {b.variance_pct!=null?`${b.variance_pct>0?'+':''}${b.variance_pct}%`:'—'}
                        </td>
                        <td style={{textAlign:'right',fontSize:12,fontWeight:700}}>{fmtW(b.cost_per_unit)}</td>
                      </tr>
                    ))}
                    <tr style={{fontWeight:700,background:'#f1f5f9'}}>
                      <td colSpan={7} style={{textAlign:'right'}}>합계 (제품 1EA 원가)</td>
                      <td style={{textAlign:'right'}}>{fmtW(rollup.total_material_cost)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!rollup && <div style={{textAlign:'center',color:'#94a3b8',padding:'60px 0',fontSize:14}}>품번을 입력하고 조회하세요</div>}
        </>
      )}

      {/* 월별 실원가 집계 */}
      {tab === 'monthly' && (
        <>
          <div className="erp-panel" style={{marginBottom:12}}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#64748b'}}>조회 월</span>
              <input type="month" value={ym} onChange={e=>setYm(e.target.value)}
                style={{padding:'5px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}/>
              <button className="btn btn-sm btn-primary" onClick={loadMonthly}>조회</button>
            </div>
          </div>
          {monthly && (
            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              {[
                {label:'자재 매입금액', val:fmtW(monthly.purchase_amount), bg:'#eff6ff',border:'#bfdbfe',color:'#1d4ed8',
                  sub:`${monthly.receipt_count}건 입고`},
                {label:'생산 소모 원가', val:fmtW(monthly.consumption_amount), bg:'#fef2f2',border:'#fecaca',color:'#dc2626',
                  sub:'생산 투입 기준'},
                {label:'완성품 생산원가', val:fmtW(monthly.production_amount), bg:'#f0fdf4',border:'#bbf7d0',color:'#15803d',
                  sub:'생산입고 기준'},
              ].map(({label,val,bg,border,color,sub})=>(
                <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:8,padding:'14px 20px',minWidth:180}}>
                  <div style={{fontSize:11,color:'#64748b',fontWeight:600,marginBottom:4}}>{label}</div>
                  <div style={{fontSize:18,fontWeight:800,color,marginBottom:4}}>{val}</div>
                  <div style={{fontSize:11,color:'#94a3b8'}}>{sub}</div>
                </div>
              ))}
            </div>
          )}
          {!monthly && <div style={{textAlign:'center',color:'#94a3b8',padding:'60px 0',fontSize:14}}>월을 선택하고 조회하세요</div>}
        </>
      )}

      {/* 생산원가 차이 분석 */}
      {tab === 'variance' && (
        <>
          <div className="erp-panel" style={{marginBottom:12}}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#64748b'}}>조회 월</span>
              <input type="month" value={ym} onChange={e=>setYm(e.target.value)}
                style={{padding:'5px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}/>
              <button className="btn btn-sm btn-primary" onClick={loadVariance}>조회</button>
            </div>
          </div>
          {variance && (
            <>
              {/* 요약 */}
              <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
                {[
                  {label:'표준원가 합계', val:fmtW(variance.total.std_cost), bg:'#eff6ff',border:'#bfdbfe',color:'#1d4ed8'},
                  {label:'실원가 합계', val:fmtW(variance.total.actual_cost), bg:'#f0fdf4',border:'#bbf7d0',color:'#15803d'},
                  {label:'원가 차이', val:(variance.total.variance > 0 ? '+' : '') + fmtW(variance.total.variance),
                    bg: variance.total.variance > 0 ? '#fef2f2' : '#f0fdf4',
                    border: variance.total.variance > 0 ? '#fecaca' : '#bbf7d0',
                    color: variance.total.variance > 0 ? '#dc2626' : '#15803d'},
                  {label:'차이율', val: variance.total.variance_pct != null ? `${variance.total.variance_pct > 0 ? '+' : ''}${variance.total.variance_pct}%` : '—',
                    bg:'#fefce8',border:'#fde68a',color:'#92400e'},
                ].map(({label,val,bg,border,color})=>(
                  <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:8,padding:'12px 18px',minWidth:160}}>
                    <div style={{fontSize:11,color:'#64748b',fontWeight:600,marginBottom:4}}>{label}</div>
                    <div style={{fontSize:16,fontWeight:800,color}}>{val}</div>
                  </div>
                ))}
              </div>
              {variance.items.length === 0 ? (
                <div style={{textAlign:'center',color:'#94a3b8',padding:'40px 0',fontSize:14}}>
                  해당 월 완료된 작업지시 없음
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>작업지시번호</th><th>품목명</th>
                        <th style={{textAlign:'right'}}>완료수량</th>
                        <th style={{textAlign:'right'}}>표준 재료비</th>
                        <th style={{textAlign:'right'}}>표준 노무비</th>
                        <th style={{textAlign:'right'}}>표준원가 합계</th>
                        <th style={{textAlign:'right'}}>실원가(EA)</th>
                        <th style={{textAlign:'right'}}>차이(EA)</th>
                        <th style={{textAlign:'right'}}>차이율</th>
                        <th style={{textAlign:'right'}}>총 차이금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variance.items.map(item => (
                        <tr key={item.pord_no}>
                          <td style={{fontFamily:'monospace',fontSize:11}}>{item.pord_no}</td>
                          <td style={{fontWeight:500,fontSize:12}}>{item.part_name}</td>
                          <td style={{textAlign:'right',fontSize:12}}>{fmt(item.actual_qty)}</td>
                          <td style={{textAlign:'right',fontSize:12}}>{fmtW(item.std_material)}</td>
                          <td style={{textAlign:'right',fontSize:12}}>{fmtW(item.std_labor)}</td>
                          <td style={{textAlign:'right',fontSize:12,fontWeight:600}}>{fmtW(item.std_total)}</td>
                          <td style={{textAlign:'right',fontSize:12,color:'#1d4ed8',fontWeight:600}}>{fmtW(item.actual_material_per)}</td>
                          <td style={{textAlign:'right',fontSize:12,
                            color: item.variance > 0 ? '#dc2626' : item.variance < 0 ? '#16a34a' : '#64748b',
                            fontWeight:600}}>
                            {item.variance > 0 ? '+' : ''}{fmtW(item.variance)}
                          </td>
                          <td style={{textAlign:'right',fontSize:12,
                            color: item.variance_pct == null ? '#94a3b8' : item.variance_pct > 5 ? '#dc2626' : item.variance_pct < -5 ? '#16a34a' : '#64748b'}}>
                            {item.variance_pct != null ? `${item.variance_pct > 0 ? '+' : ''}${item.variance_pct}%` : '—'}
                          </td>
                          <td style={{textAlign:'right',fontSize:12,fontWeight:700,
                            color: item.total_variance > 0 ? '#dc2626' : item.total_variance < 0 ? '#16a34a' : '#64748b'}}>
                            {item.total_variance > 0 ? '+' : ''}{fmtW(item.total_variance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {!variance && <div style={{textAlign:'center',color:'#94a3b8',padding:'60px 0',fontSize:14}}>월을 선택하고 조회하세요</div>}
        </>
      )}

      {/* SAP CO 표준원가 차이분석 */}
      {tab === 'co-variance' && (
        <>
          <div className="erp-panel" style={{marginBottom:12}}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#64748b'}}>조회 월</span>
              <input type="month" value={ym} onChange={e=>setYm(e.target.value)}
                style={{padding:'5px 8px',border:'1px solid var(--border)',borderRadius:4,fontSize:13}}/>
              <button className="btn btn-sm btn-primary" onClick={loadCoVariance}>조회</button>
            </div>
          </div>
          {coVariance && (
            <>
              {/* SAP CO 차이 요약 카드 */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10,marginBottom:16}}>
                {[
                  {label:'재료 가격차이', val:coVariance.summary.material_price_var, desc:'(실제단가-표준단가)×실제량'},
                  {label:'재료 수량차이', val:coVariance.summary.material_qty_var,  desc:'(실제투입-표준투입)×표준가'},
                  {label:'재료비 차이 계', val:coVariance.summary.material_variance, desc:'가격차이+수량차이', bold:true},
                  {label:'노무 임률차이', val:coVariance.summary.labor_rate_var,  desc:'(실제임률-표준임률)×실제공수'},
                  {label:'노무 능률차이', val:coVariance.summary.labor_efficiency_var, desc:'(실제공수-표준공수)×표준임률'},
                  {label:'노무비 차이 계', val:coVariance.summary.labor_variance, desc:'임률차이+능률차이', bold:true},
                  {label:'총 원가차이', val:coVariance.summary.total_variance, desc:'재료비+노무비 차이', bold:true, big:true},
                ].map(({label,val,desc,bold,big})=>{
                  const isOver = val > 0, isUnder = val < 0
                  return (
                    <div key={label} style={{
                      background: isOver ? '#fef2f2' : isUnder ? '#f0fdf4' : '#f8fafc',
                      border: `1px solid ${isOver?'#fecaca':isUnder?'#bbf7d0':'#e2e8f0'}`,
                      borderRadius:8, padding:'10px 14px'
                    }}>
                      <div style={{fontSize:11,color:'#64748b',fontWeight:600,marginBottom:2}}>{label}</div>
                      <div style={{fontSize:big?18:bold?15:14, fontWeight:800,
                        color:isOver?'#dc2626':isUnder?'#15803d':'#475569'}}>
                        {val > 0 ? '+' : ''}{fmtW(val)}
                      </div>
                      <div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>{desc}</div>
                    </div>
                  )
                })}
              </div>

              {/* CO 차이 의미 설명 */}
              <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'10px 16px',marginBottom:16,fontSize:12,color:'#1e40af'}}>
                <strong>차이 해석:</strong>&nbsp;
                양수(+) = 불리한 차이(실제&gt;표준, 비용 초과) &nbsp;|&nbsp; 음수(−) = 유리한 차이(실제&lt;표준, 비용 절감)
              </div>

              {/* 작업지시별 CO 차이 테이블 */}
              {coVariance.items.length === 0 ? (
                <div style={{textAlign:'center',color:'#94a3b8',padding:'40px 0',fontSize:14}}>해당 월 완료된 작업지시 없음</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>작업지시번호</th>
                        <th>품목명</th>
                        <th style={{textAlign:'right'}}>완료수량</th>
                        <th style={{textAlign:'right',background:'#dbeafe'}}>가격차이</th>
                        <th style={{textAlign:'right',background:'#dbeafe'}}>수량차이</th>
                        <th style={{textAlign:'right',background:'#dbeafe'}}>재료비차이계</th>
                        <th style={{textAlign:'right',background:'#dcfce7'}}>임률차이</th>
                        <th style={{textAlign:'right',background:'#dcfce7'}}>능률차이</th>
                        <th style={{textAlign:'right',background:'#dcfce7'}}>노무비차이계</th>
                        <th style={{textAlign:'right',background:'#fef9c3'}}>총차이</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coVariance.items.map(item => {
                        const matTotal = (item.price_var||0) + (item.qty_var||0)
                        const labTotal = (item.rate_var||0) + (item.efficiency_var||0)
                        const totVar   = matTotal + labTotal
                        const c = v => v > 0 ? '#dc2626' : v < 0 ? '#16a34a' : '#64748b'
                        const fv = v => `${v>0?'+':''}${fmtW(v)}`
                        return (
                          <tr key={item.pord_no}>
                            <td style={{fontFamily:'monospace',fontSize:11}}>{item.pord_no}</td>
                            <td style={{fontWeight:500,fontSize:12}}>{item.part_name}</td>
                            <td style={{textAlign:'right',fontSize:12}}>{fmt(item.actual_qty)}</td>
                            <td style={{textAlign:'right',fontSize:12,color:c(item.price_var)}}>{fv(item.price_var||0)}</td>
                            <td style={{textAlign:'right',fontSize:12,color:c(item.qty_var)}}>{fv(item.qty_var||0)}</td>
                            <td style={{textAlign:'right',fontSize:12,fontWeight:700,color:c(matTotal)}}>{fv(matTotal)}</td>
                            <td style={{textAlign:'right',fontSize:12,color:c(item.rate_var)}}>{fv(item.rate_var||0)}</td>
                            <td style={{textAlign:'right',fontSize:12,color:c(item.efficiency_var)}}>{fv(item.efficiency_var||0)}</td>
                            <td style={{textAlign:'right',fontSize:12,fontWeight:700,color:c(labTotal)}}>{fv(labTotal)}</td>
                            <td style={{textAlign:'right',fontSize:12,fontWeight:800,color:c(totVar)}}>{fv(totVar)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {!coVariance && <div style={{textAlign:'center',color:'#94a3b8',padding:'60px 0',fontSize:14}}>월을 선택하고 조회하세요</div>}
        </>
      )}
    </div>
  )
}
