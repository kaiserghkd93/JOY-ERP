import { useEffect, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import api from '../api'

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

function DeliveryReportCard() {
  const now = new Date()
  const [drYear, setDrYear] = useState(now.getFullYear())
  const [drMonth, setDrMonth] = useState(now.getMonth() + 1)
  const [drLoading, setDrLoading] = useState(false)
  const curYear = now.getFullYear()

  const downloadDelivery = async () => {
    setDrLoading(true)
    try {
      const res = await api.get(`/reports/delivery-report?year=${drYear}&month=${drMonth}`, { responseType: 'blob' })
      const blob = res.data
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `납기준수율_보고서_${drYear}년${String(drMonth).padStart(2,'0')}월.xlsx`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('다운로드 실패: ' + e.message)
    } finally {
      setDrLoading(false)
    }
  }

  return (
    <div style={{ padding: '32px 0', maxWidth: 480 }}>
      <div style={{
        background: '#f5f3ff', border: '1px solid #ddd6fe',
        borderRadius: 12, padding: 28,
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 6 }}>
          납기준수율 종합 보고서
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>
          고객사 납기준수율 · 외주처 납기준수율 / 불량율 · A~D 등급 · 서명란 포함
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label>연도</label>
            <select value={drYear} onChange={e => setDrYear(+e.target.value)}>
              {[curYear - 1, curYear, curYear + 1].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label>월</label>
            <select value={drMonth} onChange={e => setDrMonth(+e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}월</option>
              ))}
            </select>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700, background: '#7c3aed', borderColor: '#7c3aed' }}
          onClick={downloadDelivery}
          disabled={drLoading}
        >
          {drLoading ? '⏳ 생성 중...' : `📥  ${drYear}년 ${drMonth}월  Excel 다운로드`}
        </button>

        <div style={{ marginTop: 14, fontSize: 11, color: '#94a3b8', lineHeight: 1.8 }}>
          ■ 고객사별 — 수주/출하완료/납기준수 건수 · 납기준수율 · A~D 등급<br />
          ■ 외주처별 — 납기준수율 · 불량율 · 종합 A~D 등급<br />
          ■ KPI 요약 · 서명란 포함 · 인쇄 최적화 (가로 1페이지)
        </div>
      </div>
    </div>
  )
}

function OutsourcePlCard() {
  const now = new Date()
  const [opYear, setOpYear]   = useState(now.getFullYear())
  const [opMonth, setOpMonth] = useState(now.getMonth() + 1)
  const [opLoading, setOpLoading] = useState(false)
  const curYear = now.getFullYear()

  const download = async () => {
    setOpLoading(true)
    try {
      const res = await api.get(`/reports/outsource-pl?year=${opYear}&month=${opMonth}`, { responseType: 'blob' })
      const url  = URL.createObjectURL(res.data)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `외주처_손익보고서_${opYear}년${String(opMonth).padStart(2,'0')}월.xlsx`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('다운로드 실패: ' + e.message)
    } finally {
      setOpLoading(false)
    }
  }

  return (
    <div style={{ padding: '32px 0', maxWidth: 480 }}>
      <div style={{
        background: '#fff7ed', border: '1px solid #fed7aa',
        borderRadius: 12, padding: 28,
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 6 }}>
          외주처 매입매출 손익 보고서
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>
          외주처별 이달 매입금액 · 매출금액 · 손익 · 마진율 · 품목별 세부내역 · 서명란 포함
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label>연도</label>
            <select value={opYear} onChange={e => setOpYear(+e.target.value)}>
              {[curYear - 1, curYear, curYear + 1].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label>월</label>
            <select value={opMonth} onChange={e => setOpMonth(+e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}월</option>
              ))}
            </select>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
                   background: '#ea580c', borderColor: '#ea580c' }}
          onClick={download}
          disabled={opLoading}
        >
          {opLoading ? '⏳ 생성 중...' : `📥  ${opYear}년 ${opMonth}월  Excel 다운로드`}
        </button>

        <div style={{ marginTop: 14, fontSize: 11, color: '#94a3b8', lineHeight: 1.8 }}>
          ■ 외주처별 — 매입금액 · 매출금액 · 손익 · 마진율 요약<br />
          ■ 품목별 세부내역 — 입고수량·매입금액·출하수량·매출금액·손익<br />
          ■ KPI 요약 · 서명란 포함 · 인쇄 최적화 (가로 1페이지)
        </div>
      </div>
    </div>
  )
}

function fmt(n) { return n ? Number(n).toLocaleString() : '—' }
function pct(n) { return n != null ? `${n}%` : '—' }

export default function Report() {
  const curYear = new Date().getFullYear()
  const curMonth = new Date().getMonth() + 1
  const [year, setYear] = useState(curYear)
  const [tab, setTab] = useState('monthly')
  const [spYear, setSpYear]   = useState(curYear)
  const [spMonth, setSpMonth] = useState(curMonth)
  const [spLoading, setSpLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [flowYear, setFlowYear] = useState(curYear)
  const [flowMonth, setFlowMonth] = useState(new Date().getMonth() + 1)
  const [flow, setFlow] = useState([])
  const [autoCheck, setAutoCheck] = useState([])
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoResult, setAutoResult] = useState(null)
  const SMTP_PRESETS = [
    { label: '가비아 메일', host: 'smtp.gabia.com', port: 465, hint: '가비아 메일 호스팅 — 전체 이메일 주소 + 가비아 비밀번호' },
    { label: 'Gmail', host: 'smtp.gmail.com', port: 587, hint: 'Google 계정 → 앱 비밀번호 발급 필요' },
    { label: 'Naver 메일', host: 'smtp.naver.com', port: 465, hint: '네이버 메일 → 환경설정 → POP3/SMTP 사용 ON' },
    { label: 'Daum/Kakao 메일', host: 'smtp.daum.net', port: 465, hint: '다음 메일 → 환경설정 → SMTP 사용 ON' },
    { label: 'Office365 / Outlook', host: 'smtp.office365.com', port: 587, hint: '회사 Microsoft 365 계정 사용' },
    { label: '네이버 웍스', host: 'smtp.worksmobile.com', port: 587, hint: '네이버 웍스 관리자에서 SMTP 활성화 필요' },
    { label: '직접 입력', host: '', port: 587, hint: '사내 SMTP 서버 주소를 직접 입력하세요' },
  ]
  const [smtpPreset, setSmtpPreset] = useState(0)
  const [smtpHost, setSmtpHost] = useState('smtp.gabia.com')
  const [smtpPort, setSmtpPort] = useState('465')
  const [smtpUser, setSmtpUser] = useState('jhhwang@nexgem.co.kr')
  const [smtpPass, setSmtpPass] = useState('')

  const loadReport = useCallback(() => {
    api.get(`/dashboard/annual-report?year=${year}`).then(r => setReport(r.data))
  }, [year])

  const loadFlow = useCallback(() => {
    api.get(`/dashboard/supplier-customer-flow?year=${flowYear}&month=${flowMonth}`).then(r => setFlow(r.data))
  }, [flowYear, flowMonth])

  const loadAutoCheck = useCallback(() => {
    api.get('/auto-order/check').then(r => setAutoCheck(r.data))
  }, [])

  useEffect(() => { loadReport() }, [loadReport])
  useEffect(() => { if (tab === 'flow') loadFlow() }, [tab, loadFlow, flowYear, flowMonth])
  useEffect(() => { if (tab === 'auto') loadAutoCheck() }, [tab, loadAutoCheck])

  // ── 연간 월별 보고서 Excel 출력 ──
  const exportAnnual = () => {
    if (!report) return
    const wb = XLSX.utils.book_new()

    // Sheet1: 월별 요약
    const summary = [
      ['월', '발주수량', '매입금액', '출고수량', '매출금액', '이익', '이익률(%)'],
      ...report.monthly.map(m => [
        `${m.month}월`, m.purchase_qty, m.purchase_amt,
        m.sales_qty, m.sales_amt, m.profit, m.profit_rate
      ]),
      ['합계',
        report.monthly.reduce((s,m)=>s+m.purchase_qty,0),
        report.monthly.reduce((s,m)=>s+m.purchase_amt,0),
        report.monthly.reduce((s,m)=>s+m.sales_qty,0),
        report.monthly.reduce((s,m)=>s+m.sales_amt,0),
        report.monthly.reduce((s,m)=>s+m.profit,0),
        '',
      ]
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(summary)
    ws1['!cols'] = [{wch:8},{wch:12},{wch:14},{wch:12},{wch:14},{wch:14},{wch:10}]
    XLSX.utils.book_append_sheet(wb, ws1, '월별요약')

    // Sheet2: 외주처별 월별 매입
    const supHeader = ['외주처', ...MONTHS, '연간합계']
    const supRows = report.suppliers.map(s => [s.name, ...s.monthly, s.total])
    const ws2 = XLSX.utils.aoa_to_sheet([supHeader, ...supRows])
    XLSX.utils.book_append_sheet(wb, ws2, '외주처별매입')

    // Sheet3: 고객사별 월별 매출
    const custHeader = ['고객사', ...MONTHS, '연간합계']
    const custRows = report.customers.map(c => [c.name, ...c.monthly, c.total])
    const ws3 = XLSX.utils.aoa_to_sheet([custHeader, ...custRows])
    XLSX.utils.book_append_sheet(wb, ws3, '고객사별매출')

    XLSX.writeFile(wb, `넥스젬_${year}년_보고서.xlsx`)
  }

  const downloadSparePL = async () => {
    setSpLoading(true)
    try {
      const res = await api.get(`/reports/spare-part-pl?year=${spYear}&month=${spMonth}`, { responseType: 'blob' })
      const blob = res.data
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SPARE_PART_손익보고서_${spYear}년${String(spMonth).padStart(2,'0')}월.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('다운로드 실패: ' + e.message)
    } finally {
      setSpLoading(false)
    }
  }

  const executeAutoOrder = async () => {
    if (!confirm(`안전재고 부족 ${autoCheck.length}건에 대해 자동발주를 실행하시겠습니까?`)) return
    setAutoLoading(true)
    try {
      const params = new URLSearchParams({
        send_email: 'true',
        due_days: '14',
        ...(smtpHost && { smtp_host: smtpHost }),
        ...(smtpPort && { smtp_port: smtpPort }),
        ...(smtpUser && { smtp_user: smtpUser }),
        ...(smtpPass && { smtp_password: smtpPass }),
      })
      const r = await api.post(`/auto-order/execute?${params.toString()}`)
      setAutoResult(r.data)
      loadAutoCheck()
    } finally {
      setAutoLoading(false)
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button className={`btn ${tab==='monthly'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('monthly')}>월별 보고서</button>
        <button className={`btn ${tab==='supplier'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('supplier')}>외주처별 매입</button>
        <button className={`btn ${tab==='customer'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('customer')}>고객사별 매출</button>
        <button className={`btn ${tab==='flow'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('flow')}>외주→고객 흐름</button>
        <button className={`btn ${tab==='auto'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('auto')}>자동발주</button>
        <button className={`btn ${tab==='spare'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('spare')}>스페어파트 손익</button>
        <button className={`btn ${tab==='delivery'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('delivery')}>납기준수율 보고서</button>
        <button className={`btn ${tab==='outsource-pl'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('outsource-pl')}>외주처 손익보고서</button>
        <div className="spacer" />
        {(tab==='monthly'||tab==='supplier'||tab==='customer') && (
          <>
            <select value={year} onChange={e=>setYear(+e.target.value)} style={{marginRight:8}}>
              {[curYear-1, curYear, curYear+1].map(y=><option key={y} value={y}>{y}년</option>)}
            </select>
            <button className="btn btn-outline" onClick={loadReport}>⟳ 새로고침</button>
            <button className="btn btn-outline" onClick={exportAnnual}>Excel 다운로드</button>
          </>
        )}
      </div>

      {/* ── 월별 요약 ── */}
      {tab === 'monthly' && report && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>월</th>
                <th>발주수량</th>
                <th>매입금액</th>
                <th>출고수량</th>
                <th>매출금액</th>
                <th>이익</th>
                <th>이익률</th>
              </tr>
            </thead>
            <tbody>
              {report.monthly.map(m => (
                <tr key={m.month}>
                  <td style={{fontWeight:600}}>{m.month}월</td>
                  <td style={{textAlign:'right'}}>{fmt(m.purchase_qty)}</td>
                  <td style={{textAlign:'right'}}>₩{fmt(m.purchase_amt)}</td>
                  <td style={{textAlign:'right'}}>{fmt(m.sales_qty)}</td>
                  <td style={{textAlign:'right'}}>₩{fmt(m.sales_amt)}</td>
                  <td style={{textAlign:'right', color: m.profit>=0?'#16a34a':'#dc2626', fontWeight:600}}>
                    ₩{fmt(m.profit)}
                  </td>
                  <td style={{textAlign:'right'}}>
                    <span className={`badge ${m.profit_rate>=20?'badge-green':m.profit_rate>=0?'badge-amber':'badge-red'}`}>
                      {pct(m.profit_rate)}
                    </span>
                  </td>
                </tr>
              ))}
              <tr style={{background:'#eff6ff', fontWeight:700}}>
                <td>합계</td>
                <td style={{textAlign:'right'}}>{fmt(report.monthly.reduce((s,m)=>s+m.purchase_qty,0))}</td>
                <td style={{textAlign:'right'}}>₩{fmt(report.monthly.reduce((s,m)=>s+m.purchase_amt,0))}</td>
                <td style={{textAlign:'right'}}>{fmt(report.monthly.reduce((s,m)=>s+m.sales_qty,0))}</td>
                <td style={{textAlign:'right'}}>₩{fmt(report.monthly.reduce((s,m)=>s+m.sales_amt,0))}</td>
                <td style={{textAlign:'right', color:'#16a34a'}}>
                  ₩{fmt(report.monthly.reduce((s,m)=>s+m.profit,0))}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── 외주처별 매입 ── */}
      {tab === 'supplier' && report && (
        <div className="table-wrap" style={{overflowX:'auto'}}>
          <table style={{minWidth:1100}}>
            <thead>
              <tr>
                <th style={{minWidth:120}}>외주처</th>
                {MONTHS.map(m=><th key={m} style={{minWidth:80,textAlign:'right'}}>{m}</th>)}
                <th style={{minWidth:110,textAlign:'right'}}>연간합계</th>
              </tr>
            </thead>
            <tbody>
              {report.suppliers.map(s=>(
                <tr key={s.partner_id}>
                  <td style={{fontWeight:600}}>{s.name}</td>
                  {s.monthly.map((v,i)=>(
                    <td key={i} style={{textAlign:'right',fontSize:12}}>
                      {v>0?`₩${fmt(v)}`:'—'}
                    </td>
                  ))}
                  <td style={{textAlign:'right',fontWeight:700,color:'#1d4ed8'}}>₩{fmt(s.total)}</td>
                </tr>
              ))}
              {report.suppliers.length===0&&<tr><td colSpan={14} className="empty">데이터 없음</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 고객사별 매출 ── */}
      {tab === 'customer' && report && (
        <div className="table-wrap" style={{overflowX:'auto'}}>
          <table style={{minWidth:1100}}>
            <thead>
              <tr>
                <th style={{minWidth:120}}>고객사</th>
                {MONTHS.map(m=><th key={m} style={{minWidth:80,textAlign:'right'}}>{m}</th>)}
                <th style={{minWidth:110,textAlign:'right'}}>연간합계</th>
              </tr>
            </thead>
            <tbody>
              {report.customers.map(c=>(
                <tr key={c.partner_id}>
                  <td style={{fontWeight:600}}>{c.name}</td>
                  {c.monthly.map((v,i)=>(
                    <td key={i} style={{textAlign:'right',fontSize:12}}>
                      {v>0?`₩${fmt(v)}`:'—'}
                    </td>
                  ))}
                  <td style={{textAlign:'right',fontWeight:700,color:'#16a34a'}}>₩{fmt(c.total)}</td>
                </tr>
              ))}
              {report.customers.length===0&&<tr><td colSpan={14} className="empty">데이터 없음</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 외주처→고객사 흐름 ── */}
      {tab === 'flow' && (
        <>
          <div className="toolbar" style={{marginBottom:8}}>
            <select value={flowYear} onChange={e => setFlowYear(+e.target.value)} style={{marginRight:8}}>
              {[curYear-1,curYear].map(y=><option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={flowMonth} onChange={e => setFlowMonth(+e.target.value)}>
              {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}
            </select>
            <button className="btn btn-outline" style={{marginLeft:8}} onClick={loadFlow}>⟳ 새로고침</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>품번</th><th>품명</th>
                  <th>외주처 (입고)</th>
                  <th>고객사 (출고)</th>
                  <th>출고금액</th>
                </tr>
              </thead>
              <tbody>
                {flow.length===0&&<tr><td colSpan={5} className="empty">데이터 없음</td></tr>}
                {flow.map(f=>(
                  <tr key={f.part_no}>
                    <td style={{fontFamily:'monospace',fontSize:12}}>{f.part_no}</td>
                    <td>{f.part_name}</td>
                    <td>
                      {f.suppliers.map(s=>(
                        <div key={s.partner_id} style={{fontSize:12}}>
                          {s.name} <span style={{color:'#64748b'}}>({fmt(s.qty)})</span>
                        </div>
                      ))}
                    </td>
                    <td>
                      {f.customers.map(c=>(
                        <div key={c.partner_id} style={{fontSize:12}}>
                          {c.name} <span style={{color:'#64748b'}}>({fmt(c.qty)})</span>
                        </div>
                      ))}
                    </td>
                    <td style={{textAlign:'right',fontWeight:600}}>
                      ₩{fmt(f.customers.reduce((s,c)=>s+c.amount,0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── 자동발주 ── */}
      {tab === 'auto' && (
        <div>
          <div style={{padding:'12px 0 8px', fontWeight:600, fontSize:14}}>
            안전재고 미달 품목 ({autoCheck.length}건)
          </div>
          <div className="table-wrap" style={{marginBottom:16}}>
            <table>
              <thead>
                <tr>
                  <th>품번</th><th>품명</th>
                  <th>현재고</th><th>안전재고</th><th>부족수량</th>
                  <th>MOQ</th><th>발주수량</th><th>예상금액</th>
                </tr>
              </thead>
              <tbody>
                {autoCheck.length===0&&<tr><td colSpan={8} className="empty">안전재고 부족 품목 없음</td></tr>}
                {autoCheck.map(r=>(
                  <tr key={r.part_no}>
                    <td style={{fontFamily:'monospace',fontSize:12}}>{r.part_no}</td>
                    <td>{r.name}</td>
                    <td style={{textAlign:'right'}}>{fmt(r.current_stock)}</td>
                    <td style={{textAlign:'right'}}>{fmt(r.safety_stock)}</td>
                    <td style={{textAlign:'right',color:'#dc2626',fontWeight:600}}>{fmt(r.shortage)}</td>
                    <td style={{textAlign:'right'}}>{fmt(r.moq)}</td>
                    <td style={{textAlign:'right',fontWeight:600,color:'#1d4ed8'}}>{fmt(r.suggest_qty)}</td>
                    <td style={{textAlign:'right'}}>₩{fmt(r.suggest_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:16, marginBottom:16}}>
            <div style={{fontWeight:600, marginBottom:10}}>이메일 자동발주 설정</div>

            {/* 메일 서버 선택 */}
            <div className="form-group" style={{maxWidth:520, marginBottom:10}}>
              <label>메일 서버</label>
              <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                {SMTP_PRESETS.map((p,i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSmtpPreset(i)
                      if (p.host) { setSmtpHost(p.host); setSmtpPort(String(p.port)) }
                    }}
                    style={{
                      padding:'5px 12px', borderRadius:6, fontSize:12, cursor:'pointer',
                      border: smtpPreset===i ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
                      background: smtpPreset===i ? '#dbeafe' : '#fff',
                      fontWeight: smtpPreset===i ? 700 : 400,
                      color: smtpPreset===i ? '#1d4ed8' : '#334155',
                    }}
                  >{p.label}</button>
                ))}
              </div>
              {SMTP_PRESETS[smtpPreset] && (
                <div style={{fontSize:11, color:'#64748b', marginTop:5}}>
                  ※ {SMTP_PRESETS[smtpPreset].hint}
                </div>
              )}
            </div>

            {/* 직접 입력 시 호스트/포트 표시 */}
            {smtpPreset === SMTP_PRESETS.length - 1 && (
              <div className="grid-2" style={{maxWidth:520, marginBottom:10}}>
                <div className="form-group">
                  <label>SMTP 서버 주소</label>
                  <input type="text" value={smtpHost} onChange={e=>setSmtpHost(e.target.value)} placeholder="mail.company.com" />
                </div>
                <div className="form-group">
                  <label>포트</label>
                  <input type="number" value={smtpPort} onChange={e=>setSmtpPort(e.target.value)} placeholder="587" />
                </div>
              </div>
            )}
            {smtpPreset !== SMTP_PRESETS.length - 1 && (
              <div style={{fontSize:12, color:'#64748b', marginBottom:10}}>
                서버: <code style={{background:'#e2e8f0', padding:'1px 5px', borderRadius:3}}>{smtpHost}:{smtpPort}</code>
              </div>
            )}

            <div className="grid-2" style={{maxWidth:520}}>
              <div className="form-group">
                <label>발신 이메일</label>
                <input type="email" value={smtpUser} onChange={e=>setSmtpUser(e.target.value)} placeholder="your@email.com" />
              </div>
              <div className="form-group">
                <label>비밀번호 / 앱 비밀번호</label>
                <input type="password" value={smtpPass} onChange={e=>setSmtpPass(e.target.value)} placeholder="비밀번호 입력" />
              </div>
            </div>

            <div style={{fontSize:11, color:'#94a3b8', marginTop:4}}>
              서버 환경변수 <code>SMTP_HOST</code> / <code>SMTP_PORT</code> / <code>SMTP_USER</code> / <code>SMTP_PASSWORD</code> 로 영구 설정도 가능합니다.
            </div>
          </div>

          <button
            className="btn btn-primary"
            disabled={autoLoading || autoCheck.length===0}
            onClick={executeAutoOrder}
          >
            {autoLoading ? '발주 처리 중...' : `자동발주 실행 (${autoCheck.length}건)`}
          </button>

          {autoResult && (
            <div style={{marginTop:16, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:16}}>
              <div style={{fontWeight:700, color:'#16a34a', marginBottom:8}}>
                발주 완료 — {autoResult.created_count}건 생성
              </div>
              <table style={{width:'100%', fontSize:12, borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#dcfce7'}}>
                    <th style={{padding:'4px 8px', border:'1px solid #bbf7d0'}}>PO번호</th>
                    <th style={{padding:'4px 8px', border:'1px solid #bbf7d0'}}>품번</th>
                    <th style={{padding:'4px 8px', border:'1px solid #bbf7d0'}}>수량</th>
                    <th style={{padding:'4px 8px', border:'1px solid #bbf7d0'}}>이메일</th>
                    <th style={{padding:'4px 8px', border:'1px solid #bbf7d0'}}>발송결과</th>
                  </tr>
                </thead>
                <tbody>
                  {autoResult.orders.map((o,i)=>{
                    const em = autoResult.email_results[i]
                    return (
                      <tr key={o.po_no}>
                        <td style={{padding:'4px 8px', border:'1px solid #bbf7d0', fontFamily:'monospace'}}>{o.po_no}</td>
                        <td style={{padding:'4px 8px', border:'1px solid #bbf7d0'}}>{o.part_no}</td>
                        <td style={{padding:'4px 8px', border:'1px solid #bbf7d0', textAlign:'right'}}>{fmt(o.qty)}</td>
                        <td style={{padding:'4px 8px', border:'1px solid #bbf7d0'}}>{em?.to || '—'}</td>
                        <td style={{padding:'4px 8px', border:'1px solid #bbf7d0'}}>
                          <span className={`badge ${em?.success?'badge-green':'badge-amber'}`}>
                            {em?.message}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* ── 납기준수율 보고서 ── */}
      {tab === 'delivery' && (
        <DeliveryReportCard />
      )}

      {/* ── 외주처 손익보고서 ── */}
      {tab === 'outsource-pl' && (
        <OutsourcePlCard />
      )}

      {/* ── 스페어파트 손익보고서 ── */}
      {tab === 'spare' && (
        <div style={{padding:'32px 0', maxWidth:480}}>
          <div style={{
            background:'#eff6ff', border:'1px solid #bfdbfe',
            borderRadius:12, padding:28,
          }}>
            <div style={{fontWeight:700, fontSize:16, color:'#1e293b', marginBottom:6}}>
              스페어파트 손익보고서
            </div>
            <div style={{fontSize:12, color:'#64748b', marginBottom:20}}>
              자체생산 / 외주처 구분 · 매입원가·매출·순익 · 월말재고 포함
            </div>

            <div style={{display:'flex', gap:10, marginBottom:20}}>
              <div className="form-group" style={{flex:1, margin:0}}>
                <label>연도</label>
                <select value={spYear} onChange={e=>setSpYear(+e.target.value)}>
                  {[curYear-1, curYear, curYear+1].map(y=>(
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{flex:1, margin:0}}>
                <label>월</label>
                <select value={spMonth} onChange={e=>setSpMonth(+e.target.value)}>
                  {Array.from({length:12},(_,i)=>(
                    <option key={i+1} value={i+1}>{i+1}월</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{width:'100%', padding:'12px 0', fontSize:14, fontWeight:700}}
              onClick={downloadSparePL}
              disabled={spLoading}
            >
              {spLoading
                ? '⏳ 생성 중...'
                : `📥  ${spYear}년 ${spMonth}월  Excel 다운로드`}
            </button>

            <div style={{marginTop:14, fontSize:11, color:'#94a3b8', lineHeight:1.6}}>
              ■ 자체생산 (GC1-AS-0098, 0100) — BOM단위원가 기준<br/>
              ■ 외주처 (GC3/GP1/GP2) — BOM재료비 + 포장비 80원 기준
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
