import { useState } from 'react'
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Purchase from './pages/Purchase'
import Receipt from './pages/Receipt'
import Sales from './pages/Sales'
import Quality from './pages/Quality'
import Production from './pages/Production'
import Master from './pages/Master'
import Invoice from './pages/Invoice'
import Report from './pages/Report'
import Bom from './pages/Bom'
import ProductionPlan from './pages/ProductionPlan'
import Cost from './pages/Cost'
import Mold from './pages/Mold'
import DeliveryReport from './pages/DeliveryReport'
import MonthlySales from './pages/MonthlySales'
import Login from './pages/Login'
import { getUser, logout, isMaster, STAFF_ALLOWED } from './auth'

const allMenus = [
  { group: '현황', items: [
    { to: '/', label: '대시보드', icon: '▪' },
    { to: '/report', label: '보고서', icon: '▪' },
  ]},
  { group: '재고', items: [
    { to: '/inventory', label: '재고 현황', icon: '▪' },
  ]},
  { group: '구매', items: [
    { to: '/purchase', label: '발주 관리', icon: '▪' },
    { to: '/receipt', label: '입고·검사', icon: '▪' },
  ]},
  { group: '영업', items: [
    { to: '/invoice', label: '거래명세서', icon: '▪' },
    { to: '/sales', label: '수주/출하', icon: '▪' },
    { to: '/monthly-sales', label: '월 매출 집계표', icon: '▪' },
  ]},
  { group: '품질', items: [
    { to: '/quality', label: '품질·클레임', icon: '▪' },
  ]},
  { group: '생산', items: [
    { to: '/production', label: '생산 관리', icon: '▪' },
    { to: '/production-plan', label: '월 생산계획', icon: '▪' },
  ]},
  { group: '원가', items: [
    { to: '/cost', label: '원가 관리', icon: '▪' },
  ]},
  { group: '금형', items: [
    { to: '/mold', label: '금형 수주관리', icon: '▪' },
  ]},
  { group: '기준정보', items: [
    { to: '/master', label: '품목·거래처', icon: '▪' },
    { to: '/bom', label: 'BOM·구매계획', icon: '▪' },
  ]},
]

const pageTitles = {
  '/': '대시보드',
  '/inventory': '재고 현황',
  '/purchase': '발주 관리',
  '/receipt': '입고·수입검사',
  '/report': '보고서 & 자동발주',
  '/delivery-report': '납기준수율 종합 보고서',
  '/invoice': '거래명세서',
  '/sales': '수주/출하 관리',
  '/quality': '품질·클레임 관리',
  '/production': '생산 관리',
  '/production-plan': '월 생산계획 · 실적',
  '/master': '기준정보 관리',
  '/bom': 'BOM · 원재료 구매계획',
  '/cost': '원가 관리',
  '/mold': '금형 수주관리',
  '/monthly-sales': '월 매출 집계표',
}

function ProtectedRoute({ path, children }) {
  if (!isMaster() && !STAFF_ALLOWED.includes(path)) {
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  const [user, setUser] = useState(getUser)
  const loc = useLocation()
  const title = pageTitles[loc.pathname] || 'KAISER ERP'

  if (!user) {
    return <Login onLogin={() => setUser(getUser())} />
  }

  const master = isMaster()
  const menus = master
    ? allMenus
    : allMenus.map(g => ({
        ...g,
        items: g.items.filter(m => STAFF_ALLOWED.includes(m.to))
      })).filter(g => g.items.length > 0)

  const handleLogout = () => {
    logout()
    setUser(null)
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">K</div>
          <div>
            <div className="logo-text">KAISER</div>
            <span className="logo-sub">ERP SYSTEM</span>
          </div>
        </div>

        {menus.map(g => (
          <div className="sidebar-group" key={g.group}>
            <div className="sidebar-label">{g.group}</div>
            {g.items.map(m => (
              <NavLink key={m.to} to={m.to} end className={({ isActive }) => isActive ? 'active' : ''}>
                {m.label}
              </NavLink>
            ))}
          </div>
        ))}

        {/* 하단 사용자 정보 */}
        <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 11, color: '#4a5568', letterSpacing: 1, marginBottom: 6 }}>
            {master ? '● MASTER' : '● STAFF'}
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 10 }}>
            {user.name}
          </div>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '6px', background: 'transparent',
            border: '1px solid #2d3748', color: '#64748b',
            cursor: 'pointer', fontSize: 11, letterSpacing: 1,
            fontFamily: 'inherit', textTransform: 'uppercase',
          }}
          onMouseEnter={e => { e.target.style.borderColor = '#c8102e'; e.target.style.color = '#c8102e' }}
          onMouseLeave={e => { e.target.style.borderColor = '#2d3748'; e.target.style.color = '#64748b' }}
          >로그아웃</button>
        </div>
      </nav>

      <div className="main">
        <div className="topbar">
          {title}
          {!master && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af', letterSpacing: 1, fontWeight: 400 }}>
              STAFF ACCESS
            </span>
          )}
        </div>
        <div className="page">
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
          </Routes>
        </div>
      </div>
    </div>
  )
}
