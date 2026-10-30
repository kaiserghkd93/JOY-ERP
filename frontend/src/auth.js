const API = import.meta.env.VITE_API_URL || ''

// ── 역할별 접근 가능 경로 ─────────────────────────────────────────
// null = 전체 접근 (admin)
const ROLE_PERMISSIONS = {
  admin:      null,  // 나만 (외주구매·계정관리 포함 전체)
  executive:  ['/', '/report', '/dashboard', '/monthly-sales', '/monthly-purchase', '/sales-target', '/inventory', '/cost', '/cost-actual', '/mrp', '/management'],
  manager:    ['/', '/sales-target', '/cost-actual'],
  accounting: ['/', '/invoice', '/monthly-sales', '/monthly-purchase', '/sales-target', '/report', '/inventory', '/cost-actual'],
  sales:      ['/', '/sales', '/invoice', '/monthly-sales', '/sales-target', '/inventory'],
  purchase:   ['/', '/receipt', '/monthly-purchase', '/bom', '/inventory',
               '/sales', '/invoice', '/monthly-sales', '/sales-target',
               '/quality', '/production', '/production-plan',
               '/master', '/bom'],
  material:       ['/', '/purchase', '/mrp', '/inventory', '/inv-adjust'],
  manufacturing:  ['/', '/production', '/production-plan', '/sales', '/invoice', '/monthly-sales', '/sales-target', '/inventory', '/cost', '/cost-actual', '/mold', '/mrp', '/production-mrp', '/bom', '/inv-adjust'],
  shipping:   ['/', '/sales', '/invoice', '/inventory'],
  quality:         ['/', '/quality', '/inventory', '/production', '/production-plan', '/production-mrp'],
  quality_manager: ['/', '/quality', '/inventory', '/production', '/production-plan', '/production-mrp', '/sales', '/invoice', '/inv-adjust'],
  production: ['/', '/production', '/production-plan', '/inventory', '/cost', '/mold', '/bom', '/inv-adjust'],
  owner:      ['/', '/inventory', '/inv-adjust', '/invoice', '/sales', '/monthly-sales', '/sales-target',
                '/quality', '/production', '/production-plan', '/production-mrp',
                '/cost', '/cost-actual', '/mold', '/master', '/bom',
                '/purchase', '/mrp', '/monthly-purchase', '/management'],
  supplier:   ['/'],
}

// 재무 데이터 열람 가능 역할 (대시보드 마감요약·손익)
export const FINANCE_ROLES = ['admin', 'accounting', 'executive']

// 역할 한글 레이블
export const ROLE_LABELS = {
  admin:      '관리자 (전체)',
  executive:  '대표/전무',
  manager:    '상무',
  accounting: '경리',
  sales:      '영업관리',
  purchase:   '외주구매',
  shipping:   '출하관리',
  quality:         '품질검사 담당자',
  quality_manager: '품질책임자',
  production: '생산관리',
  material:      '자재구매',
  manufacturing: '제조관리 총괄',
  owner:         '오너',
  supplier:      '외주처 (외부)',
}

// ── 인증 ─────────────────────────────────────────────────────────
export async function login(id, pw) {
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: id, password: pw }),
    })
    if (!res.ok) return false
    const data = await res.json()
    sessionStorage.setItem('jwt_token', data.access_token)
    sessionStorage.setItem('kaiser_user', JSON.stringify({
      id, role: data.role, name: data.name, partner_id: data.partner_id,
    }))
    return true
  } catch {
    return false
  }
}

export function logout() {
  sessionStorage.removeItem('kaiser_user')
  sessionStorage.removeItem('jwt_token')
}

const VALID_ROLES = new Set(Object.keys(ROLE_PERMISSIONS))

export function getUser() {
  const s = sessionStorage.getItem('kaiser_user')
  if (!s) return null
  const u = JSON.parse(s)
  // 구버전 role(master/staff 등)이 남아있으면 세션 초기화
  if (!VALID_ROLES.has(u.role)) {
    sessionStorage.removeItem('kaiser_user')
    sessionStorage.removeItem('jwt_token')
    return null
  }
  return u
}

export function getRole() {
  return getUser()?.role ?? null
}

export function isMaster() {
  return getRole() === 'admin'
}

// 경로에 대한 접근 권한 확인
export function hasPermission(path) {
  const role = getRole()
  if (!role) return false
  const allowed = ROLE_PERMISSIONS[role]
  if (allowed === undefined) return false  // 알 수 없는 역할(구 버전 캐시 등)
  if (allowed === null) return true        // admin = 전체
  // 정확히 일치하거나 하위 경로면 허용
  return allowed.some(p => p === path || (p !== '/' && path.startsWith(p + '/')))
}

// 재무 데이터 열람 가능 여부
export function canViewFinancials() {
  return FINANCE_ROLES.includes(getRole())
}

// 현재 역할의 허용 경로 목록 (메뉴 필터링용)
export function getAllowedPaths() {
  const role = getRole()
  if (!role) return []
  return ROLE_PERMISSIONS[role]  // null = all
}
