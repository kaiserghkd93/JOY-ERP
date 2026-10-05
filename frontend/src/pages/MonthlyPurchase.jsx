import { useState, useEffect } from 'react'
import API from '../api'

const EMPTY_ROW = (no) => ({
  row_no: no, trade_date: '', item_name: '', spec: '',
  qty: '', unit_price: '', supply_amount: '', has_invoice: true, note: '',
})
const INITIAL_ROWS = Array.from({ length: 15 }, (_, i) => EMPTY_ROW(i + 1))

export default function MonthlyPurchase() {
  const today = new Date()
  const [tab, setTab] = useState('input')
  const [yearMonth, setYearMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  )
  const [partners, setPartners] = useState([])   // 해당 월 거래 파트너 목록
  const [selectedPid, setSelectedPid] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [closingDate, setClosingDate] = useState('')
  const [rows, setRows] = useState(INITIAL_ROWS)
  const [source, setSource] = useState('')
  const [savedList, setSavedList] = useState([])  // 저장된 목록
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // 집계 탭
  const [allData, setAllData] = useState([])
  const [filterPartner, setFilterPartner] = useState('all')

  useEffect(() => { loadSavedList() }, [])
  useEffect(() => { if (tab === 'input') loadPartners(yearMonth) }, [yearMonth, tab])
  useEffect(() => {
    if (tab === 'input' && selectedPid) loadData(yearMonth, selectedPid)
  }, [selectedPid, yearMonth, tab])
  useEffect(() => { if (tab === 'summary') loadAllData() }, [tab, savedList])

  async function loadSavedList() {
    try { const r = await API.get('/monthly-purchase/list'); setSavedList(r.data) } catch {}
  }

  async function loadPartners(ym) {
    setLoading(true)
    try {
      const r = await API.get(`/monthly-purchase/partners/${ym}`)
      setPartners(r.data)
      if (r.data.length > 0 && !selectedPid) setSelectedPid(r.data[0].partner_id)
    } catch { setPartners([]) } finally { setLoading(false) }
  }

  async function loadData(ym, pid) {
    if (!pid) return
    setLoading(true); setMsg('')
    try {
      const r = await API.get(`/monthly-purchase/${ym}/${pid}`)
      const d = r.data
      setCompanyName(d.company_name || '')
      setClosingDate(d.closing_date || '')
      setSource(d.source || '')
      const raw = d.rows || []
      const filled = Array.from({ length: Math.max(15, raw.length) }, (_, i) => {
        const found = raw.find(x => x.row_no === i + 1)
        return found ? {
          row_no: i + 1, trade_date: found.trade_date || '',
          item_name: found.item_name || '', spec: found.spec || '',
          qty: found.qty ?? '', unit_price: found.unit_price ?? '',
          supply_amount: found.supply_amount ?? '',
          has_invoice: found.has_invoice ?? true, note: found.note || '',
        } : EMPTY_ROW(i + 1)
      })
      setRows(filled)
    } catch { setRows(INITIAL_ROWS) } finally { setLoading(false) }
  }

  async function handleReload() {
    if (!selectedPid) return
    setLoading(true); setMsg('')
    try {
      const r = await API.get(`/monthly-purchase/auto/${yearMonth}/${selectedPid}`)
      const d = r.data; setSource('erp')
      const raw = d.rows || []
      const filled = Array.from({ length: Math.max(15, raw.length) }, (_, i) => {
        const found = raw.find(x => x.row_no === i + 1)
        return found ? {
          row_no: i + 1, trade_date: found.trade_date || '',
          item_name: found.item_name || '', spec: found.spec || '',
          qty: found.qty ?? '', unit_price: found.unit_price ?? '',
          supply_amount: found.supply_amount ?? '',
          has_invoice: found.has_invoice ?? true, note: '',
        } : EMPTY_ROW(i + 1)
      })
      setRows(filled); setMsg('ERP 데이터로 새로고침했습니다.')
    } catch { setMsg('불러오기 실패') } finally { setLoading(false) }
  }

  function updateRow(idx, field, value) {
    setRows(prev => {
      const n = [...prev]; n[idx] = { ...n[idx], [field]: value }
      // qty × unit_price → supply_amount 자동 계산
      if (field === 'qty' || field === 'unit_price') {
        const qty = field === 'qty' ? value : n[idx].qty
        const up  = field === 'unit_price' ? value : n[idx].unit_price
        n[idx].supply_amount = (qty !== '' && up !== '') ? Number(qty) * Number(up) : ''
      }
      return n
    })
  }

  async function handleSave() {
    if (!selectedPid) { setMsg('업체를 선택하세요.'); return }
    setSaving(true); setMsg('')
    try {
      await API.post('/monthly-purchase/save', {
        year_month: yearMonth, partner_id: selectedPid,
        company_name: companyName,
        closing_date: closingDate || null,
        rows: rows.map((r, i) => ({
          row_no: i + 1,
          trade_date: r.trade_date || null,
          item_name: r.item_name, spec: r.spec,
          qty: r.qty === '' ? null : Number(r.qty),
          unit_price: r.unit_price === '' ? null : Number(r.unit_price),
          supply_amount: r.supply_amount === '' ? null : Number(r.supply_amount),
          has_invoice: r.has_invoice, note: r.note,
        })),
      })
      setMsg('저장되었습니다.'); setSource('saved'); loadSavedList()
    } catch (e) {
      setMsg('저장 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setSaving(false) }
  }

  async function handleDownloadExcel() {
    if (!selectedPid) return
    try {
      const r = await API.get(`/monthly-purchase/excel/${yearMonth}/${selectedPid}`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url; a.download = `매입집계표_${companyName}_${yearMonth}.xlsx`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (e) { setMsg('다운로드 실패: ' + e.message) }
  }

  // qty × unit_price 자동 계산 (supply_amount 없을 때)
  const totalAmt = rows.reduce((s, r) => s + (Number(r.supply_amount) || 0), 0)
  const fmt = n => n !== '' && n != null && n !== 0 ? Number(n).toLocaleString() : ''

  // 집계 탭
  async function loadAllData() {
    try {
      const uniq = [...new Map(savedList.map(s => [`${s.year_month}|${s.partner_id}`, s])).values()]
      const results = await Promise.all(
        uniq.map(s => API.get(`/monthly-purchase/${s.year_month}/${s.partner_id}`).then(r => r.data))
      )
      setAllData(results)
    } catch {}
  }

  const allPartnerNames = [...new Set(allData.map(d => d.company_name).filter(Boolean))].sort()
  const allMonthsSum    = [...new Set(allData.map(d => d.year_month))].sort()
  const crossMap = {}
  for (const d of allData) {
    const total = (d.rows||[]).reduce((s,r) => s + (Number(r.supply_amount)||0), 0)
    if (!crossMap[d.company_name]) crossMap[d.company_name] = {}
    crossMap[d.company_name][d.year_month] = (crossMap[d.company_name][d.year_month]||0) + total
  }

  const fmtN = n => n ? Number(n).toLocaleString() : '-'

  return (
    <div className="mp-page">
      <div className="mp-tabs no-print">
        <button className={tab==='input'?'tab active':'tab'} onClick={()=>setTab('input')}>📝 집계 입력</button>
        <button className={tab==='summary'?'tab active':'tab'} onClick={()=>setTab('summary')}>📊 전체 집계 조회</button>
      </div>

      {tab === 'input' && (
        <>
          {/* 툴바 */}
          <div className="mp-toolbar no-print">
            <div className="mp-nav">
              <button onClick={()=>{const[y,m]=yearMonth.split('-').map(Number);const d=new Date(y,m-2,1);setYearMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);setSelectedPid('')}}>◀</button>
              <select value={yearMonth} onChange={e=>{setYearMonth(e.target.value);setSelectedPid('')}}>
                {Array.from({length:24},(_,i)=>{
                  const d=new Date(today.getFullYear(),today.getMonth()-12+i,1)
                  const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
                  return <option key={ym} value={ym}>{ym}</option>
                })}
              </select>
              <button onClick={()=>{const[y,m]=yearMonth.split('-').map(Number);const d=new Date(y,m,1);setYearMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);setSelectedPid('')}}>▶</button>
            </div>

            {/* 업체 선택 */}
            {partners.length > 0 && (
              <div className="mp-partner-select">
                <label>구매처</label>
                <select value={selectedPid} onChange={e=>setSelectedPid(e.target.value)}>
                  {partners.map(p=>(
                    <option key={p.partner_id} value={p.partner_id}>
                      {p.partner_name} ({p.total.toLocaleString()}원)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mp-actions">
              <button onClick={handleReload} disabled={loading||!selectedPid} className="btn-reload">
                🔄 ERP 재집계
              </button>
              <button onClick={handleDownloadExcel} disabled={!selectedPid} className="btn-excel">
                📥 Excel
              </button>
              <button onClick={handleSave} disabled={saving||!selectedPid} className="btn-save">
                {saving ? '저장 중...' : '💾 저장'}
              </button>
              <button onClick={()=>window.print()} className="btn-print">🖨️ 인쇄</button>
            </div>

            {source && (
              <span className="mp-source">
                {source==='erp' ? '📊 ERP 자동집계' : '💾 저장된 데이터'}
              </span>
            )}
            {msg && <span className={`mp-msg ${msg.includes('실패')?'err':'ok'}`}>{msg}</span>}
          </div>

          {/* 저장된 목록 pills */}
          {savedList.length > 0 && (
            <div className="mp-saved-list no-print">
              {[...new Map(savedList.map(s=>[`${s.year_month}|${s.partner_id}`,s])).values()].map(s=>(
                <button key={`${s.year_month}|${s.partner_id}`}
                  className={`pill ${s.year_month===yearMonth&&s.partner_id===selectedPid?'active':''}`}
                  onClick={()=>{setYearMonth(s.year_month);setSelectedPid(s.partner_id)}}>
                  {s.year_month}
                </button>
              ))}
            </div>
          )}

          {/* 양식 */}
          {selectedPid ? (
            <div className="mp-form">
              {/* 결재란 + 업체명 */}
              <div className="mp-top-row">
                <div className="mp-company-block">
                  <div className="mp-company">업체명 :&nbsp;
                    <input value={companyName} onChange={e=>setCompanyName(e.target.value)} className="inp-company no-print" />
                    <span className="print-only" style={{fontWeight:'bold'}}>{companyName}</span>
                  </div>
                </div>
                <table className="mp-approval">
                  <tbody>
                    <tr>
                      <td className="ap-label">담당</td><td className="ap-label">경리 확인</td>
                      <td className="ap-label">임원</td><td className="ap-label">대표이사</td>
                    </tr>
                    <tr>
                      <td className="ap-box"/><td className="ap-box"/>
                      <td className="ap-box"/><td className="ap-box"/>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 제목 */}
              <div className="mp-title">
                {yearMonth.replace('-','년 ')}월&nbsp;&nbsp;<span className="title-main">매 입 집 계 표</span>
              </div>

              <div className="mp-closing">
                마감제출일 :&nbsp;
                <input type="date" value={closingDate} onChange={e=>setClosingDate(e.target.value)} className="inp-date no-print" />
                <span className="print-only">{closingDate}</span>
              </div>
              <div className="mp-note-label">* NO별 거래 명세표 첨부</div>

              {/* 테이블 */}
              <div style={{overflowX:'auto'}}>
                <table className="mp-table">
                  <colgroup>
                    <col style={{width:'4%'}} /><col style={{width:'9%'}} />
                    <col style={{width:'22%'}} /><col style={{width:'12%'}} />
                    <col style={{width:'7%'}} /><col style={{width:'10%'}} />
                    <col style={{width:'12%'}} /><col style={{width:'4%'}} />
                    <col style={{width:'4%'}} /><col style={{width:'14%'}} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th rowSpan={2}>NO</th>
                      <th rowSpan={2}>거래일</th>
                      <th rowSpan={2}>품명</th>
                      <th rowSpan={2}>규격</th>
                      <th rowSpan={2}>수량</th>
                      <th rowSpan={2}>단가</th>
                      <th rowSpan={2}>공급가액</th>
                      <th colSpan={2}>거래명세표</th>
                      <th rowSpan={2}>비고</th>
                    </tr>
                    <tr>
                      <th>유</th><th>무</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r,i)=>(
                      <tr key={i}>
                        <td className="tc">{r.row_no}</td>
                        <td className="tc">
                          <input type="date" value={r.trade_date} onChange={e=>updateRow(i,'trade_date',e.target.value)} className="inp-td no-print" />
                          <span className="print-only">{r.trade_date}</span>
                        </td>
                        <td>
                          <input value={r.item_name} onChange={e=>updateRow(i,'item_name',e.target.value)} className="inp-full no-print" />
                          <span className="print-only">{r.item_name}</span>
                        </td>
                        <td className="tc">
                          <input value={r.spec} onChange={e=>updateRow(i,'spec',e.target.value)} className="inp-full no-print" />
                          <span className="print-only">{r.spec}</span>
                        </td>
                        <td className="tr">
                          <input type="number" value={r.qty} onChange={e=>updateRow(i,'qty',e.target.value)} className="inp-num no-print" />
                          <span className="print-only">{fmt(r.qty)}</span>
                        </td>
                        <td className="tr">
                          <input type="number" value={r.unit_price} onChange={e=>updateRow(i,'unit_price',e.target.value)} className="inp-num no-print" />
                          <span className="print-only">{fmt(r.unit_price)}</span>
                        </td>
                        <td className="tr supply-amt">
                          {fmt(r.supply_amount)}
                        </td>
                        <td className="tc invoice-cell" onClick={()=>updateRow(i,'has_invoice',true)} style={{cursor:'pointer',background:r.has_invoice?'#e6f5ec':''}}>
                          {r.has_invoice ? '●' : ''}
                        </td>
                        <td className="tc invoice-cell" onClick={()=>updateRow(i,'has_invoice',false)} style={{cursor:'pointer',background:!r.has_invoice?'#fef3f2':''}}>
                          {!r.has_invoice ? '●' : ''}
                        </td>
                        <td>
                          <input value={r.note} onChange={e=>updateRow(i,'note',e.target.value)} className="inp-full no-print" />
                          <span className="print-only">{r.note}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} className="tc foot-label">합  계</td>
                      <td className="tr foot-val">{totalAmt ? totalAmt.toLocaleString() : '-'}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button className="btn-add-row no-print" onClick={()=>setRows(r=>[...r,EMPTY_ROW(r.length+1)])}>+ 행 추가</button>
            </div>
          ) : (
            <div className="no-data">
              {loading ? '불러오는 중...' : `${yearMonth}에 매입 데이터가 없습니다.`}
            </div>
          )}
        </>
      )}

      {tab === 'summary' && (
        <div>
          <div className="sum-toolbar no-print">
            <select value={filterPartner} onChange={e=>setFilterPartner(e.target.value)} style={{padding:'5px 10px',fontSize:'13px',marginRight:'8px'}}>
              <option value="all">전체 구매처</option>
              {allPartnerNames.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <button className="btn-print" onClick={()=>window.print()}>🖨️ 인쇄</button>
          </div>

          {allData.length === 0 ? (
            <div className="no-data">저장된 데이터가 없습니다.<br/>입력 탭에서 저장 후 조회 가능합니다.</div>
          ) : (
            <div className="sum-print-area">
              <div className="sum-print-title">
                {filterPartner==='all' ? '전체' : filterPartner} 매입 집계 현황
              </div>

              {filterPartner === 'all' && (
                <div style={{marginBottom:'20px'}}>
                  <h3 className="sum-h3">월별 매입 합계</h3>
                  <table className="sum-table">
                    <thead><tr><th>월</th><th style={{textAlign:'right'}}>공급가액 합계</th></tr></thead>
                    <tbody>
                      {allMonthsSum.map(m=>{
                        const t=allPartnerNames.reduce((s,p)=>s+(crossMap[p]?.[m]||0),0)
                        return <tr key={m}><td className="tc">{m}</td><td className="tr">{fmtN(t)}</td></tr>
                      })}
                      <tr className="foot-row">
                        <td className="tc bold">총합계</td>
                        <td className="tr bold">{fmtN(allPartnerNames.reduce((s,p)=>s+allMonthsSum.reduce((s2,m)=>s2+(crossMap[p]?.[m]||0),0),0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <h3 className="sum-h3">구매처별 집계</h3>
                <div style={{overflowX:'auto'}}>
                  {filterPartner === 'all' ? (
                    <table className="sum-table">
                      <thead>
                        <tr>
                          <th>구매처</th>
                          {allMonthsSum.map(m=><th key={m} style={{textAlign:'right'}}>{m}</th>)}
                          <th style={{textAlign:'right'}}>합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPartnerNames.map(p=>{
                          const tot=allMonthsSum.reduce((s,m)=>s+(crossMap[p]?.[m]||0),0)
                          return (
                            <tr key={p}>
                              <td>{p}</td>
                              {allMonthsSum.map(m=><td key={m} className="tr">{fmtN(crossMap[p]?.[m])}</td>)}
                              <td className="tr bold">{fmtN(tot)}</td>
                            </tr>
                          )
                        })}
                        <tr className="foot-row">
                          <td className="bold">월 합계</td>
                          {allMonthsSum.map(m=>{
                            const t=allPartnerNames.reduce((s,p)=>s+(crossMap[p]?.[m]||0),0)
                            return <td key={m} className="tr bold">{fmtN(t)}</td>
                          })}
                          <td className="tr bold">{fmtN(allPartnerNames.reduce((s,p)=>s+allMonthsSum.reduce((s2,m)=>s2+(crossMap[p]?.[m]||0),0),0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    <table className="sum-table">
                      <thead><tr><th>월</th><th style={{textAlign:'right'}}>공급가액</th></tr></thead>
                      <tbody>
                        {allMonthsSum.filter(m=>crossMap[filterPartner]?.[m]).map(m=>(
                          <tr key={m}><td className="tc">{m}</td><td className="tr">{fmtN(crossMap[filterPartner]?.[m])}</td></tr>
                        ))}
                        <tr className="foot-row">
                          <td className="bold">합계</td>
                          <td className="tr bold">{fmtN(allMonthsSum.reduce((s,m)=>s+(crossMap[filterPartner]?.[m]||0),0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .mp-page{padding:16px;font-family:'맑은 고딕',sans-serif;font-size:13px;}
        .mp-tabs{display:flex;gap:4px;margin-bottom:12px;border-bottom:2px solid #0e7c3e;}
        .tab{padding:8px 20px;cursor:pointer;border:1px solid #ccc;border-bottom:none;background:#f5f5f5;font-size:13px;font-family:inherit;}
        .tab.active{background:#0e7c3e;color:#fff;border-color:#0e7c3e;font-weight:bold;}
        .mp-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;}
        .mp-nav{display:flex;align-items:center;gap:4px;}
        .mp-nav button{padding:4px 10px;cursor:pointer;}
        .mp-nav select{padding:4px 8px;font-size:14px;font-weight:bold;}
        .mp-partner-select{display:flex;align-items:center;gap:6px;font-size:13px;}
        .mp-partner-select label{font-weight:bold;color:#0e7c3e;white-space:nowrap;}
        .mp-partner-select select{padding:5px 10px;font-size:13px;border:1px solid #0e7c3e;border-radius:4px;min-width:180px;}
        .mp-actions{display:flex;gap:6px;flex-wrap:wrap;}
        .btn-reload{padding:6px 12px;cursor:pointer;border:1px solid #0e7c3e;border-radius:4px;background:#e6f5ec;color:#0e7c3e;font-size:12px;font-weight:bold;}
        .btn-excel{padding:6px 12px;cursor:pointer;border:1px solid #217346;border-radius:4px;background:#e8f5e9;color:#217346;font-size:12px;font-weight:bold;}
        .btn-save{padding:6px 14px;cursor:pointer;border:1px solid #0e7c3e;border-radius:4px;background:#0e7c3e;color:#fff;font-size:13px;font-family:inherit;}
        .btn-print{padding:6px 12px;cursor:pointer;border:1px solid #aaa;border-radius:4px;background:#555;color:#fff;font-size:12px;font-family:inherit;}
        .btn-add-row{margin-top:6px;padding:5px 16px;background:#e6f5ec;border:1px dashed #0e7c3e;color:#0e7c3e;cursor:pointer;font-size:13px;border-radius:4px;}
        .mp-source{font-size:12px;color:#0e7c3e;background:#e6f5ec;padding:2px 8px;border-radius:10px;}
        .mp-msg{font-size:13px;}.mp-msg.ok{color:#0e7c3e;}.mp-msg.err{color:#c00;}
        .mp-saved-list{margin-bottom:10px;}
        .pill{padding:2px 10px;margin-right:4px;border:1px solid #bbb;border-radius:12px;cursor:pointer;background:#f5f5f5;font-size:12px;}
        .pill.active{background:#0e7c3e;color:#fff;border-color:#0e7c3e;}
        .mp-form{max-width:900px;}
        .mp-top-row{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:4px;}
        .mp-company{display:flex;align-items:center;gap:4px;font-size:13px;}
        .inp-company{border:none;border-bottom:1px solid #333;width:200px;font-size:13px;font-family:inherit;}
        .mp-approval{border-collapse:collapse;}
        .mp-approval td{border:1px solid #333;font-size:11px;text-align:center;}
        .mp-approval .ap-label{background:#e8e8e8;font-weight:bold;padding:2px 14px;min-width:60px;}
        .mp-approval .ap-box{height:36px;min-width:60px;}
        .mp-title{font-size:20px;font-weight:bold;text-align:center;margin:8px 0 6px;letter-spacing:2px;}
        .title-main{text-decoration:underline;color:#0e7c3e;}
        .mp-closing{font-size:13px;margin-bottom:2px;}
        .inp-date{border:none;border-bottom:1px solid #333;font-size:13px;font-family:inherit;}
        .mp-note-label{font-size:11px;color:#555;margin-bottom:6px;}
        .mp-table{width:100%;border-collapse:collapse;margin-top:4px;min-width:700px;}
        .mp-table th,.mp-table td{border:1px solid #555;padding:4px 5px;}
        .mp-table th{background:#f0f0f0;text-align:center;font-size:11px;font-weight:bold;}
        .mp-table td{font-size:12px;}
        .tc{text-align:center;}.tr{text-align:right;padding-right:6px!important;}
        .inp-td,.inp-full{width:100%;border:none;font-size:12px;padding:0;font-family:inherit;}
        .inp-num{width:100%;border:none;font-size:12px;text-align:right;padding:0;font-family:inherit;}
        input:focus{outline:1px solid #0e7c3e;background:#f0faf4;}
        .supply-amt{font-weight:bold;color:#0e7c3e;text-align:right;padding-right:6px!important;}
        .invoice-cell{font-size:14px;user-select:none;}
        .foot-label{font-weight:bold;background:#f0f0f0;text-align:center!important;}
        .foot-val{font-weight:bold;padding-right:6px!important;color:#0e7c3e;}
        .no-data{color:#888;padding:40px;text-align:center;}
        .sum-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:12px;}
        .sum-print-area{max-width:960px;}
        .sum-print-title{display:none;}
        .sum-h3{font-size:14px;font-weight:bold;margin:0 0 8px;color:#0e7c3e;border-bottom:2px solid #0e7c3e;padding-bottom:4px;}
        .sum-table{border-collapse:collapse;width:100%;font-size:13px;}
        .sum-table th,.sum-table td{border:1px solid #ccc;padding:5px 10px;}
        .sum-table th{background:#e6f5ec;text-align:center;font-weight:bold;}
        .sum-table .foot-row td{background:#d4edda;font-weight:bold;border-top:2px solid #0e7c3e;}
        .bold{font-weight:bold;}
        .print-only{display:none;}
        @media print{
          @page{size:A4 landscape;margin:12mm 15mm;}
          .no-print{display:none!important;}
          .print-only{display:inline!important;font-size:11pt;}
          .mp-page{padding:0;}.mp-form{width:100%;}
          .mp-table th,.mp-table td{font-size:10pt;padding:3px 4px;}
          .mp-title{font-size:18pt;}
          input{display:none!important;}
          .sum-print-title{display:block!important;font-size:16pt;font-weight:bold;text-align:center;margin-bottom:12px;}
        }
      `}</style>
    </div>
  )
}
