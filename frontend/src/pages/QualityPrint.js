/**
 * 품질 문서 PDF 출력 유틸리티
 * ISO 9001 / IATF 16949 / AIAG 양식 기반
 */

const COMPANY = '조이산업(주)'
const today = () => new Date().toLocaleDateString('ko-KR')

function openPrint(html) {
  const w = window.open('', '_blank', 'width=1200,height=900')
  w.document.write(html)
  w.document.close()
  w.onload = () => { w.focus(); w.print() }
}

const BASE_CSS = `
  @page { margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', Arial, sans-serif; font-size: 9pt; color: #000; background: #fff; }
  h1 { text-align: center; font-size: 14pt; font-weight: 900; letter-spacing: 4px; padding: 6px 0; border: 2.5px solid #000; margin-bottom: 0; }
  .header-box { display: grid; border: 1px solid #000; border-top: none; }
  .header-row { display: grid; border-bottom: 1px solid #000; }
  .header-row:last-child { border-bottom: none; }
  .hc { padding: 4px 8px; border-right: 1px solid #000; }
  .hc:last-child { border-right: none; }
  .hc-label { font-size: 7pt; color: #555; margin-bottom: 1px; }
  .hc-val { font-size: 9pt; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #d9d9d9; font-size: 8pt; padding: 5px 4px; border: 1px solid #000; text-align: center; font-weight: 700; word-break: keep-all; }
  td { font-size: 8pt; padding: 4px 4px; border: 1px solid #000; vertical-align: middle; }
  .center { text-align: center; }
  .right { text-align: right; }
  .kpc { color: #cc0000; font-weight: 700; }
  .kcc { color: #cc6600; font-weight: 700; }
  .badge-red { background: #fee2e2; color: #991b1b; padding: 1px 6px; border-radius: 3px; font-size: 7.5pt; }
  .badge-amber { background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 3px; font-size: 7.5pt; }
  .badge-green { background: #dcfce7; color: #166534; padding: 1px 6px; border-radius: 3px; font-size: 7.5pt; }
  .footer { margin-top: 16px; display: flex; justify-content: space-between; font-size: 7.5pt; color: #555; border-top: 1px solid #ccc; padding-top: 6px; }
  .sign-row { display: flex; gap: 20px; margin-top: 16px; }
  .sign-box { flex: 1; border: 1px solid #000; padding: 8px 12px; min-height: 50px; }
  .sign-title { font-size: 8pt; color: #555; margin-bottom: 20px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`

// ── 1. 관리계획서 (Control Plan) ─────────────────────────────────
export function printControlPlan(plan) {
  if (!plan) return
  const items = plan.items || []
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>관리계획서 ${plan.cp_no}</title>
<style>
  ${BASE_CSS}
  @page { size: A4 landscape; }
  .header-row { grid-template-columns: 1fr 2fr 1fr 1fr; }
</style></head><body>
<h1>관 리 계 획 서 &nbsp; CONTROL PLAN</h1>
<div class="header-box">
  <div class="header-row" style="grid-template-columns:1fr 2fr 1fr 1fr;">
    <div class="hc"><div class="hc-label">관리계획서 번호</div><div class="hc-val">${plan.cp_no}</div></div>
    <div class="hc"><div class="hc-label">품번 / 품명</div><div class="hc-val">${plan.part_no} / ${plan.part_name || ''}</div></div>
    <div class="hc"><div class="hc-label">Rev / 유형</div><div class="hc-val">Rev.${plan.revision} / ${plan.plan_type}</div></div>
    <div class="hc"><div class="hc-label">고객사</div><div class="hc-val">${plan.customer || '—'}</div></div>
  </div>
  <div class="header-row" style="grid-template-columns:1fr 1fr 1fr 1fr;">
    <div class="hc"><div class="hc-label">공급자 / 공장</div><div class="hc-val">${COMPANY}</div></div>
    <div class="hc"><div class="hc-label">적용일</div><div class="hc-val">${plan.effective_date || '—'}</div></div>
    <div class="hc"><div class="hc-label">작성자</div><div class="hc-val">${plan.created_by || '—'}</div></div>
    <div class="hc"><div class="hc-label">승인자 / 상태</div><div class="hc-val">${plan.approved_by || '—'} &nbsp; [${plan.status}]</div></div>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th rowspan="2" style="width:40px">공정<br>No.</th>
      <th rowspan="2">공정명 / 작업내용</th>
      <th rowspan="2">설비 / 기계</th>
      <th colspan="3">관리특성</th>
      <th rowspan="2">규격 / 공차</th>
      <th rowspan="2">측정·평가 방법</th>
      <th colspan="2">샘플링</th>
      <th rowspan="2">이상 반응계획</th>
    </tr>
    <tr>
      <th style="width:30px">No.</th>
      <th>특성명</th>
      <th style="width:55px">유형</th>
      <th style="width:50px">크기</th>
      <th style="width:70px">주기</th>
    </tr>
  </thead>
  <tbody>
    ${items.length === 0
      ? '<tr><td colspan="11" style="text-align:center;padding:20px">항목 없음</td></tr>'
      : items.map((it, i) => `
    <tr>
      <td class="center">${it.process_no || i + 1}</td>
      <td>${it.process_name}${it.operation ? `<br><span style="font-size:7.5pt;color:#666">${it.operation}</span>` : ''}</td>
      <td>${it.machine || '—'}</td>
      <td class="center">${i + 1}</td>
      <td class="${it.char_type === 'KPC' ? 'kpc' : it.char_type === 'KCC' ? 'kcc' : ''}" style="font-weight:600">${it.characteristic_name}</td>
      <td class="center">
        ${it.char_type === 'KPC' ? '<span class="kpc">▲ KPC</span>' : it.char_type === 'KCC' ? '<span class="kcc">◆ KCC</span>' : it.char_type === '특별특성' ? '★' : '—'}
      </td>
      <td class="center">
        ${it.spec_nominal != null ? it.spec_nominal : ''}${it.spec_upper != null ? ` +${it.spec_upper}` : ''}${it.spec_lower != null ? ` ${it.spec_lower}` : ''} ${it.unit || ''}
      </td>
      <td>${it.control_method || '—'}</td>
      <td class="center">${it.sample_size || '—'}</td>
      <td class="center">${it.sample_freq || '—'}</td>
      <td>${it.reaction_plan || '—'}</td>
    </tr>`).join('')}
  </tbody>
</table>
<div style="margin-top:6px;font-size:7.5pt;color:#555">
  ▲KPC: 핵심제품특성 (Key Product Characteristic) &nbsp;|&nbsp; ◆KCC: 핵심제조특성 (Key Control Characteristic) &nbsp;|&nbsp; ★: 특별특성
</div>
<div class="sign-row">
  <div class="sign-box"><div class="sign-title">작성자 서명</div></div>
  <div class="sign-box"><div class="sign-title">검토자 서명</div></div>
  <div class="sign-box"><div class="sign-title">승인자 서명</div></div>
  <div class="sign-box"><div class="sign-title">고객 승인 / 날짜</div></div>
</div>
<div class="footer">
  <span>${COMPANY} — 품질경영시스템 문서 (IATF 16949)</span>
  <span>출력일: ${today()}</span>
  <span>문서번호: ${plan.cp_no} &nbsp; Rev.${plan.revision}</span>
</div>
</body></html>`
  openPrint(html)
}

// ── 2. PFMEA ─────────────────────────────────────────────────────
export function printPfmea(pfmea) {
  if (!pfmea) return
  const items = pfmea.items || []
  const rpnColor = (v) => v >= 200 ? '#fee2e2' : v >= 100 ? '#fef3c7' : '#f0fdf4'
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>PFMEA ${pfmea.pfmea_no}</title>
<style>
  ${BASE_CSS}
  @page { size: A3 landscape; }
</style></head><body>
<h1>공정 고장형태 및 영향분석 &nbsp; PFMEA</h1>
<div class="header-box">
  <div class="header-row" style="display:grid;grid-template-columns:1fr 2fr 1fr 1fr 1fr;">
    <div class="hc"><div class="hc-label">PFMEA 번호</div><div class="hc-val">${pfmea.pfmea_no}</div></div>
    <div class="hc"><div class="hc-label">품번 / 품명</div><div class="hc-val">${pfmea.part_no} / ${pfmea.part_name || ''}</div></div>
    <div class="hc"><div class="hc-label">Rev</div><div class="hc-val">Rev.${pfmea.revision}</div></div>
    <div class="hc"><div class="hc-label">작성자</div><div class="hc-val">${pfmea.created_by || '—'}</div></div>
    <div class="hc"><div class="hc-label">출력일</div><div class="hc-val">${today()}</div></div>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th rowspan="2">공정<br>단계</th>
      <th rowspan="2">기능</th>
      <th rowspan="2">잠재적<br>고장형태</th>
      <th rowspan="2">잠재적<br>고장영향</th>
      <th rowspan="2" style="width:28px">S</th>
      <th rowspan="2">잠재적<br>고장원인</th>
      <th rowspan="2" style="width:28px">O</th>
      <th rowspan="2">현 예방/<br>검출관리</th>
      <th rowspan="2" style="width:28px">D</th>
      <th rowspan="2" style="width:38px">RPN</th>
      <th rowspan="2">권고 개선조치</th>
      <th rowspan="2">담당자/<br>목표일</th>
      <th colspan="4">조치결과</th>
    </tr>
    <tr>
      <th>실시조치</th><th style="width:28px">S'</th><th style="width:28px">O'</th><th style="width:28px">D'</th>
    </tr>
  </thead>
  <tbody>
    ${items.length === 0
      ? '<tr><td colspan="14" style="text-align:center;padding:16px">항목 없음</td></tr>'
      : items.map(it => `
    <tr style="background:${rpnColor(it.rpn)}">
      <td style="font-weight:600">${it.process_step}</td>
      <td>${it.function || '—'}</td>
      <td style="font-weight:600">${it.failure_mode}</td>
      <td>${it.failure_effect || '—'}</td>
      <td class="center" style="font-weight:700">${it.severity}</td>
      <td>${it.failure_cause || '—'}</td>
      <td class="center" style="font-weight:700">${it.occurrence}</td>
      <td>${it.current_control || '—'}</td>
      <td class="center" style="font-weight:700">${it.detection}</td>
      <td class="center" style="font-weight:700;font-size:10pt;background:${rpnColor(it.rpn)}">${it.rpn}</td>
      <td>${it.action_required || '—'}</td>
      <td style="font-size:7.5pt">${it.responsible || ''}${it.target_date ? '<br>' + it.target_date : ''}</td>
      <td>${it.action_taken || '—'}</td>
      <td class="center">${it.new_severity || '—'}</td>
      <td class="center">${it.new_occurrence || '—'}</td>
      <td class="center">${it.new_detection || '—'}</td>
    </tr>`).join('')}
  </tbody>
</table>
<div style="margin-top:8px;font-size:7.5pt;color:#555;display:flex;gap:20px">
  <span>심각도(S): 1~10 (10=가장 심각) &nbsp;|&nbsp; 발생도(O): 1~10 &nbsp;|&nbsp; 검출도(D): 1~10</span>
  <span>RPN &lt; 100: 정상 &nbsp;|&nbsp; 100~199: 주의 (노랑) &nbsp;|&nbsp; ≥ 200: 즉시 개선 (빨강)</span>
</div>
<div class="sign-row">
  <div class="sign-box"><div class="sign-title">작성자</div></div>
  <div class="sign-box"><div class="sign-title">검토자</div></div>
  <div class="sign-box"><div class="sign-title">승인자</div></div>
</div>
<div class="footer">
  <span>${COMPANY} — IATF 16949 / AIAG FMEA 4th Edition</span>
  <span>출력일: ${today()}</span>
  <span>${pfmea.pfmea_no} Rev.${pfmea.revision}</span>
</div>
</body></html>`
  openPrint(html)
}

// ── 3. 교정 성적서 (Calibration Certificate) ─────────────────────
export function printCalibrationCert(inst, history) {
  if (!inst) return
  const latest = history?.[0]
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>교정성적서 ${inst.instrument_no}</title>
<style>
  ${BASE_CSS}
  @page { size: A4 portrait; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #000; border-top: none; }
  .info-row { display: contents; }
  .info-label { background: #d9d9d9; padding: 5px 10px; font-weight: 700; font-size: 8.5pt; border-right: 1px solid #000; border-bottom: 1px solid #000; }
  .info-val { padding: 5px 10px; border-right: 1px solid #000; border-bottom: 1px solid #000; font-size: 9pt; }
</style></head><body>
<h1>측 정 기 교 정 성 적 서</h1>
<div class="header-box" style="border:1px solid #000;border-top:none;display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:none">
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">성적서 번호</div><div class="hc-val">${latest?.certificate_no || '—'}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">교정일</div><div class="hc-val">${latest?.calibrated_at || '—'}</div></div>
  <div class="hc" style="border-bottom:1px solid #000;border-right:none"><div class="hc-label">차기교정일</div><div class="hc-val">${latest?.next_due || '—'}</div></div>
</div>
<div class="info-grid">
  <div class="info-label">기기 관리번호</div><div class="info-val">${inst.instrument_no}</div>
  <div class="info-label">기기명</div><div class="info-val">${inst.name}</div>
  <div class="info-label">기기 유형</div><div class="info-val">${inst.instrument_type}</div>
  <div class="info-label">제조사 / 모델</div><div class="info-val">${inst.manufacturer || '—'} / ${inst.model_no || '—'}</div>
  <div class="info-label">시리얼번호</div><div class="info-val">${inst.serial_no || '—'}</div>
  <div class="info-label">보관위치</div><div class="info-val">${inst.location || '—'}</div>
  <div class="info-label">정확도 사양</div><div class="info-val">${inst.accuracy_spec || '—'}</div>
  <div class="info-label">교정주기</div><div class="info-val">${inst.calibration_interval}일</div>
  <div class="info-label">교정기관</div><div class="info-val">${latest?.agency || '—'}</div>
  <div class="info-label">교정자</div><div class="info-val">${latest?.calibrated_by || '—'}</div>
  <div class="info-label">판정 결과</div><div class="info-val" style="font-weight:700;color:${latest?.result === '합격' ? '#166534' : '#991b1b'}">${latest?.result || '—'}</div>
  <div class="info-label">다음 교정일</div><div class="info-val" style="font-weight:700">${latest?.next_due || '—'}</div>
</div>

<div style="margin-top:20px;border:1px solid #000;padding:12px;min-height:80px">
  <div style="font-weight:700;font-size:9pt;margin-bottom:8px">교정 결과 및 특이사항</div>
  <div style="font-size:9pt">${latest?.note || '특이사항 없음'}</div>
</div>

<div style="margin-top:16px">
  <div style="font-weight:700;font-size:9.5pt;margin-bottom:6px">교정 이력</div>
  <table>
    <thead><tr>
      <th>교정일</th><th>차기교정일</th><th>교정기관</th><th>교정자</th><th>성적서 번호</th><th>판정</th>
    </tr></thead>
    <tbody>
      ${(history || []).length === 0 ? '<tr><td colspan="6" style="text-align:center">이력 없음</td></tr>'
        : (history || []).map(h => `<tr>
          <td class="center">${h.calibrated_at}</td>
          <td class="center">${h.next_due}</td>
          <td>${h.agency || '—'}</td>
          <td>${h.calibrated_by || '—'}</td>
          <td class="center" style="font-family:monospace">${h.certificate_no || '—'}</td>
          <td class="center" style="font-weight:700;color:${h.result === '합격' ? '#166534' : '#991b1b'}">${h.result}</td>
        </tr>`).join('')}
    </tbody>
  </table>
</div>

<div class="sign-row" style="margin-top:24px">
  <div class="sign-box"><div class="sign-title">교정자 (서명)</div></div>
  <div class="sign-box"><div class="sign-title">검토자 (서명)</div></div>
  <div class="sign-box"><div class="sign-title">부서장 (서명)</div></div>
</div>
<div style="margin-top:8px;font-size:7.5pt;color:#555;border:1px solid #ccc;padding:8px">
  본 성적서는 KS A ISO/IEC 17025 교정절차에 따라 발행되었으며,
  표기된 교정유효기간 내에서만 사용이 보증됩니다.
</div>
<div class="footer">
  <span>${COMPANY} — 측정장비 관리절차 (KS A ISO/IEC 17025 / IATF 16949 §7.1.5)</span>
  <span>출력일: ${today()}</span>
</div>
</body></html>`
  openPrint(html)
}

// ── 4. 내부감사 보고서 ─────────────────────────────────────────────
export function printAuditReport(audit, findings) {
  if (!audit) return
  const statusColor = { '열림': '#fee2e2', '시정중': '#fef3c7', '완료': '#dcfce7', '효과확인': '#d1fae5' }
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>감사보고서 ${audit.audit_no}</title>
<style>
  ${BASE_CSS}
  @page { size: A4 portrait; }
</style></head><body>
<h1>내 부 감 사 보 고 서</h1>
<div class="header-box" style="border:1px solid #000;border-top:none;display:grid;grid-template-columns:1fr 1fr;border-bottom:none">
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">감사 번호</div><div class="hc-val">${audit.audit_no}</div></div>
  <div class="hc" style="border-bottom:1px solid #000;border-right:none"><div class="hc-label">감사 유형</div><div class="hc-val">${audit.audit_type}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">적용 기준</div><div class="hc-val">${audit.standard}</div></div>
  <div class="hc" style="border-bottom:1px solid #000;border-right:none"><div class="hc-label">감사일</div><div class="hc-val">${audit.audit_date}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">감사원</div><div class="hc-val">${audit.auditor}</div></div>
  <div class="hc" style="border-bottom:1px solid #000;border-right:none"><div class="hc-label">피감사 부서 / 범위</div><div class="hc-val">${audit.auditee_dept || ''} ${audit.scope ? `/ ${audit.scope}` : ''}</div></div>
</div>

<div style="margin-top:12px">
  <div style="font-weight:700;font-size:10pt;margin-bottom:4px">▶ 지적사항 요약</div>
  <div style="display:flex;gap:12px;margin-bottom:8px;font-size:8.5pt">
    <span>총 지적: <strong>${(findings||[]).length}건</strong></span>
    <span>중대부적합: <strong style="color:#991b1b">${(findings||[]).filter(f=>f.finding_type==='중대부적합').length}건</strong></span>
    <span>경미부적합: <strong style="color:#92400e">${(findings||[]).filter(f=>f.finding_type==='경미부적합').length}건</strong></span>
    <span>관찰사항: <strong style="color:#1e40af">${(findings||[]).filter(f=>f.finding_type==='관찰사항').length}건</strong></span>
    <span>강점: <strong style="color:#166534">${(findings||[]).filter(f=>f.finding_type==='강점').length}건</strong></span>
    <span>미결: <strong style="color:#dc2626">${(findings||[]).filter(f=>f.status==='열림'||f.status==='시정중').length}건</strong></span>
  </div>
  <table>
    <thead><tr>
      <th style="width:55px">조항번호</th>
      <th>조항명</th>
      <th style="width:65px">유형</th>
      <th>지적내용</th>
      <th>시정조치</th>
      <th style="width:55px">기한</th>
      <th style="width:55px">상태</th>
    </tr></thead>
    <tbody>
      ${(findings||[]).length === 0 ? '<tr><td colspan="7" style="text-align:center">지적사항 없음</td></tr>'
        : (findings||[]).map((f, i) => `<tr style="background:${statusColor[f.status] || '#fff'}">
          <td class="center" style="font-family:monospace;font-size:8pt">${f.clause_no || '—'}</td>
          <td style="font-size:7.5pt">${f.clause_title || '—'}</td>
          <td class="center"><span class="${f.finding_type==='중대부적합'?'badge-red':f.finding_type==='경미부적합'?'badge-amber':f.finding_type==='강점'?'badge-green':'badge-amber'}">${f.finding_type}</span></td>
          <td>${f.description}</td>
          <td style="font-size:7.5pt">${f.corrective_action || '—'}</td>
          <td class="center" style="font-size:7.5pt">${f.due_date || '—'}</td>
          <td class="center"><span class="${f.status==='효과확인'||f.status==='완료'?'badge-green':f.status==='시정중'?'badge-amber':'badge-red'}">${f.status}</span></td>
        </tr>`).join('')}
    </tbody>
  </table>
</div>

${(findings||[]).filter(f=>f.root_cause||f.corrective_action).length > 0 ? `
<div style="margin-top:16px">
  <div style="font-weight:700;font-size:10pt;margin-bottom:4px">▶ 시정조치 상세</div>
  ${(findings||[]).filter(f=>f.root_cause||f.corrective_action).map((f, i) => `
  <div style="border:1px solid #000;margin-bottom:8px;font-size:8.5pt">
    <div style="background:#d9d9d9;padding:4px 8px;font-weight:700">${i+1}. ${f.finding_type} — ${f.clause_no || ''} ${f.clause_title || ''}</div>
    <div style="padding:6px 10px">
      <div><strong>지적내용:</strong> ${f.description}</div>
      ${f.root_cause ? `<div><strong>근본원인:</strong> ${f.root_cause}</div>` : ''}
      ${f.corrective_action ? `<div><strong>시정조치:</strong> ${f.corrective_action}</div>` : ''}
      ${f.effectiveness_result ? `<div><strong>효과검증:</strong> ${f.effectiveness_result}</div>` : ''}
    </div>
  </div>`).join('')}
</div>` : ''}

<div class="sign-row">
  <div class="sign-box"><div class="sign-title">감사원 (서명)</div></div>
  <div class="sign-box"><div class="sign-title">피감사 부서장 (서명)</div></div>
  <div class="sign-box"><div class="sign-title">품질책임자 (서명)</div></div>
</div>
<div class="footer">
  <span>${COMPANY} — 내부감사 절차 (IATF 16949 §9.2 / ISO 9001 §9.2)</span>
  <span>출력일: ${today()}</span>
  <span>${audit.audit_no}</span>
</div>
</body></html>`
  openPrint(html)
}

// ── 5. PPAP 체크리스트 ────────────────────────────────────────────
export function printPpap(ppap) {
  if (!ppap) return
  const elements = ppap.elements || []
  const completed = elements.filter(e => e.status === '완료').length
  const active = elements.filter(e => e.status !== '해당없음').length
  const statusColor = { '준비중': '#fef3c7', '완료': '#dcfce7', '거절': '#fee2e2', '해당없음': '#f3f4f6' }
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>PPAP ${ppap.ppap_no}</title>
<style>
  ${BASE_CSS}
  @page { size: A4 portrait; }
</style></head><body>
<h1>PPAP 부품승인 제출 체크리스트</h1>
<div class="header-box" style="border:1px solid #000;border-top:none;display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:none">
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">PPAP 번호</div><div class="hc-val">${ppap.ppap_no}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">품번 / 품명</div><div class="hc-val">${ppap.part_no} / ${ppap.part_name || ''}</div></div>
  <div class="hc" style="border-bottom:1px solid #000;border-right:none"><div class="hc-label">제출 레벨</div><div class="hc-val">Level ${ppap.submission_level}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">고객사</div><div class="hc-val">${ppap.customer || '—'}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">변경 사유</div><div class="hc-val">${ppap.reason || '—'}</div></div>
  <div class="hc" style="border-bottom:1px solid #000;border-right:none"><div class="hc-label">상태</div><div class="hc-val" style="font-weight:700">${ppap.status}</div></div>
</div>

<div style="margin:10px 0;font-size:9pt">
  진행률: <strong>${completed} / ${active}</strong>개 완료
  <span style="display:inline-block;width:200px;height:10px;background:#e5e7eb;border-radius:5px;vertical-align:middle;margin-left:8px">
    <span style="display:block;width:${active > 0 ? Math.round(completed/active*100) : 0}%;height:100%;background:${completed===active&&active>0?'#16a34a':'#2563eb'};border-radius:5px"></span>
  </span>
</div>

<table>
  <thead><tr>
    <th style="width:40px">번호</th>
    <th>요구사항 (PPAP 요소)</th>
    <th style="width:70px">상태</th>
    <th>비고</th>
  </tr></thead>
  <tbody>
    ${elements.map(e => `<tr style="background:${statusColor[e.status] || '#fff'}">
      <td class="center" style="font-weight:700">${e.element_no}</td>
      <td>${e.element_name}</td>
      <td class="center">
        <span class="${e.status==='완료'?'badge-green':e.status==='거절'?'badge-red':e.status==='해당없음'?'':''}">${e.status}</span>
      </td>
      <td>${e.note || ''}</td>
    </tr>`).join('')}
  </tbody>
</table>

<div class="sign-row" style="margin-top:20px">
  <div class="sign-box"><div class="sign-title">공급자 대표 (서명 / 날짜)</div></div>
  <div class="sign-box"><div class="sign-title">고객 품질 승인 (서명 / 날짜)</div></div>
  <div class="sign-box"><div class="sign-title">고객 엔지니어링 승인 (서명 / 날짜)</div></div>
</div>
<div class="footer">
  <span>${COMPANY} — PPAP 4th Edition (AIAG) / IATF 16949 §8.3.4.4</span>
  <span>출력일: ${today()}</span>
  <span>${ppap.ppap_no}</span>
</div>
</body></html>`
  openPrint(html)
}

// ── 6. MSA 연구 보고서 ────────────────────────────────────────────
export function printMsaReport(study) {
  if (!study) return
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>MSA ${study.study_no}</title>
<style>
  ${BASE_CSS}
  @page { size: A4 portrait; }
  .result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #000; margin-top: 12px; }
  .rg-label { background: #d9d9d9; padding: 5px 10px; font-weight: 700; border-right: 1px solid #000; border-bottom: 1px solid #000; font-size: 8.5pt; }
  .rg-val { padding: 5px 10px; border-right: 1px solid #000; border-bottom: 1px solid #000; font-size: 9pt; font-weight: 600; }
</style></head><body>
<h1>측 정 시 스 템 분 석 보 고 서 &nbsp; (MSA Gage R&R)</h1>
<div class="header-box" style="border:1px solid #000;border-top:none;display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:none">
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">연구 번호</div><div class="hc-val">${study.study_no}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">관리 특성</div><div class="hc-val">${study.characteristic}</div></div>
  <div class="hc" style="border-bottom:1px solid #000;border-right:none"><div class="hc-label">품번</div><div class="hc-val">${study.part_no || '—'}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">연구 유형</div><div class="hc-val">${study.study_type}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">측정자 / 부품 / 반복</div><div class="hc-val">${study.appraiser_count}명 × ${study.part_count}개 × ${study.trial_count}회</div></div>
  <div class="hc" style="border-bottom:1px solid #000;border-right:none"><div class="hc-label">공차 (USL-LSL)</div><div class="hc-val">${study.tolerance != null ? study.tolerance : '—'}</div></div>
</div>

${study.grr_pct != null ? `
<div class="result-grid">
  <div class="rg-label">% 게이지 R&R (TV)</div>
  <div class="rg-val" style="color:${study.grr_pct > 30 ? '#991b1b' : study.grr_pct > 10 ? '#92400e' : '#166534'}">${study.grr_pct?.toFixed(2)}%</div>
  <div class="rg-label">판정</div>
  <div class="rg-val" style="color:${study.result==='합격'?'#166534':study.result==='주의'?'#92400e':'#991b1b'}">${study.result}</div>
  <div class="rg-label">NDC (부품군 수)</div>
  <div class="rg-val">${study.ndc ?? '—'} <span style="font-size:7.5pt;color:#666">(≥5 권장)</span></div>
  <div class="rg-label">EV 반복성 (σ)</div>
  <div class="rg-val">${study.sigma_equipment?.toFixed(6) ?? '—'}</div>
  <div class="rg-label">AV 재현성 (σ)</div>
  <div class="rg-val">${study.sigma_appraiser?.toFixed(6) ?? '—'}</div>
  <div class="rg-label">GRR (σ)</div>
  <div class="rg-val">${study.sigma_rr?.toFixed(6) ?? '—'}</div>
  <div class="rg-label">PV 부품변동 (σ)</div>
  <div class="rg-val">${study.sigma_part?.toFixed(6) ?? '—'}</div>
  <div class="rg-label">TV 전체변동 (σ)</div>
  <div class="rg-val">${study.sigma_total?.toFixed(6) ?? '—'}</div>
</div>

<div style="margin-top:12px;border:1px solid #ccc;padding:10px;font-size:8.5pt">
  <strong>판정 기준 (AIAG MSA 4th Ed.):</strong><br>
  • %R&R &lt; 10%: 합격 — 측정 시스템 적합<br>
  • %R&R 10~30%: 주의 — 사용 목적에 따라 적합할 수 있음, 개선 검토 필요<br>
  • %R&R &gt; 30%: 불합격 — 측정 시스템 부적합, 즉시 개선 필요<br>
  • NDC ≥ 5: 부품 간 차이를 충분히 구분 가능
</div>
` : `<div style="margin-top:20px;text-align:center;padding:30px;border:1px solid #ccc;color:#555">
  아직 Gage R&R 계산이 실행되지 않았습니다. 측정값 입력 후 계산을 실행하세요.
</div>`}

<div class="sign-row" style="margin-top:20px">
  <div class="sign-box"><div class="sign-title">연구 수행자 (서명)</div></div>
  <div class="sign-box"><div class="sign-title">검토자 (서명)</div></div>
  <div class="sign-box"><div class="sign-title">품질책임자 (서명)</div></div>
</div>
<div class="footer">
  <span>${COMPANY} — AIAG MSA 4th Edition / IATF 16949 §7.1.5.1</span>
  <span>출력일: ${today()}</span>
  <span>${study.study_no}</span>
</div>
</body></html>`
  openPrint(html)
}

// ── 7. SPC 분석 보고서 ───────────────────────────────────────────
export function printSpcReport(chart, measurements, analysis) {
  if (!chart) return
  const cpkColor = (v) => v == null ? '#000' : v >= 1.67 ? '#166534' : v >= 1.33 ? '#1e40af' : v >= 1.0 ? '#92400e' : '#991b1b'
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>SPC 보고서 ${chart.characteristic}</title>
<style>
  ${BASE_CSS}
  @page { size: A4 portrait; }
</style></head><body>
<h1>SPC 공정능력 분석 보고서</h1>
<div class="header-box" style="border:1px solid #000;border-top:none;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:none">
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">품번</div><div class="hc-val">${chart.part_no || '—'}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">관리특성</div><div class="hc-val">${chart.characteristic}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">단위</div><div class="hc-val">${chart.unit || '—'}</div></div>
  <div class="hc" style="border-bottom:1px solid #000;border-right:none"><div class="hc-label">소그룹 크기</div><div class="hc-val">${chart.subgroup_size}개</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">규격 상한 (USL)</div><div class="hc-val">${chart.usl ?? '—'}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">규격 하한 (LSL)</div><div class="hc-val">${chart.lsl ?? '—'}</div></div>
  <div class="hc" style="border-bottom:1px solid #000"><div class="hc-label">분석일</div><div class="hc-val">${today()}</div></div>
  <div class="hc" style="border-bottom:1px solid #000;border-right:none"><div class="hc-label">데이터 수</div><div class="hc-val">${analysis?.n ?? (measurements||[]).length}개 소그룹</div></div>
</div>

${analysis && !analysis.error ? `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px">
  ${[
    { label: '평균 (X̄)', value: analysis.mean?.toFixed(4) },
    { label: '표준편차 (σ)', value: analysis.std?.toFixed(6) },
    { label: 'Cp', value: analysis.cp?.toFixed(3), color: cpkColor(analysis.cp), sub: analysis.cp_result },
    { label: 'Cpk', value: analysis.cpk?.toFixed(3), color: cpkColor(analysis.cpk), sub: analysis.cpk_result },
  ].map(k => `<div style="border:2px solid ${k.color||'#000'};padding:8px;text-align:center;border-radius:4px">
    <div style="font-size:7.5pt;color:#555">${k.label}</div>
    <div style="font-size:16pt;font-weight:900;color:${k.color||'#000'}">${k.value ?? '—'}</div>
    ${k.sub ? `<div style="font-size:8pt">${k.sub}</div>` : ''}
  </div>`).join('')}
</div>
<div style="margin-top:10px;border:1px solid #ccc;padding:8px;font-size:8.5pt">
  <strong>Cp/Cpk 판정 기준:</strong> Cpk ≥ 1.67: 최우수(초록) | ≥ 1.33: 양호(파랑) | ≥ 1.00: 주의(노랑) | &lt; 1.00: 불합격(빨강)
</div>` : '<div style="padding:16px;color:#555;border:1px solid #ccc;margin-top:8px">분석 데이터 없음</div>'}

<div style="margin-top:12px">
  <div style="font-weight:700;font-size:10pt;margin-bottom:6px">▶ 측정 데이터</div>
  <table>
    <thead><tr>
      <th>측정일시</th><th>측정자</th><th>측정값</th><th>X̄</th><th>R</th><th>상태</th>
    </tr></thead>
    <tbody>
      ${(measurements||[]).length === 0 ? '<tr><td colspan="6" style="text-align:center">데이터 없음</td></tr>'
        : (measurements||[]).slice(-30).map(m => {
          const outOfSpec = (chart.usl && m.values.some(v => v > chart.usl)) || (chart.lsl && m.values.some(v => v < chart.lsl))
          return `<tr style="background:${outOfSpec?'#fee2e2':''}">
            <td style="font-size:7.5pt">${new Date(m.measured_at).toLocaleString('ko-KR')}</td>
            <td>${m.measured_by||'—'}</td>
            <td style="font-family:monospace;font-size:8pt">${(m.values||[]).join(', ')}</td>
            <td class="center" style="font-weight:700">${m.xbar?.toFixed(4)??'—'}</td>
            <td class="center">${m.r?.toFixed(4)??'—'}</td>
            <td class="center"><span class="${outOfSpec?'badge-red':'badge-green'}">${outOfSpec?'규격초과':'OK'}</span></td>
          </tr>`}).join('')}
    </tbody>
  </table>
  ${(measurements||[]).length > 30 ? `<div style="font-size:7.5pt;color:#555;margin-top:4px">* 최근 30개 소그룹만 표시됩니다.</div>` : ''}
</div>

<div class="sign-row" style="margin-top:16px">
  <div class="sign-box"><div class="sign-title">작성자 (서명)</div></div>
  <div class="sign-box"><div class="sign-title">검토자 (서명)</div></div>
</div>
<div class="footer">
  <span>${COMPANY} — SPC 절차 (IATF 16949 §10.2 / AIAG SPC 2nd Ed.)</span>
  <span>출력일: ${today()}</span>
</div>
</body></html>`
  openPrint(html)
}
