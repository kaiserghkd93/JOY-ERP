import { useState, useEffect, useRef } from 'react'
import API from '../api'

const EMPTY_ROW = (no) => ({
  row_no: no, trade_date: '', item_name: '', spec: '',
  qty: '', unit_price: '', supply_amount: '', has_invoice: true, note: '',
})
const INITIAL_ROWS = Array.from({ length: 15 }, (_, i) => EMPTY_ROW(i + 1))

function addRow(rows) {
  return [...rows, EMPTY_ROW(rows.length + 1)]
}

export default function MonthlySales() {
  const today = new Date()
  const [tab, setTab] = useState('input')   // 'input' | 'summary'
  const [yearMonth, setYearMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  )
  const [companyName, setCompanyName] = useState('')
  const [closingDate, setClosingDate] = useState('')
  const [rows, setRows] = useState(INITIAL_ROWS)
  const [monthList, setMonthList] = useState([])
  const [allData, setAllData] = useState([])   // 전체 월 데이터 (집계용)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef()

  useEffect(() => { loadMonthList() }, [])
  useEffect(() => { if (tab === 'input') loadMonth(yearMonth) }, [yearMonth, tab])
  useEffect(() => { if (tab === 'summary') loadAllData() }, [tab])

  async function loadMonthList() {
    try {
      const r = await API.get('/monthly-sales/list')
      setMonthList(r.data)
    } catch {}
  }

  async function loadMonth(ym) {
    try {
      const r = await API.get(`/monthly-sales/${ym}`)
      const d = r.data
      setCompanyName(d.company_name || '')
      setClosingDate(d.closing_date || '')
      const filled = Array.from({ length: 15 }, (_, i) => {
        const found = d.rows?.find(x => x.row_no === i + 1)
        if (found) return {
          row_no: i + 1,
          trade_date: found.trade_date || '',
          item_name: found.item_name || '',
          spec: found.spec || '',
          qty: found.qty ?? '',
          unit_price: found.unit_price ?? '',
          supply_amount: found.supply_amount ?? '',
          has_invoice: found.has_invoice ?? true,
          note: found.note || '',
        }
        return EMPTY_ROW(i + 1)
      })
      setRows(filled)
    } catch {}
  }

  async function loadAllData() {
    try {
      const results = await Promise.all(
        monthList.map(m => API.get(`/monthly-sales/${m.year_month}`).then(r => r.data))
      )
      setAllData(results)
    } catch {}
  }

  function updateRow(idx, field, value) {
    setRows(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  async function handleSave() {
    setSaving(true); setMsg('')
    try {
      await API.post('/monthly-sales/save', {
        year_month: yearMonth,
        company_name: companyName,
        closing_date: closingDate || null,
        rows: rows.map(r => ({
          ...r,
          qty: r.qty === '' ? null : Number(r.qty),
          unit_price: r.unit_price === '' ? null : Number(r.unit_price),
          supply_amount: r.supply_amount === '' ? null : Number(r.supply_amount),
          trade_date: r.trade_date || null,
        })),
      })
      setMsg('저장되었습니다.')
      loadMonthList()
    } catch (e) {
      setMsg('저장 실패: ' + (e.response?.data?.detail || e.message))
    } finally { setSaving(false) }
  }

  async function handleDownloadTemplate() {
    try {
      const res = await API.get('/monthly-sales/template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = '월매출집계표_양식.xlsx'
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (e) { setMsg('다운로드 실패: ' + e.message) }
  }

  async function handleUpload(e) {
    const file = e.target.files[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file)
    setMsg('업로드 중...')
    try {
      const r = await API.post(`/monthly-sales/upload-excel/${yearMonth}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMsg(`업로드 완료 — ${r.data.imported}행`)
      loadMonth(yearMonth); loadMonthList()
    } catch (e) { setMsg('업로드 실패: ' + (e.response?.data?.detail || e.message))
    } finally { fileRef.current.value = '' }
  }

  const totalAmt = rows.reduce((s, r) => s + (Number(r.supply_amount) || 0), 0)

  // ── 집계 계산 ────────────────────────────────────────────────
  // 월별 합계
  const monthlyTotals = allData.map(d => ({
    month: d.year_month,
    total: (d.rows || []).reduce((s, r) => s + (Number(r.supply_amount) || 0), 0),
  })).sort((a, b) => a.month.localeCompare(b.month))

  // 업체별 × 월별 크로스
  const allCompanies = [...new Set(
    allData.flatMap(d => (d.rows || []).map(r => r.item_name).filter(Boolean))
  )].sort()
  const allMonths = monthlyTotals.map(m => m.month)
  const crossMap = {}
  for (const d of allData) {
    for (const r of (d.rows || [])) {
      if (!r.item_name) continue
      if (!crossMap[r.item_name]) crossMap[r.item_name] = {}
      crossMap[r.item_name][d.year_month] = (crossMap[r.item_name][d.year_month] || 0) + (Number(r.supply_amount) || 0)
    }
  }

  const fmt = n => n ? n.toLocaleString() : '-'

  return (
    <div className="ms-page">
      {/* ── 탭 ── */}
      <div className="ms-tabs no-print">
        <button className={tab === 'input' ? 'tab active' : 'tab'} onClick={() => setTab('input')}>📝 집계 입력</button>
        <button className={tab === 'summary' ? 'tab active' : 'tab'} onClick={() => { setTab('summary'); loadAllData() }}>📊 전체 집계 조회</button>
      </div>

      {/* ══════════════ 입력 탭 ══════════════ */}
      {tab === 'input' && (
        <>
          {/* 툴바 */}
          <div className="ms-toolbar no-print">
            <div className="ms-nav">
              <button onClick={() => { const [y,m]=yearMonth.split('-').map(Number); const d=new Date(y,m-2,1); setYearMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`) }}>◀</button>
              <select value={yearMonth} onChange={e => setYearMonth(e.target.value)}>
                {Array.from({ length: 24 }, (_, i) => {
                  const d = new Date(today.getFullYear(), today.getMonth() - 12 + i, 1)
                  const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
                  return <option key={ym} value={ym}>{ym}</option>
                })}
              </select>
              <button onClick={() => { const [y,m]=yearMonth.split('-').map(Number); const d=new Date(y,m,1); setYearMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`) }}>▶</button>
            </div>
            <div className="ms-actions">
              <button onClick={handleDownloadTemplate} className="btn-tpl">📥 양식 다운로드</button>
              <label className="btn-upload">📤 업로드 <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={handleUpload} style={{display:'none'}} /></label>
              <button onClick={handleSave} disabled={saving} className="btn-save">{saving ? '저장 중...' : '💾 저장'}</button>
              <button onClick={() => window.print()} className="btn-print">🖨️ 인쇄</button>
            </div>
            {msg && <span className={`ms-msg ${msg.includes('실패') ? 'err' : 'ok'}`}>{msg}</span>}
          </div>

          {/* 저장된 월 목록 */}
          {monthList.length > 0 && (
            <div className="ms-month-list no-print">
              {monthList.map(m => (
                <button key={m.year_month} className={`pill ${m.year_month === yearMonth ? 'active' : ''}`}
                  onClick={() => setYearMonth(m.year_month)}>{m.year_month}</button>
              ))}
            </div>
          )}

          {/* 양식 */}
          <div className="ms-form">

            {/* 상단: 업체명(좌) + 결재란(우) */}
            <div className="ms-top-row">
              <div className="ms-company-block">
                <div className="ms-company">업체명 :&nbsp;<input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="업체명" className="inp-company" /></div>
              </div>
              <table className="ms-approval">
                <tbody>
                  <tr>
                    <td className="ap-label">담당</td>
                    <td className="ap-label">경리 확인</td>
                    <td className="ap-label">임원</td>
                    <td className="ap-label">대표이사</td>
                  </tr>
                  <tr>
                    <td className="ap-box"></td>
                    <td className="ap-box"></td>
                    <td className="ap-box"></td>
                    <td className="ap-box"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 제목 */}
            <div className="ms-title">
              {yearMonth.replace('-', '년 ')}월&nbsp;&nbsp;<span className="title-main">매출 집계표</span>
            </div>

            {/* 마감제출일 */}
            <div className="ms-closing">
              마감제출일 :&nbsp;<input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)} className="inp-date" />
            </div>
            <div className="ms-note-label">* NO별 거래 명세표 첨부</div>

            {/* 데이터 테이블 */}
            <table className="ms-table">
              <colgroup>
                <col style={{width:'6%'}} />
                <col style={{width:'18%'}} />
                <col style={{width:'52%'}} />
                <col style={{width:'24%'}} />
              </colgroup>
              <thead>
                <tr><th>NO</th><th>마감일</th><th>업체명</th><th>공급가액</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="tc">{r.row_no}</td>
                    <td><input type="date" value={r.trade_date} onChange={e => updateRow(i,'trade_date',e.target.value)} className="inp-td" /></td>
                    <td><input value={r.item_name} onChange={e => updateRow(i,'item_name',e.target.value)} className="inp-full" placeholder="업체명" /></td>
                    <td><input type="number" value={r.supply_amount} onChange={e => updateRow(i,'supply_amount',e.target.value)} className="inp-num" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="tc foot-label">합계</td>
                  <td className="tr foot-val">{totalAmt ? totalAmt.toLocaleString() : '-'}</td>
                </tr>
              </tfoot>
            </table>
            <button className="btn-add-row no-print" onClick={() => setRows(r => addRow(r))}>+ 행 추가</button>
          </div>
        </>
      )}

      {/* ══════════════ 집계 조회 탭 ══════════════ */}
      {tab === 'summary' && (
        <div className="summary-area">
          {allData.length === 0 ? (
            <div className="no-data">저장된 데이터가 없습니다.</div>
          ) : (
            <>
              {/* 월별 합계 */}
              <div className="sum-section">
                <h3>월별 매출 합계</h3>
                <table className="sum-table">
                  <thead><tr><th>월</th><th>공급가액 합계</th></tr></thead>
                  <tbody>
                    {monthlyTotals.map(m => (
                      <tr key={m.month}>
                        <td className="tc">{m.month}</td>
                        <td className="tr">{fmt(m.total)}</td>
                      </tr>
                    ))}
                    <tr className="foot-row">
                      <td className="tc bold">총합계</td>
                      <td className="tr bold">{fmt(monthlyTotals.reduce((s,m)=>s+m.total,0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 업체별 × 월별 크로스 */}
              <div className="sum-section">
                <h3>업체별 월별 집계</h3>
                <div style={{overflowX:'auto'}}>
                  <table className="sum-table cross">
                    <thead>
                      <tr>
                        <th>업체명</th>
                        {allMonths.map(m => <th key={m}>{m}</th>)}
                        <th>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allCompanies.map(co => {
                        const rowTotal = allMonths.reduce((s,m) => s + (crossMap[co]?.[m] || 0), 0)
                        return (
                          <tr key={co}>
                            <td>{co}</td>
                            {allMonths.map(m => <td key={m} className="tr">{fmt(crossMap[co]?.[m])}</td>)}
                            <td className="tr bold">{fmt(rowTotal)}</td>
                          </tr>
                        )
                      })}
                      <tr className="foot-row">
                        <td className="bold">월 합계</td>
                        {allMonths.map(m => {
                          const colTotal = allCompanies.reduce((s,co) => s + (crossMap[co]?.[m] || 0), 0)
                          return <td key={m} className="tr bold">{fmt(colTotal)}</td>
                        })}
                        <td className="tr bold">{fmt(allCompanies.reduce((s,co) => s + allMonths.reduce((s2,m)=>s2+(crossMap[co]?.[m]||0),0), 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        /* ── 화면 공통 ── */
        .ms-page { padding: 16px; font-family: '맑은 고딕', sans-serif; font-size: 13px; }
        .ms-tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 2px solid #1a6fc4; }
        .tab { padding: 8px 20px; cursor: pointer; border: 1px solid #ccc; border-bottom: none; background: #f5f5f5; font-size: 13px; font-family: inherit; }
        .tab.active { background: #1a6fc4; color: #fff; border-color: #1a6fc4; font-weight: bold; }
        .ms-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
        .ms-nav { display: flex; align-items: center; gap: 4px; }
        .ms-nav button { padding: 4px 10px; cursor: pointer; }
        .ms-nav select { padding: 4px 8px; font-size: 14px; font-weight: bold; }
        .ms-actions { display: flex; gap: 8px; }
        .btn-tpl { padding: 6px 14px; cursor: pointer; border: 1px solid #1a6fc4; border-radius: 4px; background: #e8f0fb; color: #1a6fc4; font-size: 13px; font-weight: bold; }
        .btn-upload, .btn-save, .btn-print { padding: 6px 14px; cursor: pointer; border: 1px solid #aaa; border-radius: 4px; background: #f5f5f5; font-size: 13px; font-family: inherit; }
        .btn-save { background: #1a6fc4; color: #fff; border-color: #1a6fc4; }
        .btn-print { background: #555; color: #fff; border-color: #555; }
        .ms-msg { font-size: 13px; }
        .ms-msg.ok { color: #1a6fc4; } .ms-msg.err { color: #c00; }
        .ms-month-list { margin-bottom: 10px; }
        .pill { padding: 2px 10px; margin-right: 4px; border: 1px solid #bbb; border-radius: 12px; cursor: pointer; background: #f5f5f5; font-size: 12px; }
        .pill.active { background: #1a6fc4; color: #fff; border-color: #1a6fc4; }

        /* ── 양식 ── */
        .ms-form { width: 740px; max-width: 100%; }
        .ms-top-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2px; }
        .ms-company-block { font-size: 13px; }
        .ms-company { display: flex; align-items: center; gap: 4px; }
        .inp-company { border: none; border-bottom: 1px solid #333; width: 180px; font-size: 13px; font-family: inherit; }
        .ms-approval { border-collapse: collapse; }
        .ms-approval td { border: 1px solid #333; font-size: 11px; text-align: center; }
        .ms-approval .ap-label { background: #e8e8e8; font-weight: bold; padding: 2px 10px; min-width: 64px; }
        .ms-approval .ap-box { height: 38px; min-width: 64px; }
        .ms-title { font-size: 18px; font-weight: bold; text-align: center; margin: 6px 0 4px; }
        .title-main { text-decoration: underline; color: #1a6fc4; }
        .ms-closing { font-size: 13px; margin-bottom: 2px; }
        .inp-date { border: none; border-bottom: 1px solid #333; font-size: 13px; font-family: inherit; }
        .ms-note-label { font-size: 11px; color: #555; margin-bottom: 4px; }
        .ms-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        .ms-table th, .ms-table td { border: 1px solid #333; padding: 4px 5px; }
        .ms-table th { background: #f0f0f0; text-align: center; font-size: 12px; font-weight: bold; }
        .ms-table td { font-size: 12px; }
        .tc { text-align: center; } .tr { text-align: right; padding-right: 6px !important; }
        .inp-td, .inp-full { width: 100%; border: none; font-size: 12px; padding: 0; font-family: inherit; }
        .inp-num { width: 100%; border: none; font-size: 12px; text-align: right; padding: 0; font-family: inherit; }
        input:focus { outline: 1px solid #1a6fc4; background: #f0f7ff; }
        .foot-label { font-weight: bold; background: #f0f0f0; text-align: center !important; }
        .foot-val { font-weight: bold; padding-right: 6px !important; }
        .btn-add-row { margin-top: 6px; padding: 5px 16px; background: #f0f4fb; border: 1px dashed #1a6fc4; color: #1a6fc4; cursor: pointer; font-size: 13px; border-radius: 4px; }

        /* ── 집계 탭 ── */
        .summary-area { display: flex; gap: 32px; flex-wrap: wrap; }
        .sum-section { flex: 1; min-width: 280px; }
        .sum-section h3 { font-size: 14px; font-weight: bold; margin-bottom: 8px; color: #1a6fc4; border-bottom: 2px solid #1a6fc4; padding-bottom: 4px; }
        .sum-table { border-collapse: collapse; width: 100%; font-size: 13px; }
        .sum-table th, .sum-table td { border: 1px solid #ccc; padding: 5px 10px; }
        .sum-table th { background: #f0f4fb; text-align: center; font-weight: bold; }
        .sum-table .foot-row td { background: #e8f0fb; font-weight: bold; border-top: 2px solid #1a6fc4; }
        .bold { font-weight: bold; }
        .no-data { color: #888; padding: 40px; text-align: center; }

        /* ── 인쇄 ── */
        @media print {
          @page { size: A4 portrait; margin: 15mm 12mm; }
          .no-print { display: none !important; }
          .ms-page { padding: 0; }
          .ms-form { width: 100%; }
          .ms-table th, .ms-table td { font-size: 11pt; padding: 3px 4px; }
          .ms-title { font-size: 16pt; }
          input { border: none !important; outline: none !important; background: transparent !important; padding: 0 !important; }
          .inp-date { color: #000; }
        }
      `}</style>
    </div>
  )
}
