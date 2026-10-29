import { useState, useEffect } from 'react'
import api from '../api'
import { ROLE_LABELS } from '../auth'

const ROLES = Object.entries(ROLE_LABELS).filter(([k]) => k !== 'admin')

export default function UserAdmin() {
  const [users, setUsers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'sales', partner_id: '' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    api.get('/auth/users').then(r => setUsers(r.data)).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => {
    setEditUser(null)
    setForm({ username: '', password: '', name: '', role: 'sales', partner_id: '' })
    setShowForm(true)
  }

  const openEdit = (u) => {
    setEditUser(u)
    setForm({ username: u.username, password: '', name: u.name || '', role: u.role, partner_id: u.partner_id || '' })
    setShowForm(true)
  }

  const submit = async () => {
    if (!form.username || !form.name || (!editUser && !form.password)) {
      alert('아이디, 이름, 비밀번호는 필수입니다')
      return
    }
    setSaving(true)
    try {
      if (editUser) {
        const patch = { name: form.name, role: form.role }
        if (form.password) patch.password = form.password
        await api.patch(`/auth/users/${editUser.id}`, patch)
      } else {
        await api.post('/auth/users', {
          username: form.username, password: form.password,
          name: form.name, role: form.role,
          partner_id: form.partner_id || null,
        })
      }
      setShowForm(false)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || '저장 실패')
    } finally { setSaving(false) }
  }

  const toggleActive = async (u) => {
    await api.patch(`/auth/users/${u.id}`, { is_active: !u.is_active }).catch(() => {})
    load()
  }

  const ROLE_COLOR = {
    admin: '#1d4ed8', executive: '#7c3aed', manager: '#0891b2',
    accounting: '#b45309', sales: '#15803d', purchase: '#c2410c',
    shipping: '#0369a1', quality: '#7c3aed', quality_manager: '#6d28d9', production: '#4d7c0f', supplier: '#64748b',
  }

  return (
    <div>
      <div className="erp-panel" style={{marginBottom:8}}>
        <div className="erp-actions">
          <span style={{fontWeight:700,fontSize:15}}>계정 관리</span>
          <div className="spacer"/>
          <button className="btn btn-sm btn-primary" onClick={openNew}>＋ 계정 추가</button>
        </div>
      </div>

      <div className="result-bar">
        <span className="result-bar-title">전체 계정</span>
        <span className="result-bar-count">{users.length}명</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>아이디</th><th>이름</th><th>역할</th><th>외주처 연결</th><th>상태</th><th>수정</th><th>활성</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && <tr><td colSpan={7} className="empty">계정 없음</td></tr>}
            {users.map(u => (
              <tr key={u.id} style={{opacity: u.is_active ? 1 : 0.5}}>
                <td style={{fontFamily:'monospace',fontWeight:600}}>{u.username}</td>
                <td>{u.name}</td>
                <td>
                  <span style={{
                    background: (ROLE_COLOR[u.role] || '#64748b') + '18',
                    color: ROLE_COLOR[u.role] || '#64748b',
                    border: `1px solid ${ROLE_COLOR[u.role] || '#64748b'}40`,
                    borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  }}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </td>
                <td style={{color:'#64748b',fontSize:12}}>{u.partner_id || '—'}</td>
                <td>
                  <span className={`badge ${u.is_active ? 'badge-green' : 'badge-gray'}`}>
                    {u.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td>
                  {u.role !== 'admin' && (
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(u)}>수정</button>
                  )}
                </td>
                <td>
                  {u.role !== 'admin' && (
                    <button
                      className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-outline'}`}
                      style={{fontSize:11}}
                      onClick={() => toggleActive(u)}>
                      {u.is_active ? '정지' : '활성화'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal" style={{width:480}}>
            <h3>{editUser ? '계정 수정' : '계정 추가'}</h3>
            <div className="grid-2">
              <div className="form-group">
                <label>아이디 *</label>
                <input value={form.username} onChange={e=>set('username',e.target.value)}
                  disabled={!!editUser} placeholder="영문+숫자" />
              </div>
              <div className="form-group">
                <label>이름 *</label>
                <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="홍길동" />
              </div>
            </div>
            <div className="form-group">
              <label>비밀번호 {editUser ? '(변경 시만 입력)' : '*'}</label>
              <input type="password" value={form.password} onChange={e=>set('password',e.target.value)}
                placeholder={editUser ? '변경하지 않으면 비워두세요' : '초기 비밀번호'} />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label>역할 *</label>
                <select value={form.role} onChange={e=>set('role',e.target.value)}>
                  {ROLES.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>외주처 ID (외주처 계정만)</label>
                <input value={form.partner_id} onChange={e=>set('partner_id',e.target.value)}
                  placeholder="예: MIDAS-001" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowForm(false)}>취소</button>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
