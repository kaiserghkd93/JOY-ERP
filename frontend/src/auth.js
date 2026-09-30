// 계정 정보 (프론트엔드 간이 인증)
const ACCOUNTS = {
  'kaiser': { password: 'kaiser2024!', role: 'master', name: '관리자' },
  'staff':  { password: 'staff1234',   role: 'staff',  name: '현장직원' },
}

// 직원 계정 허용 메뉴
export const STAFF_ALLOWED = ['/', '/inventory', '/invoice', '/receipt', '/sales']

export function login(id, pw) {
  const acc = ACCOUNTS[id]
  if (!acc || acc.password !== pw) return false
  sessionStorage.setItem('kaiser_user', JSON.stringify({ id, role: acc.role, name: acc.name }))
  return true
}

export function logout() {
  sessionStorage.removeItem('kaiser_user')
}

export function getUser() {
  const s = sessionStorage.getItem('kaiser_user')
  return s ? JSON.parse(s) : null
}

export function isMaster() {
  return getUser()?.role === 'master'
}
