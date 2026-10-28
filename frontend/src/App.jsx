import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import { getUser, logout, isMaster, STAFF_ALLOWED } from './auth'

const Dashboard      = lazy(() => import('./pages/Dashboard'))
const Inventory      = lazy(() => import('./pages/Inventory'))
const Purchase       = lazy(() => import('./pages/Purchase'))
const Receipt        = lazy(() => import('./pages/Receipt'))
const Sales          = lazy(() => import('./pages/Sales'))
const Quality        = lazy(() => import('./pages/Quality'))
const Production     = lazy(() => import('./pages/Production'))
const Master         = lazy(() => import('./pages/Master'))
const Invoice        = lazy(() => import('./pages/Invoice'))
const Report         = lazy(() => import('./pages/Report'))
const Bom            = lazy(() => import('./pages/Bom'))
const ProductionPlan = lazy(() => import('./pages/ProductionPlan'))
const Cost           = lazy(() => import('./pages/Cost'))
const Mold           = lazy(() => import('./pages/Mold'))
const DeliveryReport = lazy(() => import('./pages/DeliveryReport'))
const MonthlySales   = lazy(() => import('./pages/MonthlySales'))
const MonthlyPurchase = lazy(() => import('./pages/MonthlyPurchase'))
const SalesTarget    = lazy(() => import('./pages/SalesTarget'))

// GNB: 대분류 / LNB: 소분류
const allMenus = [
  { id: 'dashboard', label: '현황', items: [
    { to: '/',       label: '대시보드' },
    { to: '/report', label: '보고서·자동발주' },
  ]},
  { id: 'inventory', label: '재고', items: [
    { to: '/inventory', label: '재고 현황' },
  ]},
  { id: 'purchase', label: '구매', items: [
    { to: '/purchase',         label: '발주 관리' },
    { to: '/receipt',          label: '입고·검사' },
    { to: '/monthly-purchase', label: '월 매입 집계표' },
  ]},
  { id: 'sales', label: '영업', items: [
    { to: '/invoice',       label: '거래명세서' },
    { to: '/sales',         label: '수주/출하' },
    { to: '/monthly-sales', label: '월 매출 집계표' },
    { to: '/sales-target',  label: '매출 목표 관리' },
  ]},
  { id: 'quality', label: '품질', items: [
    { to: '/quality', label: '품질·클레임' },
  ]},
  { id: 'production', label: '생산', items: [
    { to: '/production',      label: '생산 관리' },
    { to: '/production-plan', label: '월 생산계획' },
  ]},
  { id: 'cost', label: '원가', items: [
    { to: '/cost', label: '원가 관리' },
  ]},
  { id: 'mold', label: '금형', items: [
    { to: '/mold', label: '금형 수주관리' },
  ]},
  { id: 'master', label: '기준정보', items: [
    { to: '/master', label: '품목·거래처' },
    { to: '/bom',    label: 'BOM·구매계획' },
  ]},
]

const masterOnlyPaths = [
  '/purchase', '/report', '/quality', '/production',
  '/master', '/bom', '/production-plan', '/cost', '/mold',
  '/monthly-purchase', '/monthly-sales', '/sales-target',
]

function ProtectedRoute({ path, children }) {
  if (!isMaster() && !STAFF_ALLOWED.includes(path)) {
    return <Navigate to="/" replace />
  }
  return children
}

function NowClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  const fmt = now.toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  })
  return <span className="gnb-clock">{fmt}</span>
}

const API = import.meta.env.VITE_API_URL || ''

function AlertBar() {
  const [alerts, setAlerts] = useState([])
  useEffect(() => {
    fetch(`${API}/dashboard/alerts`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setAlerts(data))
      .catch(() => {})
  }, [])

  if (!alerts.length) return null

  const flagClass = (type) => {
    if (type === 'overdue')     return 'alert-flag alert-flag-danger'
    if (type === 'warn')        return 'alert-flag alert-flag-warn'
    if (type === 'new_request') return 'alert-flag alert-flag-info'
    return 'alert-flag alert-flag-info'
  }

  return (
    <div className="alert-bar">
      <span className="alert-bar-label">⚑ ALERT</span>
      {alerts.map((a, i) => (
        <span key={i} className={flagClass(a.type)} title={a.doc_no}>
          {a.message}
        </span>
      ))}
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(getUser)
  const loc = useLocation()
  const navigate = useNavigate()

  if (!user) {
    return <Login onLogin={() => setUser(getUser())} />
  }

  const master = isMaster()

  // 현재 경로로 활성 GNB 그룹 판별
  const activeGroup = allMenus.find(g =>
    g.items.some(item =>
      item.to === '/'
        ? loc.pathname === '/'
        : loc.pathname === item.to || loc.pathname.startsWith(item.to + '/')
    )
  ) ?? allMenus[0]

  // STAFF는 허용된 항목만 보이게
  const visibleMenus = master
    ? allMenus
    : allMenus.map(g => ({
        ...g,
        items: g.items.filter(m => STAFF_ALLOWED.includes(m.to)),
      })).filter(g => g.items.length > 0)

  const handleLogout = () => { logout(); setUser(null) }

  return (
    <div className="layout">

      {/* ── GNB ─────────────────────────────────────────── */}
      <div className="gnb">
        <div className="gnb-logo">
          <span className="gnb-logo-mark">K</span>
          <span className="gnb-logo-name">KAISER ERP</span>
        </div>

        <div className="gnb-tabs">
          {visibleMenus.map(g => (
            <button
              key={g.id}
              className={`gnb-tab${activeGroup?.id === g.id ? ' active' : ''}`}
              onClick={() => navigate(g.items[0].to)}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="gnb-right">
          <NowClock />
          <span className="gnb-user">{user.name}</span>
          {!master && <span className="badge badge-amber" style={{ fontSize: 10 }}>STAFF</span>}
          <button className="gnb-logout" onClick={handleLogout}>로그아웃</button>
        </div>
      </div>

      {/* ── LNB ─────────────────────────────────────────── */}
      {activeGroup && (
        <div className="lnb">
          <span className="lnb-module">{activeGroup.label}</span>
          {activeGroup.items
            .filter(item => master || STAFF_ALLOWED.includes(item.to))
            .map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `lnb-tab${isActive ? ' active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
        </div>
      )}

      {/* ── Alert bar ───────────────────────────────────── */}
      <AlertBar />

      {/* ── Page content ────────────────────────────────── */}
      <div className="page">
        <Suspense fallback={
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-xs)', fontSize: 13 }}>
            로딩 중...
          </div>
        }>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/receipt" element={<Receipt />} />
            <Route path="/invoice" element={<Invoice />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/purchase" element={
              <ProtectedRoute path="/purchase"><Purchase /></ProtectedRoute>
            } />
            <Route path="/report" element={
              <ProtectedRoute path="/report"><Report /></ProtectedRoute>
            } />
            <Route path="/quality" element={
              <ProtectedRoute path="/quality"><Quality /></ProtectedRoute>
            } />
            <Route path="/production" element={
              <ProtectedRoute path="/production"><Production /></ProtectedRoute>
            } />
            <Route path="/master" element={
              <ProtectedRoute path="/master"><Master /></ProtectedRoute>
            } />
            <Route path="/bom" element={
              <ProtectedRoute path="/bom"><Bom /></ProtectedRoute>
            } />
            <Route path="/production-plan" element={
              <ProtectedRoute path="/production-plan"><ProductionPlan /></ProtectedRoute>
            } />
            <Route path="/cost" element={
              <ProtectedRoute path="/cost"><Cost /></ProtectedRoute>
            } />
            <Route path="/mold" element={
              <ProtectedRoute path="/mold"><Mold /></ProtectedRoute>
            } />
            <Route path="/delivery-report" element={<DeliveryReport />} />
            <Route path="/monthly-sales" element={
              <ProtectedRoute path="/monthly-sales"><MonthlySales /></ProtectedRoute>
            } />
            <Route path="/monthly-purchase" element={
              <ProtectedRoute path="/monthly-purchase"><MonthlyPurchase /></ProtectedRoute>
            } />
            <Route path="/sales-target" element={
              <ProtectedRoute path="/sales-target"><SalesTarget /></ProtectedRoute>
            } />
          </Routes>
        </Suspense>
      </div>
    </div>
  )
}
