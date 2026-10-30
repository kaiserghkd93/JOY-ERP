import { useState, useEffect } from 'react'
import api from '../api'

const STATUS_COLOR = {
  '계획':   { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
  '진행중': { bg: '#fef3c7', fg: '#b45309', border: '#fcd34d' },
  '완료':   { bg: '#dcfce7', fg: '#15803d', border: '#86efac' },
}

export default function ProductionGantt() {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [year, month])

  async function load() {
    setLoading(true)
    try {
      const r = await api.get(`/production/gantt?year=${year}&month=${month}`)
      setData(r.data)
    } finally {
      setLoading(false)
    }
  }

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  // 호기별 그룹화
  const rows = {}
  if (data?.orders) {
    for (const o of data.orders) {
      if (!rows[o.mold_no]) rows[o.mold_no] = []
      rows[o.mold_no].push(o)
    }
  }
  const molds = Object.keys(rows).sort()
  const days = data?.days || 31
  const DAY_W = 32  // px per day

  function dayOffset(dateStr) {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) {
      return d < new Date(year, month - 1, 1) ? 0 : days
    }
    return d.getDate() - 1
  }

  function barWidth(order) {
    const start = dayOffset(order.plan_date)
    const end = order.complete_date
      ? Math.min(days, dayOffset(order.complete_date) + 1)
      : Math.min(days, start + 1)
    return Math.max(1, end - start)
  }

  const todayDay = (new Date().getFullYear() === year && new Date().getMonth() + 1 === month)
    ? new Date().getDate() - 1 : -1

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>생산 스케줄러 (Gantt)</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button className="btn btn-sm" onClick={prevMonth}>‹</button>
          <span style={{ fontWeight: 500, minWidth: 90, textAlign: 'center' }}>
            {year}년 {month}월
          </span>
          <button className="btn btn-sm" onClick={nextMonth}>›</button>
          <button className="btn btn-sm" onClick={load} style={{ marginLeft: 4 }}>새로고침</button>
        </div>
      </div>

      {/* 범례 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 12 }}>
        {Object.entries(STATUS_COLOR).map(([s, c]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: c.bg, border: `1px solid ${c.border}` }} />
            <span style={{ color: 'var(--text-secondary)' }}>{s}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 2, height: 14, background: '#ef4444' }} />
          <span style={{ color: 'var(--text-secondary)' }}>오늘</span>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)', padding: 24 }}>로딩 중...</div>}

      {!loading && data && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 180 + days * DAY_W }}>
            {/* 날짜 헤더 */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 160, flexShrink: 0, fontSize: 12, color: 'var(--text-secondary)', padding: '4px 8px' }}>
                호기 / 금형
              </div>
              <div style={{ display: 'flex', position: 'relative' }}>
                {Array.from({ length: days }, (_, i) => {
                  const d = new Date(year, month - 1, i + 1)
                  const isSat = d.getDay() === 6
                  const isSun = d.getDay() === 0
                  return (
                    <div key={i} style={{
                      width: DAY_W,
                      flexShrink: 0,
                      textAlign: 'center',
                      fontSize: 11,
                      padding: '4px 0',
                      color: isSun ? '#ef4444' : isSat ? '#3b82f6' : 'var(--text-secondary)',
                      background: i === todayDay ? '#fef9c3' : undefined,
                      borderLeft: '1px solid var(--border)',
                    }}>
                      {i + 1}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 호기별 행 */}
            {molds.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
                해당 월 작업지시 없음
              </div>
            ) : molds.map(mold => (
              <div key={mold} style={{
                display: 'flex',
                borderBottom: '1px solid var(--border)',
                minHeight: 44,
                alignItems: 'center',
              }}>
                <div style={{
                  width: 160,
                  flexShrink: 0,
                  padding: '4px 8px',
                  fontSize: 13,
                  fontWeight: 500,
                  borderRight: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}>
                  {mold}
                </div>
                <div style={{ position: 'relative', height: 36, flex: 1 }}>
                  {/* 오늘 선 */}
                  {todayDay >= 0 && (
                    <div style={{
                      position: 'absolute',
                      left: todayDay * DAY_W + DAY_W / 2,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      background: '#ef4444',
                      zIndex: 10,
                      opacity: 0.7,
                    }} />
                  )}
                  {/* 주말 배경 */}
                  {Array.from({ length: days }, (_, i) => {
                    const d = new Date(year, month - 1, i + 1)
                    if (d.getDay() === 0 || d.getDay() === 6) {
                      return (
                        <div key={i} style={{
                          position: 'absolute',
                          left: i * DAY_W,
                          top: 0,
                          width: DAY_W,
                          bottom: 0,
                          background: 'var(--surface-1)',
                          opacity: 0.5,
                        }} />
                      )
                    }
                    return null
                  })}
                  {/* 작업지시 바 */}
                  {rows[mold].map((order, idx) => {
                    const left = dayOffset(order.plan_date) * DAY_W
                    const w = barWidth(order) * DAY_W
                    const c = STATUS_COLOR[order.status] || STATUS_COLOR['계획']
                    const top = idx * 34 + 2
                    return (
                      <div
                        key={order.pord_no}
                        onClick={() => setSelected(selected?.pord_no === order.pord_no ? null : order)}
                        style={{
                          position: 'absolute',
                          left,
                          width: w - 2,
                          height: 28,
                          top,
                          background: c.bg,
                          border: `1.5px solid ${selected?.pord_no === order.pord_no ? '#6366f1' : c.border}`,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: 6,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          boxShadow: selected?.pord_no === order.pord_no ? '0 0 0 2px #6366f133' : undefined,
                          zIndex: selected?.pord_no === order.pord_no ? 5 : 1,
                        }}
                        title={`${order.pord_no} | ${order.part_name} | ${order.status} | ${order.planned_qty}EA`}
                      >
                        {/* 진행률 바 */}
                        {order.progress > 0 && (
                          <div style={{
                            position: 'absolute',
                            left: 0, top: 0, bottom: 0,
                            width: `${Math.min(100, order.progress)}%`,
                            background: c.border,
                            opacity: 0.35,
                          }} />
                        )}
                        <span style={{ fontSize: 11, color: c.fg, fontWeight: 500, position: 'relative', whiteSpace: 'nowrap' }}>
                          {w > 60 ? order.part_name : ''}
                          {w > 120 ? ` (${order.progress}%)` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 상세 패널 */}
      {selected && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          width: 300,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 100,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>{selected.pord_no}</strong>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
          </div>
          {[
            ['품목', selected.part_name],
            ['품번', selected.part_no],
            ['호기', selected.mold_no],
            ['상태', selected.status],
            ['계획일', selected.plan_date],
            ['완료일', selected.complete_date || '-'],
            ['계획수량', `${(selected.planned_qty || 0).toLocaleString()} EA`],
            ['실적수량', `${(selected.actual_qty || 0).toLocaleString()} EA`],
            ['진행률', `${selected.progress}%`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
              <span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
