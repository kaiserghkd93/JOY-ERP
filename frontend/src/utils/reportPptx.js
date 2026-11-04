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
export function downloadProductionReport(plans, oee, kaizen, monthLabel) {
  const pres = newPres()
  addCoverSlide(pres, '생산 KPI 보고서', monthLabel)

  const totalPlan   = plans.reduce((s, p) => s + (p.planned_qty || 0), 0)
  const totalActual = plans.reduce((s, p) => s + (p.total_actual || 0), 0)
  const ar = totalPlan > 0 ? Math.round(totalActual / totalPlan * 100) : 0

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

  if (kaizen?.total > 0) {
    const s4 = addContentSlide(pres, '카이젠 과제 현황', monthLabel)
    const statuses = Object.entries(kaizen.by_status || {})
    if (statuses.length > 0) {
      const bW = Math.min(9.4 / statuses.length, 2.4) - 0.1
      const startX = 0.3 + (9.4 - statuses.length * (bW + 0.1)) / 2
      statuses.forEach(([st, cnt], i) => {
        const col = st === '완료' ? GREEN : st === '진행중' ? BLUE : st === '보류' ? AMBER : G400
        addKpiCard(s4, startX + i * (bW + 0.1), 1.1, bW, 1.1, st, `${cnt}건`, col)
      })
    }
    if (kaizen.overdue > 0) {
      s4.addText(`⚠ 기한초과 과제: ${kaizen.overdue}건`, {
        x: 0.3, y: 2.4, w: 9.5, h: 0.4, fontSize: 14, color: RED, fontFace: 'Arial', bold: true, isTextBox: true,
      })
    }
    s4.addText(`전체 ${kaizen.total}건  /  완료율 ${kaizen.completion_rate ?? 0}%`, {
      x: 0.3, y: kaizen.overdue > 0 ? 2.9 : 2.4, w: 9.5, h: 0.3, fontSize: 11, color: G400, fontFace: 'Arial', isTextBox: true,
    })
    addProgressBar(s4, 0.3, kaizen.overdue > 0 ? 3.3 : 2.85, 9.5, '카이젠 완료율', kaizen.completion_rate ?? 0, GREEN)
  }

  pres.writeFile({ fileName: `생산_KPI_보고서_${monthLabel}.pptx` })
}

// ════════════════════════════════════════════════════════════════════
// QUALITY REPORT
// ════════════════════════════════════════════════════════════════════
export function downloadQualityReport(summary, defectRate, monthLabel) {
  const pres = newPres()
  addCoverSlide(pres, '품질 KPI 보고서', monthLabel)

  const s2 = addContentSlide(pres, '품질 KPI 현황', monthLabel)

  if (summary) {
    const cards = [
      { label: '전체 클레임', value: `${summary.claims?.total ?? 0}건`, color: NAVY },
      { label: '처리중', value: `${(summary.claims?.total ?? 0) - (summary.claims?.completed ?? 0)}건`, color: AMBER },
      { label: '완료', value: `${summary.claims?.completed ?? 0}건`, color: GREEN },
    ]
    if (summary.incoming?.pass_rate != null)
      cards.push({ label: '수입검사 합격률', value: `${summary.incoming.pass_rate}%`, color: summary.incoming.pass_rate >= 95 ? GREEN : AMBER, sub: `${summary.incoming.total}건` })
    if (summary.defect?.rate != null)
      cards.push({ label: '공정불량률', value: `${summary.defect.rate}%`, color: summary.defect.rate <= 1 ? GREEN : summary.defect.rate <= 3 ? AMBER : RED, sub: '목표 ≤ 1.0%' })

    const n = Math.min(cards.length, 5)
    const cW = 9.5 / n - 0.1
    cards.slice(0, n).forEach((c, i) => {
      addKpiCard(s2, 0.25 + i * (cW + 0.1), 1.0, cW, 1.1, c.label, c.value, c.color, c.sub)
    })

    if (summary.claims?.by_status) {
      s2.addText('클레임 처리 현황', { x: 0.2, y: 2.3, w: 9.5, h: 0.3, fontSize: 13, bold: true, color: NAVY, fontFace: 'Arial', isTextBox: true })
      const sts = Object.entries(summary.claims.by_status)
      const sW = 9.4 / sts.length - 0.1
      sts.forEach(([st, cnt], i) => {
        const col = st === '완료' ? GREEN : st === '접수' ? BLUE : st === '조사중' ? AMBER : G400
        addKpiCard(s2, 0.2 + i * (sW + 0.1), 2.7, sW, 1.0, st, `${cnt}건`, col)
      })
    }
  }

  if (defectRate?.length > 0) {
    const s3 = addContentSlide(pres, '협력사별 불량률 현황', monthLabel)
    const rows = [
      [hdr('협력사', 'left'), hdr('검사수량'), hdr('불량수량'), hdr('불량률'), hdr('평가')],
      ...defectRate.slice(0, 14).map((r, i) => {
        const rate = r.defect_rate || 0
        const ev = rate <= 1 ? '우수' : rate <= 3 ? '보통' : '주의'
        const ec = rate <= 1 ? GREEN : rate <= 3 ? AMBER : RED
        const f = altFill(i)
        return [
          cell(r.partner_name || r.partner_id, { fill: f }),
          cell((r.total_qty || 0).toLocaleString(), { align: 'right', fill: f }),
          cell((r.defect_qty || 0).toLocaleString(), { align: 'right', fill: f }),
          cell(`${rate.toFixed(2)}%`, { align: 'right', bold: true, color: ec, fill: f }),
          cell(ev, { align: 'center', bold: true, color: ec, fill: f }),
        ]
      }),
    ]
    s3.addTable(rows, { x: 0.3, y: 1.05, w: 9.4, colW: [3.2, 1.9, 1.9, 1.5, 0.9] })
  }

  pres.writeFile({ fileName: `품질_KPI_보고서_${monthLabel}.pptx` })
}

// ════════════════════════════════════════════════════════════════════
// PURCHASE REPORT
// ════════════════════════════════════════════════════════════════════
export function downloadPurchaseReport(data, monthLabel) {
  const pres = newPres()
  addCoverSlide(pres, '자재구매 KPI 보고서', monthLabel)

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

    if (data.order_count != null || data.supplier_count != null) {
      addKpiCard(s2, 0.2, 3.8, 4.5, 0.95, '발주 건수', `${data.order_count ?? '-'}건`, BLUE)
      addKpiCard(s2, 5.0, 3.8, 4.5, 0.95, '거래 협력사', `${data.supplier_count ?? '-'}사`, BLUE)
    }
  }

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

  pres.writeFile({ fileName: `자재구매_KPI_보고서_${monthLabel}.pptx` })
}
