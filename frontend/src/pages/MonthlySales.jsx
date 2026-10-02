import { useState, useEffect, useRef } from 'react'
import API from '../api'

const EMPTY_ROW = (no) => ({
  row_no: no, trade_date: '', item_name: '', spec: '',
  qty: '', unit_price: '', supply_amount: '', has_invoice: true, note: '',
})

const INITIAL_ROWS = Array.from({ length: 15 }, (_, i) => EMPTY_ROW(i + 1))

export default function MonthlySales() {
  const today = new Date()
  const [yearMonth, setYearMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  )
  const [companyName, setCompanyName] = useState('')
  const [closingDate, setClosingDate] = useState('')
  const [rows, setRows] = useState(INITIAL_ROWS)
  const [monthList, setMonthList] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef()

  useEffect(() => { loadMonthList() }, [])
  useEffect(() => { loadMonth(yearMonth) }, [yearMonth])

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

  function updateRow(idx, field, value) {
    setRows(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      // 수량·단가 입력 시 공급가액 자동계산
      if (field === 'qty' || field === 'unit_price') {
        const q = field === 'qty' ? Number(value) : Number(next[idx].qty)
        const p = field === 'unit_price' ? Number(value) : Number(next[idx].unit_price)
        if (q && p) next[idx].supply_amount = q * p
      }
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
    } finally {
      setSaving(false)
    }
  }

  async function handleDownloadTemplate() {
    try {
      const res = await API.get('/monthly-sales/template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = '월매출집계표_양식.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setMsg('다운로드 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    setMsg('업로드 중...')
    try {
      const r = await API.post(`/monthly-sales/upload-excel/${yearMonth}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMsg(`업로드 완료 — ${r.data.company_name || ''} ${r.data.imported}행`)
      loadMonth(yearMonth)
      loadMonthList()
    } catch (e) {
      setMsg('업로드 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      fileRef.current.value = ''
    }
  }

  const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0)
  const totalAmt = rows.reduce((s, r) => s + (Number(r.supply_amount) || 0), 0)

  function handlePrint() { window.print() }

  // 월 이동
  function moveMonth(delta) {
    const [y, m] = yearMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="monthly-sales-page">
      {/* ── 상단 컨트롤 ── */}
      <div className="ms-toolbar no-print">
        <div className="ms-nav">
          <button onClick={() => moveMonth(-1)}>◀</button>
          <select value={yearMonth} onChange={e => setYearMonth(e.target.value)}>
            {/* 현재 월 포함 24개월 */}
            {Array.from({ length: 24 }, (_, i) => {
              const d = new Date(today.getFullYear(), today.getMonth() - 12 + i, 1)
              const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
              return <option key={ym} value={ym}>{ym}</option>
            })}
          </select>
          <button onClick={() => moveMonth(1)}>▶</button>
        </div>

        <div className="ms-actions">
          <button onClick={handleDownloadTemplate} className="btn-tpl">📥 양식 다운로드</button>
          <label className="btn-upload">
            📤 작성 후 업로드
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={handleUpload} style={{ display: 'none' }} />
          </label>
          <button onClick={handleSave} disabled={saving} className="btn-save">
            {saving ? '저장 중...' : '💾 직접 저장'}
          </button>
          <button onClick={handlePrint} className="btn-print">🖨️ 인쇄</button>
        </div>

        {msg && <span className={`ms-msg ${msg.includes('실패') ? 'err' : 'ok'}`}>{msg}</span>}
      </div>

      {/* ── 저장된 월 목록 ── */}
      {monthList.length > 0 && (
        <div className="ms-month-list no-print">
          저장된 월:&nbsp;
          {monthList.map(m => (
            <button key={m.year_month} className={`pill ${m.year_month === yearMonth ? 'active' : ''}`}
              onClick={() => setYearMonth(m.year_month)}>
              {m.year_month}
            </button>
          ))}
        </div>
      )}

      {/* ── 집계표 양식 ── */}
      <div className="ms-form">
        {/* 결재란 */}
        <table className="ms-approval">
          <tbody>
            <tr>
              <td></td>
              <td className="ap-label">담당</td>
              <td className="ap-label">경리 확인</td>
              <td className="ap-label">임원</td>
              <td className="ap-label">대표이사</td>
            </tr>
            <tr>
              <td></td>
              <td className="ap-box"></td>
              <td className="ap-box"></td>
              <td className="ap-box"></td>
              <td className="ap-box"></td>
            </tr>
          </tbody>
        </table>

        {/* 제목 영역 */}
        <div className="ms-header">
          <div className="ms-company">
            <span>업체명 : </span>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)}
              placeholder="업체명" className="inp-company" />
          </div>
          <div className="ms-title">
            <span>{yearMonth.replace('-', '년 ')}월</span>&nbsp;&nbsp;
            <span className="title-main">매출 집계표</span>
          </div>
          <div className="ms-closing">
            <span>마감제출일 : </span>
            <input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)}
              className="inp-date" />
          </div>
          <div className="ms-note-label">* NO별 거래 명세표 첨부</div>
        </div>

        {/* 데이터 테이블 */}
        <table className="ms-table">
          <colgroup>
            <col style={{ width: '38px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '180px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '60px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '70px' }} />
            <col style={{ width: '80px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>NO</th>
              <th>거래일</th>
              <th>품명</th>
              <th>규격</th>
              <th>수량</th>
              <th>단가</th>
              <th>공급가액</th>
              <th colSpan={2}>거래명세표</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="tc">{r.row_no}</td>
                <td>
                  <input type="date" value={r.trade_date} onChange={e => updateRow(i, 'trade_date', e.target.value)} className="inp-td" />
                </td>
                <td>
                  <input value={r.item_name} onChange={e => updateRow(i, 'item_name', e.target.value)} className="inp-full" placeholder="품명" />
                </td>
                <td>
                  <input value={r.spec} onChange={e => updateRow(i, 'spec', e.target.value)} className="inp-full" placeholder="규격" />
                </td>
                <td>
                  <input type="number" value={r.qty} onChange={e => updateRow(i, 'qty', e.target.value)} className="inp-num" />
                </td>
                <td>
                  <input type="number" value={r.unit_price} onChange={e => updateRow(i, 'unit_price', e.target.value)} className="inp-num" />
                </td>
                <td>
                  <input type="number" value={r.supply_amount} onChange={e => updateRow(i, 'supply_amount', e.target.value)} className="inp-num" />
                </td>
                <td className="tc">
                  <button
                    className={`inv-btn ${r.has_invoice ? 'inv-yes' : ''}`}
                    onClick={() => updateRow(i, 'has_invoice', true)}
                  >유</button>
                </td>
                <td className="tc">
                  <button
                    className={`inv-btn ${!r.has_invoice ? 'inv-no' : ''}`}
                    onClick={() => updateRow(i, 'has_invoice', false)}
                  >무</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="tc foot-label">합계</td>
              <td className="tc foot-val">{totalQty ? totalQty.toLocaleString() : '-'}</td>
              <td></td>
              <td className="tc foot-val">{totalAmt ? totalAmt.toLocaleString() : '-'}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <style>{`
        .monthly-sales-page { padding: 16px; font-family: '맑은 고딕', sans-serif; font-size: 13px; }
        .ms-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
        .ms-nav { display: flex; align-items: center; gap: 4px; }
        .ms-nav button { padding: 4px 10px; cursor: pointer; }
        .ms-nav select { padding: 4px 8px; font-size: 14px; font-weight: bold; }
        .ms-actions { display: flex; gap: 8px; }
        .btn-tpl { padding: 6px 14px; cursor: pointer; border: 1px solid #1a6fc4; border-radius: 4px;
                   background: #e8f0fb; color: #1a6fc4; font-size: 13px; font-weight: bold; }
        .btn-upload, .btn-save, .btn-print {
          padding: 6px 14px; cursor: pointer; border: 1px solid #aaa; border-radius: 4px;
          background: #f5f5f5; font-size: 13px;
        }
        .btn-save { background: #1a6fc4; color: #fff; border-color: #1a6fc4; }
        .btn-print { background: #555; color: #fff; border-color: #555; }
        .ms-msg { font-size: 13px; }
        .ms-msg.ok { color: #1a6fc4; }
        .ms-msg.err { color: #c00; }
        .ms-month-list { margin-bottom: 10px; font-size: 12px; }
        .pill { padding: 2px 10px; margin-right: 4px; border: 1px solid #bbb; border-radius: 12px;
                cursor: pointer; background: #f5f5f5; }
        .pill.active { background: #1a6fc4; color: #fff; border-color: #1a6fc4; }

        /* 양식 */
        .ms-form { max-width: 900px; }
        .ms-approval { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        .ms-approval td { border: 1px solid #333; padding: 4px 8px; font-size: 12px; }
        .ms-approval .ap-label { background: #e8e8e8; font-weight: bold; text-align: center; width: 80px; }
        .ms-approval .ap-box { height: 36px; width: 80px; }
        .ms-header { margin: 6px 0; }
        .ms-company { font-size: 13px; margin-bottom: 4px; }
        .ms-title { font-size: 18px; font-weight: bold; text-align: center; margin: 4px 0; }
        .title-main { text-decoration: underline; color: #1a6fc4; }
        .ms-closing { font-size: 13px; margin-top: 4px; }
        .ms-note-label { font-size: 12px; color: #555; margin-top: 4px; }
        .inp-company { border: none; border-bottom: 1px solid #333; width: 160px; font-size: 13px; }
        .inp-date { border: none; border-bottom: 1px solid #333; font-size: 13px; }

        .ms-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .ms-table th, .ms-table td { border: 1px solid #333; padding: 3px 4px; }
        .ms-table th { background: #f0f0f0; text-align: center; font-size: 12px; }
        .tc { text-align: center; }
        .inp-td { width: 100%; border: none; font-size: 12px; padding: 0; }
        .inp-full { width: 100%; border: none; font-size: 12px; padding: 0; }
        .inp-num { width: 100%; border: none; font-size: 12px; text-align: right; padding: 0; }
        input:focus { outline: 1px solid #1a6fc4; background: #f0f7ff; }
        .inv-btn { padding: 1px 6px; border: 1px solid #bbb; cursor: pointer; background: #fff; font-size: 11px; margin: 1px; }
        .inv-btn.inv-yes { background: #f5c518; color: #000; border-color: #c99600; font-weight: bold; }
        .inv-btn.inv-no { background: #fff; color: #333; border-color: #bbb; }
        .foot-label { font-weight: bold; background: #f0f0f0; }
        .foot-val { font-weight: bold; text-align: right; padding-right: 6px; background: #fafafa; }

        @media print {
          .no-print { display: none !important; }
          .monthly-sales-page { padding: 0; }
          .ms-form { max-width: 100%; }
          input { border: none !important; background: transparent !important; }
          .inv-btn { border: none; padding: 0; }
        }
      `}</style>
    </div>
  )
}
