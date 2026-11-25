import { useState, useRef, useEffect } from 'react'

/**
 * 검색 가능한 드롭다운 컴포넌트
 * Props:
 *   value       - 현재 선택된 값 (option의 value)
 *   onChange    - (value) => void
 *   options     - [{ value, label }] 배열
 *   placeholder - 미선택 시 표시 텍스트 (기본: '선택')
 *   style       - 컨테이너 추가 스타일
 *   disabled    - 비활성화
 */
export default function SearchableSelect({ value, onChange, options = [], placeholder = '선택', style, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find(o => o.value === value)
  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  useEffect(() => {
    const handler = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (val) => {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      {/* 트리거 버튼 */}
      <div
        onClick={() => { if (!disabled) setOpen(o => !o) }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 4,
          background: disabled ? 'var(--bg-secondary)' : 'var(--bg)',
          color: selected ? 'var(--text)' : '#94a3b8',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 13, minHeight: 32, userSelect: 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>▼</span>
      </div>

      {/* 드롭다운 패널 */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,.18)',
          marginTop: 2,
        }}>
          {/* 검색 입력 */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="검색..."
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '4px 8px', border: '1px solid var(--border)',
                borderRadius: 3, fontSize: 12,
                background: 'var(--bg)', color: 'var(--text)',
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') { setOpen(false); setQuery('') }
                if (e.key === 'Enter' && filtered.length === 1) select(filtered[0].value)
              }}
            />
          </div>

          {/* 옵션 목록 */}
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {/* 빈 선택 */}
            <div
              onClick={() => select('')}
              style={{
                padding: '7px 12px', fontSize: 12, cursor: 'pointer',
                color: '#94a3b8',
                background: value === '' ? 'var(--bg-secondary)' : 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              onMouseLeave={e => e.currentTarget.style.background = value === '' ? 'var(--bg-secondary)' : 'transparent'}
            >
              {placeholder}
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                검색 결과 없음
              </div>
            )}

            {filtered.map(o => (
              <div
                key={o.value}
                onClick={() => select(o.value)}
                style={{
                  padding: '7px 12px', fontSize: 12, cursor: 'pointer',
                  background: o.value === value ? '#eff6ff' : 'transparent',
                  color: o.value === value ? '#1d4ed8' : 'var(--text)',
                  fontWeight: o.value === value ? 600 : 400,
                }}
                onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = 'var(--bg-secondary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = o.value === value ? '#eff6ff' : 'transparent' }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
