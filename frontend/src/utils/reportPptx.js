import PptxGenJS from 'pptxgenjs'

// ── Color palette ──────────────────────────────────────────────────
const NAVY  = '1E3A5F'
const BLUE  = '1D4ED8'
const SKY   = 'BFDBFE'
const GREEN = '059669'
const AMBER = 'D97706'
const RED   = 'DC2626'
const WHITE = 'FFFFFF'
const G50   = 'F8FAFC'
const G100  = 'F1F5F9'
const G200  = 'E2E8F0'
const G400  = '94A3B8'
const G700  = '374151'
const G900  = '111827'

function kpiColor(rate) {
  return rate >= 90 ? GREEN : rate >= 70 ? AMBER : RED
}

function fmtKRW(v) {
  if (v == null || v === undefined) return '-'
  const n = Math.round(v / 10000)
  return n.toLocaleString('ko-KR') + '만원'
}

function altFill(i) { return i % 2 === 1 ? G100 : WHITE }

function newPres() {
  const p = new PptxGenJS()
  p.layout = 'LAYOUT_16x9'  // 10" × 5.625"
  return p
}

// ── Cover Slide ────────────────────────────────────────────────────
function addCoverSlide(pres, mainTitle, month) {
  const sl = pres.addSlide()

  sl.addShape('rect', { x: 0, y: 0, w: 10, h: 5.625, fill: { color: NAVY } })
  sl.addShape('rect', { x: 0, y: 0, w: 10, h: 0.07, fill: { color: BLUE } })
  sl.addShape('rect', { x: 0.5, y: 1.4, w: 0.08, h: 2.5, fill: { color: SKY } })

  sl.addText('조이산업 (주)', {
    x: 0.85, y: 1.4, w: 8.5, h: 0.65,
    fontSize: 22, color: SKY, fontFace: 'Arial', bold: true, isTextBox: true,
  })
  sl.addText(mainTitle, {
    x: 0.85, y: 2.1, w: 8.5, h: 1.3,
    fontSize: 36, color: WHITE, fontFace: 'Arial', bold: true, isTextBox: true,
  })
  sl.addText(month, {
    x: 0.85, y: 3.45, w: 8.5, h: 0.5,
    fontSize: 18, color: SKY, fontFace: 'Arial', isTextBox: true,
  })

  sl.addShape('rect', { x: 0, y: 5.1, w: 10, h: 0.525, fill: { color: BLUE } })
  sl.addText('조이산업 ERP 경영 보고서', {
    x: 0.5, y: 5.15, w: 7, h: 0.4,
    fontSize: 12, color: WHITE, fontFace: 'Arial', isTextBox: true,
  })
  sl.addText(new Date().toLocaleDateString('ko-KR'), {
    x: 7.5, y: 5.15, w: 2.3, h: 0.4,
    fontSize: 12, color: WHITE, fontFace: 'Arial', align: 'right', isTextBox: true,
  })
}

// ── Content slide with navy header ────────────────────────────────
function addContentSlide(pres, title, month) {
  const sl = pres.addSlide()

  sl.addShape('rect', { x: 0, y: 0, w: 10, h: 0.85, fill: { color: NAVY } })
  sl.addText(title, {
    x: 0.3, y: 0.08, w: 8, h: 0.52,
    fontSize: 20, color: WHITE, fontFace: 'Arial', bold: true, isTextBox: true,
  })
  if (month) {
    sl.addText(month, {
      x: 7.5, y: 0.08, w: 2.3, h: 0.52,
      fontSize: 13, color: SKY, fontFace: 'Arial', align: 'right', isTextBox: true,
    })
  }
  sl.addShape('rect', { x: 0, y: 0.85, w: 10, h: 0.04, fill: { color: BLUE } })

  return sl
}

// ── KPI card ──────────────────────────────────────────────────────
function addKpiCard(sl, x, y, w, h, label, value, valColor, sub) {
  sl.addShape('rect', { x, y, w, h, fill: { color: G50 }, line: { color: G200, width: 1 } })
  sl.addText(label.toUpperCase(), {
    x: x + 0.14, y: y + 0.1, w: w - 0.28, h: 0.22,
    fontSize: 8, color: G400, fontFace: 'Arial', bold: true, isTextBox: true,
  })
  sl.addText(String(value), {
    x: x + 0.14, y: y + 0.3, w: w - 0.28, h: 0.58,
    fontSize: 20, color: valColor || NAVY, fontFace: 'Arial', bold: true, isTextBox: true,
  })
  if (sub) {
    sl.addText(String(sub), {
      x: x + 0.14, y: y + 0.86, w: w - 0.28, h: 0.2,
      fontSize: 7.5, color: G400, fontFace: 'Arial', isTextBox: true,
    })
  }
}

// ── Progress bar ──────────────────────────────────────────────────
function addProgressBar(sl, x, y, w, label, pct, valColor) {
  const col = valColor || (pct >= 90 ? GREEN : pct >= 70 ? AMBER : RED)
  const safePct = Math.min(Math.max(pct || 0, 0), 100)

  sl.addText(label, {
    x, y, w: w - 1.0, h: 0.22,
    fontSize: 10, color: G700, fontFace: 'Arial', isTextBox: true,
  })
  sl.addText(`${Math.round(pct || 0)}%`, {
    x: x + w - 0.95, y, w: 0.9, h: 0.22,
    fontSize: 10, color: col, fontFace: 'Arial', bold: true, align: 'right', isTextBox: true,
  })
  sl.addShape('rect', { x, y: y + 0.26, w, h: 0.11, fill: { color: G200 } })
  if (safePct > 0) {
    sl.addShape('rect', { x, y: y + 0.26, w: w * safePct / 100, h: 0.11, fill: { color: col } })
  }
}

// ── Table helpers ─────────────────────────────────────────────────
function hdr(text, align = 'center') {
  return {
    text,
    options: {
      bold: true, fontSize: 9, color: WHITE, fontFace: 'Arial',
      fill: { color: NAVY }, align,
      border: { type: 'solid', pt: 0.5, color: G200 },
    },
  }
}
function cell(text, { align = 'left', bold = false, color = G900, fill = WHITE } = {}) {
  return {
    text: String(text ?? '-'),
    options: {
      fontSize: 9, color, fontFace: 'Arial', bold,
      fill: { color: fill }, align,
      border: { type: 'solid', pt: 0.5, color: G200 },
    },
  }
}

// ════════════════════════════════════════════════════════════════════
// SALES REPORT
// ════════════════════════════════════════════════════════════════════
export function downloadSalesReport(data, monthLabel) {
  const pres = newPres()
  addCoverSlide(pres, '영업 KPI 보고서', monthLabel)

  const target = data?.total_target ?? 0
  const actual = data?.total_actual ?? 0
  const rate   = data?.total_rate ?? (target > 0 ? Math.round(actual / target * 100) : 0)
  const remain = target - actual

  const s2 = addContentSlide(pres, '월 매출 목표 대비 실적 현황', monthLabel)
  addKpiCard(s2, 0.2,  1.0, 2.9, 1.1, '매출 목표', fmtKRW(target), NAVY, `${monthLabel} 목표`)
  addKpiCard(s2, 3.35, 1.0, 2.9, 1.1, '현재 매출', fmtKRW(actual), GREEN, '현재까지 실적')
  addKpiCard(s2, 6.5,  1.0, 3.1, 1.1, '달성률', `${rate}%`, kpiColor(rate), rate >= 100 ? '목표 초과 달성!' : '달성 진행 중')

  s2.addText('목표 달성 현황', { x: 0.2, y: 2.3, w: 9.5, h: 0.3, fontSize: 13, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
  addProgressBar(s2, 0.2, 2.68, 9.5, `${monthLabel} 월 매출 목표 (${fmtKRW(target)})`, rate)

  s2.addText(`목표: ${fmtKRW(target)}  /  현재: ${fmtKRW(actual)}  /  잔여: ${fmtKRW(remain)}`, {
    x: 0.2, y: 3.2, w: 9.5, h: 0.25, fontSize: 9, color: G400, fontFace: 'Arial', isTextBox: true,
  })

  // 고객사별 (details[])
  const details = data?.details ?? []
  if (details.length > 0) {
    const s3 = addContentSlide(pres, '고객사별 매출 현황', monthLabel)
    const rows = [
      [hdr('고객사', 'left'), hdr('목표'), hdr('실적'), hdr('달성률')],
      ...details.map((c, i) => {
        const r = c.rate
        const col = r == null ? G400 : r >= 90 ? GREEN : r >= 70 ? AMBER : RED
        const f = altFill(i)
        return [
          cell(c.partner_name || c.partner_id, { fill: f }),
          cell(fmtKRW(c.target), { align: 'right', fill: f }),
          cell(fmtKRW(c.actual), { align: 'right', fill: f }),
          cell(r != null ? `${r}%` : '-', { align: 'right', bold: true, color: col, fill: f }),
        ]
      }),
    ]
    s3.addTable(rows, { x: 0.3, y: 1.05, w: 9.4, colW: [4.0, 2.2, 2.2, 1.0] })
  }

  pres.writeFile({ fileName: `영업_KPI_보고서_${monthLabel}.pptx` })
}

// ════════════════════════════════════════════════════════════════════
// PRODUCTION REPORT
// ════════════════════════════════════════════════════════════════════
export function downloadProductionReport(plans, oee, kaizen, machineData, lossData, monthLabel) {
  const pres = newPres()
  addCoverSlide(pres, '생산 KPI 보고서', monthLabel)

  const totalPlan   = plans.reduce((s, p) => s + (p.planned_qty || 0), 0)
  const totalActual = plans.reduce((s, p) => s + (p.total_actual || 0), 0)
  const ar = totalPlan > 0 ? Math.round(totalActual / totalPlan * 100) : 0

  // ── Slide 2: 월 생산 목표 대비 실적 ─────────────────────────────
  const s2 = addContentSlide(pres, '월 생산 목표 대비 실적', monthLabel)
  addKpiCard(s2, 0.2,  1.0, 2.9, 1.0, '계획 수량', totalPlan.toLocaleString() + ' EA', NAVY)
  addKpiCard(s2, 3.35, 1.0, 2.9, 1.0, '실적 수량', totalActual.toLocaleString() + ' EA', GREEN)
  addKpiCard(s2, 6.5,  1.0, 3.1, 1.0, '달성률', `${ar}%`, kpiColor(ar), ar >= 90 ? '목표 달성' : '달성 중')

  s2.addText('품번별 달성 현황', { x: 0.2, y: 2.2, w: 9.5, h: 0.3, fontSize: 13, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
  plans.slice(0, 5).forEach((p, i) => {
    const actual = p.total_actual || 0
    const rate   = p.planned_qty > 0 ? Math.round(actual / p.planned_qty * 100) : 0
    const lbl = `${p.part_no}${p.item?.name ? ' — ' + p.item.name : ''}  (${actual.toLocaleString()} / ${p.planned_qty.toLocaleString()} EA)`
    addProgressBar(s2, 0.2, 2.6 + i * 0.5, 9.5, lbl, rate)
  })

  // ── Slide 3: 설비별 OEE 현황 ────────────────────────────────────
  if (oee?.length > 0) {
    const s3 = addContentSlide(pres, '설비별 OEE 현황', monthLabel)
    const rows = [
      [hdr('설비번호'), hdr('가동일수'), hdr('가동률'), hdr('성능률'), hdr('양품률'), hdr('OEE'), hdr('등급')],
      ...oee.map((r, i) => {
        const grade = r.avg_oee >= 85 ? 'A' : r.avg_oee >= 80 ? 'B' : r.avg_oee >= 60 ? 'C' : 'D'
        const oc = r.avg_oee >= 85 ? GREEN : r.avg_oee >= 60 ? AMBER : RED
        const f = altFill(i)
        return [
          cell(r.machine_no, { fill: f }),
          cell(`${r.days_recorded}일`, { align: 'center', fill: f }),
          cell(`${r.avg_availability}%`, { align: 'right', fill: f }),
          cell(`${r.avg_performance}%`, { align: 'right', fill: f }),
          cell(`${r.avg_quality}%`, { align: 'right', fill: f }),
          cell(`${r.avg_oee}%`, { align: 'right', bold: true, color: oc, fill: f }),
          cell(grade, { align: 'center', bold: true, color: oc, fill: f }),
        ]
      }),
    ]
    s3.addTable(rows, { x: 0.3, y: 1.05, w: 9.4, colW: [1.9, 1.3, 1.4, 1.4, 1.4, 1.2, 0.8] })
  }

  // ── Slide 4+: 호기별 C/T 분석 — 금액환산 (10호기씩 분할) ──────────
  const machines = machineData?.machines || []
  if (machines.length > 0) {
    const totals = machineData.totals || {}
    const CT_PAGE = 10

    // 첫 슬라이드만 KPI 카드 표시
    const s4first = addContentSlide(pres, '호기별 C/T 분석 / 기회손실금액 (1)', monthLabel)
    addKpiCard(s4first, 0.2,  1.0, 3.0, 1.0, '총 실적금액', fmtKRW(totals.actual_revenue), NAVY)
    addKpiCard(s4first, 3.45, 1.0, 3.0, 1.0, '이론최대금액', fmtKRW(totals.ideal_revenue), BLUE, '표준 C/T 100% 달성 시')
    addKpiCard(s4first, 6.7,  1.0, 3.0, 1.0, '기회손실금액', fmtKRW(totals.opportunity_loss), totals.opportunity_loss > 0 ? RED : GREEN, 'C/T 로스로 인한 미실현 매출')

    const makeCtRows = (chunk) => [
      [hdr('호기'), hdr('품번', 'left'), hdr('실적수량'), hdr('이론최대'), hdr('표준C/T'), hdr('실제C/T'), hdr('C/T효율'), hdr('실적금액'), hdr('기회손실')],
      ...chunk.map((m, i) => {
        const ctColor = (m.ct_efficiency_pct != null && m.ct_efficiency_pct < 85) ? RED : G900
        const f = altFill(i)
        return [
          cell(m.machine_no, { bold: true, fill: f }),
          cell(m.part_no || '-', { fill: f }),
          cell((m.actual_qty || 0).toLocaleString(), { align: 'right', fill: f }),
          cell((m.ideal_qty || 0).toLocaleString(), { align: 'right', color: G400, fill: f }),
          cell(m.std_ct_sec != null ? `${m.std_ct_sec}s` : '-', { align: 'center', fill: f }),
          cell(m.avg_actual_ct_sec != null ? `${Math.round(m.avg_actual_ct_sec)}s` : '-', { align: 'center', color: ctColor, fill: f }),
          cell(m.ct_efficiency_pct != null ? `${Math.round(m.ct_efficiency_pct)}%` : '-', { align: 'center', bold: true, color: ctColor, fill: f }),
          cell(fmtKRW(m.actual_revenue), { align: 'right', fill: f }),
          cell(fmtKRW(m.opportunity_loss), { align: 'right', bold: m.opportunity_loss > 0, color: m.opportunity_loss > 0 ? RED : G400, fill: f }),
        ]
      }),
    ]

    // 첫 번째 슬라이드 테이블 (1~10호기)
    s4first.addTable(makeCtRows(machines.slice(0, CT_PAGE)), { x: 0.2, y: 2.55, w: 9.6, colW: [0.95, 1.0, 1.0, 1.0, 0.85, 0.85, 0.85, 1.6, 1.5] })
    s4first.addText('이론최대수량 = 순가동시간(분) × 60 ÷ 표준C/T(초)  |  C/T효율 = 표준C/T ÷ 실제C/T × 100', {
      x: 0.2, y: 5.2, w: 9.6, h: 0.22, fontSize: 7.5, color: G400, fontFace: 'Arial', isTextBox: true,
    })

    // 11~20호기 — 추가 슬라이드
    for (let pg = 1; pg * CT_PAGE < machines.length; pg++) {
      const chunk = machines.slice(pg * CT_PAGE, (pg + 1) * CT_PAGE)
      const sN = addContentSlide(pres, `호기별 C/T 분석 / 기회손실금액 (${pg + 1})`, monthLabel)
      sN.addText(`${pg * CT_PAGE + 1}~${pg * CT_PAGE + chunk.length}호기`, {
        x: 0.2, y: 1.0, w: 9.5, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true,
      })
      sN.addTable(makeCtRows(chunk), { x: 0.2, y: 1.35, w: 9.6, colW: [0.95, 1.0, 1.0, 1.0, 0.85, 0.85, 0.85, 1.6, 1.5] })
      sN.addText('이론최대수량 = 순가동시간(분) × 60 ÷ 표준C/T(초)  |  C/T효율 = 표준C/T ÷ 실제C/T × 100', {
        x: 0.2, y: 5.2, w: 9.6, h: 0.22, fontSize: 7.5, color: G400, fontFace: 'Arial', isTextBox: true,
      })
    }
  }

  // ── Slide 5+: 호기별 OEE + 달성률 상세 (10호기씩 분할) ──────────
  if (machines.length > 0) {
    const OEE_PAGE = 10

    const makeOeeRows = (chunk) => [
      [hdr('호기'), hdr('품번', 'left'), hdr('품명', 'left'), hdr('계획수량'), hdr('실적수량'), hdr('달성률'), hdr('불량수량'), hdr('가동률'), hdr('OEE')],
      ...chunk.map((m, i) => {
        const achieveRate = m.achieve_rate_pct != null ? Math.round(m.achieve_rate_pct) : null
        const achColor = achieveRate == null ? G400 : achieveRate >= 90 ? GREEN : achieveRate >= 70 ? AMBER : RED
        const oeeVal = m.avg_oee_pct != null ? Math.round(m.avg_oee_pct) : null
        const oeeColor = oeeVal == null ? G400 : oeeVal >= 85 ? GREEN : oeeVal >= 60 ? AMBER : RED
        const f = altFill(i)
        return [
          cell(m.machine_no, { bold: true, fill: f }),
          cell(m.part_no || '-', { fill: f }),
          cell(m.part_name || '-', { fill: f }),
          cell((m.plan_qty || 0).toLocaleString(), { align: 'right', fill: f }),
          cell((m.actual_qty || 0).toLocaleString(), { align: 'right', fill: f }),
          cell(achieveRate != null ? `${achieveRate}%` : '-', { align: 'center', bold: true, color: achColor, fill: f }),
          cell((m.defect_qty || 0).toLocaleString(), { align: 'right', color: m.defect_qty > 0 ? RED : G400, fill: f }),
          cell(m.avg_availability_pct != null ? `${Math.round(m.avg_availability_pct)}%` : '-', { align: 'center', fill: f }),
          cell(oeeVal != null ? `${oeeVal}%` : '-', { align: 'center', bold: true, color: oeeColor, fill: f }),
        ]
      }),
    ]

    for (let pg = 0; pg * OEE_PAGE < machines.length; pg++) {
      const chunk = machines.slice(pg * OEE_PAGE, (pg + 1) * OEE_PAGE)
      const pageLabel = machines.length > OEE_PAGE ? ` (${pg + 1})` : ''
      const sOee = addContentSlide(pres, `호기별 생산달성률 및 OEE 상세${pageLabel}`, monthLabel)
      if (pg > 0) {
        sOee.addText(`${pg * OEE_PAGE + 1}~${pg * OEE_PAGE + chunk.length}호기`, {
          x: 0.2, y: 0.9, w: 9.5, h: 0.22, fontSize: 10, color: NAVY, fontFace: 'Arial', isTextBox: true,
        })
      }
      sOee.addTable(makeOeeRows(chunk), { x: 0.2, y: pg > 0 ? 1.15 : 1.05, w: 9.6, colW: [0.95, 0.9, 1.5, 1.0, 1.0, 0.85, 0.9, 0.85, 0.85] })
    }
  }

  // ── Slide 6: 비가동 원인별 집계 ─────────────────────────────────
  const lossSummary = lossData?.summary || []
  const lossTotal = lossData?.total_stop_min
  if (lossSummary.length > 0 && lossSummary.some(s => s.total_min > 0)) {
    const s6loss = addContentSlide(pres, '비가동 원인별 집계 (Loss Tree)', monthLabel)
    addKpiCard(s6loss, 0.2, 1.0, 3.0, 1.0, '총 비가동시간', lossTotal != null ? `${lossTotal.toLocaleString()}분` : '-', NAVY)
    s6loss.addText('원인별 비가동 현황', { x: 0.2, y: 2.25, w: 9.5, h: 0.28, fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
    const lossRows = [
      [hdr('원인', 'left'), hdr('비가동(분)'), hdr('비중'), hdr('분류')],
      ...lossSummary.filter(s => s.total_min > 0).map((s, i) => {
        const isMajor = s.share_pct >= 30
        const col = isMajor ? RED : s.share_pct >= 15 ? AMBER : G700
        const f = altFill(i)
        const category = ['breakdown', 'unplanned_change'].includes(s.loss_code) ? '가용성손실' :
                         ['speed', 'minor_stop'].includes(s.loss_code) ? '성능손실' : '품질손실'
        return [
          cell(s.label, { bold: isMajor, fill: f }),
          cell(s.total_min.toLocaleString(), { align: 'right', fill: f }),
          cell(`${s.share_pct}%`, { align: 'right', bold: true, color: col, fill: f }),
          cell(category, { align: 'center', color: G400, fill: f }),
        ]
      }),
    ]
    s6loss.addTable(lossRows, { x: 0.2, y: 2.58, w: 9.6, colW: [3.5, 2.0, 2.0, 2.1] })
  }

  // ── Slide 7+: 카이젠 과제 현황 ───────────────────────────────────
  if (kaizen?.total > 0) {
    const s6 = addContentSlide(pres, '카이젠 과제 현황', monthLabel)
    const statuses = Object.entries(kaizen.by_status || {})
    if (statuses.length > 0) {
      const bW = Math.min(9.4 / statuses.length, 2.4) - 0.1
      const startX = 0.3 + (9.4 - statuses.length * (bW + 0.1)) / 2
      statuses.forEach(([st, cnt], i) => {
        const col = st === '완료' ? GREEN : st === '진행중' ? BLUE : st === '보류' ? AMBER : G400
        addKpiCard(s6, startX + i * (bW + 0.1), 1.1, bW, 1.1, st, `${cnt}건`, col)
      })
    }
    if (kaizen.overdue > 0) {
      s6.addText(`기한초과 과제: ${kaizen.overdue}건`, {
        x: 0.3, y: 2.4, w: 9.5, h: 0.4, fontSize: 14, color: RED, fontFace: 'Arial', bold: true, isTextBox: true,
      })
    }
    s6.addText(`전체 ${kaizen.total}건  /  완료율 ${kaizen.completion_rate ?? 0}%`, {
      x: 0.3, y: kaizen.overdue > 0 ? 2.9 : 2.4, w: 9.5, h: 0.3, fontSize: 11, color: G400, fontFace: 'Arial', isTextBox: true,
    })
    addProgressBar(s6, 0.3, kaizen.overdue > 0 ? 3.3 : 2.85, 9.5, '카이젠 완료율', kaizen.completion_rate ?? 0, GREEN)
  }

  pres.writeFile({ fileName: `생산_KPI_보고서_${monthLabel}.pptx` })
}

// ════════════════════════════════════════════════════════════════════
// QUALITY REPORT  (VDA 6.3)
// ════════════════════════════════════════════════════════════════════
export function downloadQualityReport(vda, monthLabel) {
  const pres = newPres()
  addCoverSlide(pres, '품질 보고서 (VDA 6.3)', monthLabel)

  const ds   = vda?.defect_summary   || {}
  const insp = vda?.incoming_inspection || {}
  const clm  = vda?.claims           || {}
  const insights = vda?.auto_insights || []

  // ── Slide 2: 공정/출하 불량 KPI + 파레토 ────────────────────────
  const s2 = addContentSlide(pres, 'P5 — 공정/출하 불량 현황', monthLabel)
  const totalDefect = ds.total_defect_qty || 0
  const totalLoss   = ds.total_loss_cost  || 0
  const byType      = ds.by_type || []

  addKpiCard(s2, 0.2,  1.0, 3.0, 1.1, '총 불량수량',      `${totalDefect.toLocaleString()} EA`, totalDefect === 0 ? GREEN : RED)
  addKpiCard(s2, 3.45, 1.0, 3.0, 1.1, '공정불량 로스비용', `${Math.round(totalLoss/10000).toLocaleString()}만원`, totalLoss === 0 ? GREEN : RED, '불량수량 × 단가')
  addKpiCard(s2, 6.7,  1.0, 3.0, 1.1, '불량유형 수',       `${byType.length}종`, NAVY)

  if (byType.length > 0) {
    s2.addText('불량유형별 파레토', { x: 0.2, y: 2.3, w: 9.5, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
    const rows = [
      [hdr('불량유형', 'left'), hdr('공정구분'), hdr('불량수량'), hdr('비중'), hdr('누적비율'), hdr('로스비용')],
      ...byType.slice(0, 8).map((t, i) => {
        const lc = t.loss_cost > 0 ? Math.round(t.loss_cost/10000).toLocaleString() + '만원' : '-'
        const f  = altFill(i)
        return [
          cell(t.defect_type, { bold: true, fill: f }),
          cell(t.inspect_type, { fill: f }),
          cell(t.defect_qty.toLocaleString(), { align: 'right', bold: true, color: RED, fill: f }),
          cell(`${t.share_pct}%`, { align: 'right', bold: true, color: t.cumulative_rate <= 80 ? RED : AMBER, fill: f }),
          cell(`${t.cumulative_rate}%`, { align: 'right', color: G400, fill: f }),
          cell(lc, { align: 'right', bold: t.loss_cost > 0, color: t.loss_cost > 0 ? RED : G400, fill: f }),
        ]
      }),
    ]
    s2.addTable(rows, { x: 0.2, y: 2.65, w: 9.6, colW: [2.6, 1.6, 1.6, 1.2, 1.3, 1.3] })
  } else {
    s2.addText('이 기간 불량 등록 없음', { x: 0.2, y: 2.5, w: 9.5, h: 0.5, fontSize: 13, color: G400, fontFace: 'Arial', align: 'center', isTextBox: true })
  }

  // ── Slide 3: 입고검사 불합격 ─────────────────────────────────────
  const s3 = addContentSlide(pres, 'P4 — 입고검사 불합격 현황', monthLabel)
  const passRate = insp.pass_rate
  addKpiCard(s3, 0.2,  1.0, 2.9, 1.1, '전체 검사건수', `${insp.total_count || 0}건`, NAVY)
  addKpiCard(s3, 3.35, 1.0, 2.9, 1.1, '불합격 건수',   `${insp.fail_count  || 0}건`, (insp.fail_count || 0) === 0 ? GREEN : RED)
  addKpiCard(s3, 6.5,  1.0, 3.1, 1.1, '입고 합격률',   passRate != null ? `${passRate}%` : '-',
    passRate == null ? G400 : passRate >= 95 ? GREEN : passRate >= 90 ? AMBER : RED, '목표: 95% 이상')

  const failPartners = insp.fail_by_partner || []
  if (failPartners.length > 0) {
    s3.addText('협력사별 불합격 현황 (외주처 개선요청 대상)', { x: 0.2, y: 2.3, w: 9.5, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
    const rows = [
      [hdr('협력사', 'left'), hdr('불합격건수'), hdr('불합격수량'), hdr('불량 내용', 'left')],
      ...failPartners.slice(0, 10).map((p, i) => {
        const notes = (p.defect_notes || []).slice(0,2).join(' / ') || '-'
        const f = altFill(i)
        return [
          cell(p.partner_name, { bold: true, fill: f }),
          cell(`${p.fail_count}건`, { align: 'center', bold: true, color: RED, fill: f }),
          cell((p.total_fail_qty || 0).toLocaleString(), { align: 'right', fill: f }),
          cell(notes, { fill: f }),
        ]
      }),
    ]
    s3.addTable(rows, { x: 0.2, y: 2.65, w: 9.6, colW: [2.8, 1.6, 1.8, 3.4] })
  } else {
    s3.addText('불합격 없음 — 모든 입고검사 합격', { x: 0.2, y: 2.5, w: 9.5, h: 0.5, fontSize: 13, color: GREEN, fontFace: 'Arial', align: 'center', isTextBox: true })
  }

  // ── Slide 4: 클레임 현황 (고객 실패비용) ────────────────────────
  const s4 = addContentSlide(pres, 'P6 — 클레임 현황 (고객 실패비용)', monthLabel)
  const totalClm = clm.total || 0
  addKpiCard(s4, 0.2, 1.0, 3.0, 1.1, '총 클레임', `${totalClm}건`, totalClm === 0 ? GREEN : RED)

  const statusEntries = Object.entries(clm.by_status || {})
  if (statusEntries.length > 0) {
    const sW = Math.min(9.0 / statusEntries.length - 0.15, 2.8)
    const startX = 3.5
    statusEntries.forEach(([st, cnt], i) => {
      const col = st === '완료' ? GREEN : st === '접수' ? BLUE : AMBER
      addKpiCard(s4, startX + i * (sW + 0.15), 1.0, sW, 1.1, st, `${cnt}건`, col)
    })
  }

  const byCustomer = clm.by_customer || []
  if (byCustomer.length > 0) {
    s4.addText('고객사별 클레임 현황', { x: 0.2, y: 2.3, w: 9.5, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
    const rows = [
      [hdr('고객사', 'left'), hdr('클레임수'), hdr('처리현황', 'left')],
      ...byCustomer.slice(0, 12).map((c, i) => {
        const stSummary = Object.entries(c.status_map || {}).map(([st,n]) => `${st} ${n}건`).join(' / ')
        const f = altFill(i)
        return [
          cell(c.partner_name, { bold: true, fill: f }),
          cell(`${c.count}건`, { align: 'center', bold: true, color: RED, fill: f }),
          cell(stSummary || '-', { fill: f }),
        ]
      }),
    ]
    s4.addTable(rows, { x: 0.2, y: 2.65, w: 9.6, colW: [3.5, 1.6, 4.5] })
  } else {
    s4.addText('이 기간 클레임 없음', { x: 0.2, y: 2.5, w: 9.5, h: 0.5, fontSize: 13, color: GREEN, fontFace: 'Arial', align: 'center', isTextBox: true })
  }

  // ── Slide 5: PPM 지수 + 3개월 추이 ──────────────────────────────
  const ppm = vda?.ppm_data
  const trend = vda?.trend || []
  if (ppm || trend.length > 0) {
    const s5ppm = addContentSlide(pres, 'PPM 지수 / 월별 품질 추이', monthLabel)
    if (ppm) {
      addKpiCard(s5ppm, 0.2,  1.0, 2.9, 1.1, '총 출하수량', `${(ppm.total_ship_qty||0).toLocaleString()} EA`, NAVY)
      addKpiCard(s5ppm, 3.35, 1.0, 2.9, 1.1, '출하불량 PPM',
        ppm.outgoing_ppm != null ? ppm.outgoing_ppm.toLocaleString() : '-',
        ppm.outgoing_ppm > 100 ? RED : ppm.outgoing_ppm > 0 ? AMBER : GREEN, '목표: 100 PPM 이하')
      addKpiCard(s5ppm, 6.5,  1.0, 3.1, 1.1, '클레임 건수', `${ppm.claim_count || 0}건`,
        ppm.claim_count > 0 ? RED : GREEN, '고객 실패비용')
    }
    if (trend.length > 0) {
      s5ppm.addText('3개월 품질 추이', { x: 0.2, y: 2.3, w: 9.5, h: 0.28, fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
      const tRows = [
        [hdr('월'), hdr('불량수량'), hdr('출하수량'), hdr('불량률'), hdr('PPM'), hdr('클레임'), hdr('불합격검사')],
        ...trend.map((t, i) => {
          const ppmVal = t.ppm || 0
          const ppmColor = ppmVal > 100 ? RED : ppmVal > 0 ? AMBER : GREEN
          const f = i === trend.length - 1 ? 'E8F4FD' : altFill(i)
          const bold = i === trend.length - 1
          return [
            cell(t.label, { bold, fill: f }),
            cell((t.defect_qty||0).toLocaleString(), { align: 'right', fill: f }),
            cell((t.ship_qty||0).toLocaleString(), { align: 'right', fill: f }),
            cell(`${t.defect_rate_pct}%`, { align: 'right', fill: f }),
            cell(ppmVal.toLocaleString(), { align: 'right', bold: true, color: ppmColor, fill: f }),
            cell(`${t.claim_count}건`, { align: 'right', color: t.claim_count > 0 ? RED : G400, fill: f }),
            cell(`${t.fail_inspection}건`, { align: 'right', color: t.fail_inspection > 0 ? AMBER : G400, fill: f }),
          ]
        }),
      ]
      s5ppm.addTable(tRows, { x: 0.2, y: 2.62, w: 9.6, colW: [1.6, 1.4, 1.4, 1.1, 1.3, 1.1, 1.7] })
    }
  }

  // ── Slide 7: ERP 자동진단 ────────────────────────────────────────
  if (insights.length > 0) {
    const s5 = addContentSlide(pres, 'ERP 자동진단 — 워스트/베스트 & 개선사항', monthLabel)
    insights.slice(0, 5).forEach((ins, i) => {
      const col  = ins.level === 'critical' ? RED : ins.level === 'warn' ? AMBER : BLUE
      const lbl  = ins.level === 'critical' ? '긴급' : ins.level === 'warn' ? '주의' : '정보'
      const yPos = 1.0 + i * 0.9
      s5.addShape('rect', { x: 0.2, y: yPos, w: 9.6, h: 0.78, fill: { color: G50 }, line: { color: col, width: 2 } })
      s5.addShape('rect', { x: 0.2, y: yPos, w: 0.1, h: 0.78, fill: { color: col } })
      s5.addText(lbl, {
        x: 0.4, y: yPos + 0.06, w: 0.7, h: 0.22,
        fontSize: 8, color: WHITE, fontFace: 'Arial', bold: true, fill: { color: col }, align: 'center', isTextBox: true,
      })
      s5.addText(`[${ins.category}] ${ins.title}`, {
        x: 1.2, y: yPos + 0.05, w: 8.4, h: 0.26,
        fontSize: 11, color: col, fontFace: 'Arial', bold: true, isTextBox: true,
      })
      s5.addText(`${ins.detail}  |  💡 ${ins.suggestion}`, {
        x: 1.2, y: yPos + 0.35, w: 8.4, h: 0.32,
        fontSize: 9, color: G700, fontFace: 'Arial', isTextBox: true,
      })
    })
  }

  // ── Slide 8: 개선방향 (사용자 작성용 빈 양식) ───────────────────
  const s6 = addContentSlide(pres, '차월 개선방향 (담당자 작성)', monthLabel)
  const sections = ['공정불량 개선방향', '입고검사 불합격 외주처 조치', '클레임 고객 실패비용 개선', '수입검사 강화 방안']
  sections.forEach((title, i) => {
    const yPos = 1.0 + i * 1.1
    s6.addShape('rect', { x: 0.2, y: yPos, w: 9.6, h: 0.95, fill: { color: G50 }, line: { color: G200, width: 1 } })
    s6.addText(title, { x: 0.35, y: yPos + 0.07, w: 3.0, h: 0.25, fontSize: 10, color: NAVY, fontFace: 'Arial', bold: true, isTextBox: true })
    s6.addText('[ 담당자 작성 ] :', { x: 0.35, y: yPos + 0.38, w: 9.0, h: 0.45, fontSize: 9, color: G400, fontFace: 'Arial', isTextBox: true })
  })

  pres.writeFile({ fileName: `품질_VDA63_보고서_${monthLabel}.pptx` })
}

// ════════════════════════════════════════════════════════════════════
// PURCHASE REPORT
// ════════════════════════════════════════════════════════════════════
export function downloadPurchaseReport(data, reportData, monthLabel) {
  const pres = newPres()
  addCoverSlide(pres, '자재구매 KPI 보고서', monthLabel)

  // ── Slide 2: KPI 현황 ────────────────────────────────────────────
  const s2 = addContentSlide(pres, '월 자재구매 KPI 현황', monthLabel)

  if (data) {
    addKpiCard(s2, 0.2,  1.0, 2.9, 1.1, '월 구매 목표', fmtKRW(data.target_amount), NAVY)
    addKpiCard(s2, 3.35, 1.0, 2.9, 1.1, '현재 구매액', fmtKRW(data.current_amount), GREEN,
      data.target_amount > 0 ? `목표 대비 ${Math.round((data.current_amount || 0) / data.target_amount * 100)}%` : '')
    addKpiCard(s2, 6.5,  1.0, 3.1, 1.1, '월말 예상액', fmtKRW(data.final_amount ?? data.current_amount),
      (data.final_amount || data.current_amount || 0) > (data.target_amount || 0) ? RED : NAVY, '예상 월말 금액')

    if (data.target_amount > 0) {
      s2.addText('목표 대비 현황', { x: 0.2, y: 2.3, w: 9.5, h: 0.3, fontSize: 13, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
      const curR = Math.round((data.current_amount || 0) / data.target_amount * 100)
      addProgressBar(s2, 0.2, 2.68, 9.5, `현재 집행률 (목표: ${fmtKRW(data.target_amount)})`, curR,
        curR <= 90 ? GREEN : curR <= 100 ? AMBER : RED)
      if (data.final_amount != null) {
        const finR = Math.round(data.final_amount / data.target_amount * 100)
        addProgressBar(s2, 0.2, 3.22, 9.5, '월말 예상률', finR, finR <= 100 ? GREEN : RED)
      }
    }

    if (reportData?.overdue_count != null) {
      addKpiCard(s2, 0.2, 3.9, 2.9, 0.95, '발주 건수', `${data.order_count ?? '-'}건`, BLUE)
      addKpiCard(s2, 3.35, 3.9, 2.9, 0.95, '거래 협력사', `${data.supplier_count ?? '-'}사`, BLUE)
      addKpiCard(s2, 6.5, 3.9, 3.1, 0.95, '미납 발주', `${reportData.overdue_count}건`,
        reportData.overdue_count > 0 ? RED : GREEN, '납기 초과 미입고')
    } else if (data.order_count != null || data.supplier_count != null) {
      addKpiCard(s2, 0.2, 3.9, 4.5, 0.95, '발주 건수', `${data.order_count ?? '-'}건`, BLUE)
      addKpiCard(s2, 5.0, 3.9, 4.5, 0.95, '거래 협력사', `${data.supplier_count ?? '-'}사`, BLUE)
    }
  }

  // ── Slide 3: 협력사별 구매 현황 ──────────────────────────────────
  if (data?.by_supplier?.length > 0) {
    const s3 = addContentSlide(pres, '협력사별 구매 현황 TOP 10', monthLabel)
    const rows = [
      [hdr('협력사', 'left'), hdr('구매액'), hdr('비중'), hdr('발주건')],
      ...data.by_supplier.slice(0, 10).map((s, i) => {
        const f = altFill(i)
        return [
          cell(s.name || s.partner_id, { fill: f }),
          cell(fmtKRW(s.amount), { align: 'right', fill: f }),
          cell(s.ratio != null ? `${s.ratio}%` : '-', { align: 'center', fill: f }),
          cell(s.order_count ?? '-', { align: 'center', fill: f }),
        ]
      }),
    ]
    s3.addTable(rows, { x: 0.3, y: 1.05, w: 9.4, colW: [4.2, 2.5, 1.8, 0.9] })
  }

  // ── Slide 4: 미납/지연 발주 현황 ────────────────────────────────
  if (reportData) {
    const s4 = addContentSlide(pres, '미납/지연 발주 현황 — 납기 초과 오픈 PO', monthLabel)
    addKpiCard(s4, 0.2, 1.0, 3.0, 1.0, '지연 발주 건수', `${reportData.overdue_count}건`,
      reportData.overdue_count > 0 ? RED : GREEN, '납기일 초과 미완료')

    const otd = reportData.otd_summary || {}
    if (otd.overall_rate != null) {
      addKpiCard(s4, 3.45, 1.0, 3.0, 1.0, '당월 납기준수율', `${otd.overall_rate}%`,
        otd.overall_rate >= 90 ? GREEN : otd.overall_rate >= 70 ? AMBER : RED, '완료 발주 기준')
      addKpiCard(s4, 6.7, 1.0, 3.0, 1.0, '완료 발주', `${otd.total_closed}건`,
        NAVY, `납기준수 ${otd.total_on_time}건`)
    }

    const overdue = reportData.overdue_list || []
    if (overdue.length > 0) {
      s4.addText('지연 발주 목록', { x: 0.2, y: 2.25, w: 9.5, h: 0.28, fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
      const rows = [
        [hdr('협력사', 'left'), hdr('품번', 'left'), hdr('품명', 'left'), hdr('납기일'), hdr('지연일수'), hdr('발주량'), hdr('미입고')],
        ...overdue.slice(0, 10).map((po, i) => {
          const dColor = po.days_late >= 14 ? RED : AMBER
          const f = altFill(i)
          return [
            cell(po.partner_name, { bold: true, fill: f }),
            cell(po.part_no, { fill: f }),
            cell(po.part_name, { fill: f }),
            cell(po.due_date, { align: 'center', color: RED, fill: f }),
            cell(`${po.days_late}일`, { align: 'center', bold: true, color: dColor, fill: f }),
            cell((po.order_qty || 0).toLocaleString(), { align: 'right', fill: f }),
            cell((po.remain_qty || 0).toLocaleString(), { align: 'right', bold: true, color: RED, fill: f }),
          ]
        }),
      ]
      s4.addTable(rows, { x: 0.2, y: 2.58, w: 9.6, colW: [1.8, 1.0, 2.0, 1.1, 0.9, 1.0, 1.0] })
    } else {
      s4.addText('미납 발주 없음 — 모든 발주 납기 준수', { x: 0.2, y: 2.5, w: 9.5, h: 0.5, fontSize: 13, color: GREEN, fontFace: 'Arial', align: 'center', isTextBox: true })
    }
  }

  // ── Slide 5: 협력사 납기준수율 + 단가 변동 ───────────────────────
  if (reportData?.delivery_rate?.length > 0 || reportData?.price_changes?.length > 0) {
    const s5 = addContentSlide(pres, '협력사 납기준수율 / 단가 변동 분석', monthLabel)

    if (reportData.delivery_rate?.length > 0) {
      s5.addText('협력사 납기준수율 (당월)', { x: 0.2, y: 1.0, w: 4.5, h: 0.28, fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
      const rRows = [
        [hdr('협력사', 'left'), hdr('완료건'), hdr('납기준수'), hdr('지연'), hdr('준수율')],
        ...reportData.delivery_rate.slice(0, 8).map((d, i) => {
          const oc = d.rate_pct >= 90 ? GREEN : d.rate_pct >= 70 ? AMBER : RED
          const f = altFill(i)
          return [
            cell(d.partner_name, { bold: true, fill: f }),
            cell(`${d.total}건`, { align: 'center', fill: f }),
            cell(`${d.on_time}건`, { align: 'center', color: GREEN, fill: f }),
            cell(`${d.late}건`, { align: 'center', color: d.late > 0 ? RED : G400, fill: f }),
            cell(`${d.rate_pct}%`, { align: 'center', bold: true, color: oc, fill: f }),
          ]
        }),
      ]
      s5.addTable(rRows, { x: 0.2, y: 1.32, w: 4.6, colW: [1.5, 0.75, 0.75, 0.75, 0.85] })
    }

    if (reportData.price_changes?.length > 0) {
      s5.addText('전월 대비 단가 변동 (1% 이상)', { x: 5.0, y: 1.0, w: 4.6, h: 0.28, fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
      const pRows = [
        [hdr('품번', 'left'), hdr('품명', 'left'), hdr('전월'), hdr('당월'), hdr('변동률')],
        ...reportData.price_changes.slice(0, 8).map((p, i) => {
          const up = p.change_pct > 0
          const f = altFill(i)
          return [
            cell(p.part_no, { fill: f }),
            cell(p.part_name, { fill: f }),
            cell(`${(p.prev_price||0).toLocaleString()}`, { align: 'right', fill: f }),
            cell(`${(p.cur_price||0).toLocaleString()}`, { align: 'right', fill: f }),
            cell(`${up ? '▲' : '▼'} ${Math.abs(p.change_pct)}%`, { align: 'right', bold: true, color: up ? RED : GREEN, fill: f }),
          ]
        }),
      ]
      s5.addTable(pRows, { x: 5.0, y: 1.32, w: 4.6, colW: [0.9, 1.3, 0.9, 0.9, 0.6] })
    }
  }

  pres.writeFile({ fileName: `자재구매_KPI_보고서_${monthLabel}.pptx` })
}
