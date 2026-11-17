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
      <div style={{ display:'flex', gap:0, marginBottom:16, borderBottom:'2px solid #e2e8f0' }}>
        {[{ k:'andon', label:'🏭 안돈 보드' }, { k:'oee', label:'📊 OEE 분석' }, { k:'pareto', label:'📉 불량 파레토' }, { k:'planact', label:'📋 계획 대비 실적' }].map(t => (
          <button key={t.k} onClick={() => setMainTab(t.k)} style={{
            padding:'8px 20px', fontSize:13, fontWeight:700, border:'none', cursor:'pointer',
            background:'transparent', color:mainTab===t.k?'#1d4ed8':'#64748b',
            borderBottom:mainTab===t.k?'2px solid #1d4ed8':'2px solid transparent',
            marginBottom:-2,
          }}>{t.label}</button>
        ))}
      </div>

      {mainTab === 'oee' && <OeeAnalysis />}
      {mainTab === 'pareto' && <DefectPareto />}
      {mainTab === 'planact' && <PlanVsActual />}

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
