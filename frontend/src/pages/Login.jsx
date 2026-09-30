import { useState } from 'react'
import { login } from '../auth'

export default function Login({ onLogin }) {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setTimeout(() => {
      if (login(id, pw)) {
        onLogin()
      } else {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.')
      }
      setLoading(false)
    }, 300)
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#1a1a2e',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: 380 }}>
        {/* 로고 */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, background: '#c8102e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 32, fontWeight: 900, color: '#fff',
          }}>K</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: 4 }}>KAISER ERP</div>
          <div style={{ fontSize: 11, color: '#4a5568', letterSpacing: 3, marginTop: 4 }}>ENTERPRISE RESOURCE PLANNING</div>
        </div>

        {/* 로그인 박스 */}
        <form onSubmit={submit} style={{
          background: '#16213e', border: '1px solid #0f3460',
          borderTop: '3px solid #c8102e', padding: '32px 36px',
        }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', fontSize: 10, fontWeight: 700,
              color: '#6b7a99', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase'
            }}>아이디</label>
            <input
              type="text" value={id} onChange={e => setId(e.target.value)}
              autoFocus autoComplete="username"
              style={{
                width: '100%', padding: '10px 14px',
                background: '#1a1a2e', border: '1px solid #0f3460',
                color: '#e2e8f0', fontSize: 14, outline: 'none',
                borderRadius: 0, fontFamily: 'inherit',
              }}
              onFocus={e => e.target.style.borderColor = '#c8102e'}
              onBlur={e => e.target.style.borderColor = '#0f3460'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block', fontSize: 10, fontWeight: 700,
              color: '#6b7a99', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase'
            }}>비밀번호</label>
            <input
              type="password" value={pw} onChange={e => setPw(e.target.value)}
              autoComplete="current-password"
              style={{
                width: '100%', padding: '10px 14px',
                background: '#1a1a2e', border: '1px solid #0f3460',
                color: '#e2e8f0', fontSize: 14, outline: 'none',
                borderRadius: 0, fontFamily: 'inherit',
              }}
              onFocus={e => e.target.style.borderColor = '#c8102e'}
              onBlur={e => e.target.style.borderColor = '#0f3460'}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.3)',
              color: '#f87171', fontSize: 12, padding: '8px 12px', marginBottom: 16,
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '12px',
            background: loading ? '#6b1020' : '#c8102e',
            color: '#fff', border: 'none', cursor: loading ? 'default' : 'pointer',
            fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
            fontFamily: 'inherit',
          }}>
            {loading ? '확인 중...' : '로 그 인'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#2d3748' }}>
          © 2026 KAISER · Powered by NEXGEM
        </div>
      </div>
    </div>
  )
}
