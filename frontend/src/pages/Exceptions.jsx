import { useState, useEffect } from 'react'
import api from '../api'

const SEV = {
  critical: { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5', label: '긴급' },
  warn:     { bg: '#fffbeb', text: '#b45309', border: '#fcd34d', label: '경고' },
  info:     { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd', label: '정보' },
}

function Badge({ sev }) {
  const s = SEV[sev] || SEV.info
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 999,
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      fontWeight: 600, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

function Section({ title, icon, items, renderRow, emptyMsg }) {
  const [open, setOpen] = useState(true)
  const critCount = items.filter(i => i.severity === 'critical').length
  const warnCount = items.filter(i => i.severity === 'warn').length

  return (
    <div style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', background: 'var(--surface-1)', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        <strong style={{ fontSize: 14, flex: 1 }}>{title}</strong>
        {critCount > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', fontWeight: 600 }}>{critCount}건 긴급</span>}
        {warnCount > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d', fontWeight: 600 }}>{warnCount}건 경고</span>}
        {items.length === 0 && <span style={{ fontSize: 12, color: '#16a34a' }}>✓ 이상 없음</span>}
        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          {items.length === 0 ? (
            <div style={{ padding: '16px 0', color: 'var(--text-secondary)', fontSize: 13 }}>{emptyMsg}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ marginTop: 12 }}>
                {renderRow(items)}
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Exceptions() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await api.get('/dashboard/exceptions')
      setData(r.data)
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }

  const summary = data?.summary || { critical: 0, warn: 0 }

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>예외 모니터링</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {summary.critical > 0 && (
            <span style={{ fontSize: 13, padding: '4px 12px', borderRadius: 999, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', fontWeight: 600 }}>
              🚨 긴급 {summary.critical}건
            </span>
          )}
          {summary.warn > 0 && (
            <span style={{ fontSize: 13, padding: '4px 12px', borderRadius: 999, background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d', fontWeight: 600 }}>
              ⚠ 경고 {summary.warn}건
            </span>
          )}
          {data && summary.critical === 0 && summary.warn === 0 && (
            <span style={{ fontSize: 13, padding: '4px 12px', borderRadius: 999, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', fontWeight: 600 }}>
              ✓ 이상 없음
            </span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdated && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>업데이트: {lastUpdated.toLocaleTimeString('ko-KR')}</span>}
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? '갱신 중...' : '새로고침'}
          </button>
        </div>
      </div>

      {loading && !data && <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>로딩 중...</div>}

      {data && (
        <>
          {/* 안전재고 이하 */}
          <Section
            title="안전재고 이하 품목"
            icon="📦"
            items={data.safety_stock || []}
            emptyMsg="안전재고 이하 품목 없음"
            renderRow={items => (
              <>
                <thead><tr>
                  <th>품번</th><th>품명</th><th style={{ textAlign: 'right' }}>현재고</th>
                  <th style={{ textAlign: 'right' }}>안전재고</th><th style={{ textAlign: 'right' }}>부족량</th><th>심각도</th>
                </tr></thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.part_no}>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.part_no}</td>
                      <td style={{ fontWeight: 500 }}>{item.name}</td>
                      <td style={{ textAlign: 'right', color: item.current_stock <= 0 ? '#b91c1c' : undefined }}>
                        {item.current_stock.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>{item.safety_stock.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#b91c1c' }}>
                        -{item.shortage.toLocaleString()}
                      </td>
                      <td><Badge sev={item.severity} /></td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          />

          {/* 납기 초과 발주 */}
          <Section
            title="납기 초과 발주"
            icon="📋"
            items={data.overdue_po || []}
            emptyMsg="납기 초과 발주 없음"
            renderRow={items => (
              <>
                <thead><tr>
                  <th>발주번호</th><th>품번</th><th>품명</th><th>거래처</th>
                  <th>납기일</th><th style={{ textAlign: 'right' }}>초과일수</th><th>심각도</th>
                </tr></thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.po_no}>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{item.po_no}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.part_no}</td>
                      <td style={{ fontWeight: 500 }}>{item.part_name}</td>
                      <td>{item.partner}</td>
                      <td style={{ color: '#b91c1c' }}>{item.due_date}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#b91c1c' }}>+{item.days_overdue}일</td>
                      <td><Badge sev={item.severity} /></td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          />

          {/* 미결 NCR */}
          <Section
            title="미결 NCR (부적합품)"
            icon="🔍"
            items={data.open_ncr || []}
            emptyMsg="미결 NCR 없음"
            renderRow={items => (
              <>
                <thead><tr>
                  <th>NCR 번호</th><th>품번</th><th>품명</th>
                  <th>상태</th><th style={{ textAlign: 'right' }}>경과일수</th><th>심각도</th>
                </tr></thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.ncr_no}>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{item.ncr_no}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.part_no}</td>
                      <td style={{ fontWeight: 500 }}>{item.part_name}</td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.days_open}일</td>
                      <td><Badge sev={item.severity} /></td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          />

          {/* 생산 목표 미달 */}
          <Section
            title="이달 생산 목표 미달 (경과 기준 80% 미달)"
            icon="🏭"
            items={data.production_shortfall || []}
            emptyMsg="생산 목표 미달 품목 없음"
            renderRow={items => (
              <>
                <thead><tr>
                  <th>품번</th><th>품명</th>
                  <th style={{ textAlign: 'right' }}>목표</th>
                  <th style={{ textAlign: 'right' }}>경과 기준</th>
                  <th style={{ textAlign: 'right' }}>실적</th>
                  <th style={{ textAlign: 'right' }}>부족</th>
                  <th>달성률</th>
                  <th>심각도</th>
                </tr></thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.part_no}>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.part_no}</td>
                      <td style={{ fontWeight: 500 }}>{item.part_name}</td>
                      <td style={{ textAlign: 'right' }}>{item.planned_qty.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>{item.expected_by_now.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>{item.actual_qty.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 600 }}>
                        -{item.shortfall.toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 8, background: 'var(--surface-1)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(100, item.achievement_pct)}%`,
                              background: item.achievement_pct >= 80 ? '#16a34a' : item.achievement_pct >= 50 ? '#f59e0b' : '#ef4444',
                              borderRadius: 99,
                            }} />
                          </div>
                          <span style={{ fontSize: 11, minWidth: 36 }}>{item.achievement_pct}%</span>
                        </div>
                      </td>
                      <td><Badge sev={item.severity} /></td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          />
        </>
      )}
    </div>
  )
}
