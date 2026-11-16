import { useState, useEffect, useMemo } from 'react'
import api from '../api'

const STATUS_COLOR = {
  '계획':   { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
  '진행중': { bg: '#fef3c7', fg: '#b45309', border: '#fcd34d' },
  '완료':   { bg: '#dcfce7', fg: '#15803d', border: '#86efac' },
}

function getMonday(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = day === 0 ? -6 : 1 - day
  dt.setDate(dt.getDate() + diff)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtYM(y, m) {
  return `${y}년 ${m}월`
}

export default function ProductionGantt() {
  const today = new Date()

  // 뷰 모드: 'month' | 'week'
  const [viewMode, setViewMode] = useState('month')
  // 그룹 기준: 'part' | 'machine'
  const [groupBy, setGroupBy] = useState('machine')

  // 월단위 상태
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  // 주단위 상태 — 이번주 월요일
  const [weekStart, setWeekStart] = useState(getMonday(today))

  // 필터
  const [filterMachine, setFilterMachine] = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [filterPart,    setFilterPart]    = useState('')

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)

  // 데이터 로드 — 월 기준으로 항상 로드 (주간도 같은 데이터 사용)
  const loadYear  = viewMode === 'week' ? weekStart.getFullYear() : year
  const loadMonth = viewMode === 'week' ? weekStart.getMonth() + 1 : month

  // 주간 뷰에서 월이 걸치면 양쪽 다 로드
  const [data2, setData2] = useState(null)
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 6); return d
  }, [weekStart])
  const needSecondMonth = viewMode === 'week' && weekEnd.getMonth() !== weekStart.getMonth()

  useEffect(() => {
    setLoading(true)
    const p1 = api.get(`/production/gantt?year=${loadYear}&month=${loadMonth}`)
    const p2 = needSecondMonth
      ? api.get(`/production/gantt?year=${weekEnd.getFullYear()}&month=${weekEnd.getMonth()+1}`)
      : Promise.resolve(null)
    Promise.all([p1, p2])
      .then(([r1, r2]) => {
        setData(r1.data)
        setData2(r2?.data || null)
      })
      .finally(() => setLoading(false))
  }, [loadYear, loadMonth, needSecondMonth])

  // 현재 뷰에 보여줄 orders 합치기
  const allOrders = useMemo(() => {
    const o1 = data?.orders || []
    const o2 = data2?.orders || []
    const seen = new Set()
    return [...o1, ...o2].filter(o => { if (seen.has(o.pord_no)) return false; seen.add(o.pord_no); return true })
  }, [data, data2])

  // 주간 날짜 배열 (7일)
  const weekDays = useMemo(() => Array.from({length:7}, (_,i) => {
    const d = new Date(weekStart); d.setDate(d.getDate()+i); return d
  }), [weekStart])

  // 주간 뷰 — 해당 주에 걸치는 주문만
  const weekOrders = useMemo(() => {
    const ws = fmtDate(weekStart), we = fmtDate(weekEnd)
    return allOrders.filter(o => {
      const start = o.plan_date || ws
      const end   = o.complete_date || ((() => { const d=new Date(o.plan_date||ws); d.setDate(d.getDate()+(o.lead_days||7)-1); return fmtDate(d) })())
      return start <= we && end >= ws
    })
  }, [allOrders, weekStart, weekEnd])

  // 필터 적용
  const filteredOrders = useMemo(() => {
    const src = viewMode === 'week' ? weekOrders : (data?.orders || [])
    return src.filter(o => {
      if (filterMachine && o.mold_no !== filterMachine) return false
      if (filterStatus  && o.status  !== filterStatus)  return false
      if (filterPart    && !o.part_no.toLowerCase().includes(filterPart.toLowerCase()) && !o.part_name.toLowerCase().includes(filterPart.toLowerCase())) return false
      return true
    })
  }, [viewMode, weekOrders, data, filterMachine, filterStatus, filterPart])

  // 그룹 키 목록
  const groupKeys = useMemo(() => {
    const src = filteredOrders
    const keys = [...new Set(src.map(o => groupBy === 'machine' ? (o.mold_no || '미지정') : (o.part_no || '미지정')))]
    return keys.sort()
  }, [filteredOrders, groupBy])

  // 호기/품번 필터 옵션
  const machineOptions = useMemo(() => [...new Set((data?.orders||[]).map(o=>o.mold_no||'미지정'))].sort(), [data])
  const statusOptions  = ['계획','진행중','완료']

  // ── 월 뷰 계산 ──────────────────────────────────────────────
  const days    = data?.days || 31
  const DAY_W   = 34
  const todayDay = (today.getFullYear()===year && today.getMonth()+1===month) ? today.getDate()-1 : -1

  function dayOffset(dateStr) {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    if (d.getFullYear()!==year || d.getMonth()+1!==month) {
      return d < new Date(year, month-1, 1) ? 0 : days
    }
    return d.getDate()-1
  }

  function barWidth(order) {
    const start = dayOffset(order.plan_date)
    const end   = order.complete_date
      ? Math.min(days, dayOffset(order.complete_date)+1)
      : Math.min(days, start+(order.lead_days||7))
    return Math.max(2, end-start)
  }

  // ── 주간 뷰 계산 ──────────────────────────────────────────────
  const WDAY_W = 120
  const DOW = ['월','화','수','목','금','토','일']

  function wDayOffset(dateStr, clampStart=true) {
    if (!dateStr) return clampStart ? 0 : 7
    const d = new Date(dateStr)
    const diff = Math.round((d - weekStart) / 86400000)
    return Math.max(0, Math.min(7, diff))
  }

  function wBarLeft(order) { return wDayOffset(order.plan_date, true) * WDAY_W }
  function wBarWidth(order) {
    const endDate = order.complete_date || (() => {
      const d = new Date(order.plan_date || fmtDate(weekStart))
      d.setDate(d.getDate() + (order.lead_days||7) - 1)
      return fmtDate(d)
    })()
    const cols = wDayOffset(endDate, false) - wDayOffset(order.plan_date, true)
    return Math.max(1, cols) * WDAY_W - 4
  }

  // 네비게이션
  const prevMonth = () => { if(month===1){setYear(y=>y-1);setMonth(12)}else setMonth(m=>m-1) }
  const nextMonth = () => { if(month===12){setYear(y=>y+1);setMonth(1)}else setMonth(m=>m+1) }
  const prevWeek  = () => { const d=new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d) }
  const nextWeek  = () => { const d=new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d) }
  const goToday   = () => {
    if (viewMode==='month') { setYear(today.getFullYear()); setMonth(today.getMonth()+1) }
    else setWeekStart(getMonday(today))
  }

  // 그룹 행 렌더러 (공통)
  const renderBar = (order, idx, isWeek) => {
    const c = STATUS_COLOR[order.status] || STATUS_COLOR['계획']
    const isSelected = selected?.pord_no === order.pord_no
    const left  = isWeek ? wBarLeft(order) : dayOffset(order.plan_date) * DAY_W
    const width = isWeek ? wBarWidth(order) : barWidth(order) * DAY_W - 2
    const top   = idx * 34 + 2

    return (
      <div key={order.pord_no}
        onClick={() => setSelected(isSelected ? null : order)}
        style={{
          position:'absolute', left, width, height:28, top,
          background: c.bg, border:`1.5px solid ${isSelected?'#6366f1':c.border}`,
          borderRadius:4, display:'flex', alignItems:'center', paddingLeft:6,
          overflow:'hidden', cursor:'pointer',
          boxShadow: isSelected?'0 0 0 2px #6366f133':undefined,
          zIndex: isSelected?5:1,
        }}
        title={`${order.pord_no} | ${order.part_name} | ${order.status} | ${order.planned_qty?.toLocaleString()}EA`}
      >
        {order.progress > 0 && (
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,order.progress)}%`,background:c.border,opacity:0.35}} />
        )}
        <span style={{fontSize:11,color:c.fg,fontWeight:500,position:'relative',whiteSpace:'nowrap'}}>
          {width > 50 ? (groupBy==='machine' ? order.part_name : (order.mold_no||'')) : ''}
          {width > 110 && order.progress > 0 ? ` ${order.progress}%` : ''}
        </span>
      </div>
    )
  }

  const LABEL_W = 160

  return (
    <div style={{padding:'16px 20px'}}>

      {/* ── 헤더 ── */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:700}}>생산 스케줄러</h2>

        {/* 뷰 모드 토글 */}
        <div style={{display:'flex',border:'1px solid #cbd5e1',borderRadius:6,overflow:'hidden'}}>
          {[['month','월단위'],['week','주단위']].map(([v,l])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{
              padding:'5px 14px',fontSize:12,fontWeight:600,cursor:'pointer',border:'none',
              background: viewMode===v?'#1d4ed8':'#fff',
              color: viewMode===v?'#fff':'#64748b',
            }}>{l}</button>
          ))}
        </div>

        {/* 그룹 토글 */}
        <div style={{display:'flex',border:'1px solid #cbd5e1',borderRadius:6,overflow:'hidden'}}>
          {[['machine','호기별'],['part','품번별']].map(([v,l])=>(
            <button key={v} onClick={()=>setGroupBy(v)} style={{
              padding:'5px 14px',fontSize:12,fontWeight:600,cursor:'pointer',border:'none',
              background: groupBy===v?'#0f766e':'#fff',
              color: groupBy===v?'#fff':'#64748b',
            }}>{l}</button>
          ))}
        </div>

        {/* 기간 네비 */}
        <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:4}}>
          <button className="btn btn-sm" onClick={viewMode==='month'?prevMonth:prevWeek}>‹</button>
          <span style={{fontWeight:600,minWidth:130,textAlign:'center',fontSize:13}}>
            {viewMode==='month'
              ? fmtYM(year,month)
              : `${fmtDate(weekStart).slice(5).replace('-','/')} ~ ${fmtDate(weekEnd).slice(5).replace('-','/')}`
            }
          </span>
          <button className="btn btn-sm" onClick={viewMode==='month'?nextMonth:nextWeek}>›</button>
          <button className="btn btn-sm btn-outline" onClick={goToday} style={{fontSize:11}}>오늘</button>
          <button className="btn btn-sm" onClick={()=>{setData(null);setData2(null)}} style={{fontSize:11}}>↻</button>
        </div>

        {/* 필터 */}
        <div style={{display:'flex',gap:6,marginLeft:'auto',flexWrap:'wrap'}}>
          <input placeholder="품번/품명 검색" value={filterPart} onChange={e=>setFilterPart(e.target.value)}
            style={{padding:'4px 8px',fontSize:12,border:'1px solid #cbd5e1',borderRadius:5,width:130}} />
          <select value={filterMachine} onChange={e=>setFilterMachine(e.target.value)}
            style={{padding:'4px 8px',fontSize:12,border:'1px solid #cbd5e1',borderRadius:5}}>
            <option value="">전체 호기</option>
            {machineOptions.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
            style={{padding:'4px 8px',fontSize:12,border:'1px solid #cbd5e1',borderRadius:5}}>
            <option value="">전체 상태</option>
            {statusOptions.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          {(filterMachine||filterStatus||filterPart) && (
            <button className="btn btn-sm btn-outline" onClick={()=>{setFilterMachine('');setFilterStatus('');setFilterPart('')}} style={{fontSize:11}}>초기화</button>
          )}
        </div>
      </div>

      {/* 범례 */}
      <div style={{display:'flex',gap:16,marginBottom:12,fontSize:12,alignItems:'center'}}>
        {Object.entries(STATUS_COLOR).map(([s,c])=>(
          <div key={s} style={{display:'flex',alignItems:'center',gap:4}}>
            <div style={{width:14,height:14,borderRadius:3,background:c.bg,border:`1px solid ${c.border}`}} />
            <span style={{color:'var(--text-secondary)'}}>{s}</span>
          </div>
        ))}
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <div style={{width:2,height:14,background:'#ef4444'}} />
          <span style={{color:'var(--text-secondary)'}}>오늘</span>
        </div>
        <span style={{marginLeft:'auto',color:'var(--text-secondary)',fontSize:11}}>
          {filteredOrders.length}건 / {groupKeys.length}개 그룹
        </span>
      </div>

      {loading && <div style={{color:'var(--text-secondary)',padding:40,textAlign:'center'}}>로딩 중...</div>}

      {!loading && (
        <div style={{overflowX:'auto',border:'1px solid var(--border)',borderRadius:8}}>
          <div style={{minWidth: LABEL_W + (viewMode==='week' ? 7*WDAY_W : days*DAY_W)}}>

            {/* ── 날짜 헤더 ── */}
            <div style={{display:'flex',borderBottom:'2px solid var(--border)',background:'var(--surface-1)'}}>
              <div style={{width:LABEL_W,flexShrink:0,padding:'6px 10px',fontSize:12,fontWeight:600,color:'var(--text-secondary)',borderRight:'1px solid var(--border)'}}>
                {groupBy==='machine'?'호기':'품번 / 품명'}
              </div>
              <div style={{display:'flex',flex:1}}>
                {viewMode==='month' ? (
                  Array.from({length:days},(_,i)=>{
                    const d = new Date(year,month-1,i+1)
                    const isSat=d.getDay()===6, isSun=d.getDay()===0
                    return (
                      <div key={i} style={{
                        width:DAY_W,flexShrink:0,textAlign:'center',fontSize:11,padding:'6px 0',
                        color: isSun?'#ef4444':isSat?'#3b82f6':'var(--text-secondary)',
                        background: i===todayDay?'#fef9c3': (isSat||isSun)?'var(--surface-2)':undefined,
                        borderLeft:'1px solid var(--border)',fontWeight:i===todayDay?700:400,
                      }}>
                        {i+1}
                        <div style={{fontSize:9,marginTop:1}}>{['일','월','화','수','목','금','토'][d.getDay()]}</div>
                      </div>
                    )
                  })
                ) : (
                  weekDays.map((d,i)=>{
                    const isSat=d.getDay()===6, isSun=d.getDay()===0
                    const isToday = fmtDate(d)===fmtDate(today)
                    return (
                      <div key={i} style={{
                        width:WDAY_W,flexShrink:0,textAlign:'center',fontSize:12,padding:'6px 0',
                        color: isSun?'#ef4444':isSat?'#3b82f6':'var(--text-secondary)',
                        background: isToday?'#fef9c3':(isSat||isSun)?'var(--surface-2)':undefined,
                        borderLeft:'1px solid var(--border)',
                        fontWeight: isToday?700:400,
                      }}>
                        {DOW[i]}
                        <div style={{fontSize:11,fontWeight:isToday?700:400}}>{`${d.getMonth()+1}/${d.getDate()}`}</div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* ── 그룹 행 ── */}
            {groupKeys.length === 0 ? (
              <div style={{padding:48,textAlign:'center',color:'var(--text-secondary)'}}>
                {filteredOrders.length===0 ? '해당 기간 작업지시 없음' : '필터 조건에 맞는 항목 없음'}
              </div>
            ) : groupKeys.map(key => {
              const groupOrders = filteredOrders.filter(o =>
                (groupBy==='machine' ? (o.mold_no||'미지정') : (o.part_no||'미지정')) === key
              )
              const label = groupBy==='machine' ? key : (groupOrders[0]?.part_name || key)
              const rowH = Math.max(44, groupOrders.length * 34 + 8)

              return (
                <div key={key} style={{display:'flex',borderBottom:'1px solid var(--border)',minHeight:rowH}}>
                  {/* 행 레이블 */}
                  <div style={{
                    width:LABEL_W,flexShrink:0,padding:'6px 10px',
                    borderRight:'1px solid var(--border)',
                    display:'flex',flexDirection:'column',justifyContent:'center',
                  }}>
                    <div style={{fontSize:11,fontFamily:'monospace',color:'var(--text-secondary)',fontWeight:600}}>{key}</div>
                    {groupBy==='machine' && (
                      <div style={{fontSize:11,color:'var(--text-primary)',marginTop:1}}>
                        {[...new Set(groupOrders.map(o=>o.part_name))].slice(0,2).join(', ')}
                        {[...new Set(groupOrders.map(o=>o.part_name))].length > 2 ? ' ...' : ''}
                      </div>
                    )}
                    <div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>{groupOrders.length}건</div>
                  </div>

                  {/* 바 영역 */}
                  <div style={{position:'relative',height:rowH,flex:1}}>
                    {/* 오늘 선 */}
                    {viewMode==='month' && todayDay>=0 && (
                      <div style={{position:'absolute',left:todayDay*DAY_W+DAY_W/2,top:0,bottom:0,width:2,background:'#ef4444',zIndex:10,opacity:0.6}} />
                    )}
                    {/* 주간 오늘 선 */}
                    {viewMode==='week' && weekDays.some(d=>fmtDate(d)===fmtDate(today)) && (
                      <div style={{
                        position:'absolute',
                        left: weekDays.findIndex(d=>fmtDate(d)===fmtDate(today))*WDAY_W+WDAY_W/2,
                        top:0,bottom:0,width:2,background:'#ef4444',zIndex:10,opacity:0.6
                      }} />
                    )}
                    {/* 주말 / 열 구분선 */}
                    {viewMode==='month'
                      ? Array.from({length:days},(_,i)=>{
                          const d=new Date(year,month-1,i+1)
                          if(d.getDay()===0||d.getDay()===6)
                            return <div key={i} style={{position:'absolute',left:i*DAY_W,top:0,width:DAY_W,bottom:0,background:'var(--surface-1)',opacity:0.5}} />
                          return null
                        })
                      : weekDays.map((d,i)=>(
                          <div key={i} style={{
                            position:'absolute',left:i*WDAY_W,top:0,width:WDAY_W,bottom:0,
                            borderLeft:'1px solid var(--border)',
                            background:(d.getDay()===0||d.getDay()===6)?'var(--surface-1)':undefined,
                            opacity:0.4,
                          }} />
                        ))
                    }
                    {/* 작업지시 바 */}
                    {groupOrders.map((order, idx) => renderBar(order, idx, viewMode==='week'))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 상세 패널 ── */}
      {selected && (
        <div style={{
          position:'fixed',right:24,bottom:24,width:320,
          background:'var(--surface-2)',border:'1px solid var(--border)',
          borderRadius:12,padding:18,boxShadow:'0 8px 32px rgba(0,0,0,.18)',zIndex:200,
        }}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:12,alignItems:'center'}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:'var(--text-primary)'}}>{selected.pord_no}</div>
              <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:1}}>{selected.part_name}</div>
            </div>
            <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--text-secondary)'}}>✕</button>
          </div>
          {[
            ['품번', selected.part_no],
            ['호기', selected.mold_no],
            ['상태', selected.status],
            ['계획일', selected.plan_date || '-'],
            ['완료일', selected.complete_date || '-'],
            ['계획수량', `${(selected.planned_qty||0).toLocaleString()} EA`],
            ['실적수량', `${(selected.actual_qty||0).toLocaleString()} EA`],
            ['진행률', `${selected.progress}%`],
          ].map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'5px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{color:'var(--text-secondary)'}}>{k}</span>
              <span style={{fontWeight:600}}>{v}</span>
            </div>
          ))}
          {/* 진행률 바 */}
          <div style={{marginTop:10}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
              <span style={{color:'var(--text-secondary)'}}>진행률</span>
              <span style={{fontWeight:700,color: selected.progress>=100?'#16a34a':selected.progress>=70?'#d97706':'#dc2626'}}>{selected.progress}%</span>
            </div>
            <div style={{height:6,background:'#e5e7eb',borderRadius:3}}>
              <div style={{width:`${Math.min(100,selected.progress)}%`,height:'100%',borderRadius:3,
                background: selected.progress>=100?'#16a34a':selected.progress>=70?'#f59e0b':'#ef4444',
                transition:'width 0.4s'}} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
