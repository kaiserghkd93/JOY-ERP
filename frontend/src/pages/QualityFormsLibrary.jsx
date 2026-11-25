import { useState } from 'react'
import { FORMS_LIST, printForm, hasFormTemplate } from './QualityForms'

const CATEGORY_COLOR = {
  '검사 (Inspection)': '#0369a1',
  '부적합·CAPA':       '#b91c1c',
  '품질 관리':         '#15803d',
  '협력업체·심사':     '#7c3aed',
  'VDA 6.3':           '#1e3a5f',
}

const CATEGORY_ICON = {
  '검사 (Inspection)': '🔍',
  '부적합·CAPA':       '⚠️',
  '품질 관리':         '📊',
  '협력업체·심사':     '🏭',
  'VDA 6.3':           '🏆',
}

const CATEGORIES = [...new Set(FORMS_LIST.map(f => f.category))]

export default function QualityFormsLibrary() {
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [search, setSearch] = useState('')

  const filtered = FORMS_LIST.filter(f => {
    const matchCat = activeCategory === 'ALL' || f.category === activeCategory
    const q = search.trim().toLowerCase()
    const matchSearch = !q || f.no.toLowerCase().includes(q) || f.title.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = filtered.filter(f => f.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  return (
    <div style={{ padding: '0 2px' }}>
      {/* 헤더 */}
      <div className="erp-panel" style={{ marginBottom: 10 }}>
        <div className="erp-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>📄 서식 자료실</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>총 {FORMS_LIST.length}종 — 클릭하면 A4 출력 창이 열립니다</span>
          <div className="spacer" />
          <input
            className="search-input"
            style={{ width: 200, fontSize: 12 }}
            placeholder="양식번호 또는 양식명 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 카테고리 필터 버튼 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <button
          className={`qdate-btn${activeCategory === 'ALL' ? ' active' : ''}`}
          onClick={() => setActiveCategory('ALL')}
        >
          전체 ({FORMS_LIST.length})
        </button>
        {CATEGORIES.map(cat => {
          const count = FORMS_LIST.filter(f => f.category === cat).length
          return (
            <button
              key={cat}
              className={`qdate-btn${activeCategory === cat ? ' active' : ''}`}
              style={activeCategory === cat ? { background: CATEGORY_COLOR[cat], borderColor: CATEGORY_COLOR[cat] } : {}}
              onClick={() => setActiveCategory(cat)}
            >
              {CATEGORY_ICON[cat]} {cat} ({count})
            </button>
          )
        })}
      </div>

      {/* 양식 카드 그리드 */}
      {Object.keys(grouped).length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>검색 결과 없음</div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          {/* 카테고리 헤더 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: CATEGORY_COLOR[cat], color: '#fff',
            padding: '6px 14px', borderRadius: 6, marginBottom: 10,
            fontWeight: 900, fontSize: 13, letterSpacing: 0.5,
          }}>
            <span>{CATEGORY_ICON[cat]}</span>
            <span>{cat}</span>
            <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>{items.length}종</span>
          </div>

          {/* 양식 카드 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 8,
          }}>
            {items.map(f => {
              const dedicated = hasFormTemplate(f.no)
              return (
                <div
                  key={f.no}
                  style={{
                    border: `1px solid ${dedicated ? CATEGORY_COLOR[cat] + '55' : 'var(--border)'}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    background: dedicated ? CATEGORY_COLOR[cat] + '08' : 'var(--bg)',
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer',
                    transition: 'box-shadow .15s',
                  }}
                  onClick={() => printForm(f.no, f.title)}
                  title={dedicated ? '전용 양식 출력' : '기본 양식 출력'}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.12)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  {/* 아이콘 */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                    background: CATEGORY_COLOR[cat] + (dedicated ? '22' : '11'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                  }}>
                    📋
                  </div>

                  {/* 텍스트 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: CATEGORY_COLOR[cat], fontWeight: 700, marginBottom: 1 }}>
                      {f.no}
                      {dedicated && (
                        <span style={{
                          marginLeft: 6, background: CATEGORY_COLOR[cat], color: '#fff',
                          borderRadius: 3, padding: '0 4px', fontSize: 9, fontWeight: 400,
                        }}>전용</span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {f.title}
                    </div>
                  </div>

                  {/* 출력 버튼 */}
                  <div style={{
                    flexShrink: 0, fontSize: 18, color: CATEGORY_COLOR[cat], opacity: dedicated ? 1 : 0.4,
                  }}>
                    🖨
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* 하단 안내 */}
      <div style={{
        marginTop: 16, padding: '10px 14px', borderRadius: 6,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        fontSize: 11, color: '#64748b', lineHeight: 1.6,
      }}>
        💡 <strong>전용</strong> 뱃지가 있는 양식은 항목이 채워진 전용 서식입니다. 나머지는 기본 서식이 출력됩니다.<br />
        각 절차서의 <strong>7. 품질 기록</strong> 섹션에서도 해당 양식을 직접 출력할 수 있습니다.
      </div>
    </div>
  )
}
