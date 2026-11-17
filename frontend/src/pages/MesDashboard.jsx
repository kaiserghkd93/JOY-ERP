import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const REFRESH_MS = 5000

/* ── OEE 분석 탭 ──────────────────────────────────────────────── */
function OeeAnalysis() {
  const [trend, setTrend] = useState([])
  const [machineStats, setMachineStats] = useState([])
  const [dailyReport, setDailyReport] = useState(null)
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })
  const [activeTab, setActiveTab] = useState('trend')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/mes-floor/oee-trend?days=14').then(r => setTrend(r.data)).catch(() => {}),
      api.get('/mes-floor/machine-oee-summary?days=14').then(r => setMachineStats(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (activeTab === 'report') {
      api.get(`/mes-floor/daily-report?target_date=${reportDate}`).then(r => setDailyReport(r.data)).catch(() => {})
    }
  }, [activeTab, reportDate])

  const maxOee = Math.max(...trend.map(d => d.avg_oee), 1)
  const maxGood = Math.max(...trend.map(d => d.total_good), 1)

  const oeeColor = (v) => v >= 85 ? '#16a34a' : v >= 70 ? '#d97706' : '#dc2626'

  if (loading) return <div style={{ padding: 40, textAlign:'center', color:'#94a3b8' }}>로딩 중...</div>

  return (
    <div>
      {/* 서브 탭 */}
      <div style={{ display:'flex', gap:0, marginBottom:18, border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden', width:'fit-content' }}>
        {[{ k:'trend', label:'📈 주간 OEE 트렌드' }, { k:'machine', label:'🔧 호기별 OEE' }, { k:'report', label:'📋 일보' }].map(t => (
          <button key={t.k} onClick={() => setActiveTab(t.k)} style={{
            padding:'7px 20px', fontSize:12, fontWeight:600, border:'none', cursor:'pointer',
            background:activeTab===t.k?'#1d4ed8':'#fff', color:activeTab===t.k?'#fff':'#64748b',
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'trend' && (
        <div>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>최근 14일 OEE 트렌드</div>
          {trend.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>MES 세션 데이터 없음</div>
          ) : (
            <>
              {/* OEE 바 차트 */}
              <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'16px 16px 8px', marginBottom:12 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:10 }}>평균 OEE (%)</div>
                <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:120 }}>
                  {trend.map(d => {
                    const h = d.avg_oee > 0 ? Math.max((d.avg_oee / 100) * 100, 4) : 2
                    const color = oeeColor(d.avg_oee)
                    const shortDate = d.date.slice(5)
                    return (
                      <div key={d.date} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                        <div style={{ fontSize:9, color, fontWeight:700 }}>{d.avg_oee > 0 ? d.avg_oee+'%' : ''}</div>
                        <div style={{ width:'100%', height:`${h}px`, background:color, borderRadius:'3px 3px 0 0', minHeight:2 }} />
                        <div style={{ fontSize:9, color:'#94a3b8', textAlign:'center' }}>{shortDate}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:8, fontSize:11 }}>
                  {[{ color:'#16a34a', label:'85% 이상 (우수)' }, { color:'#d97706', label:'70~85% (보통)' }, { color:'#dc2626', label:'70% 미만 (불량)' }].map(l => (
                    <span key={l.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <span style={{ width:10, height:10, borderRadius:2, background:l.color, display:'inline-block' }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* 양품/불량 차트 */}
              <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'16px 16px 8px', marginBottom:12 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:10 }}>일별 생산수량</div>
                <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:100 }}>
                  {trend.map(d => {
                    const goodH = d.total_good > 0 ? Math.max((d.total_good / maxGood) * 90, 3) : 0
                    const defH = d.total_defect > 0 ? Math.max((d.total_defect / maxGood) * 90, 2) : 0
                    return (
                      <div key={d.date} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
                        {d.total_good > 0 && <div style={{ fontSize:8, color:'#1d4ed8' }}>{d.total_good}</div>}
                        <div style={{ width:'100%', display:'flex', flexDirection:'column-reverse' }}>
                          <div style={{ width:'100%', height:`${goodH}px`, background:'#3b82f6', borderRadius:'0' }} />
                          {defH > 0 && <div style={{ width:'100%', height:`${defH}px`, background:'#f87171', borderRadius:'2px 2px 0 0' }} />}
                        </div>
                        <div style={{ fontSize:9, color:'#94a3b8' }}>{d.date.slice(5)}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:6, fontSize:11 }}>
                  <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:10, height:10, background:'#3b82f6', display:'inline-block', borderRadius:2 }} />양품</span>
                  <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:10, height:10, background:'#f87171', display:'inline-block', borderRadius:2 }} />불량</span>
                </div>
              </div>

              {/* 요약 통계 */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                {[
                  { label:'평균 OEE', value:`${trend.filter(d=>d.avg_oee>0).reduce((s,d)=>s+d.avg_oee,0) / (trend.filter(d=>d.avg_oee>0).length||1) | 0}%`, color:'#1d4ed8' },
                  { label:'총 양품', value:(trend.reduce((s,d)=>s+d.total_good,0)).toLocaleString()+'개', color:'#16a34a' },
                  { label:'총 불량', value:(trend.reduce((s,d)=>s+d.total_defect,0)).toLocaleString()+'개', color:'#dc2626' },
                  { label:'평균 불량률', value:`${(trend.filter(d=>d.defect_rate>0).reduce((s,d)=>s+d.defect_rate,0) / (trend.filter(d=>d.defect_rate>0).length||1)).toFixed(2)}%`, color:'#d97706' },
                ].map(k => (
                  <div key={k.label} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:11, color:'#64748b' }}>{k.label}</div>
                    <div style={{ fontSize:18, fontWeight:800, color:k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'machine' && (
        <div>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>호기별 OEE 순위 (최근 14일)</div>
          {machineStats.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>데이터 없음</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>순위</th><th>호기</th>
                  <th style={{ minWidth:160 }}>평균 OEE</th>
                  <th style={{ textAlign:'right' }}>양품</th>
                  <th style={{ textAlign:'right' }}>불량</th>
                  <th style={{ textAlign:'right' }}>불량률</th>
                  <th style={{ textAlign:'right' }}>세션수</th>
                </tr>
              </thead>
              <tbody>
                {machineStats.map((m, i) => {
                  const color = oeeColor(m.avg_oee)
                  return (
                    <tr key={m.machine_id}>
                      <td style={{ textAlign:'center' }}>
                        <span style={{ fontWeight:800, color: i===0?'#d97706':i===1?'#94a3b8':i===2?'#b45309':'#64748b' }}>
                          {i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`}
                        </span>
                      </td>
                      <td style={{ fontWeight:600 }}>{m.machine_name}</td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, height:8, background:'#e5e7eb', borderRadius:4 }}>
                            <div style={{ width:`${Math.min(100,m.avg_oee)}%`, height:'100%', background:color, borderRadius:4 }} />
                          </div>
                          <span style={{ fontSize:12, fontWeight:800, color, minWidth:36, textAlign:'right' }}>{m.avg_oee}%</span>
                        </div>
                      </td>
                      <td style={{ textAlign:'right', color:'#1d4ed8', fontWeight:600 }}>{m.total_good.toLocaleString()}</td>
                      <td style={{ textAlign:'right', color:m.total_defect>0?'#dc2626':undefined }}>{m.total_defect.toLocaleString()}</td>
                      <td style={{ textAlign:'right', color:m.defect_rate>5?'#dc2626':m.defect_rate>2?'#d97706':'#16a34a', fontWeight:600 }}>
                        {m.defect_rate}%
                      </td>
                      <td style={{ textAlign:'right', color:'#64748b' }}>{m.sessions}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'report' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <span style={{ fontSize:13, fontWeight:700 }}>일보 조회:</span>
            <input type="date" className="form-control" value={reportDate}
              onChange={e => setReportDate(e.target.value)} style={{ width:160 }} />
          </div>
          {dailyReport ? (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:14 }}>
                {[
                  { label:'가동 호기수', value:`${dailyReport.summary.active_machines}대`, color:'#1d4ed8' },
                  { label:'평균 OEE', value:`${dailyReport.summary.avg_oee}%`, color:oeeColor(dailyReport.summary.avg_oee) },
                  { label:'총 양품', value:`${dailyReport.summary.total_good.toLocaleString()}개`, color:'#16a34a' },
                  { label:'총 불량', value:`${dailyReport.summary.total_defect.toLocaleString()}개`, color:'#dc2626' },
                  { label:'불량률', value:`${dailyReport.summary.defect_rate}%`, color:'#d97706' },
                ].map(k => (
                  <div key={k.label} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:11, color:'#64748b' }}>{k.label}</div>
                    <div style={{ fontSize:16, fontWeight:800, color:k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>
              <table className="table" style={{ fontSize:12 }}>
                <thead>
                  <tr><th>호기</th><th>품번</th><th>품명</th><th>작업자</th><th style={{ textAlign:'right' }}>목표</th><th style={{ textAlign:'right' }}>양품</th><th style={{ textAlign:'right' }}>불량</th><th style={{ textAlign:'center' }}>OEE</th><th style={{ textAlign:'right' }}>가동(분)</th><th>상태</th></tr>
                </thead>
                <tbody>
                  {dailyReport.rows.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign:'center', color:'#94a3b8', padding:24 }}>해당일 데이터 없음</td></tr>
                  ) : dailyReport.rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight:600 }}>{r.machine_name}</td>
                      <td style={{ fontSize:11, fontFamily:'monospace' }}>{r.part_no}</td>
                      <td>{r.part_name}</td>
                      <td style={{ fontSize:11 }}>{r.worker_id || '—'}</td>
                      <td style={{ textAlign:'right' }}>{(r.target_qty||0).toLocaleString()}</td>
                      <td style={{ textAlign:'right', color:'#1d4ed8', fontWeight:700 }}>{(r.good_qty||0).toLocaleString()}</td>
                      <td style={{ textAlign:'right', color:r.defect_qty>0?'#dc2626':undefined }}>{(r.defect_qty||0).toLocaleString()}</td>
                      <td style={{ textAlign:'center' }}>
                        <span style={{ fontWeight:700, fontSize:12, color:oeeColor(r.oee||0) }}>{r.oee||0}%</span>
                      </td>
                      <td style={{ textAlign:'right', color:'#64748b' }}>{Math.round(r.working_min||0)}</td>
                      <td><span style={{ fontSize:10, padding:'2px 6px', borderRadius:20, fontWeight:600,
                        background:r.status==='completed'?'#dcfce7':r.status==='active'?'#dbeafe':'#f1f5f9',
                        color:r.status==='completed'?'#15803d':r.status==='active'?'#1d4ed8':'#64748b',
                      }}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>일보 로딩 중...</div>
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_COLOR = {
  '가동':  { bg: '#dcfce7', border: '#16a34a', text: '#15803d', dot: '#16a34a' },
  '비가동': { bg: '#fee2e2', border: '#dc2626', text: '#dc2626', dot: '#dc2626' },
  '대기':  { bg: '#f1f5f9', border: '#cbd5e1', text: '#64748b', dot: '#94a3b8' },
}

/* ── 원가 분석 탭 ───────────────────────────────────────────────── */
function CostAnalysis() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/mes-floor/cost-analysis?year=${year}&month=${month}`)
      .then(r => setData(r.data)).catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year, month])
  useEffect(() => { load() }, [load])

  const marginColor = (m) => m === null ? '#94a3b8' : m >= 20 ? '#16a34a' : m >= 0 ? '#d97706' : '#dc2626'

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <select value={year} onChange={e => setYear(+e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {[now.getFullYear()-1, now.getFullYear()].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <button onClick={load} style={{ padding:'6px 14px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>조회</button>
      </div>

      {loading && <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>로딩 중...</div>}

      {data && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
            {[
              { label:'총 재료비', val: data.total_material?.toLocaleString(), unit:'원' },
              { label:'총 노무비', val: data.total_labor?.toLocaleString(), unit:'원' },
              { label:'총 원가', val: data.total_cost?.toLocaleString(), unit:'원', bold:true },
            ].map(k => (
              <div key={k.label} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 16px', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>{k.label}</div>
                <div style={{ fontSize:20, fontWeight:k.bold?800:600, color:'#374151' }}>{k.val}<span style={{ fontSize:12, color:'#94a3b8', marginLeft:3 }}>{k.unit}</span></div>
              </div>
            ))}
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['품번','품명','생산량','재료비','노무비','단위원가','이익률'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', textAlign:'right', borderBottom:'2px solid #e2e8f0', fontWeight:700, color:'#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map(r => (
                <tr key={r.part_no} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'8px 12px', fontFamily:'monospace', textAlign:'left', color:'#374151' }}>{r.part_no}</td>
                  <td style={{ padding:'8px 12px', textAlign:'left', color:'#374151' }}>{r.part_name}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right' }}>{r.good_qty?.toLocaleString()}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right' }}>{r.material_cost?.toLocaleString()}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right' }}>{r.labor_cost?.toLocaleString()}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:700 }}>{r.unit_cost?.toLocaleString()}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:800, color: marginColor(r.margin) }}>
                    {r.margin !== null ? `${r.margin}%` : '-'}
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={7} style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>데이터 없음</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}


/* ── SPC 관리도 탭 ──────────────────────────────────────────────── */
function SpcChart() {
  const [items, setItems] = useState([])
  const [partNo, setPartNo] = useState('')
  const [dim, setDim] = useState('dim1')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/master/items').then(r => setItems(r.data || [])).catch(() => {})
  }, [])

  const load = () => {
    if (!partNo) return
    setLoading(true)
    api.get(`/mes-floor/spc-chart?part_no=${encodeURIComponent(partNo)}&dim=${dim}`)
      .then(r => setData(r.data)).catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  const groups = data?.groups || []
  const maxXbar = groups.length ? Math.max(...groups.map(g => g.xbar), data.ucl_x || 0) : 1
  const minXbar = groups.length ? Math.min(...groups.map(g => g.xbar), data.lcl_x || 0) : 0
  const maxR = groups.length ? Math.max(...groups.map(g => g.r), data.ucl_r || 0) : 1
  const rangeX = maxXbar - minXbar || 1

  const plotY = (v, min, max) => {
    const range = max - min || 1
    return Math.round(10 + ((max - v) / range) * 80)
  }

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <select value={partNo} onChange={e => setPartNo(e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13, minWidth:160 }}>
          <option value="">품번 선택</option>
          {items.map(i => <option key={i.part_no} value={i.part_no}>{i.part_no} {i.name}</option>)}
        </select>
        <select value={dim} onChange={e => setDim(e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          <option value="dim1">치수 1</option>
          <option value="dim2">치수 2</option>
          <option value="dim3">치수 3</option>
        </select>
        <button onClick={load} style={{ padding:'6px 14px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>조회</button>
      </div>

      {loading && <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>로딩 중...</div>}

      {data && groups.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>검사 데이터 없음 — 초·중·종물 검사를 먼저 등록하세요</div>}

      {data && groups.length > 0 && (
        <div>
          {/* 관리 한계값 요약 */}
          <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap' }}>
            {[
              { label:'X̄̄ (중심선)', val: data.xbar_bar },
              { label:'UCL(X̄)', val: data.ucl_x },
              { label:'LCL(X̄)', val: data.lcl_x },
              { label:'R̄', val: data.r_bar },
              { label:'UCL(R)', val: data.ucl_r },
              data.spec ? { label:'규격', val: data.spec } : null,
            ].filter(Boolean).map(k => (
              <div key={k.label} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'8px 14px', textAlign:'center', minWidth:80 }}>
                <div style={{ fontSize:11, color:'#64748b' }}>{k.label}</div>
                <div style={{ fontSize:16, fontWeight:700, color:'#374151' }}>{k.val}</div>
              </div>
            ))}
          </div>

          {/* X̄ 관리도 (SVG) */}
          <div style={{ marginBottom:8, fontWeight:700, fontSize:13, color:'#374151' }}>X̄ 관리도</div>
          <svg viewBox={`0 0 ${Math.max(groups.length * 30 + 40, 400)} 100`} style={{ width:'100%', height:120, background:'#f8fafc', borderRadius:8, border:'1px solid #e2e8f0', display:'block', marginBottom:16 }}>
            {/* UCL/LCL/CL 라인 */}
            <line x1="20" y1={plotY(data.ucl_x, minXbar, maxXbar)} x2={groups.length*30+30} y2={plotY(data.ucl_x, minXbar, maxXbar)} stroke="#dc2626" strokeDasharray="4" strokeWidth="1" />
            <line x1="20" y1={plotY(data.xbar_bar, minXbar, maxXbar)} x2={groups.length*30+30} y2={plotY(data.xbar_bar, minXbar, maxXbar)} stroke="#374151" strokeWidth="1.5" />
            <line x1="20" y1={plotY(data.lcl_x, minXbar, maxXbar)} x2={groups.length*30+30} y2={plotY(data.lcl_x, minXbar, maxXbar)} stroke="#dc2626" strokeDasharray="4" strokeWidth="1" />
            {/* 데이터 포인트 연결 */}
            {groups.map((g, i) => i > 0 && (
              <line key={`l${i}`}
                x1={30 + (i-1)*30} y1={plotY(groups[i-1].xbar, minXbar, maxXbar)}
                x2={30 + i*30} y2={plotY(g.xbar, minXbar, maxXbar)}
                stroke="#1d4ed8" strokeWidth="1.5" />
            ))}
            {groups.map((g, i) => {
              const y = plotY(g.xbar, minXbar, maxXbar)
              const oor = g.xbar > data.ucl_x || g.xbar < data.lcl_x
              return <circle key={i} cx={30 + i*30} cy={y} r="4" fill={oor ? '#dc2626' : '#1d4ed8'} />
            })}
          </svg>

          {/* 데이터 테이블 */}
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['그룹','검사','X̄','R','판정'].map(h => (
                    <th key={h} style={{ padding:'6px 10px', textAlign:'center', borderBottom:'2px solid #e2e8f0', fontWeight:700, color:'#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const oor = g.xbar > data.ucl_x || g.xbar < data.lcl_x
                  return (
                    <tr key={g.idx} style={{ borderBottom:'1px solid #f1f5f9', background: oor ? '#fef2f2' : 'transparent' }}>
                      <td style={{ padding:'6px 10px', textAlign:'center' }}>{g.idx}</td>
                      <td style={{ padding:'6px 10px', textAlign:'center', color:'#64748b' }}>{g.insp_type}</td>
                      <td style={{ padding:'6px 10px', textAlign:'center', fontWeight:700, color: oor ? '#dc2626' : '#374151' }}>{g.xbar}</td>
                      <td style={{ padding:'6px 10px', textAlign:'center' }}>{g.r}</td>
                      <td style={{ padding:'6px 10px', textAlign:'center' }}>
                        <span style={{ color: oor ? '#dc2626' : '#16a34a', fontWeight:700 }}>{oor ? '이상' : 'OK'}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}


/* ── SMED 분석 탭 ───────────────────────────────────────────────── */
function SmedAnalysis() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/mes-floor/smed-analysis?days=${days}`)
      .then(r => setData(r.data)).catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [days])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>로딩 중...</div>

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        {[7, 14, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            style={{ padding:'6px 14px', borderRadius:6, border:`1px solid ${days===d?'#1d4ed8':'#d1d5db'}`, background:days===d?'#1d4ed8':'#fff', color:days===d?'#fff':'#374151', fontSize:13, cursor:'pointer' }}>
            {d}일
          </button>
        ))}
      </div>

      {data && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
            {[
              { label:'평균 교체 시간', val: `${data.avg_min}분`, color: data.avg_min <= data.target_min ? '#16a34a' : '#dc2626' },
              { label:'최소 / 최대', val: `${data.min_min} / ${data.max_min}분`, color:'#374151' },
              { label:'교체 횟수', val: `${data.count}회`, color:'#1d4ed8' },
              { label:'목표', val: `${data.target_min}분 이하`, color:'#d97706' },
            ].map(k => (
              <div key={k.label} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 16px', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>{k.label}</div>
                <div style={{ fontSize:18, fontWeight:700, color: k.color }}>{k.val}</div>
              </div>
            ))}
          </div>

          {data.by_machine?.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:8, color:'#374151' }}>호기별 평균</div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {data.by_machine.map(m => (
                  <div key={m.machine_id} style={{ background: m.avg_min <= data.target_min ? '#f0fdf4' : '#fef2f2', border:`1px solid ${m.avg_min<=data.target_min?'#bbf7d0':'#fecaca'}`, borderRadius:8, padding:'8px 16px', textAlign:'center', minWidth:80 }}>
                    <div style={{ fontSize:12, color:'#64748b' }}>{m.machine_id}</div>
                    <div style={{ fontSize:16, fontWeight:800, color: m.avg_min<=data.target_min?'#16a34a':'#dc2626' }}>{m.avg_min}분</div>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>{m.count}회</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.count === 0 && <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>금형 교체 기록 없음</div>}
        </>
      )}
    </div>
  )
}


/* ── 5-Why 보드 탭 ──────────────────────────────────────────────── */
function FiveWhyBoard() {
  const [andons, setAndons] = useState([])
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ why1:'', why2:'', why3:'', why4:'', why5:'', root_cause:'', countermeasure:'', created_by:'' })
  const [existing, setExisting] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/mes-floor/andon/active').then(r => {
      // 미해결 + 품질이상 우선
      const all = [...(r.data||[])].sort((a,b) => a.andon_type === '품질이상' ? -1 : 1)
      setAndons(all)
    }).catch(() => {})
    // 기존 5-Why 목록도 가져오기
    api.get('/mes-floor/five-why?limit=20').then(r => setExisting(r.data||[])).catch(() => {})
  }, [])

  const submit = async () => {
    if (!selected) return
    setLoading(true)
    try {
      await api.post('/mes-floor/five-why', { andon_id: selected.id, ...form })
      alert('5-Why 등록 완료')
      setSelected(null)
      setForm({ why1:'', why2:'', why3:'', why4:'', why5:'', root_cause:'', countermeasure:'', created_by:'' })
      api.get('/mes-floor/five-why?limit=20').then(r => setExisting(r.data||[])).catch(() => {})
    } catch { alert('등록 실패') }
    setLoading(false)
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap:20 }}>
      {/* 미해결 Andon 목록 */}
      <div>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:'#374151' }}>🚨 미해결 안돈 ({andons.length}건)</div>
        {andons.length === 0 && <div style={{ padding:20, color:'#94a3b8', fontSize:13 }}>미해결 안돈 없음</div>}
        {andons.map(a => (
          <div key={a.id} onClick={() => setSelected(a)} style={{ background: selected?.id===a.id?'#eff6ff':'#f8fafc', border:`1px solid ${selected?.id===a.id?'#3b82f6':'#e2e8f0'}`, borderRadius:8, padding:'10px 14px', marginBottom:8, cursor:'pointer' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
              <span style={{ fontWeight:700, color:'#374151' }}>{a.machine_id} — {a.andon_type}</span>
              <span style={{ color:'#94a3b8' }}>{a.called_at?.slice(0,16)}</span>
            </div>
            {a.note && <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>{a.note}</div>}
          </div>
        ))}

        <div style={{ fontWeight:700, fontSize:13, marginTop:20, marginBottom:10, color:'#374151' }}>📋 최근 5-Why 이력</div>
        {existing.slice(0,5).map(e => (
          <div key={e.id} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 12px', marginBottom:6, fontSize:12 }}>
            <div style={{ color:'#374151', fontWeight:600 }}>Why1: {e.why1}</div>
            {e.root_cause && <div style={{ color:'#64748b', marginTop:2 }}>근본원인: {e.root_cause}</div>}
            {e.countermeasure && <div style={{ color:'#16a34a', marginTop:2 }}>대책: {e.countermeasure}</div>}
            <div style={{ color:'#94a3b8', marginTop:2 }}>{e.created_at?.slice(0,16)}</div>
          </div>
        ))}
      </div>

      {/* 5-Why 작성 폼 */}
      {selected && (
        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, padding:20 }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:4, color:'#374151' }}>5-Why 분석</div>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:16 }}>{selected.machine_id} — {selected.andon_type}: {selected.note}</div>
          {['why1','why2','why3','why4','why5'].map((k,i) => (
            <div key={k} style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>Why {i+1}</div>
              <input value={form[k]} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} placeholder={`왜 ${i+1}`}
                style={{ width:'100%', padding:'8px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13, boxSizing:'border-box' }} />
            </div>
          ))}
          {[['root_cause','근본 원인'],['countermeasure','재발 방지 대책'],['created_by','작성자']].map(([k,label]) => (
            <div key={k} style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>{label}</div>
              <input value={form[k]} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} placeholder={label}
                style={{ width:'100%', padding:'8px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13, boxSizing:'border-box' }} />
            </div>
          ))}
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={submit} disabled={loading}
              style={{ flex:2, padding:'10px', borderRadius:8, border:'none', background:'#1d4ed8', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:13 }}>
              등록 (Andon 해결 처리)
            </button>
            <button onClick={() => setSelected(null)}
              style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid #d1d5db', background:'#fff', color:'#64748b', cursor:'pointer', fontSize:13 }}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


/* ── 납기 추적 탭 ───────────────────────────────────────────────── */
function DeliveryTracking() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/mes-floor/delivery-tracking?year=${year}&month=${month}`)
      .then(r => setData(r.data)).catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year, month])
  useEffect(() => { load() }, [load])

  const statusColor = (item) => {
    if (item.shipped_qty >= item.order_qty) return { bg:'#f0fdf4', border:'#bbf7d0', badge:'#16a34a', label:'출하완료' }
    if (item.on_time === false) return { bg:'#fef2f2', border:'#fecaca', badge:'#dc2626', label:'납기초과' }
    if (new Date(item.due_date) < new Date()) return { bg:'#fff7ed', border:'#fed7aa', badge:'#d97706', label:'납기임박' }
    return { bg:'#f8fafc', border:'#e2e8f0', badge:'#64748b', label:'진행중' }
  }

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <select value={year} onChange={e => setYear(+e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <button onClick={load} style={{ padding:'6px 14px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>조회</button>
      </div>

      {loading && <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>로딩 중...</div>}

      {data?.items?.map(item => {
        const s = statusColor(item)
        const pct = item.order_qty > 0 ? Math.min(100, Math.round(item.shipped_qty / item.order_qty * 100)) : 0
        return (
          <div key={item.so_no} onClick={() => setExpanded(expanded===item.so_no ? null : item.so_no)}
            style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:10, padding:'12px 16px', marginBottom:10, cursor:'pointer' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div>
                <span style={{ fontWeight:800, fontSize:13, color:'#374151' }}>{item.so_no}</span>
                <span style={{ fontSize:12, color:'#64748b', marginLeft:10 }}>{item.partner_name}</span>
                <span style={{ fontSize:12, color:'#64748b', marginLeft:6 }}>{item.part_no} {item.part_name}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:11, color:'#64748b' }}>납기 {item.due_date}</span>
                <span style={{ background:s.badge, color:'#fff', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>{s.label}</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:16, fontSize:12, color:'#64748b', marginBottom:6 }}>
              <span>수주 <strong style={{ color:'#374151' }}>{item.order_qty?.toLocaleString()}</strong></span>
              <span>생산 <strong style={{ color:'#1d4ed8' }}>{item.wo_good_qty?.toLocaleString()}</strong></span>
              <span>출하 <strong style={{ color:'#16a34a' }}>{item.shipped_qty?.toLocaleString()}</strong></span>
              <span>잔여 <strong style={{ color: item.open_qty>0 ? '#d97706' : '#374151' }}>{item.open_qty?.toLocaleString()}</strong></span>
            </div>
            <div style={{ background:'#e2e8f0', borderRadius:4, height:6, overflow:'hidden' }}>
              <div style={{ width:`${pct}%`, height:'100%', background: s.badge, borderRadius:4 }} />
            </div>

            {expanded === item.so_no && item.work_orders?.length > 0 && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #e2e8f0' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>연결 WO ({item.wo_count}건)</div>
                {item.work_orders.map(w => (
                  <div key={w.wo_no} style={{ fontSize:11, color:'#374151', marginBottom:3 }}>
                    {w.wo_no} — {w.plan_date} — {w.status} — 양품 {w.good_qty?.toLocaleString()}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {data?.items?.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>해당 월 수주 없음</div>}
    </div>
  )
}


/* ── 계획 대비 실적 탭 ─────────────────────────────────────────── */
function PlanVsActual() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/mes-floor/plan-vs-actual?year=${year}&month=${month}`)
      .then(r => setData(r.data)).catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year, month])

  useEffect(() => { load() }, [load])

  const achColor = (pct) => pct >= 100 ? '#16a34a' : pct >= 80 ? '#d97706' : '#dc2626'

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <select value={year} onChange={e => setYear(+e.target.value)}
          style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)}
          style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <button onClick={load} style={{ padding:'6px 14px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>조회</button>
      </div>

      {loading && <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>로딩 중...</div>}

      {data && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['품번', '품명', '계획수량', '실적수량', '달성률', '달성 현황'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', textAlign:'left', borderBottom:'2px solid #e2e8f0', fontWeight:700, color:'#374151', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr><td colSpan={6} style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>계획 데이터 없음</td></tr>
              )}
              {data.items.map(row => {
                const pct = row.achievement_pct
                const barW = Math.min(pct, 100)
                return (
                  <tr key={row.part_no} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'8px 12px', fontFamily:'monospace', color:'#374151' }}>{row.part_no}</td>
                    <td style={{ padding:'8px 12px', color:'#374151' }}>{row.part_name}</td>
                    <td style={{ padding:'8px 12px', textAlign:'right', color:'#374151' }}>{row.planned_qty.toLocaleString()}</td>
                    <td style={{ padding:'8px 12px', textAlign:'right', color:'#374151', fontWeight:700 }}>{row.actual_qty.toLocaleString()}</td>
                    <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:800, color: achColor(pct) }}>{pct.toFixed(1)}%</td>
                    <td style={{ padding:'8px 12px', minWidth:120 }}>
                      <div style={{ background:'#f1f5f9', borderRadius:4, height:10, overflow:'hidden' }}>
                        <div style={{ width:`${barW}%`, height:'100%', background: achColor(pct), borderRadius:4 }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {data.items.length > 0 && (
              <tfoot>
                <tr style={{ background:'#f8fafc', fontWeight:800 }}>
                  <td colSpan={2} style={{ padding:'8px 12px', color:'#374151' }}>합계</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', color:'#374151' }}>{data.items.reduce((s,r)=>s+r.planned_qty,0).toLocaleString()}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', color:'#374151' }}>{data.items.reduce((s,r)=>s+r.actual_qty,0).toLocaleString()}</td>
                  <td colSpan={2} style={{ padding:'8px 12px', color:'#374151' }}>
                    {(() => {
                      const p = data.items.reduce((s,r)=>s+r.planned_qty,0)
                      const a = data.items.reduce((s,r)=>s+r.actual_qty,0)
                      const pct = p > 0 ? (a/p*100).toFixed(1) : 0
                      return <span style={{ color: achColor(+pct) }}>{pct}%</span>
                    })()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}


/* ── 불량 파레토 탭 ───────────────────────────────────────────── */
function DefectPareto() {
  const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(1); return fmtDate(d) })
  const [end,   setEnd]   = useState(() => fmtDate(new Date()))
  const [machineId, setMachineId] = useState('')
  const [machines, setMachines]   = useState([])
  const [data, setData]   = useState({ total:0, items:[] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/mes-floor/machines').then(r => setMachines(r.data)).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    const p = new URLSearchParams({ start, end })
    if (machineId) p.set('machine_id', machineId)
    api.get(`/mes-floor/defect-pareto?${p}`)
      .then(r => setData(r.data))
      .catch(() => setData({ total:0, items:[] }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [start, end, machineId])

  const maxCount = Math.max(...data.items.map(i => i.count), 1)

  return (
    <div>
      {/* 필터 */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div className="form-group" style={{ margin:0 }}>
          <label style={{ fontSize:11 }}>시작일</label>
          <input type="date" className="form-control" value={start} onChange={e=>setStart(e.target.value)} style={{ width:140 }} />
        </div>
        <div className="form-group" style={{ margin:0 }}>
          <label style={{ fontSize:11 }}>종료일</label>
          <input type="date" className="form-control" value={end} onChange={e=>setEnd(e.target.value)} style={{ width:140 }} />
        </div>
        <div className="form-group" style={{ margin:0 }}>
          <label style={{ fontSize:11 }}>호기</label>
          <select className="form-control" value={machineId} onChange={e=>setMachineId(e.target.value)} style={{ width:120 }}>
            <option value="">전체</option>
            {machines.map(m=><option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>로딩 중...</div>
      ) : data.items.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>불량 데이터 없음</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:20 }}>
          {/* 바 차트 */}
          <div style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:20, background:'#fff' }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:16 }}>
              불량 유형별 발생 건수 — 총 <strong style={{ color:'#dc2626' }}>{data.total.toLocaleString()}</strong>건
            </div>
            {data.items.map((item, i) => (
              <div key={item.defect_type} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                  <span style={{ fontWeight:600 }}>
                    <span style={{ display:'inline-block', width:20, textAlign:'right', color:'#94a3b8', marginRight:8 }}>{i+1}</span>
                    {item.defect_type}
                  </span>
                  <span style={{ color:'#dc2626', fontWeight:700 }}>{item.count.toLocaleString()} ({item.pct}%)</span>
                </div>
                <div style={{ position:'relative', height:18, background:'#f1f5f9', borderRadius:4 }}>
                  <div style={{
                    width:`${(item.count/maxCount)*100}%`, height:'100%', borderRadius:4,
                    background: i===0?'#dc2626':i===1?'#f97316':i===2?'#f59e0b':'#94a3b8',
                    transition:'width 0.4s',
                  }} />
                  {/* 누적 % */}
                  <div style={{
                    position:'absolute', right:4, top:1, fontSize:10, color:'#64748b', fontWeight:600,
                  }}>누적 {item.cumulative_pct}%</div>
                </div>
              </div>
            ))}
          </div>

          {/* 테이블 */}
          <div style={{ border:'1px solid #e2e8f0', borderRadius:10, background:'#fff', overflow:'auto' }}>
            <table className="table" style={{ marginBottom:0 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>불량 유형</th>
                  <th style={{ textAlign:'right' }}>건수</th>
                  <th style={{ textAlign:'right' }}>비율</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, i) => (
                  <tr key={item.defect_type} style={{ background: i<3?'#fff7f7':undefined }}>
                    <td style={{ color:'#94a3b8', fontSize:11 }}>{i+1}</td>
                    <td style={{ fontWeight:i<3?700:400 }}>{item.defect_type}</td>
                    <td style={{ textAlign:'right', fontWeight:700, color:'#dc2626' }}>{item.count.toLocaleString()}</td>
                    <td style={{ textAlign:'right', fontSize:11, color:'#64748b' }}>{item.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}


/* ── 공정 조건 기록표 ───────────────────────────────────────────── */
function ProcessConditionTab() {
  const now = new Date()
  const [woNo, setWoNo] = useState('')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (!woNo) return
    setLoading(true)
    api.get(`/mes-floor/process-condition?wo_no=${woNo}&limit=20`)
      .then(r => setData(r.data)).catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  const fields = [
    ['노즐온도', 'barrel_temp1', '℃'], ['1존온도', 'barrel_temp2', '℃'], ['2존온도', 'barrel_temp3', '℃'],
    ['코어온도', 'mold_temp_core', '℃'], ['캐비티온도', 'mold_temp_cav', '℃'],
    ['사출압', 'injection_pressure', 'MPa'], ['보압', 'holding_pressure', 'MPa'], ['배압', 'back_pressure', 'MPa'],
    ['사출속도', 'injection_speed', 'mm/s'], ['냉각시간', 'cooling_time', 's'], ['사이클', 'cycle_time', 's'],
    ['숏트중량', 'shot_weight', 'g'],
  ]

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <input value={woNo} onChange={e => setWoNo(e.target.value)} placeholder="작업지시번호 (WO-...)"
          style={{ padding:'7px 12px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13, width:220 }} />
        <button onClick={load} style={{ padding:'7px 16px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', cursor:'pointer', fontSize:13 }}>조회</button>
      </div>
      {loading ? <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>로딩 중...</div> : data.length === 0 ? (
        <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>공정 조건 기록 없음<br/><small>작업자 화면에서 공정 조건을 입력합니다</small></div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                <th style={{ padding:'8px', textAlign:'left', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>기록일시</th>
                <th style={{ padding:'8px', textAlign:'left', borderBottom:'2px solid #e2e8f0' }}>기록자</th>
                {fields.map(([label]) => (
                  <th key={label} style={{ padding:'8px', textAlign:'right', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'7px 8px', whiteSpace:'nowrap', color:'#64748b', fontSize:11 }}>{r.created_at?.slice(0,16)}</td>
                  <td style={{ padding:'7px 8px' }}>{r.recorded_by || '-'}</td>
                  {fields.map(([, key, unit]) => (
                    <td key={key} style={{ padding:'7px 8px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>
                      {r[key] != null ? `${r[key]} ${unit}` : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


/* ── 금형 PM 캘린더 ─────────────────────────────────────────────── */
function PmCalendar() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ mold_no:'', plan_date:'', pm_type:'정기', description:'' })
  const [molds, setMolds] = useState([])

  const load = useCallback(() => {
    Promise.all([
      api.get(`/mes-floor/pm-calendar?year=${year}&month=${month}`).then(r => setData(r.data)).catch(() => {}),
      api.get('/mold/list?limit=100').then(r => setMolds(r.data?.items || [])).catch(() => {}),
    ])
  }, [year, month])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    try {
      await api.post('/mes-floor/pm-plan', form)
      setShowForm(false); load()
    } catch (e) { alert('등록 실패: ' + (e.response?.data?.detail || e.message)) }
  }

  const complete = async (id) => {
    const by = prompt('완료 처리자 ID')
    if (by === null) return
    try { await api.patch(`/mes-floor/pm-plan/${id}/complete?completed_by=${by}`); load() }
    catch (e) { alert('실패: ' + (e.response?.data?.detail || e.message)) }
  }

  const pmColor = (s) => s === '완료' ? '#16a34a' : s === '연기' ? '#d97706' : '#1d4ed8'

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
        <select value={year} onChange={e => setYear(+e.target.value)}
          style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)}
          style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <button onClick={load} style={{ padding:'6px 14px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', cursor:'pointer', fontSize:13 }}>조회</button>
        <button onClick={() => setShowForm(v => !v)} style={{ padding:'6px 14px', borderRadius:6, background:'#16a34a', color:'#fff', border:'none', cursor:'pointer', fontSize:13 }}>+ PM 계획 등록</button>
      </div>

      {showForm && (
        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:16, marginBottom:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:10 }}>
            <select value={form.mold_no} onChange={e => setForm(f => ({...f,mold_no:e.target.value}))}
              style={{ padding:'7px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
              <option value="">금형 선택</option>
              {molds.map(m => <option key={m.mold_no} value={m.mold_no}>{m.mold_no} {m.mold_name}</option>)}
            </select>
            <input type="date" value={form.plan_date} onChange={e => setForm(f => ({...f,plan_date:e.target.value}))}
              style={{ padding:'7px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }} />
            <select value={form.pm_type} onChange={e => setForm(f => ({...f,pm_type:e.target.value}))}
              style={{ padding:'7px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
              {['정기','임시','마감'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={form.description} onChange={e => setForm(f => ({...f,description:e.target.value}))} placeholder="작업 내용"
              style={{ padding:'7px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }} />
          </div>
          <button onClick={submit} style={{ padding:'7px 20px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', cursor:'pointer', fontSize:13 }}>등록</button>
        </div>
      )}

      {data && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>PM 계획 목록</div>
            {data.plans.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'#94a3b8', border:'1px solid #e2e8f0', borderRadius:8 }}>이번 달 PM 계획 없음</div>
            ) : data.plans.map(p => (
              <div key={p.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px', marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <span style={{ fontWeight:700, fontSize:13 }}>{p.mold_no}</span>
                    <span style={{ fontSize:11, color:'#64748b', marginLeft:8 }}>{p.plan_date}</span>
                    <span style={{ fontSize:11, background:'#e0f2fe', color:'#0369a1', padding:'1px 7px', borderRadius:10, marginLeft:6 }}>{p.pm_type}</span>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color: pmColor(p.status) }}>{p.status}</span>
                </div>
                {p.description && <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>{p.description}</div>}
                {p.status === '계획' && (
                  <button onClick={() => complete(p.id)} style={{ marginTop:6, padding:'3px 10px', borderRadius:6, background:'#16a34a', color:'#fff', border:'none', cursor:'pointer', fontSize:11 }}>완료 처리</button>
                )}
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>PM 주의 금형</div>
            {data.overdue_molds.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'#94a3b8', border:'1px solid #e2e8f0', borderRadius:8 }}>PM 주기 초과 금형 없음</div>
            ) : data.overdue_molds.map(m => (
              <div key={m.mold_no} style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 14px', marginBottom:8 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'#dc2626' }}>⚠ {m.mold_no} {m.mold_name}</div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>PM 후 누적: {(m.since_pm_shot||0).toLocaleString()}샷 / 주기: {(m.pm_cycle_shot||0).toLocaleString()}샷</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


/* ── 작업자 스킬 매트릭스 ───────────────────────────────────────── */
function SkillMatrix() {
  const [data, setData] = useState([])
  const [form, setForm] = useState({ worker_id:'', machine_id:'', part_no:'', skill_level:'견습', certified_at:'', certified_by:'' })
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/mes-floor/worker-skill').then(r => setData(r.data)).catch(() => {}),
      api.get('/mes-floor/machines').then(r => setMachines(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!form.worker_id || !form.machine_id) return alert('작업자ID, 호기는 필수')
    try { await api.post('/mes-floor/worker-skill', form); load() }
    catch (e) { alert('실패: ' + (e.response?.data?.detail || e.message)) }
  }

  const LEVEL_COLOR = { '견습':'#94a3b8', '보조':'#3b82f6', '주작업자':'#16a34a', '교사':'#7c3aed' }

  return (
    <div>
      <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:14, marginBottom:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, marginBottom:10 }}>
          {[['작업자ID','worker_id'],['호기ID','machine_id'],['품번(선택)','part_no'],['인증자','certified_by'],['인증일','certified_at']].map(([lbl,key]) => (
            <div key={key}>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:3 }}>{lbl}</div>
              <input type={key==='certified_at'?'date':'text'} value={form[key]} onChange={e => setForm(f => ({...f,[key]:e.target.value}))}
                style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #d1d5db', fontSize:12, boxSizing:'border-box' }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize:11, color:'#64748b', marginBottom:3 }}>레벨</div>
            <select value={form.skill_level} onChange={e => setForm(f => ({...f,skill_level:e.target.value}))}
              style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #d1d5db', fontSize:12 }}>
              {['견습','보조','주작업자','교사'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <button onClick={submit} style={{ padding:'7px 20px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', cursor:'pointer', fontSize:13 }}>등록/갱신</button>
      </div>

      {loading ? <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>로딩 중...</div> : data.length === 0 ? (
        <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>스킬 데이터 없음</div>
      ) : data.map(w => (
        <div key={w.worker_id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:14, marginBottom:12 }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:10 }}>👤 {w.worker_name} ({w.worker_id})</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {w.skills.map(s => (
              <div key={s.id} style={{ background:'#f8fafc', border:`2px solid ${LEVEL_COLOR[s.skill_level]||'#e2e8f0'}`, borderRadius:8, padding:'6px 12px', minWidth:140 }}>
                <div style={{ fontWeight:700, fontSize:12 }}>{s.machine_name}</div>
                {s.part_no && <div style={{ fontSize:11, color:'#64748b' }}>품번: {s.part_no}</div>}
                <div style={{ fontSize:11, fontWeight:700, color: LEVEL_COLOR[s.skill_level], marginTop:3 }}>{s.skill_level}</div>
                {s.certified_at && <div style={{ fontSize:10, color:'#94a3b8' }}>인증: {s.certified_at}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}


/* ── 재고 ABC 분석 ──────────────────────────────────────────────── */
function AbcAnalysis() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(365)
  const [filter, setFilter] = useState('ALL')

  const load = () => {
    setLoading(true)
    api.get(`/mes-floor/abc-analysis?days=${days}`)
      .then(r => setData(r.data)).catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [days])

  const cls_color = { A:'#dc2626', B:'#d97706', C:'#16a34a' }
  const items = data?.items?.filter(i => filter === 'ALL' ? true : filter === 'DEAD' ? i.dead_stock : i.abc_class === filter) || []

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
        <select value={days} onChange={e => setDays(+e.target.value)}
          style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {[[90,'3개월'],[180,'6개월'],[365,'1년'],[730,'2년']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {data?.summary && (
          <div style={{ display:'flex', gap:6 }}>
            {['ALL','A','B','C','DEAD'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer', border:'none',
                background: filter===f ? (f==='DEAD'?'#dc2626':f==='ALL'?'#1d4ed8':cls_color[f]) : '#f1f5f9',
                color: filter===f ? '#fff' : '#374151',
              }}>
                {f === 'DEAD' ? `🚨 불용 ${data.summary.dead}` : f === 'ALL' ? `전체 ${data.total_items}` : `${f}등급 ${data.summary[f]}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>분석 중...</div> : !data ? null : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['등급','품번','품명','이동금액','누적%','최근이동일','불용재고'].map(h => (
                  <th key={h} style={{ padding:'8px 10px', textAlign:'left', borderBottom:'2px solid #e2e8f0', fontWeight:700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={7} style={{ padding:24, textAlign:'center', color:'#94a3b8' }}>데이터 없음</td></tr>}
              {items.map((i, idx) => (
                <tr key={i.part_no} style={{ borderBottom:'1px solid #f1f5f9', background: i.dead_stock?'#fef2f2':undefined }}>
                  <td style={{ padding:'7px 10px' }}>
                    <span style={{ fontWeight:800, color: cls_color[i.abc_class], fontSize:14 }}>{i.abc_class}</span>
                  </td>
                  <td style={{ padding:'7px 10px', fontFamily:'monospace', fontSize:11 }}>{i.part_no}</td>
                  <td style={{ padding:'7px 10px' }}>{i.part_name}</td>
                  <td style={{ padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{(i.move_value||0).toLocaleString()}원</td>
                  <td style={{ padding:'7px 10px', textAlign:'right' }}>{i.cumulative_pct}%</td>
                  <td style={{ padding:'7px 10px', color:'#64748b', fontSize:11 }}>{i.last_move || '-'}</td>
                  <td style={{ padding:'7px 10px', textAlign:'center' }}>{i.dead_stock ? '🚨' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


/* ── MRP 자재 부족 예측 ─────────────────────────────────────────── */
function MrpAlert() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    api.get(`/mes-floor/mrp-alert?days=${days}`)
      .then(r => setData(r.data)).catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [days])

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <select value={days} onChange={e => setDays(+e.target.value)}
          style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {[[7,'7일'],[14,'14일'],[30,'30일'],[60,'60일']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={load} style={{ padding:'6px 14px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', cursor:'pointer', fontSize:13 }}>분석</button>
        {data && <span style={{ fontSize:12, color:'#64748b' }}>WO {data.wo_count}건 / 부족 {data.shortage_items}품목</span>}
      </div>

      {loading ? <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>분석 중...</div> : !data ? null : data.items.length === 0 ? (
        <div style={{ padding:30, textAlign:'center', color:'#16a34a' }}>✅ {days}일 내 자재 부족 없음</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['품번','품명','필요수량','현재고','부족수량','상태','관련 WO'].map(h => (
                  <th key={h} style={{ padding:'8px 10px', textAlign:'left', borderBottom:'2px solid #e2e8f0', fontWeight:700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map(i => (
                <tr key={i.part_no} style={{ borderBottom:'1px solid #f1f5f9', background: i.is_short?'#fef2f2':undefined }}>
                  <td style={{ padding:'7px 10px', fontFamily:'monospace', fontSize:11 }}>{i.part_no}</td>
                  <td style={{ padding:'7px 10px' }}>{i.part_name}</td>
                  <td style={{ padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{i.required_qty.toLocaleString()}</td>
                  <td style={{ padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{i.on_hand_qty.toLocaleString()}</td>
                  <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color: i.is_short?'#dc2626':'#16a34a' }}>{i.shortage_qty.toLocaleString()}</td>
                  <td style={{ padding:'7px 10px' }}>
                    {i.is_short ? <span style={{ color:'#dc2626', fontWeight:700 }}>🚨 부족</span> : <span style={{ color:'#16a34a' }}>✅ 충분</span>}
                  </td>
                  <td style={{ padding:'7px 10px', fontSize:11, color:'#64748b' }}>{i.related_wos.map(w => w.wo_no).slice(0,3).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


/* ── 월별 손익 ──────────────────────────────────────────────────── */
function MonthlyPL() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/mes-floor/monthly-pl?year=${year}&month=${month}`)
      .then(r => setData(r.data)).catch(() => {})
      .finally(() => setLoading(false))
  }, [year, month])

  useEffect(() => { load() }, [load])

  const marginColor = (p) => p >= 20 ? '#16a34a' : p >= 10 ? '#d97706' : p >= 0 ? '#f97316' : '#dc2626'

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <select value={year} onChange={e => setYear(+e.target.value)}
          style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {[now.getFullYear()-1, now.getFullYear()].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)}
          style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }}>
          {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <button onClick={load} style={{ padding:'6px 14px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', cursor:'pointer', fontSize:13 }}>조회</button>
      </div>

      {loading ? <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>로딩 중...</div> : !data ? null : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
            {[
              { label:'총 매출', val:(data.total_revenue||0).toLocaleString(), unit:'원', color:'#1d4ed8' },
              { label:'총 원가', val:(data.total_cost||0).toLocaleString(), unit:'원', color:'#64748b' },
              { label:'총 이익', val:(data.total_profit||0).toLocaleString(), unit:'원', color: data.total_profit>=0?'#16a34a':'#dc2626' },
              { label:'이익률', val: data.total_margin_pct != null ? data.total_margin_pct : '-', unit:'%', color: marginColor(data.total_margin_pct) },
            ].map(k => (
              <div key={k.label} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'14px', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>{k.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.val}<span style={{ fontSize:12 }}>{k.unit}</span></div>
              </div>
            ))}
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['품번','품명','출하수량','생산수량','매출','재료비','노무비','원가','이익','이익률'].map(h => (
                    <th key={h} style={{ padding:'8px 10px', textAlign:'right', borderBottom:'2px solid #e2e8f0', fontWeight:700, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map(i => (
                  <tr key={i.part_no} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'7px 10px', textAlign:'left', fontFamily:'monospace', fontSize:11 }}>{i.part_no}</td>
                    <td style={{ padding:'7px 10px', textAlign:'left' }}>{i.part_name}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{(i.shipped_qty||0).toLocaleString()}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{(i.good_qty_produced||0).toLocaleString()}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{(i.revenue||0).toLocaleString()}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{(i.material_cost||0).toLocaleString()}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{(i.labor_cost||0).toLocaleString()}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{(i.total_cost||0).toLocaleString()}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color: i.profit>=0?'#16a34a':'#dc2626', fontVariantNumeric:'tabular-nums' }}>{(i.profit||0).toLocaleString()}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color: marginColor(i.margin_pct) }}>{i.margin_pct != null ? `${i.margin_pct}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}


/* ── 클레임 LOT 역추적 ──────────────────────────────────────────── */
function LotClaimTrace() {
  const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const [partNo, setPartNo] = useState('')
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return fmtDate(d) })
  const [dateTo, setDateTo] = useState(() => fmtDate(new Date()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const load = () => {
    if (!partNo) return alert('품번을 입력하세요')
    setLoading(true)
    api.get(`/mes-floor/claim-trace?part_no=${encodeURIComponent(partNo)}&date_from=${dateFrom}&date_to=${dateTo}`)
      .then(r => setData(r.data)).catch(e => alert('조회 실패: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false))
  }

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
        <input value={partNo} onChange={e => setPartNo(e.target.value)} placeholder="품번 (예: PA-001)"
          style={{ padding:'7px 12px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13, width:180 }} />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding:'7px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }} />
        <span style={{ color:'#94a3b8' }}>~</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding:'7px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13 }} />
        <button onClick={load} style={{ padding:'7px 16px', borderRadius:6, background:'#1d4ed8', color:'#fff', border:'none', cursor:'pointer', fontSize:13 }}>역추적</button>
      </div>

      {loading ? <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>추적 중...</div> : !data ? null : (
        <>
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 16px', marginBottom:14, fontSize:13 }}>
            품번 <strong>{data.part_no}</strong> · WO {data.wo_count}건 · 세션 {data.session_count}건
          </div>
          {data.sessions.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'#94a3b8' }}>해당 기간 세션 없음</div>
          ) : data.sessions.map(s => (
            <div key={s.session_id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'12px 16px', marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}
                onClick={() => setExpanded(expanded === s.session_id ? null : s.session_id)}>
                <div>
                  <span style={{ fontWeight:700, fontSize:13 }}>{s.wo_no}</span>
                  <span style={{ fontSize:12, color:'#64748b', marginLeft:10 }}>{s.machine_id} · {s.worker_id}</span>
                  <span style={{ fontSize:11, color:'#94a3b8', marginLeft:10 }}>{s.start_time?.slice(0,16)}</span>
                </div>
                <div style={{ display:'flex', gap:12, fontSize:12 }}>
                  <span>양품 <strong style={{ color:'#16a34a' }}>{s.good_qty}</strong></span>
                  <span>불량 <strong style={{ color:'#dc2626' }}>{s.defect_qty}</strong></span>
                  {s.inspections.length > 0 && <span style={{ color:'#1d4ed8' }}>검사 {s.inspections.length}건</span>}
                  {s.andons.length > 0 && <span style={{ color:'#dc2626' }}>안돈 {s.andons.length}건</span>}
                  <span style={{ color:'#94a3b8' }}>{expanded===s.session_id?'▲':'▼'}</span>
                </div>
              </div>

              {expanded === s.session_id && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #f1f5f9' }}>
                  {/* 파렛트 */}
                  {s.pallets.length > 0 && (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4 }}>📦 파렛트 LOT</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {s.pallets.map(p => <span key={p.pallet_id} style={{ background:'#e0f2fe', color:'#0369a1', fontSize:11, padding:'2px 8px', borderRadius:10 }}>{p.pallet_id} ({p.qty}EA)</span>)}
                      </div>
                    </div>
                  )}
                  {/* 검사 */}
                  {s.inspections.length > 0 && (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4 }}>🔍 초·중·종물 검사</div>
                      {s.inspections.map(i => (
                        <div key={i.id} style={{ fontSize:11, background:'#f8fafc', padding:'4px 8px', borderRadius:6, marginBottom:4 }}>
                          <span style={{ fontWeight:700 }}>[{i.insp_type}]</span>
                          <span style={{ color: i.result==='OK'?'#16a34a':'#dc2626', marginLeft:6, fontWeight:700 }}>{i.result}</span>
                          {i.dim1_spec && <span style={{ color:'#64748b', marginLeft:8 }}>dim1: {i.dim1_spec}→{i.dim1_actual}</span>}
                          <span style={{ color:'#94a3b8', marginLeft:8 }}>{i.created_at?.slice(0,16)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 안돈 */}
                  {s.andons.length > 0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4 }}>🚨 안돈 이력</div>
                      {s.andons.map(a => (
                        <div key={a.id} style={{ fontSize:11, background:'#fef2f2', padding:'4px 8px', borderRadius:6, marginBottom:4, color:'#dc2626' }}>
                          [{a.andon_type}] {a.note} <span style={{ color: a.is_resolved?'#16a34a':'#dc2626' }}>{a.is_resolved?'✓해결':'미해결'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}


const ANDON_COLOR = {
  '품질이상': '#dc2626',
  '설비고장': '#ea580c',
  '재료부족': '#d97706',
  '안전':    '#7c3aed',
  '도움요청': '#2563eb',
}

function OeeGauge({ value }) {
  const color = value >= 85 ? '#16a34a' : value >= 70 ? '#d97706' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: `conic-gradient(${color} ${value * 3.6}deg, #e5e7eb 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color,
        }}>{value}%</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: '#64748b' }}>OEE</div>
      </div>
    </div>
  )
}

function MachineCard({ m, onAndon }) {
  const sc = STATUS_COLOR[m.status] || STATUS_COLOR['대기']
  const isDown = m.status === '비가동'
  const pct = Math.min(m.achievement_pct || 0, 100)
  const barColor = pct >= 100 ? '#16a34a' : pct >= 70 ? '#3b82f6' : '#dc2626'

  return (
    <div style={{
      border: `2px solid ${sc.border}`,
      borderRadius: 10,
      background: sc.bg,
      padding: '14px 16px',
      position: 'relative',
      animation: isDown ? 'pulse-border 1.5s infinite' : undefined,
      cursor: 'default',
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: sc.text }}>{m.machine_name}</div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: sc.border, color: '#fff', letterSpacing: 0.5,
        }}>{m.status}</span>
      </div>

      {m.status !== '대기' ? (
        <>
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.part_name || '-'}
          </div>
          {/* 생산 현황 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>양품 <strong>{(m.good_qty || 0).toLocaleString()}</strong> / {(m.target_qty || 0).toLocaleString()}</span>
            <span style={{ fontWeight: 700, color: barColor }}>{(m.achievement_pct || 0).toFixed(0)}%</span>
          </div>
          <div style={{ height: 5, background: '#e5e7eb', borderRadius: 3, marginBottom: 8 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <OeeGauge value={m.oee || 0} />
            <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
              <div>작업자: <strong>{m.worker_id || '-'}</strong></div>
              {isDown && <div style={{ color: '#dc2626', fontWeight: 700 }}>⚠ {m.downtime_reason || '비가동'}</div>}
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>대기중</div>
      )}

      {/* 안돈 호출 버튼 */}
      {m.status !== '대기' && (
        <button
          onClick={() => onAndon(m)}
          style={{
            position: 'absolute', bottom: 10, right: 10,
            fontSize: 10, padding: '3px 8px', borderRadius: 6,
            border: '1px solid #dc2626', background: '#fff', color: '#dc2626',
            cursor: 'pointer', fontWeight: 700,
          }}
        >안돈</button>
      )}
    </div>
  )
}

export default function MesDashboard() {
  const [mainTab, setMainTab] = useState('andon')
  const [machines, setMachines] = useState([])
  const [andons, setAndons] = useState([])
  const [loading, setLoading] = useState(true)
  const [andonModal, setAndonModal] = useState(null) // { machine_id, machine_name }
  const [andonForm, setAndonForm] = useState({ caller_id: '', andon_type: '품질이상', note: '' })
  const [lastUpdated, setLastUpdated] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [dash, andon] = await Promise.all([
        api.get('/mes-floor/dashboard'),
        api.get('/mes-floor/andon/active'),
      ])
      setMachines(dash.data)
      setAndons(andon.data)
      setLastUpdated(new Date())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  const submitAndon = async () => {
    if (!andonForm.caller_id) return alert('호출자 ID를 입력하세요')
    try {
      await api.post('/mes-floor/andon/call', {
        machine_id: andonModal.machine_id,
        caller_id: andonForm.caller_id,
        andon_type: andonForm.andon_type,
        note: andonForm.note || null,
      })
      setAndonModal(null)
      setAndonForm({ caller_id: '', andon_type: '품질이상', note: '' })
      refresh()
    } catch (e) {
      alert('안돈 호출 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  const resolveAndon = async (id) => {
    const by = prompt('해결자 ID를 입력하세요')
    if (!by) return
    try {
      await api.post(`/mes-floor/andon/${id}/resolve?resolved_by=${encodeURIComponent(by)}`)
      refresh()
    } catch {}
  }

  // Summary
  const running = machines.filter(m => m.status === '가동').length
  const down = machines.filter(m => m.status === '비가동').length
  const activeMachines = machines.filter(m => m.status !== '대기')
  const avgOEE = activeMachines.length > 0
    ? (activeMachines.reduce((s, m) => s + (m.oee || 0), 0) / activeMachines.length).toFixed(1)
    : '—'
  const totalGood = machines.reduce((s, m) => s + (m.good_qty || 0), 0)
  const totalTarget = machines.reduce((s, m) => s + (m.target_qty || 0), 0)
  const overallPct = totalTarget > 0 ? Math.round(totalGood / totalTarget * 100) : 0

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-xs)' }}>로딩 중...</div>

  return (
    <div style={{ padding: '16px 20px' }}>
      <style>{`
        @keyframes pulse-border { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.4) } 50% { box-shadow: 0 0 0 6px rgba(220,38,38,0) } }
        @keyframes blink-dot { 0%,100% { opacity: 1 } 50% { opacity: 0.2 } }
      `}</style>

      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>NEXGEM — MES 대시보드</h2>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            갱신: {lastUpdated ? lastUpdated.toLocaleTimeString('ko-KR') : '-'} · {REFRESH_MS / 1000}초 자동갱신
          </div>
        </div>
        <button className="btn btn-outline" onClick={refresh} style={{ fontSize: 12 }}>↻ 새로고침</button>
      </div>

      {/* 메인 탭 */}
      <div style={{ overflowX:'auto', marginBottom:16, borderBottom:'2px solid #e2e8f0' }}>
        <div style={{ display:'flex', gap:0, minWidth:'max-content' }}>
          {[
            { k:'andon', label:'🏭 안돈 보드' },
            { k:'oee', label:'📊 OEE 분석' },
            { k:'pareto', label:'📉 불량 파레토' },
            { k:'planact', label:'📋 계획 대비 실적' },
            { k:'cost', label:'💰 원가 분석' },
            { k:'spc', label:'📐 SPC 관리도' },
            { k:'smed', label:'⏱ SMED' },
            { k:'fivewhy', label:'🔍 5-Why' },
            { k:'delivery', label:'🚚 납기 추적' },
            { k:'procond', label:'🧪 공정 조건' },
            { k:'pmcal', label:'🔧 PM 캘린더' },
            { k:'skill', label:'👷 스킬 매트릭스' },
            { k:'abc', label:'📦 ABC 분석' },
            { k:'mrp', label:'⚠ MRP 경보' },
            { k:'pl', label:'💹 월별 손익' },
            { k:'claimtrace', label:'🔎 LOT 역추적' },
          ].map(t => (
            <button key={t.k} onClick={() => setMainTab(t.k)} style={{
              padding:'8px 16px', fontSize:12, fontWeight:700, border:'none', cursor:'pointer',
              background:'transparent', color:mainTab===t.k?'#1d4ed8':'#64748b',
              borderBottom:mainTab===t.k?'2px solid #1d4ed8':'2px solid transparent',
              marginBottom:-2, whiteSpace:'nowrap',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {mainTab === 'oee' && <OeeAnalysis />}
      {mainTab === 'pareto' && <DefectPareto />}
      {mainTab === 'planact' && <PlanVsActual />}
      {mainTab === 'cost' && <CostAnalysis />}
      {mainTab === 'spc' && <SpcChart />}
      {mainTab === 'smed' && <SmedAnalysis />}
      {mainTab === 'fivewhy' && <FiveWhyBoard />}
      {mainTab === 'delivery' && <DeliveryTracking />}
      {mainTab === 'procond' && <ProcessConditionTab />}
      {mainTab === 'pmcal' && <PmCalendar />}
      {mainTab === 'skill' && <SkillMatrix />}
      {mainTab === 'abc' && <AbcAnalysis />}
      {mainTab === 'mrp' && <MrpAlert />}
      {mainTab === 'pl' && <MonthlyPL />}
      {mainTab === 'claimtrace' && <LotClaimTrace />}

      {mainTab === 'andon' && <>
      {/* KPI 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: '가동 호기', value: running, color: '#16a34a', unit: '대' },
          { label: '비가동', value: down, color: down > 0 ? '#dc2626' : '#16a34a', unit: '대' },
          { label: '평균 OEE', value: avgOEE, color: parseFloat(avgOEE) >= 85 ? '#16a34a' : parseFloat(avgOEE) >= 70 ? '#d97706' : '#dc2626', unit: '%' },
          { label: '총 양품', value: totalGood.toLocaleString(), color: '#1d4ed8', unit: '개' },
          { label: '목표달성률', value: overallPct, color: overallPct >= 100 ? '#16a34a' : '#d97706', unit: '%' },
        ].map(k => (
          <div key={k.label} style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            padding: '12px 14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}<span style={{ fontSize: 12 }}>{k.unit}</span></div>
          </div>
        ))}
      </div>

      {/* 활성 안돈 경보 */}
      {andons.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
            🚨 미해결 안돈 ({andons.length}건)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {andons.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fff', border: `1.5px solid ${ANDON_COLOR[a.andon_type] || '#dc2626'}`,
                borderRadius: 8, padding: '8px 12px', fontSize: 12,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: ANDON_COLOR[a.andon_type] || '#dc2626',
                  animation: 'blink-dot 1.5s infinite',
                }} />
                <span><strong>{a.machine_name}</strong> · {a.andon_type}</span>
                <span style={{ color: '#94a3b8' }}>{a.elapsed_min}분 경과</span>
                {a.note && <span style={{ color: '#475569' }}>"{a.note}"</span>}
                <button
                  onClick={() => resolveAndon(a.id)}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid #16a34a', background: '#fff', color: '#16a34a', cursor: 'pointer' }}
                >해제</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 호기 그리드 — Toyota 안돈 보드 */}
      {machines.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          등록된 호기가 없습니다. 기준정보에서 호기를 먼저 등록하세요.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {machines.map(m => (
            <MachineCard
              key={m.machine_id}
              m={m}
              onAndon={(machine) => setAndonModal({ machine_id: machine.machine_id, machine_name: machine.machine_name })}
            />
          ))}
        </div>
      )}

      {/* 안돈 호출 모달 */}
      {andonModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, minWidth: 320 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
              🚨 안돈 호출 — {andonModal.machine_name}
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>이상 유형</label>
              <select
                className="form-control"
                value={andonForm.andon_type}
                onChange={e => setAndonForm(f => ({ ...f, andon_type: e.target.value }))}
              >
                {['품질이상', '설비고장', '재료부족', '안전', '도움요청'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>호출자 ID</label>
              <input
                className="form-control"
                value={andonForm.caller_id}
                onChange={e => setAndonForm(f => ({ ...f, caller_id: e.target.value }))}
                placeholder="작업자 ID"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>메모 (선택)</label>
              <input
                className="form-control"
                value={andonForm.note}
                onChange={e => setAndonForm(f => ({ ...f, note: e.target.value }))}
                placeholder="이상 내용 간략히"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setAndonModal(null)} style={{ flex: 1 }}>취소</button>
              <button
                onClick={submitAndon}
                style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '8px', fontWeight: 700, cursor: 'pointer' }}
              >안돈 호출</button>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  )
}
