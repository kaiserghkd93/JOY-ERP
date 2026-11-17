/**
 * MES 현장 TV 현황판
 * - 전체화면(풀스크린) 모드
 * - 5초 자동 갱신
 * - 호기별 목표/실적 진행바
 * - 현재 교대 시계
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const REFRESH_MS = 5000

function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function getShiftLabel(d) {
  const h = d.getHours(), m = d.getMinutes()
  const mins = h * 60 + m
  return mins >= 8 * 60 + 30 && mins < 20 * 60 + 30 ? '주간' : '야간'
}

function getShiftRange(d) {
  const shift = getShiftLabel(d)
  return shift === '주간' ? '08:30 ~ 20:30' : '20:30 ~ 08:30'
}

function getShiftProgress(d) {
  const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds()
  const totalMins = h * 60 + m + s / 60
  const shift = getShiftLabel(d)
  if (shift === '주간') {
    const elapsed = Math.max(0, totalMins - 8 * 60 - 30)
    return Math.min(100, (elapsed / 720) * 100)
  } else {
    const start = 20 * 60 + 30
    let elapsed = totalMins >= start ? totalMins - start : totalMins + (24 * 60 - start)
    return Math.min(100, (elapsed / 720) * 100)
  }
}

function StatusBadge({ status }) {
  const cfg = {
    '가동': { bg: '#16a34a', text: '#fff', icon: '▶' },
    '비가동': { bg: '#dc2626', text: '#fff', icon: '⏸' },
    '대기': { bg: '#475569', text: '#94a3b8', icon: '○' },
  }
  const c = cfg[status] || cfg['대기']
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      letterSpacing: 1,
    }}>
      {c.icon} {status}
    </span>
  )
}

function MachineCard({ m }) {
  const pct = m.achievement_pct || 0
  const barColor = pct >= 100 ? '#16a34a' : pct >= 80 ? '#3b82f6' : pct >= 60 ? '#d97706' : '#dc2626'
  const isIdle = m.status === '대기'

  return (
    <div style={{
      background: isIdle ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
      border: `1px solid ${isIdle ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)'}`,
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* 호기 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: isIdle ? '#64748b' : '#e2e8f0', letterSpacing: 0.5 }}>
          {m.machine_name || m.machine_id}
        </span>
        <StatusBadge status={m.status} />
      </div>

      {/* 품번/작업자 */}
      {!isIdle && (
        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
          <span style={{ color: '#94a3b8' }}>품번</span>
          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{m.part_name || '-'}</span>
          <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>{m.worker_id || '-'}</span>
        </div>
      )}

      {/* 목표/실적 */}
      {!isIdle && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span>실적 <strong style={{ color: '#e2e8f0', fontSize: 15 }}>{(m.good_qty || 0).toLocaleString()}</strong></span>
            <span>목표 <strong style={{ color: '#94a3b8', fontSize: 13 }}>{(m.target_qty || 0).toLocaleString()}</strong></span>
            <span style={{ color: barColor, fontWeight: 800, fontSize: 13 }}>{pct.toFixed(0)}%</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(pct, 100)}%`, height: '100%',
              background: barColor, borderRadius: 6,
              transition: 'width 0.5s',
            }} />
          </div>
        </>
      )}

      {isIdle && (
        <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '8px 0' }}>대기 중</div>
      )}
    </div>
  )
}

export default function MesFloorTV() {
  const now = useNow()
  const [machines, setMachines] = useState([])
  const [fullscreen, setFullscreen] = useState(false)

  const load = useCallback(() => {
    api.get('/mes-floor/dashboard').then(r => setMachines(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  // 집계
  const active = machines.filter(m => m.status === '가동').length
  const down = machines.filter(m => m.status === '비가동').length
  const idle = machines.filter(m => m.status === '대기').length
  const totalGood = machines.reduce((s, m) => s + (m.good_qty || 0), 0)
  const totalTarget = machines.reduce((s, m) => s + (m.target_qty || 0), 0)
  const overallPct = totalTarget > 0 ? Math.round((totalGood / totalTarget) * 100) : 0
  const totalDefect = machines.reduce((s, m) => s + (m.defect_qty || 0), 0)
  const defectRate = (totalGood + totalDefect) > 0
    ? ((totalDefect / (totalGood + totalDefect)) * 100).toFixed(1) : '0.0'

  const shiftLabel = getShiftLabel(now)
  const shiftRange = getShiftRange(now)
  const shiftPct = getShiftProgress(now)

  const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
      color: '#e2e8f0',
      fontFamily: '"Pretendard", "Noto Sans KR", sans-serif',
      padding: '20px 24px',
      boxSizing: 'border-box',
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        {/* 좌: 회사명 + 날짜 */}
        <div>
          <div style={{ fontSize: 13, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' }}>JOY INDUSTRIAL</div>
          <div style={{ fontSize: 15, color: '#94a3b8', marginTop: 2 }}>{dateStr}</div>
        </div>

        {/* 중앙: 시계 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: 3, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {timeStr}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 6 }}>
            <span style={{
              background: shiftLabel === '주간' ? '#d97706' : '#3b82f6',
              color: '#fff', padding: '2px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            }}>
              {shiftLabel} {shiftRange}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>교대 진행 {shiftPct.toFixed(0)}%</span>
          </div>
          {/* 교대 진행바 */}
          <div style={{ width: 300, background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, margin: '8px auto 0', overflow: 'hidden' }}>
            <div style={{
              width: `${shiftPct}%`, height: '100%',
              background: shiftLabel === '주간' ? '#d97706' : '#3b82f6',
              transition: 'width 1s',
            }} />
          </div>
        </div>

        {/* 우: 전체화면 버튼 */}
        <div style={{ textAlign: 'right' }}>
          <button onClick={toggleFullscreen} style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#e2e8f0', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
          }}>
            {fullscreen ? '⊠ 전체화면 종료' : '⊞ 전체화면'}
          </button>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
            {REFRESH_MS / 1000}초 자동갱신
          </div>
        </div>
      </div>

      {/* KPI 요약 바 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20,
      }}>
        {[
          { label: '가동 호기', val: active, unit: '대', color: '#16a34a' },
          { label: '비가동', val: down, unit: '대', color: '#dc2626' },
          { label: '대기', val: idle, unit: '대', color: '#64748b' },
          { label: '오늘 양품', val: totalGood.toLocaleString(), unit: 'EA', color: '#3b82f6' },
          { label: '목표 달성률', val: overallPct, unit: '%', color: overallPct >= 100 ? '#16a34a' : overallPct >= 80 ? '#3b82f6' : '#d97706' },
          { label: '불량률', val: defectRate, unit: '%', color: +defectRate > 2 ? '#dc2626' : '#16a34a' },
        ].map(item => (
          <div key={item.label} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '12px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, letterSpacing: 0.5 }}>{item.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: item.color, lineHeight: 1 }}>
              {item.val}
              <span style={{ fontSize: 13, fontWeight: 400, color: '#94a3b8', marginLeft: 2 }}>{item.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 호기별 현황 그리드 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
      }}>
        {machines.map(m => <MachineCard key={m.machine_id} m={m} />)}
        {machines.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: '#475569' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
            <div>등록된 호기 없음 — MES 마스터에서 호기를 먼저 등록하세요</div>
          </div>
        )}
      </div>

      {/* 하단 상태바 */}
      <div style={{
        marginTop: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12,
        fontSize: 11, color: '#475569',
      }}>
        <span>JOY ERP — MES 현장 현황판</span>
        <span>마지막 갱신: {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
        <span>총 {machines.length}대 호기</span>
      </div>
    </div>
  )
}
