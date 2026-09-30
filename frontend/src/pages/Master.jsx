import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../api'

function ItemModal({ item, onClose, onSaved }) {
  const editing = !!item
  const [form, setForm] = useState(item || {
    part_no: '', name: '', spec: '', supplier: '', unit: 'EA', item_type: 'outsourced',
    std_buy_price: '', std_sell_price: '', safety_stock: '', moq: '', location: '',
  })
  const [suppliers, setSuppliers] = useState([])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get('/master/partners').then(r =>
      setSuppliers(r.data.filter(p => p.partner_type === '외주처' || p.partner_type === '공용'))
    ).catch(() => {})
  }, [])

  const submit = async () => {
    const payload = {
      ...form,
      std_buy_price: form.std_buy_price ? +form.std_buy_price : 0,
      std_sell_price: form.std_sell_price ? +form.std_sell_price : 0,
      safety_stock: form.safety_stock ? +form.safety_stock : 0,
      moq: form.moq ? +form.moq : 1,
    }
    try {
      if (editing) await api.patch(`/master/items/${form.part_no}`, payload)
      else await api.post('/master/items', payload)
      onSaved()
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map(e => e.msg || JSON.stringify(e)).join('\n')
        : (detail || err.message)
      alert('저장 실패: ' + msg)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{editing ? '품목 수정' : '품목 등록'}</h3>
        <div className="grid-2">
          <div className="form-group"><label>품번</label><input value={form.part_no} onChange={e => set('part_no', e.target.value)} disabled={editing} /></div>
          <div className="form-group"><label>품명</label><input value={form.name} onChange={e => set('name', e.target.value)} /></div>
        </div>
        <div className="form-group">
          <label>외주처 <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>(복수 시 쉼표 구분)</span></label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={form.supplier || ''}
              onChange={e => set('supplier', e.target.value)}
              placeholder="직접 입력 또는 오른쪽에서 선택"
              style={{ flex: 1 }}
            />
            <select
              defaultValue=""
              onChange={e => {
                if (!e.target.value) return
                const cur = (form.supplier || '').trim()
                const next = cur ? `${cur}, ${e.target.value}` : e.target.value
                set('supplier', next)
                e.target.value = ''
              }}
              style={{ width: 160, fontSize: 13 }}>
              <option value="">+ 외주처 선택</option>
              {suppliers.map(s => <option key={s.partner_id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>규격 <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>(도면번호·사양 등)</span></label>
          <input value={form.spec || ''} onChange={e => set('spec', e.target.value)} placeholder="예) ACB, MCCB, 도면번호 등" />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Unit</label>
            <select value={form.unit} onChange={e => set('unit', e.target.value)}>
              <option value="EA">EA</option><option value="KG">KG</option><option value="M">M</option><option value="SET">SET</option>
            </select>
          </div>
          <div className="form-group">
            <label>품목구분</label>
            <select value={form.item_type} onChange={e => set('item_type', e.target.value)}>
              <option value="finished">제품 (완제품)</option>
              <option value="semi">반제품</option>
              <option value="outsourced">외주품</option>
              <option value="raw">원자재</option>
              <option value="sub">부자재</option>
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>표준입고가</label><input type="number" value={form.std_buy_price || ''} onChange={e => set('std_buy_price', e.target.value)} /></div>
          <div className="form-group"><label>표준판매가</label><input type="number" value={form.std_sell_price || ''} onChange={e => set('std_sell_price', e.target.value)} /></div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>안전재고</label><input type="number" value={form.safety_stock || ''} onChange={e => set('safety_stock', e.target.value)} placeholder="0" /></div>
          <div className="form-group"><label>MOQ (최소발주수량)</label><input type="number" value={form.moq || ''} onChange={e => set('moq', e.target.value)} placeholder="1" /></div>
        </div>
        <div className="form-group">
          <label>보관 창고</label>
          <select value={form.location || ''} onChange={e => set('location', e.target.value)}>
            <option value="">-- 미지정 --</option>
            <option value="A동">A동</option>
            <option value="B동">B동</option>
            <option value="C동">C동</option>
            <option value="1F-1">1F-1</option>
            <option value="1F-2">1F-2</option>
          </select>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  )
}

function PartnerModal({ partner, onClose, onSaved }) {
  const editing = !!partner
  const [form, setForm] = useState(partner || {
    partner_id: '', name: '', partner_type: '외주처', business_no: '', payment_terms: '', email: '', address: '', contact: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (editing) await api.put(`/master/partners/${form.partner_id}`, form)
    else await api.post('/master/partners', form)
    onSaved()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{editing ? '거래처 수정' : '거래처 등록'}</h3>
        <div className="grid-2">
          <div className="form-group"><label>거래처코드</label><input value={form.partner_id} onChange={e => set('partner_id', e.target.value)} disabled={editing} /></div>
          <div className="form-group"><label>거래처명</label><input value={form.name} onChange={e => set('name', e.target.value)} /></div>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Type</label>
            <select value={form.partner_type} onChange={e => set('partner_type', e.target.value)}>
              <option value="외주처">Supplier (외주처)</option>
              <option value="고객">Customer (고객사)</option>
              <option value="원자재공급처">Material Supplier</option>
              <option value="공용">Common</option>
            </select>
          </div>
          <div className="form-group"><label>사업자번호</label><input value={form.business_no || ''} onChange={e => set('business_no', e.target.value)} /></div>
        </div>
        <div className="form-group"><label>주소</label><input value={form.address || ''} onChange={e => set('address', e.target.value)} placeholder="경기도 성남시..." /></div>
        <div className="grid-2">
          <div className="form-group"><label>연락처</label><input value={form.contact || ''} onChange={e => set('contact', e.target.value)} placeholder="031-000-0000" /></div>
          <div className="form-group"><label>이메일</label><input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="partner@example.com" /></div>
        </div>
        <div className="form-group"><label>결제조건</label><input value={form.payment_terms || ''} onChange={e => set('payment_terms', e.target.value)} placeholder="익월말, Net30…" /></div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  )
}

export default function Master() {
  const [tab, setTab] = useState('items')
  const [items, setItems] = useState([])
  const [partners, setPartners] = useState([])
  const [q, setQ] = useState('')
  const [itemModal, setItemModal] = useState(null)
  const [partnerModal, setPartnerModal] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [lsUploading, setLsUploading] = useState(false)
  const [locFilter, setLocFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [customerParts, setCustomerParts] = useState({}) // {partner_id: [part_no]}
  const fileRef = useRef()
  const bulkRef = useRef()
  const lsRef = useRef()

  const load = useCallback(() => {
    api.get('/master/items').then(r => setItems(r.data)).catch(() => {})
    api.get('/master/partners').then(r => setPartners(r.data)).catch(() => {})
    api.get('/master/items/customer-parts').then(r => setCustomerParts(r.data)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  // 통합 업로드 (품목+거래처+초기재고 한번에)
  const uploadBulk = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post('/master/bulk-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setUploadResult(res.data)
      load()
    } catch (err) {
      alert('업로드 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // LS Electric 품목리스트 업로드 (품번/품명/단가 3열)
  const uploadLsItems = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLsUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post('/master/items/import-ls', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const d = res.data
      alert(`LS 품목리스트 업로드 완료\n신규: ${d.created}건 / 수정: ${d.updated}건 / 스킵: ${d.skipped}건${d.errors?.length ? `\n오류: ${d.errors.length}건` : ''}`)
      load()
    } catch (err) {
      alert('업로드 실패: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLsUploading(false)
      e.target.value = ''
    }
  }

  // 양식 다운로드
  const downloadTemplate = () => {
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new()

      // Sheet1: 품목
      const itemSheet = XLSX.utils.aoa_to_sheet([
        ['품번', '품명', '규격', '단위', '품목구분', '표준입고가', '표준판매가', '안전재고', 'MOQ'],
        ['예)GC1-MO-0060', 'GRID LEFT CAP', '200x100', 'EA', '외주품', 5000, 8000, 100, 50],
        ['예)GC1-MO-0061', 'GRID RIGHT CAP', '200x100', 'EA', '외주품', 5000, 8000, 100, 50],
      ])
      itemSheet['!cols'] = [{wch:20},{wch:30},{wch:15},{wch:8},{wch:12},{wch:12},{wch:12},{wch:10},{wch:8}]
      XLSX.utils.book_append_sheet(wb, itemSheet, '품목')

      // Sheet2: 거래처
      const partnerSheet = XLSX.utils.aoa_to_sheet([
        ['거래처코드', '거래처명', '구분', '사업자번호', '결제조건', '이메일'],
        ['예)SUPP-001', '○○산업', '외주처', '123-45-67890', '익월말', 'contact@supplier.com'],
        ['예)CUST-001', '△△전자', '고객', '987-65-43210', 'Net30', ''],
      ])
      partnerSheet['!cols'] = [{wch:15},{wch:20},{wch:10},{wch:15},{wch:12},{wch:25}]
      XLSX.utils.book_append_sheet(wb, partnerSheet, '거래처')

      // Sheet3: 초기재고
      const stockSheet = XLSX.utils.aoa_to_sheet([
        ['품번', '현재고수량', '단가(선택)'],
        ['예)GC1-MO-0060', 500, 5000],
        ['예)GC1-MO-0061', 320, 5000],
      ])
      stockSheet['!cols'] = [{wch:20},{wch:14},{wch:12}]
      XLSX.utils.book_append_sheet(wb, stockSheet, '초기재고')

      XLSX.writeFile(wb, '넥스젬ERP_데이터입력양식.xlsx')
    })
  }

  const suppliers = partners.filter(p => p.partner_type === '외주처' || p.partner_type === '공용')

  const TYPE_GROUPS = {
    '제품': ['finished', 'semi'],
    '외주품': ['outsourced'],
    '원자재': ['raw'],
    '부자재': ['sub'],
  }
  const TYPE_LABEL = { finished: '제품', semi: '반제품', outsourced: '외주품', raw: '원자재', sub: '부자재' }
  const TYPE_BADGE = { finished: 'badge-green', semi: 'badge-purple', outsourced: 'badge-blue', raw: 'badge-orange', sub: 'badge-gray' }

  const filteredItems = items.filter(i => {
    const matchQ = i.part_no.toLowerCase().includes(q.toLowerCase()) || i.name.toLowerCase().includes(q.toLowerCase())
    const matchLoc = !locFilter ? true
      : locFilter === '__none__' ? !i.location
      : i.location === locFilter
    const matchSupplier = !supplierFilter ? true
      : supplierFilter === '__none__' ? !i.supplier
      : (i.supplier || '').includes(suppliers.find(s => s.partner_id === supplierFilter)?.name || supplierFilter)
    const matchType = !typeFilter ? true : (TYPE_GROUPS[typeFilter] || [typeFilter]).includes(i.item_type)
    const matchCustomer = !customerFilter ? true : (customerParts[customerFilter] || []).includes(i.part_no)
    return matchQ && matchLoc && matchSupplier && matchType && matchCustomer
  })
  const filteredPartners = partners.filter(p =>
    p.partner_id.toLowerCase().includes(q.toLowerCase()) ||
    p.name.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div>
      {/* 통합 업로드 배너 */}
      <div style={{
        background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
        borderRadius: 10, padding: '14px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ color: '#fff' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>데이터 일괄 업로드</div>
          <div style={{ fontSize: 12, color: '#bfdbfe' }}>품목 + 거래처 + 초기재고를 엑셀 한 파일로 한번에 등록</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
            onClick={downloadTemplate}>
            양식 다운로드
          </button>
          <button className="btn" style={{ background: '#fff', color: '#1d4ed8', fontWeight: 700 }}
            disabled={uploading} onClick={() => bulkRef.current?.click()}>
            {uploading ? '업로드 중...' : '엑셀 업로드'}
          </button>
          <input type="file" accept=".xlsx,.xls" ref={bulkRef} style={{ display: 'none' }} onChange={uploadBulk} />
        </div>
      </div>

      {/* 업로드 결과 */}
      {uploadResult && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 6 }}>업로드 완료</div>
          <div style={{ display: 'flex', gap: 24, fontSize: 13, flexWrap: 'wrap' }}>
            {uploadResult.items && (
              <span>품목: <b>{uploadResult.items.created}건 신규</b> / {uploadResult.items.updated}건 수정</span>
            )}
            {uploadResult.partners && (
              <span>거래처: <b>{uploadResult.partners.created}건 신규</b> / {uploadResult.partners.updated}건 수정</span>
            )}
            {uploadResult.stock && (
              <span>초기재고: <b>{uploadResult.stock.adjusted}건 조정</b></span>
            )}
          </div>
          {uploadResult.errors?.length > 0 && (
            <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>
              오류 {uploadResult.errors.length}건: {uploadResult.errors.slice(0, 3).map(e => `[${e.sheet} ${e.row}행] ${e.error}`).join(' / ')}
              {uploadResult.errors.length > 3 && ` 외 ${uploadResult.errors.length - 3}건`}
            </div>
          )}
          <button style={{ marginTop: 8, fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setUploadResult(null)}>닫기</button>
        </div>
      )}

      <div className="toolbar">
        <button className={`btn ${tab === 'items' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('items')}>품목 마스터</button>
        <button className={`btn ${tab === 'partners' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('partners')}>거래처 마스터</button>
        <input type="search" placeholder="검색" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 180 }} />
        {tab === 'items' && (<>
          {/* 유형 필터 버튼 */}
          {['', '제품', '외주품', '원자재', '부자재'].map(t => (
            <button key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 20, cursor: 'pointer',
                border: typeFilter === t ? '1.5px solid #1d4ed8' : '1.5px solid #e2e8f0',
                background: typeFilter === t ? '#1d4ed8' : 'transparent',
                color: typeFilter === t ? '#fff' : '#64748b',
                fontWeight: typeFilter === t ? 700 : 400,
              }}>
              {t || '전체'}
              {t && <span style={{ marginLeft: 4, opacity: 0.7, fontWeight: 400 }}>
                {items.filter(i => (TYPE_GROUPS[t] || [t]).includes(i.item_type)).length}
              </span>}
            </button>
          ))}
          <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">전체 고객사</option>
            {partners.filter(p => customerParts[p.partner_id]).map(p => (
              <option key={p.partner_id} value={p.partner_id}>
                {p.name} ({(customerParts[p.partner_id] || []).length})
              </option>
            ))}
          </select>
          <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">전체 외주처</option>
            {suppliers.map(s => <option key={s.partner_id} value={s.partner_id}>{s.name}</option>)}
            <option value="__none__">미지정</option>
          </select>
          <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">전체 창고</option>
            <option value="A동">A동</option>
            <option value="B동">B동</option>
            <option value="C동">C동</option>
            <option value="1F-1">1F-1</option>
            <option value="1F-2">1F-2</option>
            <option value="__none__">미지정</option>
          </select>
        </>)}
        <div className="spacer" />
        {tab === 'items' && (<>
          <button className="btn btn-outline" style={{ fontSize: 12 }}
            disabled={lsUploading} onClick={() => lsRef.current?.click()}>
            {lsUploading ? '업로드 중...' : 'LS 품목리스트 업로드'}
          </button>
          <input type="file" accept=".xlsx,.xls" ref={lsRef} style={{ display: 'none' }} onChange={uploadLsItems} />
          <button className="btn btn-primary" onClick={() => setItemModal({})}>+ 품목 등록</button>
        </>)}
        {tab === 'partners' && (
          <button className="btn btn-primary" onClick={() => setPartnerModal({})}>+ 거래처 등록</button>
        )}
      </div>

      {tab === 'items' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>품번</th><th>품명</th><th>규격</th><th>Unit</th><th>품목구분</th><th>외주처</th><th>창고</th><th>표준입고가</th><th>표준판매가</th><th>안전재고</th><th>수정</th></tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 && <tr><td colSpan={11} className="empty">품목 없음</td></tr>}
              {filteredItems.map(i => (
                <tr key={i.part_no}>
                  <td><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{i.part_no}</code></td>
                  <td>{i.name}</td>
                  <td className="text-sm" style={{ color: '#64748b' }}>{i.spec || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td>{i.unit}</td>
                  <td><span className={`badge ${TYPE_BADGE[i.item_type] || 'badge-gray'}`}>
                    {TYPE_LABEL[i.item_type] || i.item_type}
                  </span></td>
                  <td style={{ fontSize: 12 }}>
                    {i.supplier
                      ? <span style={{ color: '#0f766e', fontWeight: 600 }}>{i.supplier}</span>
                      : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td>
                    {i.location
                      ? <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{i.location}</span>
                      : <span style={{ color: '#cbd5e1', fontSize: 11 }}>미지정</span>}
                  </td>
                  <td style={{textAlign:'right'}}>{i.std_buy_price ? `₩${Number(i.std_buy_price).toLocaleString()}` : '—'}</td>
                  <td style={{textAlign:'right'}}>{i.std_sell_price ? `₩${Number(i.std_sell_price).toLocaleString()}` : '—'}</td>
                  <td style={{textAlign:'right', color: i.safety_stock > 0 ? '#b45309' : '#94a3b8'}}>{i.safety_stock > 0 ? i.safety_stock.toLocaleString() : '—'}</td>
                  <td><button className="btn btn-sm btn-outline" onClick={() => setItemModal(i)}>수정</button></td>
                </tr>
              ))}

            </tbody>
          </table>
        </div>
      )}

      {tab === 'partners' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>코드</th><th>거래처명</th><th>Type</th><th>사업자번호</th><th>주소</th><th>연락처</th><th>이메일</th><th>수정</th></tr></thead>
            <tbody>
              {filteredPartners.length === 0 && <tr><td colSpan={8} className="empty">거래처 없음</td></tr>}
              {filteredPartners.map(p => (
                <tr key={p.partner_id}>
                  <td><code style={{ fontSize: 11 }}>{p.partner_id}</code></td>
                  <td>{p.name}</td>
                  <td><span className={`badge ${p.partner_type === '고객' ? 'badge-green' : p.partner_type === '외주처' ? 'badge-blue' : 'badge-gray'}`}>
                    {p.partner_type === '고객' ? 'Customer' : p.partner_type === '외주처' ? 'Supplier' : p.partner_type === '공용' ? 'Common' : p.partner_type}
                  </span></td>
                  <td className="text-sm">{p.business_no || '—'}</td>
                  <td className="text-sm" style={{maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.address || '—'}</td>
                  <td className="text-sm">{p.contact || '—'}</td>
                  <td className="text-sm" style={{color: p.email ? '#1d4ed8' : '#94a3b8'}}>{p.email || '—'}</td>
                  <td><button className="btn btn-sm btn-outline" onClick={() => setPartnerModal(p)}>수정</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {itemModal !== null && (
        <ItemModal
          item={itemModal.part_no ? itemModal : null}
          onClose={() => setItemModal(null)}
          onSaved={() => { setItemModal(null); load() }}
        />
      )}
      {partnerModal !== null && (
        <PartnerModal
          partner={partnerModal.partner_id ? partnerModal : null}
          onClose={() => setPartnerModal(null)}
          onSaved={() => { setPartnerModal(null); load() }}
        />
      )}
    </div>
  )
}
