/**
 * QualityForms.js — (주)넥스젬 품질 양식 출력 모듈
 * 각 form no를 받아 A4 인쇄용 HTML을 생성해 새 창으로 출력한다.
 */

const COMPANY = '(주)넥스젬'

const CSS = `
  @page { size: A4 portrait; margin: 12mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif; font-size: 9pt; color: #000; background: #fff; }
  .fh { display: grid; grid-template-columns: 1fr 130px 80px 100px; border: 2px solid #000; }
  .fh > div { padding: 4px 8px; border-right: 1px solid #000; }
  .fh > div:last-child { border-right: none; }
  .fh-l { font-size: 7pt; color: #555; }
  .fh-v { font-size: 9pt; font-weight: 700; }
  h1 { text-align: center; font-size: 13pt; font-weight: 900; letter-spacing: 2px; padding: 7px 0;
       border: 1px solid #000; border-top: none; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th { background: #d0d8e8; font-size: 8pt; padding: 4px 6px; border: 1px solid #000; text-align: center; }
  td { font-size: 8.5pt; padding: 4px 6px; border: 1px solid #000; vertical-align: middle; }
  .lc { background: #efefef; font-weight: 700; text-align: center; white-space: nowrap; width: 100px; }
  .lc2 { background: #efefef; font-weight: 700; text-align: center; white-space: nowrap; width: 140px; }
  .sec { background: #1e3a5f; color: #fff; font-weight: 700; font-size: 9.5pt;
         padding: 5px 12px; margin: 10px 0 4px; letter-spacing: 1px; }
  .blank  { height: 22px; }
  .blank2 { height: 44px; }
  .blank3 { height: 66px; }
  .sign { display: grid; gap: 6px; margin-top: 10px; }
  .sign3 { grid-template-columns: repeat(3,1fr); }
  .sign4 { grid-template-columns: repeat(4,1fr); }
  .sign5 { grid-template-columns: repeat(5,1fr); }
  .sbox { border: 1px solid #000; padding: 5px 8px; min-height: 44px; }
  .st { font-size: 7.5pt; color: #555; margin-bottom: 2px; }
  .footer { margin-top: 8px; display: flex; justify-content: space-between; font-size: 7.5pt;
            color: #555; border-top: 1px solid #ccc; padding-top: 4px; }
  .cb { display: inline-block; width: 12px; height: 12px; border: 1px solid #000;
        vertical-align: middle; margin-right: 3px; }
  .note { font-size: 7.5pt; color: #555; border: 1px solid #ccc; padding: 4px 8px; background: #fafafa; margin-bottom: 6px; }
  .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .box { border: 1px solid #000; padding: 6px 8px; min-height: 50px; }
  /* ── Multi-page support ── */
  .page-break { page-break-before: always; break-before: page; padding-top: 8px; }
  .page-ref { display: flex; justify-content: space-between; align-items: center;
              padding: 3px 10px; background: #f0f4f8; border: 1px solid #c0cfe0;
              margin-bottom: 10px; font-size: 7.5pt; color: #555; }
  /* ── 8D Discipline header ── */
  .d-cover { background: #1e3a5f; color: #fff; padding: 14px 20px; margin-bottom: 12px;
             display: flex; align-items: center; gap: 20px; }
  .d-num  { font-size: 34pt; font-weight: 900; color: #fff; min-width: 55px; line-height: 1; }
  .d-name { font-size: 12pt; font-weight: 700; letter-spacing: 0.5px; }
  .d-subname { font-size: 8.5pt; color: #aaccff; margin-top: 3px; }
  .d-info { background: #f0f4f8; border: 1px solid #b0c4de; padding: 8px 12px; margin-bottom: 10px; }
  .write-area    { border: 1px solid #aaa; min-height: 60px;  padding: 8px; margin-bottom: 6px; background: #fafafa; }
  .write-area-lg { border: 1px solid #aaa; min-height: 100px; padding: 8px; margin-bottom: 6px; background: #fafafa; }
  .write-area-xl { border: 1px solid #aaa; min-height: 160px; padding: 8px; margin-bottom: 6px; background: #fafafa; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`

function wrap(no, title, rev, inner) {
  const today = new Date().toLocaleDateString('ko-KR')
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>${no} ${title}</title><style>${CSS}</style></head><body>
<div class="fh">
  <div><div class="fh-l">회사</div><div class="fh-v">${COMPANY}</div></div>
  <div><div class="fh-l">문서번호</div><div class="fh-v">${no}</div></div>
  <div><div class="fh-l">개정번호</div><div class="fh-v">Rev.${rev}</div></div>
  <div><div class="fh-l">작성일</div><div class="fh-v">${today}</div></div>
</div>
<h1>${title}</h1>
${inner}
<div class="footer">
  <span>${COMPANY} 품질보증팀 — ${no} Rev.${rev}</span>
  <span>출력일: ${today}</span>
</div>
</body></html>`
}

function rows(n, cols) {
  return Array.from({ length: n }, (_, i) =>
    `<tr><td style="color:#bbb;font-size:7pt;text-align:center">${i + 1}</td>${cols.map(() => '<td class="blank"></td>').join('')}</tr>`
  ).join('')
}

// ─────────────────────────────────────────────────────────────
// 양식별 HTML 콘텐츠
// ─────────────────────────────────────────────────────────────

function iqcF001() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">입고번호 (GR No.)</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">검사일자</td><td style="border:none;width:110px"></td>
    <td style="border:none" class="lc2">발주번호 (PO No.)</td><td style="border:none;width:130px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">공급업체명</td><td style="border:none"></td>
    <td style="border:none" class="lc2">공급업체 LOT No.</td><td style="border:none"></td>
    <td style="border:none" class="lc2">납품서 번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">품번 (Part No.)</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품명 (Part Name)</td><td style="border:none"></td>
    <td style="border:none" class="lc2">도면 개정 번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">입고수량</td><td style="border:none"></td>
    <td style="border:none" class="lc2">샘플 수 (n)</td><td style="border:none"></td>
    <td style="border:none" class="lc2">AQL / 검사 수준</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">입고 유형</td>
    <td colspan="5" style="border:none">
      <span class="cb"></span>정기 입고 &nbsp;
      <span class="cb"></span>신규 공급업체 &nbsp;
      <span class="cb"></span>설계변경 후 초도 &nbsp;
      <span class="cb"></span>재공급 (클레임 후) &nbsp;
      <span class="cb"></span>긴급 입고
    </td>
  </tr></table>
</div>

<div class="sec">외관 검사 (Visual Inspection)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>외관 검사 항목</th>
    <th style="width:160px">허용 기준</th>
    <th style="width:70px">결과</th>
    <th>불량 내용 / 비고</th>
  </tr>
  <tr><td style="text-align:center;color:#bbb">1</td><td>표면 흠집·스크래치·이물 혼입</td><td>도면/외관 승인서 기준</td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td style="height:30px"></td></tr>
  <tr><td style="text-align:center;color:#bbb">2</td><td>변형·뒤틀림·수축</td><td>허용 기준 이내</td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td></td></tr>
  <tr><td style="text-align:center;color:#bbb">3</td><td>색상·광택·표면 상태</td><td>색상 기준서 / AAR 기준</td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td></td></tr>
  <tr><td style="text-align:center;color:#bbb">4</td><td>라벨·각인·마킹 정확성</td><td>도면/규격 기준</td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td></td></tr>
  <tr><td style="text-align:center;color:#bbb">5</td><td>포장 상태 및 파손 여부</td><td>포장 사양 기준</td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td></td></tr>
</table>

<div class="sec">치수 검사 (Dimensional Inspection) — 도면 기준</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>검사항목 (도면 풍선번호)</th>
    <th style="width:120px">규격 (기준값)</th>
    <th style="width:65px">측정값 1</th>
    <th style="width:65px">측정값 2</th>
    <th style="width:65px">측정값 3</th>
    <th style="width:65px">측정값 4</th>
    <th style="width:65px">측정값 5</th>
    <th style="width:55px">판정</th>
  </tr>
  ${Array.from({length:14},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:28px"></td><td></td><td></td><td></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>

<div class="sec">기능 / 재질 검사 (Functional / Material Inspection)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>검사항목</th>
    <th style="width:160px">규격 / 기준</th>
    <th style="width:120px">측정 결과</th>
    <th style="width:55px">판정</th>
    <th>비고</th>
  </tr>
  ${Array.from({length:5},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:30px"></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td></td>
  </tr>`).join('')}
</table>

<div class="sec">불량 현황 집계</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>불량 유형</th>
    <th style="width:70px">불량 수량</th>
    <th style="width:90px">불량률 (%)</th>
    <th>불량 사진 / 증거 번호</th>
    <th style="width:120px">처리 방향</th>
  </tr>
  ${Array.from({length:4},(_,i)=>`
  <tr><td style="text-align:center;color:#bbb">${i+1}</td><td style="height:28px"></td><td></td><td></td><td></td><td></td></tr>`).join('')}
  <tr style="font-weight:700;background:#f0f4f8">
    <td colspan="2" style="text-align:right">합계</td><td></td><td></td><td colspan="2"></td>
  </tr>
</table>

<div class="sec">사진 / 증거 자료 첨부</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
  ${Array.from({length:3},(_,i)=>`
  <div style="border:1px solid #aaa;min-height:80px;background:#fafafa;padding:5px">
    <div style="font-size:7.5pt;color:#888;text-align:center;margin-bottom:4px">사진 ${i+1} (인쇄 후 부착)</div>
  </div>`).join('')}
</div>

<div class="sec">최종 판정 (Final Verdict)</div>
<table><tr>
  <td style="text-align:center;font-size:13pt;font-weight:900;padding:14px;width:50%">
    <span class="cb"></span> 합격 (PASS) &nbsp;&nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 불합격 (FAIL) &nbsp;&nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 조건부 합격 / 특채
  </td>
  <td>
    <table style="border:none;margin:0">
      <tr><td class="lc" style="border:none">처리 방법</td>
        <td style="border:none"><span class="cb"></span>입고 &nbsp;<span class="cb"></span>반품 &nbsp;<span class="cb"></span>전수검사 후 선별 입고 &nbsp;<span class="cb"></span>특채</td></tr>
      <tr><td class="lc" style="border:none">불합격 수량</td><td style="border:none"></td></tr>
      <tr><td class="lc" style="border:none">처리 완료일</td><td style="border:none"></td></tr>
    </table>
  </td>
</tr></table>
<table><tr>
  <td class="lc">불합격 / 특채 사유</td><td style="height:48px"></td>
</tr><tr>
  <td class="lc">CAPA 연계</td>
  <td><span class="cb"></span>NCR 발행 필요 (NCR No.: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;) &nbsp;&nbsp;
      <span class="cb"></span>공급업체 경고장 발행 &nbsp;&nbsp;
      <span class="cb"></span>해당 없음</td>
</tr></table>

<div class="sign sign4" style="margin-top:12px">
  <div class="sbox" style="min-height:55px"><div class="st">수입검사원 (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">품질보증팀장 (검토 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">구매팀 확인 (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">최종 처리 완료 확인</div></div>
</div>`
}

function ipqcF001() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">작업지시번호</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">작업일자 / 시각</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">캐비티 번호</td><td style="border:none;width:110px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">품번</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품명</td><td style="border:none"></td>
    <td style="border:none" class="lc2">도면 개정 번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">금형 번호</td><td style="border:none"></td>
    <td style="border:none" class="lc2">설비 번호</td><td style="border:none"></td>
    <td style="border:none" class="lc2">원자재 LOT</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">작업자</td><td style="border:none"></td>
    <td style="border:none" class="lc2">초물 채취 수량</td><td style="border:none"></td>
    <td style="border:none" class="lc2">수입검사원 (QA)</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">초물 유형</td>
    <td colspan="5" style="border:none">
      <span class="cb"></span>신규 금형 &nbsp;
      <span class="cb"></span>금형 수리 후 &nbsp;
      <span class="cb"></span>조건 변경 후 &nbsp;
      <span class="cb"></span>원자재 LOT 변경 &nbsp;
      <span class="cb"></span>장기 미가동 후 재가동
    </td>
  </tr></table>
</div>

<div class="sec">성형 조건 확인 (Molding Condition Check)</div>
<table>
  <tr>
    <th style="width:120px">조건 항목</th>
    <th style="width:90px">작업표준 기준</th>
    <th style="width:90px">실제 설정값</th>
    <th style="width:70px">적합 여부</th>
    <th>비고</th>
  </tr>
  <tr><td class="lc">수지 건조 온도 / 시간</td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td></td></tr>
  <tr><td class="lc">실린더 온도 (°C)</td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td></td></tr>
  <tr><td class="lc">금형 온도 (°C)</td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td></td></tr>
  <tr><td class="lc">사이클 타임 (sec)</td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td></td></tr>
  <tr><td class="lc">사출압 / 보압 (MPa)</td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td><td></td></tr>
</table>

<div class="sec">치수 검사 — 초물 5-SHOT 측정</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>검사항목 (도면 풍선번호)</th>
    <th style="width:120px">규격 (기준값)</th>
    <th style="width:65px">Shot 1</th>
    <th style="width:65px">Shot 2</th>
    <th style="width:65px">Shot 3</th>
    <th style="width:65px">Shot 4</th>
    <th style="width:65px">Shot 5</th>
    <th style="width:55px">Xbar</th>
    <th style="width:50px">판정</th>
  </tr>
  ${Array.from({length:12},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:30px"></td><td></td>
    <td></td><td></td><td></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>
<div class="note">※ 특수 특성(CC/SC) 항목은 항목명 앞에 ★ 표시 | Xbar: 5회 평균값 기입</div>

<div class="sec">외관 검사 (Visual Check)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>외관 불량 유형</th>
    <th style="width:70px">발생 여부</th>
    <th style="width:90px">발생 위치</th>
    <th>조치 내용</th>
  </tr>
  ${[
    'Short Shot (미충전)','Sink Mark (수축흔)','Flash (버)','Weld Line (웰드라인)',
    'Black Spot (이물질)','Warpage (뒤틀림)','Color Defect (색상 이상)','기타 외관 불량',
  ].map((item,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td>${item}</td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
    <td></td><td style="height:28px"></td>
  </tr>`).join('')}
</table>

<div class="sec">초물 검사 종합 판정</div>
<table><tr>
  <td style="text-align:center;font-size:12pt;font-weight:900;padding:16px;width:65%">
    <span class="cb"></span> 합격 → 양산 시작 허가 &nbsp;&nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 조건부 합격 (조건 명시 후 양산) &nbsp;&nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 불합격 → 조건 재조정 후 재초물
  </td>
  <td style="vertical-align:top;padding:6px">
    <div style="font-size:8pt;font-weight:700;color:#1e3a5f;margin-bottom:4px">조건부 합격 / 재조정 조건</div>
    <div style="border:1px solid #aaa;min-height:60px;background:#fafafa;padding:5px;font-size:8pt"></div>
  </td>
</tr></table>
<table><tr>
  <td class="lc2">양산 시작 허가 시각</td><td></td>
  <td class="lc2">재초물 예정 시각</td><td></td>
  <td class="lc2">QA 에스컬레이션</td>
  <td><span class="cb"></span>필요 &nbsp;<span class="cb"></span>불필요</td>
</tr></table>

<div class="sign sign4" style="margin-top:12px">
  <div class="sbox" style="min-height:55px"><div class="st">작업자 (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">검사원 QA (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">생산팀장 (양산 허가 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">품질보증팀장 (확인)</div></div>
</div>`
}

function ipqcF002() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">작업지시번호</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">검사일시</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">검사 회차 / 주기</td><td style="border:none;width:110px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">품번</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품명</td><td style="border:none"></td>
    <td style="border:none" class="lc2">도면 개정 번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">설비 번호</td><td style="border:none"></td>
    <td style="border:none" class="lc2">금형 번호</td><td style="border:none"></td>
    <td style="border:none" class="lc2">캐비티 번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">검사원 (QA)</td><td style="border:none"></td>
    <td style="border:none" class="lc2">누계 생산수량</td><td style="border:none"></td>
    <td style="border:none" class="lc2">불량 누계 수량</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">치수 순회 검사 (5-Shot 측정)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>검사항목 (도면 풍선번호)</th>
    <th style="width:120px">규격 (기준값)</th>
    <th style="width:65px">Shot 1</th>
    <th style="width:65px">Shot 2</th>
    <th style="width:65px">Shot 3</th>
    <th style="width:65px">Shot 4</th>
    <th style="width:65px">Shot 5</th>
    <th style="width:55px">Xbar</th>
    <th style="width:50px">판정</th>
  </tr>
  ${Array.from({length:10},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:28px"></td><td></td>
    <td></td><td></td><td></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>
<div class="note">※ 특수 특성(CC/SC) 항목은 항목명 앞에 ★ 표시 | Xbar: 5회 측정값 평균</div>

<div class="sec">외관 순회 검사</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>불량 유형</th>
    <th style="width:70px">불량 수량</th>
    <th style="width:80px">불량률 (%)</th>
    <th style="width:90px">발생 위치</th>
    <th>조치 내용 / 조치자</th>
  </tr>
  ${[
    'Short Shot (미충전)','Sink Mark (수축흔)','Flash (버)','Weld Line (웰드라인)',
    'Black Spot (이물질)','Color Defect (색상 이상)','기타 외관 불량',
  ].map((item,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td>${item}</td>
    <td></td><td></td><td></td><td style="height:28px"></td>
  </tr>`).join('')}
  <tr style="font-weight:700;background:#f0f4f8">
    <td colspan="2" style="text-align:right">합계</td>
    <td></td><td></td><td colspan="2"></td>
  </tr>
</table>

<div class="sec">SPC 관리도 타점 및 이상 패턴 모니터링</div>
<table>
  <tr>
    <td class="lc2" style="width:140px">이상 패턴 발생</td>
    <td>
      <span class="cb"></span>없음(정상) &nbsp;
      <span class="cb"></span>관리한계(UCL/LCL) 초과 &nbsp;
      <span class="cb"></span>연속 7점 추세 &nbsp;
      <span class="cb"></span>연속 7점 편향 &nbsp;
      <span class="cb"></span>기타
    </td>
  </tr>
  <tr>
    <td class="lc2">이상 패턴 조치</td>
    <td style="height:40px"></td>
  </tr>
  <tr>
    <td class="lc2">공정불량률</td>
    <td>
      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; % &nbsp;&nbsp;&nbsp;
      <span class="cb"></span>임계치 미만 → 계속 생산 &nbsp;
      <span class="cb"></span>임계치 초과 → 라인 중단 후 원인 조사
    </td>
  </tr>
  <tr>
    <td class="lc2">라인 재가동 승인</td>
    <td></td>
  </tr>
</table>

<div class="sec">순회 검사 종합 판정</div>
<table><tr>
  <td style="text-align:center;font-size:11pt;font-weight:900;padding:12px;width:60%">
    <span class="cb"></span> 적합 — 계속 생산 허가 &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 조건부 적합 — 조치 후 계속 생산 &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 부적합 — 라인 중단 / QA 에스컬레이션
  </td>
  <td style="vertical-align:top;padding:6px">
    <div style="font-size:8pt;font-weight:700;color:#1e3a5f;margin-bottom:4px">조치 사항 / 에스컬레이션 내용</div>
    <div style="border:1px solid #aaa;min-height:55px;background:#fafafa;padding:5px;font-size:8pt"></div>
  </td>
</tr></table>

<div class="sign sign4" style="margin-top:10px">
  <div class="sbox" style="min-height:50px"><div class="st">검사원 QA (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">생산팀장 (확인 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">품질보증팀장 (검토)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">라인 재가동 승인자</div></div>
</div>`
}

function ipqcF003() {
  const cols25 = Array.from({length:25},(_,i)=>`<th style="width:28px;font-size:7pt">${i+1}</th>`).join('')
  const dataRow = Array.from({length:25},()=>`<td style="height:18px;padding:2px;border:1px solid #ccc;text-align:center;font-size:7.5pt"></td>`).join('')
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">품번</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">품명</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">관리 공정</td><td style="border:none;width:110px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">관리 특성</td><td style="border:none"></td>
    <td style="border:none" class="lc2">측정 단위</td><td style="border:none"></td>
    <td style="border:none" class="lc2">측정 주기</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">관리 규격</td><td style="border:none"></td>
    <td style="border:none" class="lc2">관리 기간</td><td style="border:none"></td>
    <td style="border:none" class="lc2">작성자 (QA)</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">Xbar 관리도 (평균값 — 샘플 25회)</div>
<div class="note" style="margin-bottom:3px">※ n=5 (샘플 크기), 각 셀에 측정값 기입 | Xbar = 5개 평균 | UCL/LCL = Xbarbar ± A₂ × Rbar</div>
<table>
  <tr>
    <td class="lc" style="font-size:7.5pt;width:65px">회차</td>
    ${cols25}
  </tr>
  <tr><td class="lc" style="font-size:7pt">x₁</td>${dataRow}</tr>
  <tr><td class="lc" style="font-size:7pt">x₂</td>${dataRow}</tr>
  <tr><td class="lc" style="font-size:7pt">x₃</td>${dataRow}</tr>
  <tr><td class="lc" style="font-size:7pt">x₄</td>${dataRow}</tr>
  <tr><td class="lc" style="font-size:7pt">x₅</td>${dataRow}</tr>
  <tr><td class="lc" style="font-size:7pt;font-weight:900;background:#d0d8e8">Xbar</td>${dataRow}</tr>
</table>
<table style="margin-top:3px"><tr>
  <td class="lc2">UCL (Xbar)</td><td style="width:120px"></td>
  <td class="lc2">CL (Xbarbar)</td><td style="width:120px"></td>
  <td class="lc2">LCL (Xbar)</td><td style="width:120px"></td>
  <td class="lc2">A₂ 계수</td><td></td>
</tr></table>

<div class="sec">R 관리도 (범위값)</div>
<table>
  <tr>
    <td class="lc" style="font-size:7.5pt;width:65px">회차</td>
    ${cols25}
  </tr>
  <tr><td class="lc" style="font-size:7pt;font-weight:900;background:#d0d8e8">R값</td>${dataRow}</tr>
</table>
<table style="margin-top:3px"><tr>
  <td class="lc2">UCL(R)</td><td style="width:110px"></td>
  <td class="lc2">CL (Rbar)</td><td style="width:110px"></td>
  <td class="lc2">LCL(R)</td><td style="width:110px"></td>
  <td class="lc2">D₃ / D₄</td><td></td>
</tr></table>

<div class="sec">공정능력 분석</div>
<table><tr>
  <td class="lc2">규격 상한 (USL)</td><td></td>
  <td class="lc2">규격 하한 (LSL)</td><td></td>
  <td class="lc2">규격 중심</td><td></td>
</tr><tr>
  <td class="lc2">Xbarbar (전체 평균)</td><td></td>
  <td class="lc2">σ 추정값 (s̄/d₂)</td><td></td>
  <td class="lc2">측정 단위</td><td></td>
</tr><tr>
  <td class="lc2">Cp</td><td></td>
  <td class="lc2">Cpk</td><td style="font-weight:700"></td>
  <td class="lc2">목표 Cpk</td><td>≥ 1.33</td>
</tr><tr>
  <td class="lc2">공정능력 판정</td>
  <td colspan="5">
    <span class="cb"></span>적합 (Cpk ≥ 1.33) &nbsp;
    <span class="cb"></span>경계 (1.00 ≤ Cpk &lt; 1.33 — 개선 계획 수립) &nbsp;
    <span class="cb"></span>부적합 (Cpk &lt; 1.00 — 즉시 조치)
  </td>
</tr></table>

<div class="sec">이상 패턴 기록 및 조치</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th style="width:70px">이상 발생 회차</th>
    <th style="width:120px">이상 유형</th>
    <th>조치 내용</th>
    <th style="width:70px">조치자</th>
    <th style="width:80px">완료 일시</th>
  </tr>
  ${Array.from({length:4},(_,i)=>`
  <tr><td style="text-align:center;color:#bbb">${i+1}</td><td></td><td></td><td style="height:28px"></td><td></td><td></td></tr>`).join('')}
</table>
<div class="note">※ 이상 패턴 유형: ①관리한계 초과 ②연속 7점 같은 방향 추세 ③연속 7점 중심선 편향 ④연속 2점 2σ 이상 ⑤기타</div>

<div class="sign sign3">
  <div class="sbox" style="min-height:50px"><div class="st">작성자 QA (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">생산팀장 (검토 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">품질보증팀장 (승인)</div></div>
</div>`
}

function oqcF001() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">OQC 번호</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">검사일자</td><td style="border:none;width:110px"></td>
    <td style="border:none" class="lc2">출하 지시번호</td><td style="border:none;width:130px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">납품처</td><td style="border:none"></td>
    <td style="border:none" class="lc2">납품 예정일</td><td style="border:none"></td>
    <td style="border:none" class="lc2">납품 LOT No.</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">품번</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품명</td><td style="border:none"></td>
    <td style="border:none" class="lc2">도면 개정번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">납품 수량</td><td style="border:none"></td>
    <td style="border:none" class="lc2">샘플 수량 (AQL)</td><td style="border:none"></td>
    <td style="border:none" class="lc2">AQL 수준</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">치수 검사 결과</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>검사항목 (도면 풍선번호)</th>
    <th style="width:120px">규격 (기준값)</th>
    <th style="width:70px">측정값 1</th>
    <th style="width:70px">측정값 2</th>
    <th style="width:70px">측정값 3</th>
    <th style="width:70px">측정값 4</th>
    <th style="width:70px">측정값 5</th>
    <th style="width:55px">판정</th>
  </tr>
  ${Array.from({length:12},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:28px"></td><td></td>
    <td></td><td></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>
<div class="note">※ 특수 특성(CC/SC) 항목은 ★ 표시 | 불합격 항목은 적색으로 명기</div>

<div class="sec">외관 검사 결과</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>외관 불량 유형</th>
    <th style="width:70px">발생 여부</th>
    <th style="width:70px">불량 수량</th>
    <th style="width:90px">발생 위치</th>
    <th>판정 / 비고</th>
  </tr>
  ${[
    'Short Shot (미충전)','Sink Mark (수축흔)','Flash (버)','Weld Line (웰드라인)',
    'Black Spot (이물질)','Scratch / 긁힘','Color Defect (색상 이상)','기타 외관 불량',
  ].map((item,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td>${item}</td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
    <td></td><td></td><td style="height:26px"></td>
  </tr>`).join('')}
</table>

<div class="sec">포장 / 라벨 검사</div>
<table>
  <tr>
    <th style="width:160px">확인 항목</th>
    <th style="width:90px">결과</th>
    <th>비고</th>
  </tr>
  ${[
    '라벨 품번·품명 표기 정확성',
    '수량 카운트 일치',
    '포장 상태 (파손·이물 없음)',
    '부적합품 혼입 없음 확인',
    '출하 허가서 (QMS-F-100) 첨부',
    '고객 요구 특이사항 충족',
  ].map(item=>`
  <tr>
    <td class="lc">${item}</td>
    <td style="text-align:center"><span class="cb"></span>적합 &nbsp;<span class="cb"></span>부적합</td>
    <td style="height:24px"></td>
  </tr>`).join('')}
</table>

<div class="sec">OQC 최종 판정</div>
<table><tr>
  <td style="text-align:center;font-size:13pt;font-weight:900;padding:16px;width:65%">
    <span class="cb"></span> 합격 → 출하 허가 &nbsp;&nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 조건부 합격 (조건 명기 후 출하) &nbsp;&nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 불합격 → 출하 보류
  </td>
  <td style="vertical-align:top;padding:6px">
    <div style="font-size:8pt;font-weight:700;color:#1e3a5f;margin-bottom:4px">불합격 / 조건부 사유</div>
    <div style="border:1px solid #aaa;min-height:60px;background:#fafafa;padding:5px;font-size:8pt"></div>
  </td>
</tr></table>
<table><tr>
  <td class="lc2">불합격 후속 조치</td>
  <td><span class="cb"></span>전수 재검사 &nbsp;<span class="cb"></span>공급업체 반환 &nbsp;<span class="cb"></span>재작업 &nbsp;<span class="cb"></span>폐기 &nbsp;<span class="cb"></span>NCR 발행</td>
  <td class="lc2">NCR 번호</td><td></td>
</tr></table>

<div class="sign sign4" style="margin-top:12px">
  <div class="sbox" style="min-height:55px"><div class="st">검사원 QA (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">품질보증팀장 (최종 허가)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">물류팀 (수령 확인 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">출하 허가 일시</div></div>
</div>`
}

function ncrF001() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">NCR 번호</td><td style="border:none;width:140px"></td>
    <td style="border:none" class="lc2">발생일시</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">관련 CAR 번호</td><td style="border:none;width:130px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">품번</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품명</td><td style="border:none"></td>
    <td style="border:none" class="lc2">도면 개정번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">LOT 번호</td><td style="border:none"></td>
    <td style="border:none" class="lc2">부적합 수량</td><td style="border:none"></td>
    <td style="border:none" class="lc2">총 로트 수량</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">발생 장소</td>
    <td colspan="5" style="border:none">
      <span class="cb"></span>수입검사(IQC) &nbsp;
      <span class="cb"></span>공정 순회(IPQC) &nbsp;
      <span class="cb"></span>출하검사(OQC) &nbsp;
      <span class="cb"></span>고객 반품 &nbsp;
      <span class="cb"></span>내부 심사 &nbsp;
      <span class="cb"></span>기타
    </td>
  </tr><tr>
    <td style="border:none" class="lc2">발견자 / 부서</td><td style="border:none"></td>
    <td style="border:none" class="lc2">공급업체 (해당 시)</td><td style="border:none"></td>
    <td style="border:none" class="lc2">귀책 구분</td>
    <td style="border:none">
      <span class="cb"></span>자사 &nbsp;<span class="cb"></span>공급업체 &nbsp;<span class="cb"></span>고객 &nbsp;<span class="cb"></span>불명
    </td>
  </tr></table>
</div>

<div class="sec">1. 부적합 내용 (Nonconformance Description)</div>
<table>
  <tr>
    <td class="lc2" style="width:140px">불량 유형</td>
    <td>
      <span class="cb"></span>치수 불량 &nbsp;
      <span class="cb"></span>외관 불량 &nbsp;
      <span class="cb"></span>기능 불량 &nbsp;
      <span class="cb"></span>재질 불량 &nbsp;
      <span class="cb"></span>문서/표기 오류 &nbsp;
      <span class="cb"></span>기타
    </td>
  </tr>
  <tr><td class="lc2">불량 현상 (구체적 기술)</td><td style="min-height:60px" class="blank3"></td></tr>
  <tr>
    <td class="lc2">규격 기준</td><td></td>
  </tr>
  <tr>
    <td class="lc2">실측 / 발생값</td><td></td>
  </tr>
  <tr>
    <td class="lc2">사진 / 증거 자료</td>
    <td style="height:70px;font-size:8pt;color:#999;text-align:center;vertical-align:middle">
      ▣ 사진 첨부란 (인쇄 후 부착) / 디지털 첨부 시 파일명 기재
    </td>
  </tr>
</table>

<div class="sec">2. 즉각 봉쇄 조치 (Immediate Containment)</div>
<table>
  <tr>
    <td class="lc2" style="width:140px">격리 조치 완료</td>
    <td>
      <span class="cb"></span>완료 &nbsp;<span class="cb"></span>미완료 &nbsp;&nbsp;
      격리 위치: ___________________________
    </td>
    <td class="lc2" style="width:130px">격리 완료 일시</td><td style="width:120px"></td>
  </tr>
  <tr>
    <td class="lc2">소급 범위 평가</td>
    <td><span class="cb"></span>동일 LOT 전수 &nbsp;<span class="cb"></span>선행 LOT 포함 &nbsp;<span class="cb"></span>공정 소급 &nbsp;<span class="cb"></span>불필요</td>
    <td class="lc2">소급 평가 완료</td><td></td>
  </tr>
  <tr>
    <td class="lc2">봉쇄 조치 내용</td>
    <td colspan="3" style="height:50px"></td>
  </tr>
</table>

<div class="sec">3. 처리 결정 (Disposition Decision)</div>
<table>
  <tr>
    <td class="lc2" style="width:140px">처리 방법</td>
    <td>
      <span class="cb"></span>공급업체 반품 &nbsp;
      <span class="cb"></span>재작업 (NCR-F-002 발행) &nbsp;
      <span class="cb"></span>특채 사용 (QMS-F-101 승인 필요) &nbsp;
      <span class="cb"></span>폐기
    </td>
  </tr>
  <tr><td class="lc2">처리 세부 내용</td><td class="blank2"></td></tr>
  <tr>
    <td class="lc2">CAPA 개시 여부</td>
    <td>
      <span class="cb"></span>예 → CAR 발행 (CAR No: _____________) &nbsp;
      <span class="cb"></span>아니오 (반복 발생 시 필수 개시)
    </td>
  </tr>
  <tr>
    <td class="lc2">처리 결정자</td><td></td>
  </tr>
</table>

<div class="sign sign4" style="margin-top:12px">
  <div class="sbox" style="min-height:55px"><div class="st">발견자 (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">품질보증팀장 (처리 결정 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">생산 / 구매팀장 (확인)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">처리 완료 확인 (날짜)</div></div>
</div>`
}

function ncrF002() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">재작업 지시번호</td><td style="border:none;width:140px"></td>
    <td style="border:none" class="lc2">NCR 번호</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">발행일</td><td style="border:none;width:110px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">품번</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품명</td><td style="border:none"></td>
    <td style="border:none" class="lc2">도면 개정번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">LOT 번호</td><td style="border:none"></td>
    <td style="border:none" class="lc2">재작업 지시 수량</td><td style="border:none"></td>
    <td style="border:none" class="lc2">재작업 완료 기한</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">재작업 담당자</td><td style="border:none"></td>
    <td style="border:none" class="lc2">재작업 장소</td><td style="border:none"></td>
    <td style="border:none" class="lc2">감독자 (QA)</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">부적합 내용 확인 (NCR 요약)</div>
<table>
  <tr><td class="lc2">불량 내용 (NCR 참조)</td><td class="blank2"></td></tr>
  <tr>
    <td class="lc2">재작업 불가능 항목</td>
    <td>
      <span class="cb"></span>없음 (전량 재작업 가능) &nbsp;
      <span class="cb"></span>있음 → 불가능 수량: ________ 개 (폐기 처리)
    </td>
  </tr>
</table>

<div class="sec">재작업 작업 지시</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>재작업 항목 (공정/부위)</th>
    <th>작업 방법 및 기준</th>
    <th style="width:90px">작업 시간 (분)</th>
    <th style="width:70px">작업자</th>
    <th style="width:65px">완료 여부</th>
  </tr>
  ${Array.from({length:7},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:30px"></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>완료 &nbsp;<span class="cb"></span>미완료</td>
  </tr>`).join('')}
</table>
<table><tr>
  <td class="lc2">재작업 주의사항</td><td class="blank2"></td>
</tr></table>

<div class="sec">재작업 완료 기록</div>
<table>
  <tr>
    <td class="lc2">실제 완료일시</td><td></td>
    <td class="lc2">재작업 완료 수량</td><td></td>
    <td class="lc2">폐기 수량</td><td></td>
  </tr>
  <tr>
    <td class="lc2">재작업 비용 (공수)</td><td></td>
    <td class="lc2">귀책 구분</td>
    <td><span class="cb"></span>자사 &nbsp;<span class="cb"></span>공급업체</td>
    <td class="lc2">비용 청구 여부</td>
    <td><span class="cb"></span>청구 &nbsp;<span class="cb"></span>미청구</td>
  </tr>
</table>

<div class="sec">재검사 결과 (QA 확인)</div>
<table>
  <tr>
    <td class="lc2">재검사 판정</td>
    <td>
      <span class="cb"></span>합격 → 합격 태그 교체 후 재고 환입 &nbsp;
      <span class="cb"></span>불합격 → 추가 재작업 / 폐기 &nbsp;
      <span class="cb"></span>특채 처리
    </td>
  </tr>
  <tr><td class="lc2">재검사 의견</td><td class="blank2"></td></tr>
  <tr>
    <td class="lc2">재검사원 (QA)</td><td></td>
  </tr>
  <tr>
    <td class="lc2">재검사 완료일</td><td></td>
  </tr>
</table>

<div class="sign sign4" style="margin-top:10px">
  <div class="sbox" style="min-height:55px"><div class="st">재작업 담당자 (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">재검사원 QA (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">생산팀장 (확인)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">품질보증팀장 (종결 승인)</div></div>
</div>`
}

function ncrF010() {
  return `
<!-- ── PAGE 1: Cover + D0 긴급대응 + D1 팀 구성 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">CAR 번호</td><td style="border:none;width:140px"></td>
    <td style="border:none" class="lc2">발행일</td><td style="border:none;width:110px"></td>
    <td style="border:none" class="lc2">완료 기한</td><td style="border:none;width:110px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">고객사 / 발생 부서</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품번</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품명</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">발생 유형</td>
    <td colspan="5" style="border:none">
      <span class="cb"></span>고객 불만 &nbsp;
      <span class="cb"></span>내부 부적합 &nbsp;
      <span class="cb"></span>공급업체 불량 &nbsp;
      <span class="cb"></span>내부 심사 지적 &nbsp;
      <span class="cb"></span>반복 발생 &nbsp;
      <span class="cb"></span>기타
    </td>
  </tr></table>
</div>

<div class="d-cover">
  <div class="d-num">D1</div>
  <div>
    <div class="d-name">팀 구성 (Team Formation)</div>
    <div class="d-subname">문제 해결을 위한 담당 팀과 역할을 정의한다</div>
  </div>
</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>성 명</th>
    <th>부서 / 직책</th>
    <th>역 할</th>
    <th style="width:120px">연락처</th>
    <th style="width:70px">서 명</th>
  </tr>
  <tr>
    <td style="text-align:center;background:#ffe8b0;font-weight:900;font-size:10pt">L</td>
    <td style="background:#fffae0;height:34px"></td>
    <td style="background:#fffae0"></td>
    <td style="background:#fffae0;font-size:8pt">팀 리더 (Team Leader)</td>
    <td style="background:#fffae0"></td>
    <td style="background:#fffae0"></td>
  </tr>
  ${Array.from({length:7},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td class="blank2"></td><td class="blank2"></td><td class="blank2"></td>
    <td class="blank2"></td><td class="blank2"></td>
  </tr>`).join('')}
</table>
<table><tr>
  <td class="lc2">팀 구성 일자</td><td></td>
  <td class="lc2">D1 완료 확인자</td><td></td>
  <td class="lc2">D1 완료 일자</td><td></td>
</tr></table>

<!-- ═══════════════════════════ D2 PAGE ═══════════════════════════ -->
<div class="page-break">
<div class="page-ref"><span>NCR-F-010 — 시정조치 요청서 (8D CAR)</span><span>D2 — 문제 기술 (Problem Description)</span></div>
<div class="d-cover">
  <div class="d-num">D2</div>
  <div>
    <div class="d-name">문제 기술 (Problem Description)</div>
    <div class="d-subname">문제를 구체적이고 정량적으로 기술하고 Is / Is Not 으로 경계를 설정한다</div>
  </div>
</div>

<div class="sec">문제 현상 기술 (Symptom Description)</div>
<div class="write-area-xl" style="min-height:90px"></div>

<div class="sec">Is / Is Not 분석 — 문제 경계 정의</div>
<table>
  <tr>
    <th style="width:120px">관점</th>
    <th>IS — 해당 (문제가 있는 것)</th>
    <th>IS NOT — 비해당 (문제가 없는 것)</th>
    <th style="width:150px">차이점 (Distinction)</th>
  </tr>
  <tr><td class="lc">무엇 (What)</td><td style="height:55px"></td><td></td><td></td></tr>
  <tr><td class="lc">어디서 (Where)</td><td style="height:55px"></td><td></td><td></td></tr>
  <tr><td class="lc">언제 (When)</td><td style="height:55px"></td><td></td><td></td></tr>
  <tr><td class="lc">얼마나 (How Much)</td><td style="height:55px"></td><td></td><td></td></tr>
</table>

<div class="sec">영향 범위 및 증거 자료</div>
<table><tr>
  <td class="lc2">영향 수량 (불량 / 전체)</td><td></td>
  <td class="lc2">영향 공정 / 라인</td><td></td>
  <td class="lc2">최초 발생일</td><td></td>
</tr><tr>
  <td class="lc2">증거 자료 목록</td>
  <td colspan="5">
    <span class="cb"></span>사진 &nbsp;
    <span class="cb"></span>샘플 현물 &nbsp;
    <span class="cb"></span>측정 데이터 &nbsp;
    <span class="cb"></span>생산 기록 &nbsp;
    <span class="cb"></span>기타: _______________
  </td>
</tr></table>
<table><tr>
  <td class="lc2">D2 작성자</td><td></td>
  <td class="lc2">D2 완료 일자</td><td></td>
  <td class="lc2">부서장 확인</td><td></td>
</tr></table>
</div>

<!-- ═══════════════════════════ D3 PAGE ═══════════════════════════ -->
<div class="page-break">
<div class="page-ref"><span>NCR-F-010 — 시정조치 요청서 (8D CAR)</span><span>D3 — 긴급 봉쇄 조치 (Containment)</span></div>
<div class="d-cover">
  <div class="d-num">D3</div>
  <div>
    <div class="d-name">긴급 봉쇄 조치 (Immediate Containment Action)</div>
    <div class="d-subname">고객 보호를 위한 즉각적 조치 — 발생 후 24시간 이내 완료</div>
  </div>
</div>

<div class="sec">봉쇄 조치 계획 (Containment Actions)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>봉쇄 조치 내용</th>
    <th style="width:70px">적용 범위</th>
    <th style="width:70px">담당자</th>
    <th style="width:80px">완료 기한</th>
    <th style="width:80px">실제 완료일</th>
    <th style="width:55px">확인</th>
  </tr>
  ${Array.from({length:6},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:40px"></td><td></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span></td>
  </tr>`).join('')}
</table>

<div class="sec">고객 재고 봉쇄 (Customer Stock Containment)</div>
<table><tr>
  <td class="lc2">고객사 재고 수량</td><td></td>
  <td class="lc2">봉쇄 방법</td>
  <td>
    <span class="cb"></span>전수검사 &nbsp;
    <span class="cb"></span>전량 반품 &nbsp;
    <span class="cb"></span>대체 공급 &nbsp;
    <span class="cb"></span>해당 없음
  </td>
</tr><tr>
  <td class="lc2">고객 통보 일시</td><td></td>
  <td class="lc2">고객 담당자</td><td></td>
</tr></table>

<div class="sec">자사 재고 봉쇄 및 출하 중단</div>
<table><tr>
  <td class="lc2">자사 재고 수량</td><td></td>
  <td class="lc2">봉쇄 조치</td>
  <td>
    <span class="cb"></span>격리 보관 &nbsp;
    <span class="cb"></span>전수검사 &nbsp;
    <span class="cb"></span>폐기 &nbsp;
    <span class="cb"></span>해당 없음
  </td>
</tr><tr>
  <td class="lc2">출하 중단 여부</td>
  <td>
    <span class="cb"></span>중단 &nbsp;
    <span class="cb"></span>조건부 출하 &nbsp;
    <span class="cb"></span>해당 없음
  </td>
  <td class="lc2">봉쇄 완료 일자</td><td></td>
</tr></table>

<div class="sec">D3 봉쇄 효과 확인 메모</div>
<div class="write-area-lg"></div>
<table><tr>
  <td class="lc2">봉쇄 효과 판정</td>
  <td>
    <span class="cb"></span>효과적 (고객 보호 완료) &nbsp;&nbsp;
    <span class="cb"></span>추가 조치 필요
  </td>
  <td class="lc2">D3 완료 일자</td><td></td>
  <td class="lc2">D3 확인자</td><td></td>
</tr></table>
</div>

<!-- ═══════════════════════════ D4 PAGE ═══════════════════════════ -->
<div class="page-break">
<div class="page-ref"><span>NCR-F-010 — 시정조치 요청서 (8D CAR)</span><span>D4 — 근본원인 분석 (Root Cause Analysis)</span></div>
<div class="d-cover">
  <div class="d-num">D4</div>
  <div>
    <div class="d-name">근본원인 분석 (Root Cause Analysis)</div>
    <div class="d-subname">발생 원인과 유출 원인을 5-Why 및 특성요인도(Ishikawa)로 도출한다</div>
  </div>
</div>

<div class="sec">발생 원인 (Occurrence Root Cause) — 5-Why 분석</div>
<table>
  <tr>
    <th style="width:120px">단계</th>
    <th>질문 (왜 이 불량이 발생했는가?)</th>
    <th style="width:220px">원인 / 근거 / 증거</th>
    <th style="width:70px">검증 방법</th>
  </tr>
  <tr><td class="lc">1st Why</td><td style="height:48px"></td><td></td><td></td></tr>
  <tr><td class="lc">2nd Why</td><td style="height:48px"></td><td></td><td></td></tr>
  <tr><td class="lc">3rd Why</td><td style="height:48px"></td><td></td><td></td></tr>
  <tr><td class="lc">4th Why</td><td style="height:48px"></td><td></td><td></td></tr>
  <tr>
    <td class="lc" style="background:#ffd700;color:#1e3a5f;font-weight:900">5th Why<br>(발생 근본원인)</td>
    <td style="height:55px;background:#fffae0;font-weight:700"></td>
    <td style="background:#fffae0"></td>
    <td style="background:#fffae0"></td>
  </tr>
</table>

<div class="sec">유출 원인 (Escape Root Cause) — 왜 검출하지 못했는가</div>
<table>
  <tr>
    <th style="width:120px">단계</th>
    <th>질문 (왜 검출 / 차단하지 못했는가?)</th>
    <th style="width:220px">원인 / 근거 / 증거</th>
    <th style="width:70px">검증 방법</th>
  </tr>
  <tr><td class="lc">1st Why</td><td style="height:40px"></td><td></td><td></td></tr>
  <tr><td class="lc">2nd Why</td><td style="height:40px"></td><td></td><td></td></tr>
  <tr>
    <td class="lc" style="background:#ffd700;color:#1e3a5f;font-weight:900">유출<br>근본원인</td>
    <td style="height:48px;background:#fffae0;font-weight:700"></td>
    <td style="background:#fffae0"></td>
    <td style="background:#fffae0"></td>
  </tr>
</table>

<div class="sec">특성요인도 (Ishikawa / 6M Cause &amp; Effect)</div>
<table>
  <tr>
    <th style="width:150px">분류 (6M)</th>
    <th>잠재 원인 목록 (Potential Causes)</th>
    <th style="width:55px">채택</th>
  </tr>
  ${[
    'Man (작업자 / 교육)',
    'Machine (설비 / 치공구)',
    'Material (원재료 / 부품)',
    'Method (작업표준 / 절차)',
    'Measurement (측정 / 검사)',
    'Environment (환경 / 5S)',
  ].map(label=>`
  <tr>
    <td class="lc" style="font-size:8.5pt">${label}</td>
    <td style="height:42px"></td>
    <td style="text-align:center"><span class="cb"></span></td>
  </tr>`).join('')}
</table>
<table><tr>
  <td class="lc2">D4 작성자</td><td></td>
  <td class="lc2">D4 완료 일자</td><td></td>
  <td class="lc2">품질보증팀장 확인</td><td></td>
</tr></table>
</div>

<!-- ═══════════════════════════ D5 PAGE ═══════════════════════════ -->
<div class="page-break">
<div class="page-ref"><span>NCR-F-010 — 시정조치 요청서 (8D CAR)</span><span>D5 — 시정조치 계획 (Corrective Action Plan)</span></div>
<div class="d-cover">
  <div class="d-num">D5</div>
  <div>
    <div class="d-name">시정조치 계획 (Corrective Action Plan)</div>
    <div class="d-subname">D4에서 도출된 근본원인에 대한 영구적 시정조치를 계획한다</div>
  </div>
</div>

<div class="sec">발생 원인 대응 조치 (Occurrence Corrective Actions)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>시정조치 내용</th>
    <th style="width:70px">관련<br>근본원인</th>
    <th style="width:70px">담당 부서</th>
    <th style="width:60px">담당자</th>
    <th style="width:80px">완료 기한</th>
    <th style="width:80px">실제 완료일</th>
    <th style="width:55px">완료</th>
  </tr>
  ${Array.from({length:7},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:46px"></td><td></td><td></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>

<div class="sec">유출 원인 대응 조치 — 검출력 개선 (Detection Improvement Actions)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>검출 개선 조치 내용</th>
    <th style="width:70px">관련<br>근본원인</th>
    <th style="width:70px">담당 부서</th>
    <th style="width:60px">담당자</th>
    <th style="width:80px">완료 기한</th>
    <th style="width:80px">실제 완료일</th>
    <th style="width:55px">완료</th>
  </tr>
  ${Array.from({length:4},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:40px"></td><td></td><td></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>

<div class="sec">D3 봉쇄 조치 해제 계획</div>
<table><tr>
  <td class="lc2">봉쇄 해제 조건</td><td colspan="3" style="height:36px"></td>
</tr><tr>
  <td class="lc2">예상 해제 일자</td><td></td>
  <td class="lc2">D5 승인자</td><td></td>
</tr></table>
</div>

<!-- ═══════════════════════════ D6 + D7 PAGE ═══════════════════════════ -->
<div class="page-break">
<div class="page-ref"><span>NCR-F-010 — 시정조치 요청서 (8D CAR)</span><span>D6 / D7 — 조치 검증 &amp; 재발방지</span></div>
<div class="d-cover">
  <div class="d-num">D6</div>
  <div>
    <div class="d-name">조치 이행 확인 (Implementation &amp; Verification)</div>
    <div class="d-subname">D5 시정조치가 실제로 이행되었고 근본원인이 제거되었음을 검증한다</div>
  </div>
</div>

<div class="sec">시정조치 이행 현황</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>D5 시정조치 항목 (요약)</th>
    <th style="width:80px">이행 완료일</th>
    <th style="width:120px">이행 증거 / 문서</th>
    <th style="width:65px">이행 여부</th>
  </tr>
  ${Array.from({length:6},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:38px"></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>

<div class="sec">효과 검증 (Effectiveness Verification)</div>
<table><tr>
  <td class="lc2">검증 방법</td>
  <td>
    <span class="cb"></span>생산 모니터링 &nbsp;
    <span class="cb"></span>공정능력 분석 &nbsp;
    <span class="cb"></span>고객 현장 확인 &nbsp;
    <span class="cb"></span>내부 심사 &nbsp;
    <span class="cb"></span>기타
  </td>
</tr><tr>
  <td class="lc2">검증 기간</td><td></td>
</tr></table>
<div class="write-area-lg"></div>
<table><tr>
  <td class="lc2">검증 판정</td>
  <td style="font-size:10pt;font-weight:700">
    <span class="cb"></span> 효과 확인 완료 (D3 봉쇄 해제 가능) &nbsp;&nbsp;
    <span class="cb"></span> 효과 미흡 → D4~D5 재검토 필요
  </td>
</tr></table>

<div class="d-cover" style="margin-top:16px">
  <div class="d-num">D7</div>
  <div>
    <div class="d-name">수평 전개 / 재발방지 (Systemic Prevention)</div>
    <div class="d-subname">유사 공정 / 제품에 동일 문제가 재발하지 않도록 시스템을 개선한다</div>
  </div>
</div>

<div class="sec">수평 전개 (Horizontal Deployment)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>전개 대상 공정 / 제품</th>
    <th>적용 조치 내용</th>
    <th style="width:70px">담당자</th>
    <th style="width:80px">완료 기한</th>
    <th style="width:55px">완료</th>
  </tr>
  ${Array.from({length:4},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:36px"></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span></td>
  </tr>`).join('')}
</table>

<div class="sec">문서 개정 현황 (Document Updates)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>개정 문서명</th>
    <th style="width:90px">문서 번호</th>
    <th style="width:60px">개정 번호</th>
    <th style="width:80px">개정 완료일</th>
    <th style="width:70px">담당자</th>
  </tr>
  ${Array.from({length:4},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:34px"></td><td></td><td></td><td></td><td></td>
  </tr>`).join('')}
</table>
<div class="note">※ 개정 대상: 관리계획서(CP), PFMEA, 작업표준서, 검사기준서, 협력업체 통보 등</div>
</div>

<!-- ═══════════════════════════ D8 PAGE ═══════════════════════════ -->
<div class="page-break">
<div class="page-ref"><span>NCR-F-010 — 시정조치 요청서 (8D CAR)</span><span>D8 — 완료 종결 (Closure)</span></div>
<div class="d-cover">
  <div class="d-num">D8</div>
  <div>
    <div class="d-name">완료 및 종결 (Team Recognition &amp; Closure)</div>
    <div class="d-subname">D1~D7 완료를 확인하고 팀 성과를 공식 종결한다</div>
  </div>
</div>

<div class="sec">D1~D7 완료 확인 체크리스트</div>
<table>
  <tr><th style="width:40px">D</th><th>항목</th><th style="width:80px">완료</th><th>특이사항 / 비고</th></tr>
  ${[
    ['D1','팀 구성 완료 및 팀원 서명'],
    ['D2','문제 기술 — Is / Is Not 분석 완료'],
    ['D3','긴급 봉쇄 조치 완료 및 효과 확인'],
    ['D4','근본원인 분석 (5-Why + Ishikawa) 완료'],
    ['D5','시정조치 계획 수립 및 승인'],
    ['D6','시정조치 이행 완료 및 효과 검증'],
    ['D7','수평전개 완료 및 관련 문서 개정 완료'],
  ].map(([d,item])=>`
  <tr>
    <td style="text-align:center;font-weight:900;font-size:11pt;color:#1e3a5f">${d}</td>
    <td>${item}</td>
    <td style="text-align:center"><span class="cb"></span>완료 &nbsp;<span class="cb"></span>해당없음</td>
    <td style="height:36px"></td>
  </tr>`).join('')}
</table>

<div class="sec">고객 만족도 확인</div>
<table><tr>
  <td class="lc2">고객 확인 방법</td>
  <td>
    <span class="cb"></span>서면 확인 &nbsp;
    <span class="cb"></span>현장 확인 &nbsp;
    <span class="cb"></span>전화 / 이메일 &nbsp;
    <span class="cb"></span>해당 없음
  </td>
</tr><tr>
  <td class="lc2">고객 만족 여부</td>
  <td>
    <span class="cb"></span>만족 &nbsp;&nbsp;
    <span class="cb"></span>조건부 만족 &nbsp;&nbsp;
    <span class="cb"></span>불만족 (재검토 필요)
  </td>
</tr><tr>
  <td class="lc2">고객 담당자 / 확인일</td><td></td>
</tr></table>

<div class="sec">팀 성과 공유 — Lessons Learned</div>
<div class="write-area-xl" style="min-height:100px"></div>

<div class="sec">최종 종결 서명 (Final Sign-off)</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:8px">
  ${[
    ['8D 작성자','(서명 / 날짜)'],
    ['팀 리더','(서명 / 날짜)'],
    ['품질보증팀장','(종결 승인 / 날짜)'],
    ['고객 대표','(확인 / 날짜)'],
  ].map(([role,sub])=>`
  <div style="border:1px solid #000;padding:8px;min-height:68px">
    <div style="font-size:7.5pt;color:#555;border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:4px">${role}</div>
    <div style="font-size:7.5pt;color:#aaa">${sub}</div>
  </div>`).join('')}
</div>
<table style="margin-top:8px"><tr>
  <td class="lc2" style="background:#1e3a5f;color:#fff;font-size:10pt;font-weight:900;text-align:center">종결 일자</td>
  <td style="font-size:12pt;font-weight:700;text-align:center;height:40px"></td>
  <td class="lc2" style="background:#1e3a5f;color:#fff;font-size:10pt;font-weight:900;text-align:center">CAR 상태</td>
  <td style="font-size:11pt;font-weight:700;text-align:center">
    <span class="cb"></span> CLOSED &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> IN PROGRESS
  </td>
</tr></table>
</div>
`
}

function ncrF011() {
  return `
<table><tr>
  <td class="lc">분석서 번호</td><td></td>
  <td class="lc">NCR / CAR 번호</td><td></td>
  <td class="lc">분석일</td><td></td>
</tr><tr>
  <td class="lc">품번 / 품명</td><td colspan="3"></td>
  <td class="lc">분석 담당자</td><td></td>
</tr></table>

<div class="sec">문제 현상 (Problem Statement)</div>
<div class="write-area-lg"></div>

<div class="sec">Is / Is Not 분석 — 문제 경계 정의</div>
<table>
  <tr>
    <th style="width:120px">관점</th>
    <th>IS — 해당 (문제가 있는 것)</th>
    <th>IS NOT — 비해당 (문제가 없는 것)</th>
    <th style="width:140px">차이점 (Distinction)</th>
  </tr>
  <tr><td class="lc">무엇 (What)</td><td style="height:52px"></td><td></td><td></td></tr>
  <tr><td class="lc">어디서 (Where)</td><td style="height:52px"></td><td></td><td></td></tr>
  <tr><td class="lc">언제 (When)</td><td style="height:52px"></td><td></td><td></td></tr>
  <tr><td class="lc">얼마나 (How Much)</td><td style="height:52px"></td><td></td><td></td></tr>
</table>

<div class="sec">특성요인도 (Ishikawa / 6M) — 잠재 원인 목록</div>
<table>
  <tr>
    <th style="width:150px">분류 (6M)</th>
    <th>잠재 원인 목록</th>
    <th style="width:55px">채택</th>
  </tr>
  ${[
    'Man (작업자 / 교육)',
    'Machine (설비 / 치공구)',
    'Material (원재료 / 부품)',
    'Method (작업표준 / 절차)',
    'Measurement (측정 / 검사)',
    'Environment (환경 / 5S)',
  ].map(label=>`
  <tr>
    <td class="lc" style="font-size:8.5pt">${label}</td>
    <td style="height:42px"></td>
    <td style="text-align:center"><span class="cb"></span></td>
  </tr>`).join('')}
</table>

<div class="sec">5-Why 분석 — 발생 원인 (Occurrence)</div>
<table>
  <tr>
    <th style="width:120px">단계</th>
    <th>질문 (왜?)</th>
    <th>답변 (원인 / 근거)</th>
    <th style="width:70px">검증</th>
  </tr>
  <tr><td class="lc">1st Why</td><td style="height:48px"></td><td></td><td></td></tr>
  <tr><td class="lc">2nd Why</td><td style="height:48px"></td><td></td><td></td></tr>
  <tr><td class="lc">3rd Why</td><td style="height:48px"></td><td></td><td></td></tr>
  <tr><td class="lc">4th Why</td><td style="height:48px"></td><td></td><td></td></tr>
  <tr>
    <td class="lc" style="background:#ffd700;color:#1e3a5f;font-weight:900">5th Why<br>(발생 근본원인)</td>
    <td style="height:55px;background:#fffae0;font-weight:700"></td>
    <td style="background:#fffae0;font-weight:700"></td>
    <td style="background:#fffae0"></td>
  </tr>
</table>

<div class="sec">5-Why 분석 — 유출 원인 (왜 검출하지 못했는가)</div>
<table>
  <tr>
    <th style="width:120px">단계</th>
    <th>질문 (왜 검출 / 차단하지 못했는가?)</th>
    <th>답변 (원인 / 근거)</th>
    <th style="width:70px">검증</th>
  </tr>
  <tr><td class="lc">유출 경로</td><td style="height:44px"></td><td></td><td></td></tr>
  <tr>
    <td class="lc" style="background:#ffd700;color:#1e3a5f;font-weight:900">유출<br>근본원인</td>
    <td style="height:50px;background:#fffae0;font-weight:700"></td>
    <td style="background:#fffae0;font-weight:700"></td>
    <td style="background:#fffae0"></td>
  </tr>
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">분석 담당자 (서명 / 날짜)</div></div>
  <div class="sbox"><div class="st">부서장 (검토 / 날짜)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인 / 날짜)</div></div>
</div>`
}

function ncrF012() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">관리 연도</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">관리 부서</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">작성자 (QA)</td><td style="border:none;width:130px"></td>
  </tr></table>
</div>

<div class="sec">CAPA 추적 대장 (Corrective &amp; Preventive Action Log)</div>
<div class="note" style="margin-bottom:4px">
  ※ 발생유형: CC(고객불만) / IQC(수입검사) / IPQC(공정) / OQC(출하) / AUD(심사) / 기타 &nbsp;|&nbsp;
  상태: O(진행중) / V(효과확인중) / C(종결) / H(보류)
</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th style="width:90px">CAR 번호</th>
    <th style="width:70px">발생일</th>
    <th style="width:55px">유형</th>
    <th>불량 내용 (요약)</th>
    <th style="width:65px">품번</th>
    <th style="width:65px">담당 부서</th>
    <th style="width:70px">완료 기한</th>
    <th style="width:45px">D3<br>봉쇄</th>
    <th style="width:45px">D5<br>조치</th>
    <th style="width:45px">D6<br>검증</th>
    <th style="width:45px">D8<br>종결</th>
    <th style="width:70px">종결일자</th>
    <th style="width:45px">상태</th>
  </tr>
  ${Array.from({length:15},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb;font-size:7.5pt">${i+1}</td>
    <td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td>
    <td style="text-align:center;font-size:8pt"></td>
    <td style="text-align:center;font-size:8pt"></td>
    <td style="text-align:center;font-size:8pt"></td>
    <td style="text-align:center;font-size:8pt"></td>
    <td></td>
    <td style="text-align:center;font-weight:700;font-size:8.5pt"></td>
  </tr>`).join('')}
</table>

<div class="sec">CAPA 현황 요약</div>
<table>
  <tr>
    <td class="lc2" style="width:140px">총 CAPA 건수</td><td></td>
    <td class="lc2">종결 건수</td><td></td>
    <td class="lc2">진행중 건수</td><td></td>
    <td class="lc2">보류 건수</td><td></td>
  </tr>
  <tr>
    <td class="lc2">기한 초과 건수</td><td style="font-weight:700;color:#c00"></td>
    <td class="lc2">종결률 (%)</td><td></td>
    <td class="lc2">평균 처리 기간 (일)</td><td></td>
    <td class="lc2">최종 갱신일</td><td></td>
  </tr>
</table>

<div class="sign sign3">
  <div class="sbox" style="min-height:48px"><div class="st">작성자 QA (서명)</div></div>
  <div class="sbox" style="min-height:48px"><div class="st">품질보증팀장 (검토 / 날짜)</div></div>
  <div class="sbox" style="min-height:48px"><div class="st">임원 / 대표이사 (확인)</div></div>
</div>`
}

function qmsF003() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">관리 연도</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">작성 부서</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">작성자</td><td style="border:none;width:130px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">작성일</td><td style="border:none"></td>
    <td style="border:none" class="lc2">최종 검토일</td><td style="border:none"></td>
    <td style="border:none" class="lc2">차기 검토 예정</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">리스크 / 기회 평가표 (ISO 9001 §6.1)</div>
<div class="note" style="margin-bottom:4px">
  ※ 가능성(L): 1=매우낮음 / 2=낮음 / 3=보통 / 4=높음 / 5=매우높음 &nbsp;|&nbsp;
  심각도(S): 1=무시 / 2=경미 / 3=보통 / 4=심각 / 5=치명적 &nbsp;|&nbsp;
  위험도 = L×S &nbsp;|&nbsp;
  등급: ≥16 긴급(RED) / 9~15 중요(AMBER) / ≤8 모니터링(GREEN)
</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>리스크 / 기회 항목</th>
    <th style="width:70px">카테고리</th>
    <th style="width:50px">가능성<br>L (1~5)</th>
    <th style="width:50px">심각도<br>S (1~5)</th>
    <th style="width:50px">위험도<br>L×S</th>
    <th style="width:45px">등급</th>
    <th style="width:70px">처리 방법</th>
    <th>대응 / 완화 계획</th>
    <th style="width:65px">담당자</th>
    <th style="width:65px">완료 기한</th>
    <th style="width:50px">재평가<br>위험도</th>
  </tr>
  ${Array.from({length:12},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:28px"></td>
    <td></td>
    <td style="text-align:center"></td>
    <td style="text-align:center"></td>
    <td style="text-align:center;font-weight:700"></td>
    <td style="text-align:center"></td>
    <td></td><td></td><td></td><td></td>
    <td style="text-align:center"></td>
  </tr>`).join('')}
</table>
<div class="note">※ 처리방법: 회피(Avoid) / 경감(Reduce) / 이전(Transfer) / 수용(Accept) / 활용(Exploit, 기회 시)</div>

<div class="sec">리스크 현황 요약</div>
<table>
  <tr>
    <td class="lc2" style="width:140px">식별된 리스크 총수</td><td></td>
    <td class="lc2">긴급(RED) 건수</td><td style="font-weight:700;color:#c00"></td>
    <td class="lc2">중요(AMBER) 건수</td><td></td>
    <td class="lc2">모니터링(GREEN)</td><td></td>
  </tr>
</table>

<div class="sign sign3">
  <div class="sbox" style="min-height:50px"><div class="st">작성자 (서명)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">부서장 (검토)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">품질보증팀장 (승인)</div></div>
</div>`
}

function qmsF020() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">대상 연도</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">수립일</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">최종 검토일</td><td style="border:none;width:130px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">작성 부서</td><td style="border:none"></td>
    <td style="border:none" class="lc2">작성자</td><td style="border:none"></td>
    <td style="border:none" class="lc2">승인자</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">품질 목표 관리표 (ISO 9001 §6.2)</div>
<div class="note" style="margin-bottom:4px">
  ※ 달성여부: ○ 달성 / △ 근소미달(90% 이상) / × 미달 (90% 미만) | 색상: 미달 항목은 적색 표기
</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>품질 목표 항목</th>
    <th style="width:40px">단위</th>
    <th style="width:70px">전년도 실적</th>
    <th style="width:70px">당해 목표</th>
    <th style="width:65px">1Q 실적</th>
    <th style="width:65px">2Q 실적</th>
    <th style="width:65px">3Q 실적</th>
    <th style="width:65px">4Q 실적</th>
    <th style="width:70px">연간 실적</th>
    <th style="width:50px">달성</th>
    <th>미달 원인 / 개선 계획</th>
  </tr>
  <tr>
    <td style="text-align:center;background:#ffe8b0;font-weight:900;font-size:9pt">1</td>
    <td style="background:#fffae0">내부 불량률 (IQC+IPQC+OQC)</td>
    <td style="text-align:center">%</td>
    ${Array(9).fill('<td></td>').join('')}
  </tr>
  <tr>
    <td style="text-align:center;background:#ffe8b0;font-weight:900;font-size:9pt">2</td>
    <td style="background:#fffae0">고객 불만 건수</td>
    <td style="text-align:center">건</td>
    ${Array(9).fill('<td></td>').join('')}
  </tr>
  <tr>
    <td style="text-align:center;background:#ffe8b0;font-weight:900;font-size:9pt">3</td>
    <td style="background:#fffae0">납기준수율 (OTD)</td>
    <td style="text-align:center">%</td>
    ${Array(9).fill('<td></td>').join('')}
  </tr>
  <tr>
    <td style="text-align:center;background:#ffe8b0;font-weight:900;font-size:9pt">4</td>
    <td style="background:#fffae0">협력사 품질지수 (평균 점수)</td>
    <td style="text-align:center">점</td>
    ${Array(9).fill('<td></td>').join('')}
  </tr>
  <tr>
    <td style="text-align:center;background:#ffe8b0;font-weight:900;font-size:9pt">5</td>
    <td style="background:#fffae0">CAPA 적기 완결률</td>
    <td style="text-align:center">%</td>
    ${Array(9).fill('<td></td>').join('')}
  </tr>
  <tr>
    <td style="text-align:center;background:#ffe8b0;font-weight:900;font-size:9pt">6</td>
    <td style="background:#fffae0">내부 심사 지적사항 완결률</td>
    <td style="text-align:center">%</td>
    ${Array(9).fill('<td></td>').join('')}
  </tr>
  ${Array.from({length:4},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+7}</td>
    <td style="height:28px"></td><td></td>
    ${Array(9).fill('<td></td>').join('')}
  </tr>`).join('')}
</table>

<div class="sec">연간 종합 평가</div>
<table>
  <tr>
    <td class="lc2" style="width:140px">전체 목표 항목 수</td><td></td>
    <td class="lc2">달성 항목 수</td><td></td>
    <td class="lc2">미달 항목 수</td><td style="color:#c00;font-weight:700"></td>
    <td class="lc2">목표 달성률</td><td></td>
  </tr>
</table>
<table><tr><td class="lc2">종합 의견 및 차년도 개선 방향</td><td class="blank2"></td></tr></table>

<div class="sign sign3">
  <div class="sbox" style="min-height:50px"><div class="st">품질보증팀장 (작성)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">임원 (검토)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">대표이사 (승인)</div></div>
</div>`
}

function qmsF030() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">관리 부서</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">작성자</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">작성일</td><td style="border:none;width:110px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">최종 검토일</td><td style="border:none"></td>
    <td style="border:none" class="lc2">차기 검토 예정</td><td style="border:none"></td>
    <td style="border:none" class="lc2">승인자</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="note" style="margin-bottom:6px">
  ※ 역량 수준 기준: &nbsp;
  <strong>1</strong> = 교육 필요 (Needs Training) &nbsp;|&nbsp;
  <strong>2</strong> = 기본 수행 가능 (Basic) &nbsp;|&nbsp;
  <strong>3</strong> = 독자 수행 가능 (Proficient) &nbsp;|&nbsp;
  <strong>4</strong> = 타인 지도 가능 (Expert) &nbsp;&nbsp;
  목표: 핵심 직무 Level 3 이상 / CC·SC 직무 Level 4
</div>

<div class="sec">직무 역량 매트릭스 (Skill Matrix)</div>
<table>
  <tr>
    <th rowspan="2" style="width:100px">직무 항목</th>
    <th rowspan="2">직무 설명 / 평가 기준</th>
    <th rowspan="2" style="width:50px">목표<br>수준</th>
    <th colspan="8" style="background:#e8f0ff">사원별 역량 수준</th>
    <th rowspan="2" style="width:100px">교육 계획</th>
    <th rowspan="2" style="width:70px">교육 목표일</th>
  </tr>
  <tr>
    <th style="width:48px;background:#e8f0ff">성명</th>
    <th style="width:48px;background:#e8f0ff">성명</th>
    <th style="width:48px;background:#e8f0ff">성명</th>
    <th style="width:48px;background:#e8f0ff">성명</th>
    <th style="width:48px;background:#e8f0ff">성명</th>
    <th style="width:48px;background:#e8f0ff">성명</th>
    <th style="width:48px;background:#e8f0ff">성명</th>
    <th style="width:48px;background:#e8f0ff">성명</th>
  </tr>
  ${Array.from({length:14},(_,i)=>`
  <tr>
    <td style="height:28px"></td><td></td>
    <td style="text-align:center;font-weight:700"></td>
    ${Array(8).fill('<td style="text-align:center"></td>').join('')}
    <td></td><td></td>
  </tr>`).join('')}
</table>

<div class="sec">역량 갭 현황 요약</div>
<table>
  <tr>
    <td class="lc2">목표 수준 미달 직무 수</td><td></td>
    <td class="lc2">Level 1 사원 수</td><td style="color:#c00;font-weight:700"></td>
    <td class="lc2">교육 필요 사원 수</td><td></td>
    <td class="lc2">교육 완료 예정일</td><td></td>
  </tr>
</table>

<div class="sign sign3">
  <div class="sbox" style="min-height:50px"><div class="st">작성자 (서명)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">부서장 (검토)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">품질보증팀장 (승인)</div></div>
</div>`
}

function qmsF100() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">출하 허가 번호</td><td style="border:none;width:140px"></td>
    <td style="border:none" class="lc2">OQC 성적서 번호</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">출하 지시번호</td><td style="border:none;width:130px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">납품처</td><td style="border:none"></td>
    <td style="border:none" class="lc2">납품 예정일</td><td style="border:none"></td>
    <td style="border:none" class="lc2">납품 LOT No.</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">품번</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품명</td><td style="border:none"></td>
    <td style="border:none" class="lc2">도면 개정번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">출하 수량</td><td style="border:none"></td>
    <td style="border:none" class="lc2">차량번호 / 운송사</td><td style="border:none"></td>
    <td style="border:none" class="lc2">허가 일시</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">출하 전 최종 확인 체크리스트</div>
<table>
  <tr>
    <th style="width:220px">확인 항목</th>
    <th style="width:90px">결과</th>
    <th>비고 / 확인 근거</th>
  </tr>
  ${[
    'OQC 성적서 — 최신본 완비 및 합격 판정 확인',
    '출하 수량 — 출하 지시서와 실물 수량 일치',
    '품번 · 품명 — 라벨 표기 정확성 확인',
    'LOT 번호 — 성적서와 현물 LOT 일치',
    '포장 상태 — 외관 파손 / 이물질 없음',
    '부적합품 / 보류품 혼입 없음 (적색태그 미포함)',
    '고객 특이 요구사항 충족 (SDS, CoC 등)',
    '특채 품목 해당 여부 (해당 시 QMS-F-101 첨부)',
  ].map(item=>`
  <tr>
    <td class="lc" style="font-size:8.5pt">${item}</td>
    <td style="text-align:center"><span class="cb"></span>적합 &nbsp;<span class="cb"></span>부적합 &nbsp;<span class="cb"></span>N/A</td>
    <td style="height:26px"></td>
  </tr>`).join('')}
</table>

<div style="text-align:center;font-size:15pt;font-weight:900;border:2px solid #1e3a5f;padding:16px;margin:12px 0;background:#f0f4f8;color:#1e3a5f">
  <span class="cb"></span> 출하 허가 (Shipment APPROVED) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <span class="cb"></span> 출하 보류 (Shipment ON HOLD)
</div>
<table><tr>
  <td class="lc2">보류 / 특이사항</td><td class="blank2"></td>
</tr></table>

<div class="sign sign4" style="margin-top:10px">
  <div class="sbox" style="min-height:55px"><div class="st">출하검사원 QA (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">품질보증팀장 (최종 허가 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">물류팀 (수령 확인 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">허가 일시</div></div>
</div>`
}

function qmsF101() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">특채 승인 번호</td><td style="border:none;width:140px"></td>
    <td style="border:none" class="lc2">NCR 번호</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">요청일</td><td style="border:none;width:110px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">품번</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품명</td><td style="border:none"></td>
    <td style="border:none" class="lc2">도면 개정번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">LOT 번호</td><td style="border:none"></td>
    <td style="border:none" class="lc2">특채 수량</td><td style="border:none"></td>
    <td style="border:none" class="lc2">사용 / 납품 공정</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">공급업체</td><td style="border:none"></td>
    <td style="border:none" class="lc2">특채 유효 기간</td><td style="border:none"></td>
    <td style="border:none" class="lc2">요청 부서</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">1. 부적합 내용 상세</div>
<table>
  <tr>
    <td class="lc2" style="width:140px">부적합 항목</td>
    <td class="blank2" colspan="3"></td>
  </tr>
  <tr>
    <td class="lc2">규격 (기준값)</td><td></td>
    <td class="lc2">실측값 / 발생값</td><td></td>
  </tr>
  <tr>
    <td class="lc2">이탈량 / 이탈률</td><td></td>
    <td class="lc2">불량 유형</td>
    <td>
      <span class="cb"></span>치수 &nbsp;<span class="cb"></span>외관 &nbsp;<span class="cb"></span>기능 &nbsp;
      <span class="cb"></span>재질 &nbsp;<span class="cb"></span>기타
    </td>
  </tr>
</table>

<div class="sec">2. 특채 사유 및 위험 평가</div>
<table>
  <tr><td class="lc2" style="width:140px">특채 사유</td><td colspan="3" class="blank2"></td></tr>
  <tr>
    <td class="lc2">기능 / 안전에 미치는 영향</td>
    <td>
      <span class="cb"></span>무영향 &nbsp;
      <span class="cb"></span>경미 (기능 저하 없음) &nbsp;
      <span class="cb"></span>중간 (기능 경미 영향) &nbsp;
      <span class="cb"></span>중대 (안전 / 고객 승인 필수)
    </td>
    <td class="lc2" style="width:120px">위험도 등급</td>
    <td style="width:80px">
      <span class="cb"></span>Low &nbsp;<span class="cb"></span>Med &nbsp;<span class="cb"></span>High
    </td>
  </tr>
  <tr>
    <td class="lc2">고객 사전 승인</td>
    <td colspan="3">
      <span class="cb"></span>필요 → 고객 승인 번호: ___________________________ &nbsp;
      <span class="cb"></span>불필요
    </td>
  </tr>
  <tr>
    <td class="lc2">추가 검사 요건</td>
    <td colspan="3">
      <span class="cb"></span>전수 검사 &nbsp;
      <span class="cb"></span>샘플링 강화 &nbsp;
      <span class="cb"></span>현행 AQL 유지 &nbsp;
      <span class="cb"></span>없음
    </td>
  </tr>
</table>

<div class="sec">3. 재발방지 및 사후 조치</div>
<table>
  <tr><td class="lc2" style="width:140px">재발방지 대책</td><td class="blank2"></td></tr>
  <tr>
    <td class="lc2">CAPA 연계</td>
    <td>
      <span class="cb"></span>CAR 발행 (CAR No: _____________) &nbsp;
      <span class="cb"></span>모니터링 강화 &nbsp;
      <span class="cb"></span>해당 없음
    </td>
  </tr>
  <tr>
    <td class="lc2">처리 완료 기한</td><td></td>
  </tr>
</table>

<div class="sign sign5" style="margin-top:10px">
  <div class="sbox" style="min-height:50px"><div class="st">요청자 (서명)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">엔지니어링 (검토)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">품질보증팀장 (승인)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">고객 담당자 (필요시)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">승인 일자</div></div>
</div>`
}

function qmsF102() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">ISIR 번호</td><td style="border:none;width:140px"></td>
    <td style="border:none" class="lc2">제출일</td><td style="border:none;width:110px"></td>
    <td style="border:none" class="lc2">납품처</td><td style="border:none;width:130px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">품번</td><td style="border:none"></td>
    <td style="border:none" class="lc2">품명</td><td style="border:none"></td>
    <td style="border:none" class="lc2">도면 개정번호</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">초도 로트 수량</td><td style="border:none"></td>
    <td style="border:none" class="lc2">PPAP Level</td><td style="border:none"></td>
    <td style="border:none" class="lc2">제출 사유</td>
    <td style="border:none">
      <span class="cb"></span>신규 &nbsp;<span class="cb"></span>설계변경 &nbsp;
      <span class="cb"></span>공정변경 &nbsp;<span class="cb"></span>공급업체 변경 &nbsp;<span class="cb"></span>기타
    </td>
  </tr><tr>
    <td style="border:none" class="lc2">생산일자</td><td style="border:none"></td>
    <td style="border:none" class="lc2">측정자 (QA)</td><td style="border:none"></td>
    <td style="border:none" class="lc2">측정장비 번호</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">치수 측정 결과 (전항목 측정 — PPAP 필수)</div>
<div class="note" style="margin-bottom:4px">
  ※ 특성: CC=핵심특성 / SC=중요특성 | Ppk ≥ 1.67 (신규), Cpk ≥ 1.33 (양산) 이상 목표
</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th style="width:55px">도면<br>풍선번호</th>
    <th>특성 항목</th>
    <th style="width:45px">특성<br>구분</th>
    <th style="width:120px">규격 (기준값)</th>
    <th style="width:65px">측정값 1</th>
    <th style="width:65px">측정값 2</th>
    <th style="width:65px">측정값 3</th>
    <th style="width:55px">평균</th>
    <th style="width:50px">Ppk</th>
    <th style="width:50px">판정</th>
  </tr>
  ${Array.from({length:15},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:28px"></td><td></td><td></td><td></td>
    <td></td><td></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>

<div class="sec">PPAP 제출 항목 체크리스트</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>제출 항목 (AIAG PPAP 4th Ed.)</th>
    <th style="width:80px">적용 여부</th>
    <th style="width:80px">제출 여부</th>
    <th>비고 / 문서번호</th>
  </tr>
  ${[
    '설계 기록 (Design Records / 도면)',
    '설계 FMEA (DFMEA)',
    '공정흐름도 (PFD — Process Flow Diagram)',
    '공정 FMEA (PFMEA)',
    '관리계획서 (Control Plan)',
    '측정시스템 분석 (MSA — Gage R&R)',
    '초기 공정능력 연구 (Ppk ≥ 1.67)',
    '수입검사 / 초도품 성적서 (본 양식)',
    '외관 승인 보고서 (AAR)',
    '치수 측정 결과 (전항목)',
    '재질 성적서 (Mill Sheet / RoHS 포함)',
    '초도품 현물 샘플',
  ].map((item,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td>${item}</td>
    <td style="text-align:center"><span class="cb"></span>적용 &nbsp;<span class="cb"></span>면제</td>
    <td style="text-align:center"><span class="cb"></span>제출 &nbsp;<span class="cb"></span>미제출</td>
    <td style="height:26px"></td>
  </tr>`).join('')}
</table>

<div class="sec">ISIR 최종 판정</div>
<table><tr>
  <td style="text-align:center;font-size:12pt;font-weight:900;padding:14px">
    <span class="cb"></span> 승인 (Approved) &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 조건부 승인 (Interim Approval) &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 거절 (Rejected — 재제출 필요)
  </td>
</tr></table>

<div class="sign sign3" style="margin-top:10px">
  <div class="sbox" style="min-height:55px"><div class="st">품질보증팀장 (작성 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">개발 / 생산팀장 (확인)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">고객 승인 (날짜)</div></div>
</div>`
}

function qmsF110() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">변경 요청 번호</td><td style="border:none;width:140px"></td>
    <td style="border:none" class="lc2">요청일</td><td style="border:none;width:110px"></td>
    <td style="border:none" class="lc2">예상 적용일</td><td style="border:none;width:110px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">요청 부서</td><td style="border:none"></td>
    <td style="border:none" class="lc2">요청자</td><td style="border:none"></td>
    <td style="border:none" class="lc2">관련 품번</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">변경 유형</td>
    <td colspan="5" style="border:none">
      <span class="cb"></span>제품 / 도면 &nbsp;
      <span class="cb"></span>공정 (4M) &nbsp;
      <span class="cb"></span>원자재 / 부품 &nbsp;
      <span class="cb"></span>공급업체 &nbsp;
      <span class="cb"></span>설비 / 금형 &nbsp;
      <span class="cb"></span>품질 시스템 &nbsp;
      <span class="cb"></span>기타
    </td>
  </tr><tr>
    <td style="border:none" class="lc2">4M 세부 (해당 시)</td>
    <td style="border:none">
      <span class="cb"></span>Man (인원) &nbsp;
      <span class="cb"></span>Machine (설비) &nbsp;
      <span class="cb"></span>Material (자재) &nbsp;
      <span class="cb"></span>Method (방법)
    </td>
    <td style="border:none" class="lc2">대상 공정</td><td style="border:none" colspan="3"></td>
  </tr></table>
</div>

<div class="sec">1. 변경 내용 (Change Description)</div>
<table>
  <tr>
    <td class="lc2" style="width:140px">변경 전 현황 (Before)</td>
    <td style="height:55px;vertical-align:top;padding:6px;background:#fafafa"></td>
  </tr>
  <tr>
    <td class="lc2">변경 후 내용 (After)</td>
    <td style="height:55px;vertical-align:top;padding:6px;background:#fafafa"></td>
  </tr>
  <tr>
    <td class="lc2">변경 사유 (Why)</td>
    <td style="height:40px;vertical-align:top;padding:6px"></td>
  </tr>
  <tr>
    <td class="lc2">기대 효과</td>
    <td style="height:35px;vertical-align:top;padding:6px"></td>
  </tr>
</table>

<div class="sec">2. 영향 평가 (Impact Assessment)</div>
<table>
  <tr>
    <td class="lc2" style="width:140px">고객 사전 승인</td>
    <td>
      <span class="cb"></span>필요 → 승인 획득 전 적용 불가 (승인번호: _______________) &nbsp;
      <span class="cb"></span>불필요
    </td>
  </tr>
  <tr>
    <td class="lc2">PPAP 재제출</td>
    <td>
      <span class="cb"></span>Level 1 &nbsp;<span class="cb"></span>Level 2 &nbsp;
      <span class="cb"></span>Level 3 &nbsp;<span class="cb"></span>Level 4 &nbsp;
      <span class="cb"></span>불필요
    </td>
  </tr>
  <tr>
    <td class="lc2">시험 / 검증 필요</td>
    <td>
      <span class="cb"></span>초물 검사 &nbsp;<span class="cb"></span>신뢰성 시험 &nbsp;
      <span class="cb"></span>현장 파일럿 &nbsp;<span class="cb"></span>불필요 &nbsp;
      검증 계획: ___________________________
    </td>
  </tr>
  <tr>
    <td class="lc2">개정 필요 문서</td>
    <td>
      <span class="cb"></span>도면 &nbsp;<span class="cb"></span>PFMEA &nbsp;
      <span class="cb"></span>관리계획서 &nbsp;<span class="cb"></span>작업표준서 &nbsp;
      <span class="cb"></span>ISIR &nbsp;<span class="cb"></span>없음
    </td>
  </tr>
  <tr>
    <td class="lc2">변경 위험도</td>
    <td>
      <span class="cb"></span>Low (경미, 즉시 적용 가능) &nbsp;
      <span class="cb"></span>Medium (검증 후 적용) &nbsp;
      <span class="cb"></span>High (고객 승인 + 시험 후 적용)
    </td>
  </tr>
</table>

<div class="sec">3. 변경 이력</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th style="width:70px">변경일</th>
    <th>변경 내용 요약</th>
    <th style="width:80px">변경자</th>
    <th style="width:80px">승인자</th>
    <th style="width:70px">적용일</th>
  </tr>
  ${Array.from({length:4},(_,i)=>`
  <tr><td style="text-align:center;color:#bbb">${i+1}</td><td style="height:26px"></td><td></td><td></td><td></td><td></td></tr>`).join('')}
</table>

<div class="sign sign4" style="margin-top:10px">
  <div class="sbox" style="min-height:55px"><div class="st">요청자 (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">품질보증팀장 (영향평가 / 날짜)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">개발 / 생산팀장 (기술검토)</div></div>
  <div class="sbox" style="min-height:55px"><div class="st">대표이사 (최종 승인)</div></div>
</div>`
}

function supF001() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">공급업체명</td><td style="border:none;width:150px"></td>
    <td style="border:none" class="lc2">평가일</td><td style="border:none;width:110px"></td>
    <td style="border:none" class="lc2">평가자 (소속)</td><td style="border:none;width:130px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">대표자</td><td style="border:none"></td>
    <td style="border:none" class="lc2">소재지</td><td style="border:none" colspan="3"></td>
  </tr><tr>
    <td style="border:none" class="lc2">주요 납품 품목</td><td style="border:none"></td>
    <td style="border:none" class="lc2">인증 현황</td>
    <td style="border:none">
      <span class="cb"></span>ISO 9001 &nbsp;<span class="cb"></span>IATF 16949 &nbsp;
      <span class="cb"></span>ISO 14001 &nbsp;<span class="cb"></span>없음
    </td>
    <td style="border:none" class="lc2">평가 목적</td>
    <td style="border:none">
      <span class="cb"></span>신규 등록 &nbsp;<span class="cb"></span>정기평가 &nbsp;<span class="cb"></span>특별평가
    </td>
  </tr><tr>
    <td style="border:none" class="lc2">직전 평가 등급</td><td style="border:none"></td>
    <td style="border:none" class="lc2">직전 평가일</td><td style="border:none"></td>
    <td style="border:none" class="lc2">직전 PPM 실적</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">공급업체 평가 항목 (100점 만점)</div>
<table>
  <tr>
    <th style="width:110px">평가 분야</th>
    <th>평가 항목</th>
    <th style="width:55px">배점</th>
    <th style="width:65px">취득 점수</th>
    <th>평가 의견 / 근거</th>
  </tr>
  <tr>
    <td class="lc" rowspan="5" style="text-align:center">품질 시스템<br><span style="font-size:8pt;font-weight:400">(40점)</span></td>
    <td>ISO 9001 / IATF 16949 인증 보유 및 유효성</td>
    <td style="text-align:center">10</td><td></td><td style="height:26px"></td>
  </tr>
  <tr><td>품질 조직 / 역할 / 책임 명확성</td><td style="text-align:center">8</td><td></td><td></td></tr>
  <tr><td>공정 FMEA / 관리계획서 보유 및 최신화</td><td style="text-align:center">8</td><td></td><td></td></tr>
  <tr><td>측정장비 교정 및 MSA 체계 운영</td><td style="text-align:center">7</td><td></td><td></td></tr>
  <tr><td>부적합품 관리 / CAPA 체계 운영</td><td style="text-align:center">7</td><td></td><td></td></tr>
  <tr>
    <td class="lc" rowspan="4" style="text-align:center">기술 능력<br><span style="font-size:8pt;font-weight:400">(30점)</span></td>
    <td>주요 생산 설비 보유 현황 (전용 / 범용)</td>
    <td style="text-align:center">8</td><td></td><td></td>
  </tr>
  <tr><td>품질 실적 — PPM / 클레임 발생 이력</td><td style="text-align:center">8</td><td></td><td></td></tr>
  <tr><td>기술 인력 보유 수준 (엔지니어 수)</td><td style="text-align:center">7</td><td></td><td></td></tr>
  <tr><td>신기술 / 개선 의지 (원가절감 제안 등)</td><td style="text-align:center">7</td><td></td><td></td></tr>
  <tr>
    <td class="lc" rowspan="2" style="text-align:center">가격 경쟁력<br><span style="font-size:8pt;font-weight:400">(15점)</span></td>
    <td>견적가 경쟁력 (시장 대비)</td>
    <td style="text-align:center">8</td><td></td><td></td>
  </tr>
  <tr><td>원가절감 의지 / VA/VE 활동 이력</td><td style="text-align:center">7</td><td></td><td></td></tr>
  <tr>
    <td class="lc" rowspan="2" style="text-align:center">납기 능력<br><span style="font-size:8pt;font-weight:400">(15점)</span></td>
    <td>납기준수율 이력 (OTD %)</td>
    <td style="text-align:center">8</td><td></td><td></td>
  </tr>
  <tr><td>생산 CAPA / 비상 생산 대응 역량</td><td style="text-align:center">7</td><td></td><td></td></tr>
  <tr style="font-weight:900;background:#e8f0ff">
    <td colspan="2" style="text-align:right">합 계</td>
    <td style="text-align:center;font-weight:900">100</td>
    <td style="font-weight:900"></td>
    <td></td>
  </tr>
</table>

<div class="sec">종합 판정</div>
<table><tr>
  <td style="text-align:center;font-size:12pt;font-weight:900;padding:14px;width:70%">
    <span class="cb"></span> A: 80점 이상 → 등록 승인 (우수) &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> B: 70~79점 → 등록 승인 (보통) &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> C: 60~69점 → 조건부 등록 &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> D: 60점 미만 → 등록 불가
  </td>
  <td style="vertical-align:top;padding:6px">
    <div style="font-size:8pt;font-weight:700;color:#1e3a5f;margin-bottom:4px">조건부 등록 조건 / 개선 요구사항</div>
    <div style="border:1px solid #aaa;min-height:60px;background:#fafafa;padding:5px;font-size:8pt"></div>
  </td>
</tr></table>
<table><tr>
  <td class="lc2">총점</td><td></td>
  <td class="lc2">최종 판정 등급</td><td style="font-weight:700;font-size:11pt"></td>
  <td class="lc2">다음 정기 평가일</td><td></td>
</tr></table>

<div class="sign sign3" style="margin-top:10px">
  <div class="sbox" style="min-height:50px"><div class="st">평가자 (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">품질보증팀장 (검토)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">구매팀장 (승인)</div></div>
</div>`
}

function audF002() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">심사 번호</td><td style="border:none;width:140px"></td>
    <td style="border:none" class="lc2">심사일</td><td style="border:none;width:110px"></td>
    <td style="border:none" class="lc2">심사 연도 계획</td><td style="border:none;width:110px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">수감 부서</td><td style="border:none"></td>
    <td style="border:none" class="lc2">수감 부서장</td><td style="border:none"></td>
    <td style="border:none" class="lc2">심사 범위</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">심사원 (Lead)</td><td style="border:none"></td>
    <td style="border:none" class="lc2">보조 심사원</td><td style="border:none"></td>
    <td style="border:none" class="lc2">심사 기준</td>
    <td style="border:none">
      <span class="cb"></span>ISO 9001 &nbsp;<span class="cb"></span>IATF 16949 &nbsp;<span class="cb"></span>내부 절차
    </td>
  </tr></table>
</div>

<div class="sec">내부 심사 체크리스트 (ISO 9001:2015)</div>
<div class="note" style="margin-bottom:4px">
  ※ 판정: &nbsp;<strong>O</strong> 적합 &nbsp;|&nbsp; <strong>×</strong> 부적합 — 발견사항 보고서 발행 필수 &nbsp;|&nbsp;
  <strong>△</strong> 관찰사항 — 개선 권고 &nbsp;|&nbsp; <strong>N/A</strong> 해당 없음
</div>
<table>
  <tr>
    <th style="width:55px">조항</th>
    <th>심사 항목</th>
    <th style="width:60px">판정<br>O/×/△</th>
    <th style="width:65px">지적<br>유형</th>
    <th>증거 자료 / 관찰 내용</th>
  </tr>
  ${[
    ['§4.1','조직의 상황 (내/외부 이슈) 파악 및 문서화'],
    ['§4.2','이해관계자의 요구사항 파악 및 모니터링'],
    ['§4.4','QMS 프로세스 수립 및 유지'],
    ['§5.1','최고경영자의 리더십 및 경영 의지'],
    ['§5.2','품질 방침 수립 / 전달 / 이해'],
    ['§5.3','역할 / 책임 / 권한 부여 및 소통'],
    ['§6.1','리스크 및 기회 식별 / 관리 계획'],
    ['§6.2','품질 목표 수립, 추진 계획, 모니터링'],
    ['§7.1','인원 / 인프라 / 프로세스 환경 자원 충족'],
    ['§7.2','인원 역량 확보 및 교육훈련 체계'],
    ['§7.4','내/외부 소통 체계 운영'],
    ['§7.5','문서화된 정보 관리 (작성/최신화/배포)'],
    ['§8.1','운영 계획 및 관리 프로세스 운영'],
    ['§8.4','외부 공급자 선정 / 평가 / 모니터링'],
    ['§8.5','생산·서비스 제공 (식별/추적성/방호)'],
    ['§8.6','제품/서비스 출하 적합성 확인 (검사)'],
    ['§8.7','부적합품 식별 / 격리 / 처리 체계'],
    ['§9.1','성과 모니터링 및 KPI 분석'],
    ['§9.2','내부심사 계획 및 실시 체계'],
    ['§9.3','경영검토 실시 및 기록'],
    ['§10.2','시정조치 (8D/CAPA) 운영 및 종결 관리'],
    ['§10.3','지속적 개선 활동 증거'],
  ].map(([clause, item])=>`
  <tr>
    <td style="text-align:center;font-size:8pt;font-weight:700">${clause}</td>
    <td>${item}</td>
    <td style="text-align:center;font-size:9pt"></td>
    <td style="text-align:center;font-size:8pt"></td>
    <td style="height:26px"></td>
  </tr>`).join('')}
</table>

<div class="sec">지적사항 요약 (부적합 / 관찰사항)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th style="width:55px">조항</th>
    <th style="width:70px">지적 유형</th>
    <th>지적 내용</th>
    <th style="width:70px">담당자</th>
    <th style="width:80px">완료 기한</th>
    <th style="width:70px">종결 여부</th>
  </tr>
  ${Array.from({length:6},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td></td><td></td><td style="height:28px"></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>
<div class="note">※ 지적 유형: 중대부적합(MAJ) / 경미부적합(MIN) / 관찰사항(OBS) / 강점(STR)</div>

<div class="sec">심사 결과 종합</div>
<table>
  <tr>
    <td class="lc2">부적합 건수</td><td></td>
    <td class="lc2">관찰사항 건수</td><td></td>
    <td class="lc2">강점 건수</td><td></td>
    <td class="lc2">종합 평가</td>
    <td><span class="cb"></span>적합 &nbsp;<span class="cb"></span>조건부 적합 &nbsp;<span class="cb"></span>부적합</td>
  </tr>
</table>

<div class="sign sign3" style="margin-top:10px">
  <div class="sbox" style="min-height:50px"><div class="st">심사원 Lead (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">수감 부서장 (확인 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">품질보증팀장 (승인)</div></div>
</div>`
}

function audF003() {
  return `
<!-- ── 기본 정보 ── -->
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">심사 번호</td><td style="border:none;width:140px"></td>
    <td style="border:none" class="lc2">심사일</td><td style="border:none;width:110px"></td>
    <td style="border:none" class="lc2">수감 부서</td><td style="border:none;width:130px"></td>
  </tr><tr>
    <td style="border:none" class="lc2">심사원 (Lead)</td><td style="border:none"></td>
    <td style="border:none" class="lc2">보조 심사원</td><td style="border:none"></td>
    <td style="border:none" class="lc2">발행일</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">심사 발견사항 보고서 (Audit Finding Report)</div>
<div class="note" style="margin-bottom:4px">
  ※ 유형: &nbsp;<strong>MAJ</strong> 중대부적합 — 즉각 시정조치 &nbsp;|&nbsp;
  <strong>MIN</strong> 경미부적합 — 30일 내 시정 &nbsp;|&nbsp;
  <strong>OBS</strong> 관찰사항 — 60일 내 개선 권고 &nbsp;|&nbsp;
  <strong>STR</strong> 강점 — 모범 사례 공유
</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th style="width:55px">조항</th>
    <th style="width:65px">유형</th>
    <th>지적 내용 (구체적 기술)</th>
    <th style="width:150px">증거 (기록 / 관찰 / 인터뷰)</th>
    <th style="width:70px">담당 부서</th>
    <th style="width:75px">시정조치<br>기한</th>
    <th style="width:65px">종결 여부</th>
  </tr>
  ${Array.from({length:10},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td></td>
    <td style="text-align:center;font-weight:700;font-size:9pt"></td>
    <td style="height:36px;vertical-align:top;padding:4px"></td>
    <td style="vertical-align:top;padding:4px"></td>
    <td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>

<div class="sec">시정조치 완료 확인</div>
<table>
  <tr>
    <td class="lc2">중대부적합(MAJ) 건수</td><td style="color:#c00;font-weight:700"></td>
    <td class="lc2">경미부적합(MIN) 건수</td><td></td>
    <td class="lc2">관찰사항(OBS) 건수</td><td></td>
    <td class="lc2">강점(STR) 건수</td><td></td>
  </tr>
  <tr>
    <td class="lc2">최종 종결일</td><td></td>
    <td class="lc2">종결 확인자</td><td></td>
    <td class="lc2">후속 심사 필요</td>
    <td><span class="cb"></span>필요 &nbsp;<span class="cb"></span>불필요</td>
    <td class="lc2">후속 심사 예정일</td><td></td>
  </tr>
</table>

<div class="sign sign3" style="margin-top:10px">
  <div class="sbox" style="min-height:50px"><div class="st">심사원 Lead (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">수감 부서장 (확인 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">품질보증팀장 (승인)</div></div>
</div>`
}

function vdaF003() {
  return `
<table><tr>
  <td class="lc">공정명</td><td></td>
  <td class="lc">품번</td><td></td>
  <td class="lc">작성일</td><td></td>
  <td class="lc">작성자</td><td></td>
</tr></table>

<div class="sec">거북이 다이어그램 (Turtle Diagram)</div>
<table style="height:380px">
  <tr>
    <td style="width:22%;vertical-align:top;border:1px solid #000;padding:8px">
      <div style="font-weight:900;font-size:10pt;color:#1e3a5f;margin-bottom:6px">🔧 Machine (설비)</div>
      <div style="font-size:8.5pt;color:#888;margin-bottom:4px">어떤 설비/도구를 사용하는가?</div>
      ${Array(6).fill('<div style="border-bottom:1px solid #ddd;height:22px;margin-bottom:2px"></div>').join('')}
    </td>
    <td style="width:56%;vertical-align:top;border:1px solid #000;padding:8px">
      <div style="text-align:center;font-weight:900;font-size:11pt;color:#1e3a5f;margin-bottom:4px">🐢 공정 (Process)</div>
      <div style="text-align:center;font-size:8pt;color:#888;margin-bottom:8px">무엇을 하는가 / 어떻게 하는가</div>
      <div style="border:1px solid #ccc;min-height:60px;margin-bottom:6px;padding:4px;font-size:8.5pt"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
        <div style="border:1px solid #1e3a5f;padding:5px;min-height:50px">
          <div style="font-weight:700;font-size:8.5pt;color:#1e3a5f">INPUT (투입)</div>
        </div>
        <div style="border:1px solid #1e3a5f;padding:5px;min-height:50px">
          <div style="font-weight:700;font-size:8.5pt;color:#1e3a5f">OUTPUT (산출)</div>
          <div style="font-size:8pt;color:#888">품질/납기/원가 성과 지표</div>
        </div>
      </div>
    </td>
    <td style="width:22%;vertical-align:top;border:1px solid #000;padding:8px">
      <div style="font-weight:900;font-size:10pt;color:#1e3a5f;margin-bottom:6px">📏 Measurement (측정)</div>
      <div style="font-size:8.5pt;color:#888;margin-bottom:4px">어떻게 측정·평가하는가?</div>
      ${Array(6).fill('<div style="border-bottom:1px solid #ddd;height:22px;margin-bottom:2px"></div>').join('')}
    </td>
  </tr>
  <tr>
    <td style="vertical-align:top;border:1px solid #000;padding:8px">
      <div style="font-weight:900;font-size:10pt;color:#1e3a5f;margin-bottom:6px">👷 Man (사람)</div>
      <div style="font-size:8.5pt;color:#888;margin-bottom:4px">어떤 역량이 필요한가?</div>
      ${Array(6).fill('<div style="border-bottom:1px solid #ddd;height:22px;margin-bottom:2px"></div>').join('')}
    </td>
    <td style="vertical-align:top;border:1px solid #000;padding:8px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
        <div>
          <div style="font-weight:900;font-size:10pt;color:#1e3a5f;margin-bottom:4px">📦 Material (재료)</div>
          ${Array(5).fill('<div style="border-bottom:1px solid #ddd;height:20px;margin-bottom:2px"></div>').join('')}
        </div>
        <div>
          <div style="font-weight:900;font-size:10pt;color:#1e3a5f;margin-bottom:4px">📋 Method (방법)</div>
          ${Array(5).fill('<div style="border-bottom:1px solid #ddd;height:20px;margin-bottom:2px"></div>').join('')}
        </div>
      </div>
      <div style="margin-top:8px">
        <div style="font-weight:900;font-size:10pt;color:#1e3a5f;margin-bottom:4px">🌍 Environment (환경)</div>
        ${Array(3).fill('<div style="border-bottom:1px solid #ddd;height:20px;margin-bottom:2px"></div>').join('')}
      </div>
    </td>
    <td style="vertical-align:top;border:1px solid #000;padding:8px">
      <div style="font-weight:900;font-size:10pt;color:#1e3a5f;margin-bottom:6px">KPI 성과 지표</div>
      ${Array(6).fill('<div style="border-bottom:1px solid #ddd;height:22px;margin-bottom:2px"></div>').join('')}
    </td>
  </tr>
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">작성자 (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (검토)</div></div>
  <div class="sbox"><div class="st">적용일</div></div>
</div>`
}

function vdaF014() {
  return `
<table><tr>
  <td class="lc">점검 부서</td><td></td>
  <td class="lc">점검일</td><td></td>
  <td class="lc">점검자</td><td></td>
  <td class="lc">목표 점수</td><td>85점 이상</td>
</tr></table>

<div class="sec">5S 점검표</div>
<div class="note">※ 배점: 0(불량) / 2(미흡) / 4(보통) / 6(양호) / 8(우수) / 10(탁월)</div>
<table>
  <tr><th style="width:40px">구분</th><th style="width:200px">점검 항목</th><th style="width:50px">배점</th><th style="width:60px">취득점수</th><th>문제점</th><th style="width:120px">개선 조치</th></tr>
  ${[
    ['1S\n정리', '불필요한 물건이 없는가?', 10],
    ['1S\n정리', '부적합품이 즉시 격리되어 있는가?', 10],
    ['2S\n정돈', '물건이 정해진 위치에 있는가?', 10],
    ['2S\n정돈', '공구·게이지가 정위치 관리되는가?', 10],
    ['3S\n청소', '작업장 바닥이 청결한가?', 10],
    ['3S\n청소', '설비·기계가 청결하게 유지되는가?', 10],
    ['4S\n청결', '3S 활동이 지속 유지되는가?', 10],
    ['4S\n청결', '규정·표준이 현행화되어 게시되는가?', 10],
    ['5S\n습관화', '5S 활동이 작업자에게 체화되어 있는가?', 10],
    ['5S\n습관화', '5S 월간 점검이 정기적으로 실시되는가?', 10],
  ].map(([s, item, score]) =>
    `<tr><td style="text-align:center;font-size:8pt;white-space:pre">${s}</td><td>${item}</td>
     <td style="text-align:center">${score}</td><td></td><td></td><td></td></tr>`
  ).join('')}
  <tr style="font-weight:900"><td colspan="2" style="text-align:right">합계</td><td style="text-align:center">100</td><td></td><td colspan="2"></td></tr>
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">점검자 (서명)</div></div>
  <div class="sbox"><div class="st">부서장 (확인)</div></div>
  <div class="sbox"><div class="st">차기 점검 예정일</div></div>
</div>`
}

// 일반 양식 (특정 양식이 없는 경우)
function genericForm(no, title) {
  const today = new Date().toLocaleDateString('ko-KR')
  return `
<div class="d-info">
  <table style="border:none"><tr>
    <td style="border:none" class="lc2">작성 부서</td><td style="border:none;width:140px"></td>
    <td style="border:none" class="lc2">작성자</td><td style="border:none;width:130px"></td>
    <td style="border:none" class="lc2">작성일</td><td style="border:none;width:110px">${today}</td>
  </tr><tr>
    <td style="border:none" class="lc2">검토자</td><td style="border:none"></td>
    <td style="border:none" class="lc2">검토일</td><td style="border:none"></td>
    <td style="border:none" class="lc2">승인자</td><td style="border:none"></td>
  </tr><tr>
    <td style="border:none" class="lc2">관련 품번</td><td style="border:none"></td>
    <td style="border:none" class="lc2">관련 LOT No.</td><td style="border:none"></td>
    <td style="border:none" class="lc2">관련 문서 No.</td><td style="border:none"></td>
  </tr></table>
</div>

<div class="sec">주요 내용</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>항목</th>
    <th>내용 / 세부 사항</th>
    <th style="width:70px">담당자</th>
    <th style="width:70px">기한</th>
    <th style="width:70px">완료 여부</th>
  </tr>
  ${Array.from({length:14},(_,i)=>`
  <tr>
    <td style="text-align:center;color:#bbb">${i+1}</td>
    <td style="height:28px"></td><td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td>
  </tr>`).join('')}
</table>

<div class="sec">자유 기술란</div>
<div class="write-area-xl" style="min-height:100px"></div>

<div class="sign sign3">
  <div class="sbox" style="min-height:50px"><div class="st">작성자 (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">검토자 (서명 / 날짜)</div></div>
  <div class="sbox" style="min-height:50px"><div class="st">승인자 (서명 / 날짜)</div></div>
</div>`
}

// ─────────────────────────────────────────────────────────────
// VDA 전용 양식
// ─────────────────────────────────────────────────────────────

function vdaF001() {
  const p7 = ['P1 잠재성 분석','P2 프로젝트 관리','P3 개발 계획','P4 공급업체 관리','P5 생산공정 개발','P6 공정분석·량산','P7 고객서비스']
  return `
<table><tr>
  <td class="lc">심사 번호</td><td></td>
  <td class="lc">심사일</td><td></td>
  <td class="lc">공급업체명</td><td></td>
</tr><tr>
  <td class="lc">심사원</td><td></td>
  <td class="lc">대상 공정</td><td></td>
  <td class="lc">심사 유형</td>
  <td><span class="cb"></span>System &nbsp;<span class="cb"></span>Process &nbsp;<span class="cb"></span>Product</td>
</tr></table>

<div class="sec">VDA 6.3 프로세스 요소별 평가 결과</div>
<div class="note">※ 각 P 요소 평가 점수 (0~100%): 미적용=N/A, 계산 = 취득점수 / 최대가능점수 × 100</div>
<table>
  <tr><th style="width:28px">No.</th><th>프로세스 요소</th><th style="width:70px">최대점수</th><th style="width:70px">취득점수</th><th style="width:70px">달성률(%)</th><th style="width:60px">등급</th><th>주요 발견 사항</th></tr>
  ${p7.map((p, i) => `<tr><td style="text-align:center;font-weight:700">${i + 1}</td><td>${p}</td>
    <td></td><td></td><td></td>
    <td style="text-align:center"><span class="cb"></span>A &nbsp;<span class="cb"></span>B &nbsp;<span class="cb"></span>C</td>
    <td class="blank"></td></tr>`).join('')}
  <tr style="font-weight:900"><td colspan="2" style="text-align:right">종합</td><td></td><td></td><td style="font-weight:900"></td>
    <td style="text-align:center"><span class="cb"></span>A &nbsp;<span class="cb"></span>B &nbsp;<span class="cb"></span>C</td><td></td></tr>
</table>
<div class="note">※ 등급: A ≥ 90% (우수) | B 80~89% (보통, 개선계획 필요) | C &lt; 80% (불량, 즉각 개선 필수)</div>

<div class="sec">주요 부적합 및 개선 요구사항</div>
<table>
  <tr><th style="width:28px">No.</th><th>P 요소</th><th>질문번호</th><th>발견 사항</th><th style="width:60px">유형</th><th style="width:90px">개선 기한</th></tr>
  ${rows(8, ['','','','',''])}
</table>
<div class="note">※ 유형: 부적합(NC) / 관찰사항(OBS) / 강점(STR)</div>

<div class="sec">심사 종합 의견</div>
<table><tr><td style="height:60px"></td></tr></table>

<div class="sign sign4">
  <div class="sbox"><div class="st">심사원 (서명)</div></div>
  <div class="sbox"><div class="st">수감 대표자 (확인)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인)</div></div>
  <div class="sbox"><div class="st">차기 심사 예정일</div></div>
</div>`
}

function vdaF002() {
  return `
<table><tr>
  <td class="lc">개선계획 번호</td><td></td>
  <td class="lc">VDA 심사 번호</td><td></td>
  <td class="lc">작성일</td><td></td>
</tr><tr>
  <td class="lc">공급업체명</td><td></td>
  <td class="lc">대상 P 요소</td><td></td>
  <td class="lc">현재 등급</td><td></td>
</tr></table>

<div class="sec">개선 항목 계획 (Improvement Plan)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th style="width:60px">P 요소</th>
    <th>발견 사항 / 부적합 내용</th>
    <th>목표 상태</th>
    <th>개선 조치</th>
    <th style="width:80px">담당자</th>
    <th style="width:80px">완료 기한</th>
    <th style="width:70px">효과 검증</th>
    <th style="width:60px">상태</th>
  </tr>
  ${rows(10, ['','','','','','','',''])}
</table>
<div class="note">※ 상태: O(계획중) / P(진행중) / V(완료·검증중) / C(종결)</div>

<div class="sec">달성 목표 등급</div>
<table><tr>
  <td class="lc">현재 종합 등급</td><td></td>
  <td class="lc">목표 등급</td><td></td>
  <td class="lc">목표 달성일</td><td></td>
</tr></table>

<div class="sign sign3">
  <div class="sbox"><div class="st">작성자 (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인)</div></div>
  <div class="sbox"><div class="st">고객 담당자 (확인)</div></div>
</div>`
}

function vdaF004() {
  const items = [
    ['P1','잠재성 분석 — 고객 요구사항 충족 역량',''],
    ['P1','재무 안정성 및 지속 가능성',''],
    ['P1','품질 시스템 성숙도 (인증 현황)',''],
    ['P2','프로젝트 계획 및 자원 배분',''],
    ['P2','리스크 관리 체계 운영',''],
    ['P2','변경관리 프로세스 보유',''],
    ['P3','개발 단계 게이트 검토 운영',''],
    ['P3','DFMEA / PFMEA 수행 역량',''],
    ['P4','공급업체 관리 및 평가 체계',''],
    ['P5','공정 FMEA 최신화 주기',''],
    ['P5','관리계획서 운영 현황',''],
    ['P6','공정능력 (Cp/Cpk) 관리',''],
    ['P6','SPC 시스템 운영',''],
    ['P7','고객 불만 대응 프로세스',''],
  ]
  return `
<table><tr>
  <td class="lc">분석 번호</td><td></td>
  <td class="lc">분석일</td><td></td>
  <td class="lc">공급업체</td><td></td>
  <td class="lc">분석자</td><td></td>
</tr></table>

<div class="sec">잠재성 분석 체크시트</div>
<div class="note">※ 점수: 0(미흡/없음) | 4(부분적) | 8(대체로 적합) | 10(완전 충족)</div>
<table>
  <tr><th style="width:40px">P 요소</th><th>평가 항목</th><th style="width:60px">점수<br>(0/4/8/10)</th><th style="width:60px">가중치</th><th style="width:70px">가중점수</th><th>비고 / 증거</th></tr>
  ${items.map(([p, item]) =>
    `<tr><td style="text-align:center;font-weight:700;font-size:9pt">${p}</td><td>${item}</td>
     <td></td><td></td><td></td><td class="blank"></td></tr>`
  ).join('')}
  <tr style="font-weight:900"><td colspan="2" style="text-align:right">합계</td><td></td><td></td><td style="font-weight:900"></td><td></td></tr>
</table>

<div class="sec">종합 판정</div>
<table><tr>
  <td style="text-align:center;font-size:12pt;font-weight:900;padding:12px">
    <span class="cb"></span> 잠재 공급업체 적합 (Potential Supplier) &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 조건부 적합 (개선 후 재평가) &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 부적합 (Disqualified)
  </td>
</tr></table>
<table><tr><td class="lc">종합 의견</td><td class="blank2"></td></tr></table>

<div class="sign sign3">
  <div class="sbox"><div class="st">분석자 (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인)</div></div>
  <div class="sbox"><div class="st">구매팀장 (확인)</div></div>
</div>`
}

function vdaF005() {
  const questions = {
    'P5 — 공급업체 관리': [
      '공급업체 선정 기준 및 평가 절차가 문서화되어 있는가?',
      '승인공급업체 목록(AVL)이 최신화되어 관리되는가?',
      '공급업체 품질 성과(PPM, 클레임)가 정기적으로 모니터링되는가?',
      '입고검사 기준이 공급업체별로 차별화되어 있는가?',
    ],
    'P6 — 공정분석 및 양산': [
      '관리계획서(Control Plan)가 모든 생산 공정에 대해 작성되어 있는가?',
      '공정 FMEA(PFMEA)가 최신 도면/공정 기준으로 갱신되어 있는가?',
      '중요 공정 특성(SC/CC)에 대해 SPC가 적용되고 있는가?',
      '공정능력 Cpk ≥ 1.33 이상 달성 공정은 몇 %인가?',
      '관리 한계 초과 시 대응 절차(Reaction Plan)가 운영되는가?',
      '게이지 관리(MSA) 및 측정장비 교정이 체계적으로 운영되는가?',
      '불량품 격리 및 식별 체계(적색/황색 태그)가 운영되는가?',
      '작업표준서(WI)가 모든 공정에 게시되어 있고 최신 상태인가?',
    ],
    'P7 — 고객 서비스 / 고객 만족': [
      '고객 불만 처리 절차(CAR)가 체계적으로 운영되는가?',
      '고객 KPI(PPM, OTD, Field Return)가 주기적으로 보고되는가?',
      '고객 감사 및 방문에 대한 체계적인 대응 준비가 되어 있는가?',
    ],
  }
  const sections = Object.entries(questions).map(([title, qs]) => `
<div class="sec">${title}</div>
<table>
  <tr><th style="width:28px">No.</th><th>심사 질문</th>
      <th style="width:50px">점수<br>(0~10)</th>
      <th style="width:60px">판정<br>O/×/△</th>
      <th>증거 / 관찰 내용</th></tr>
  ${qs.map((q, i) => `<tr><td style="text-align:center;color:#bbb">${i + 1}</td>
    <td>${q}</td><td></td><td style="text-align:center"></td><td class="blank"></td></tr>`).join('')}
</table>`).join('')

  return `
<table><tr>
  <td class="lc">심사 번호</td><td></td>
  <td class="lc">심사일</td><td></td>
  <td class="lc">심사원</td><td></td>
</tr><tr>
  <td class="lc">대상 공급업체</td><td></td>
  <td class="lc">대상 공정</td><td></td>
  <td class="lc">품번</td><td></td>
</tr></table>
<div class="note">※ 점수: 0(전혀없음) | 4(부분적) | 6(대체로 양호) | 8(양호) | 10(완전 충족) | N/A(해당없음)</div>
${sections}

<div class="sign sign3">
  <div class="sbox"><div class="st">심사원 (서명)</div></div>
  <div class="sbox"><div class="st">수감 대표자 (확인)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인)</div></div>
</div>`
}

function vdaF010() {
  return `
<table><tr>
  <td class="lc">설비명</td><td></td>
  <td class="lc">설비번호</td><td></td>
  <td class="lc">설치일</td><td></td>
</tr><tr>
  <td class="lc">설비 위치</td><td></td>
  <td class="lc">담당자</td><td></td>
  <td class="lc">대상 연도</td><td></td>
</tr></table>

<div class="sec">연간 PM 계획 (Preventive Maintenance Plan)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>PM 항목</th>
    <th style="width:60px">주기</th>
    <th style="width:35px">1월</th><th style="width:35px">2월</th><th style="width:35px">3월</th>
    <th style="width:35px">4월</th><th style="width:35px">5월</th><th style="width:35px">6월</th>
    <th style="width:35px">7월</th><th style="width:35px">8월</th><th style="width:35px">9월</th>
    <th style="width:35px">10월</th><th style="width:35px">11월</th><th style="width:35px">12월</th>
    <th style="width:70px">담당</th>
  </tr>
  ${[
    ['오일 교환','3M'],['필터 교환','6M'],['벨트 점검','3M'],['베어링 교체','12M'],
    ['전기 단자 점검','6M'],['윤활 그리스','1M'],['냉각수 점검','3M'],['센서 교정','12M'],
    ['안전장치 점검','6M'],['청소 및 정비','1M'],['기어 상태 점검','6M'],['기타 항목',''],
  ].map(([item, cycle], i) => {
    const months = Array(12).fill('<td style="text-align:center;font-size:9pt"></td>').join('')
    return `<tr><td style="text-align:center;color:#bbb">${i+1}</td><td>${item}</td>
      <td style="text-align:center">${cycle}</td>${months}<td></td></tr>`
  }).join('')}
</table>
<div class="note">※ 범례: P = 계획 | A = 실적 | ○ = 완료 | × = 미완료 | △ = 지연</div>

<div class="sec">PM 실적 요약</div>
<table>
  <tr><th style="width:28px">No.</th><th>PM 항목</th><th>계획일</th><th>실시일</th><th>담당자</th><th>특이사항</th><th style="width:60px">판정</th></tr>
  ${rows(6, ['','','','','',''])}
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">작성자 (서명)</div></div>
  <div class="sbox"><div class="st">생산팀장 (확인)</div></div>
  <div class="sbox"><div class="st">설비담당 (승인)</div></div>
</div>`
}

function vdaF011() {
  return `
<table><tr>
  <td class="lc">공정명</td><td></td>
  <td class="lc">설비번호</td><td></td>
  <td class="lc">품번</td><td></td>
  <td class="lc">작성일</td><td></td>
</tr></table>

<div class="sec">Poka-Yoke (방오류 장치) 목록 및 점검</div>
<div class="note">※ 점검주기: D=일간 / W=주간 / M=월간 / 판정: O=정상 / ×=비정상(즉시보고)</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>Poka-Yoke 명칭</th>
    <th>방지 불량 유형</th>
    <th>설치 위치</th>
    <th style="width:60px">장치 유형</th>
    <th style="width:50px">점검<br>주기</th>
    <th style="width:50px">점검<br>방법</th>
    <th style="width:40px">D1</th><th style="width:40px">D2</th><th style="width:40px">D3</th>
    <th style="width:40px">W1</th><th style="width:40px">W2</th>
    <th style="width:40px">M</th>
    <th style="width:70px">특이사항</th>
  </tr>
  ${rows(10, ['','','','','','','','','','','','',''])}
</table>
<div class="note">※ 장치 유형: 감지(S) / 경보(A) / 정지(H) / 분리(E) / 형상(F)</div>

<div class="sec">비정상 사항 조치 기록</div>
<table>
  <tr><th style="width:28px">No.</th><th>장치명</th><th>이상 발견일</th><th>이상 내용</th><th>조치 내용</th><th>조치일</th><th>조치자</th></tr>
  ${rows(4, ['','','','','',''])}
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">점검자 (서명)</div></div>
  <div class="sbox"><div class="st">생산팀장 (확인)</div></div>
  <div class="sbox"><div class="st">품질보증팀 확인</div></div>
</div>`
}

function vdaF012() {
  const skills = [
    '공정 도면 해독','작업표준서 준수','설비 조작','이상 보고 및 대응',
    '초물검사 실시','SPC 타점 작성','불량 식별 및 격리','안전·환경 규정 준수',
  ]
  return `
<table><tr>
  <td class="lc">부서</td><td></td>
  <td class="lc">공정명</td><td></td>
  <td class="lc">작성일</td><td></td>
  <td class="lc">검토일</td><td></td>
</tr></table>
<div class="note">※ 역량 수준: 1=교육 필요 | 2=감독 하 수행 | 3=독자 수행 | 4=타인 지도 가능 | 목표: 모든 작업자 Level 3↑</div>
<table>
  <tr>
    <th rowspan="2" style="width:120px">작업자 역량 항목</th>
    <th rowspan="2" style="width:60px">목표<br>수준</th>
    <th colspan="10">사원 별 현재 수준 (성명 기입)</th>
    <th rowspan="2" style="width:80px">교육<br>계획</th>
  </tr>
  <tr>${Array(10).fill('<th style="width:50px"></th>').join('')}</tr>
  ${skills.map(s =>
    `<tr><td>${s}</td><td style="text-align:center">3</td>${Array(10).fill('<td style="text-align:center"></td>').join('')}<td></td></tr>`
  ).join('')}
  ${rows(4, Array(11).fill(''))}
</table>
<div class="note">※ 역량 미달(Level ≤ 2) 작업자는 교육 계획 열에 완료 목표일을 기입</div>
<div class="sign sign3">
  <div class="sbox"><div class="st">작성자 (서명)</div></div>
  <div class="sbox"><div class="st">생산팀장 (확인)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인)</div></div>
</div>`
}

function vdaF020() {
  return `
<table><tr>
  <td class="lc">납품처(고객)</td><td></td>
  <td class="lc">고객 담당자</td><td></td>
  <td class="lc">작성일</td><td></td>
</tr><tr>
  <td class="lc">대상 품번</td><td></td>
  <td class="lc">CSR 출처 문서</td><td></td>
  <td class="lc">개정 버전</td><td></td>
</tr></table>

<div class="sec">Customer Specific Requirements (CSR) 목록</div>
<div class="note">※ 준수 여부: O=준수 | △=부분준수(계획) | ×=미준수(즉각조치) | N/A=해당없음</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th style="width:70px">CSR 출처</th>
    <th style="width:80px">분류</th>
    <th>CSR 항목 (요구사항)</th>
    <th style="width:120px">내부 이행 근거 (문서/공정)</th>
    <th style="width:55px">준수 여부</th>
    <th style="width:80px">조치 계획</th>
  </tr>
  ${[
    // ── 품질시스템 / 인증
    ['고객 CSR', '품질시스템', 'IATF 16949 또는 ISO 9001 인증 보유 및 유효 기간 내 유지'],
    ['고객 CSR', '품질시스템', 'VDA 6.3 공정심사 주기 준수 (신규 착수 전 / 정기 24개월 이내, 등급 B↑ 유지)'],
    // ── PPAP / APQP (사출 특화)
    ['고객 CSR', 'PPAP/APQP', 'PPAP Level 3 제출 의무 (신규양산·금형변경·수지변경·공정변경 시 모두 포함)'],
    ['고객 CSR', 'PPAP/APQP', 'APQP 타임라인 공유 및 게이트 검토(G0~G6) 참여 — T1(금형시타) 샘플 고객 승인 필수'],
    ['고객 CSR', 'PPAP/APQP', '초도품 현물 샘플 제출: 금형 캐비티별 각 5 SHOT, 고객 품질 담당자 서명 후 적용 허가'],
    // ── 금형 관리 (사출 핵심)
    ['고객 CSR', '금형관리',  '금형 대장 관리 필수 — 사용 쇼트 수·수리 이력·수명 예측 기록 (수명 도달 전 고객 사전 보고)'],
    ['고객 CSR', '금형관리',  '금형 수리·개조 발생 시 고객 사전 승인 후 작업 — 수리 전후 치수 비교 보고서 제출'],
    ['고객 CSR', '금형관리',  '캐비티별 초물검사 실시 의무 — 다 캐비티 금형은 캐비티 번호 LOT 추적 적용'],
    // ── 성형 공정 관리 (사출 특화)
    ['고객 CSR', '사출공정',  '성형 조건(온도·압력·속도·냉각시간) 작업표준서 관리 및 이탈 시 즉시 생산 중단'],
    ['고객 CSR', '사출공정',  '수지 건조 조건(온도·시간) 준수 — 원자재별 성적서 보관, 혼입 방지 관리 체계 운영'],
    ['고객 CSR', '사출공정',  '재생(Regrind) 원료 사용 금지 — 납품 품목은 Virgin 원료만 사용 (서면 승인 없는 한)'],
    ['고객 CSR', '사출공정',  '사이클 타임 모니터링 — 이상 사이클(Short Shot·Sink Mark·Warpage) 발생 시 자동 경보 체계 운영'],
    // ── 특수 특성 / SPC
    ['고객 CSR', '특수특성',  'CC 특성: 공정 Cpk ≥ 1.67 — 100% 검사 또는 Poka-Yoke 적용 필수'],
    ['고객 CSR', '특수특성',  'SC 특성: 공정 Cpk ≥ 1.33 — SPC 적용, 관리 한계 이탈 시 즉시 보고'],
    ['고객 CSR', '특수특성',  'SC+ 특성: 고객 승인 MSA 계획 및 추가 검증 보고서 제출'],
    // ── 외관 / 치수 (사출 특화)
    ['고객 CSR', '외관/치수', '외관 불량(플래시·수축·웰드라인·변색·이물질) 허용 기준 고객 도면 또는 외관 승인서(AAR) 기준 적용'],
    ['고객 CSR', '외관/치수', '수지 LOT 변경 시 색상·광택·수축 재확인 측정 보고서 제출 후 출하'],
    // ── 부적합 / 8D
    ['고객 CSR', '8D/CAPA',   '고객 불만 접수: D0(즉각격리) 2시간 이내 / D3(봉쇄조치) 24시간 이내 / D8(종결) 10 영업일 이내'],
    ['고객 CSR', '8D/CAPA',   '납품 PPM 0 목표 — 반복 불량 발생 시 고객 품질 패널티 및 감사 진행'],
    // ── 변경 관리
    ['고객 CSR', '변경관리',  '4M 변경(수지 변경·금형 수리·설비 교체·작업자 교육 변경) 발생 시 고객 사전 서면 승인 필수'],
    ['고객 CSR', '변경관리',  '승인 전 변경 적용 금지 — 위반 시 즉각 공급 중단 및 추가 PPAP 재제출'],
    // ── 납기 / 포장
    ['고객 CSR', '납기/포장', 'OTD ≥ 98% 유지 — 미달 시 개선계획서 제출, 공급 위기 시 즉시 고객 통보 및 BCP 가동'],
    ['고객 CSR', '납기/포장', '납품 포장·라벨: VDA 4902 규격 준수 (LOT No·캐비티 번호·수지 LOT 포함 QR 라벨 부착)'],
    // ── 환경 / 추적성
    ['고객 CSR', '환경/추적', 'RoHS·REACH 준수 증빙 제출 (IMDS 등록 의무) — 유해물질 함유 수지 사용 금지'],
    ['고객 CSR', '환경/추적', 'LOT 추적성 최소 10년 기록 보관 — 성형일·수지 LOT·금형 번호·캐비티 번호 연계 관리'],
  ].map(([src, ref, item], i) =>
    `<tr><td style="text-align:center;color:#bbb;font-size:8pt">${i + 1}</td>
     <td style="text-align:center;font-size:7.5pt;font-weight:700;color:#1e3a5f">${src}</td>
     <td style="font-size:7.5pt;color:#64748b;white-space:nowrap">${ref}</td>
     <td style="font-size:8pt">${item}</td><td></td>
     <td style="text-align:center"></td><td></td></tr>`
  ).join('')}
  ${rows(3, ['','','','',''])}
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">작성자 (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (검토)</div></div>
  <div class="sbox"><div class="st">임원 (승인)</div></div>
</div>`
}

function vdaF021() {
  return `
<table><tr>
  <td class="lc">보고 기간</td><td></td>
  <td class="lc">납품처(고객)</td><td></td>
  <td class="lc">작성자</td><td></td>
</tr></table>

<div class="sec">고객 성과 KPI 현황</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>KPI 항목</th>
    <th style="width:70px">단위</th>
    <th style="width:70px">목표</th>
    <th style="width:70px">1월</th><th style="width:70px">2월</th><th style="width:70px">3월</th>
    <th style="width:70px">4월</th><th style="width:70px">5월</th><th style="width:70px">6월</th>
    <th style="width:60px">YTD 실적</th>
    <th style="width:60px">달성 여부</th>
  </tr>
  ${[
    ['납품 PPM (불량률)','PPM','≤ 50'],
    ['OTD 납기준수율','%','≥ 98%'],
    ['고객 불만 건수','건','0'],
    ['8D 완결 준수율','%','≥ 95%'],
    ['PPAP 초도 승인율','%','≥ 90%'],
    ['필드 반품 (Field Return)','PPM','≤ 10'],
    ['VDA 심사 등급','점','≥ 85'],
    ['공급업체 PPM','PPM','≤ 200'],
  ].map(([item, unit, target], i) =>
    `<tr><td style="text-align:center;color:#bbb">${i+1}</td>
     <td>${item}</td><td style="text-align:center">${unit}</td><td style="text-align:center;font-weight:700">${target}</td>
     ${Array(6).fill('<td></td>').join('')}<td style="font-weight:700"></td>
     <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td></tr>`
  ).join('')}
</table>

<div class="sec">7~12월 성과</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>KPI 항목</th>
    <th style="width:70px">7월</th><th style="width:70px">8월</th><th style="width:70px">9월</th>
    <th style="width:70px">10월</th><th style="width:70px">11월</th><th style="width:70px">12월</th>
    <th style="width:70px">연간 실적</th>
    <th style="width:70px">목표 달성</th>
  </tr>
  ${['납품 PPM','OTD 납기준수율','고객 불만 건수','8D 완결 준수율','PPAP 초도 승인율','필드 반품','VDA 심사 등급','공급업체 PPM'].map((item, i) =>
    `<tr><td style="text-align:center;color:#bbb">${i+1}</td><td>${item}</td>
     ${Array(6).fill('<td></td>').join('')}<td style="font-weight:700"></td>
     <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>×</td></tr>`
  ).join('')}
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">작성자 (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (검토)</div></div>
  <div class="sbox"><div class="st">임원 (승인)</div></div>
</div>`
}

function vdaF022() {
  const items = [
    ['1','설계 기록 (최신 도면/3D)','Level 1~5'],
    ['2','고객 엔지니어링 변경 문서','Level 2~5'],
    ['3','고객 엔지니어링 승인 (필요 시)','Level 3~5'],
    ['4','DFMEA (설계 FMEA)','Level 3~5'],
    ['5','공정흐름도 (PFD)','Level 2~5'],
    ['6','PFMEA (공정 FMEA)','Level 2~5'],
    ['7','관리계획서 (Control Plan)','Level 2~5'],
    ['8','MSA (측정시스템 분석)','Level 2~5'],
    ['9','초기공정능력 연구 (Ppk)','Level 2~5'],
    ['10','수입검사 성적서 (IQC)','Level 3~5'],
    ['11','외관 승인 보고서 (AAR)','Level 3~5'],
    ['12','초도품 현물 샘플','Level 2~5'],
    ['13','재질 성적서 (Mill Sheet/MSDS)','Level 3~5'],
    ['14','치수 측정 보고서 (전항목)','Level 2~5'],
    ['15','기능/성능 시험 보고서','Level 3~5'],
    ['16','수요 / 용량 검증 (Capacity Analysis)','Level 2~5'],
    ['17','포장 사양 (Packaging Spec)','Level 2~5'],
    ['18','ISIR 종합 요약 커버 시트','Level 1~5'],
  ]
  return `
<table><tr>
  <td class="lc">PPAP 번호</td><td></td>
  <td class="lc">납품처</td><td></td>
  <td class="lc">품번</td><td></td>
</tr><tr>
  <td class="lc">품명</td><td></td>
  <td class="lc">도면 번호</td><td></td>
  <td class="lc">PPAP Level</td>
  <td><span class="cb"></span>1 &nbsp;<span class="cb"></span>2 &nbsp;<span class="cb"></span>3 &nbsp;<span class="cb"></span>4 &nbsp;<span class="cb"></span>5</td>
</tr><tr>
  <td class="lc">제출 사유</td>
  <td colspan="5"><span class="cb"></span>신규양산 &nbsp;<span class="cb"></span>설계변경 &nbsp;<span class="cb"></span>공정변경(4M) &nbsp;<span class="cb"></span>고객요청 &nbsp;<span class="cb"></span>년간재승인</td>
</tr></table>

<div class="sec">PPAP 제출 항목 체크리스트</div>
<div class="note">※ 적용여부: O=해당 | N/A=해당없음(Level 무관) | 제출여부: O=제출완료 | P=준비중 | ×=미제출</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>제출 항목</th>
    <th style="width:90px">해당 Level</th>
    <th style="width:70px">적용여부</th>
    <th style="width:70px">제출여부</th>
    <th style="width:90px">문서 번호</th>
    <th style="width:90px">제출일</th>
    <th>비고</th>
  </tr>
  ${items.map(([no, item, level]) =>
    `<tr><td style="text-align:center">${no}</td><td>${item}</td>
     <td style="text-align:center;font-size:8pt">${level}</td>
     <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>N/A</td>
     <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>P &nbsp;<span class="cb"></span>×</td>
     <td></td><td></td><td></td></tr>`
  ).join('')}
</table>

<div class="sec">PPAP 최종 판정</div>
<table><tr>
  <td style="text-align:center;font-size:12pt;font-weight:900;padding:12px">
    <span class="cb"></span> Full Approval (완전 승인) &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> Interim Approval (임시 승인) &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> Rejected (반려)
  </td>
</tr></table>
<table><tr>
  <td class="lc">임시 승인 조건</td><td></td>
  <td class="lc">임시 승인 만료일</td><td></td>
  <td class="lc">반려 사유</td><td></td>
</tr></table>

<div class="sign sign4">
  <div class="sbox"><div class="st">작성자 (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인)</div></div>
  <div class="sbox"><div class="st">고객 담당자 (승인)</div></div>
  <div class="sbox"><div class="st">승인 일자</div></div>
</div>`
}

// ─────────────────────────────────────────────────────────────
// 양식 라우팅
// ─────────────────────────────────────────────────────────────
const FORM_MAP = {
  'IQC-F-001':  iqcF001,
  'IPQC-F-001': ipqcF001,
  'IPQC-F-002': ipqcF002,
  'IPQC-F-003': ipqcF003,
  'OQC-F-001':  oqcF001,
  'NCR-F-001':  ncrF001,
  'NCR-F-002':  ncrF002,
  'NCR-F-010':  ncrF010,
  'NCR-F-011':  ncrF011,
  'NCR-F-012':  ncrF012,
  'QMS-F-003':  qmsF003,
  'QMS-F-020':  qmsF020,
  'QMS-F-030':  qmsF030,
  'QMS-F-100':  qmsF100,
  'QMS-F-101':  qmsF101,
  'QMS-F-102':  qmsF102,
  'QMS-F-110':  qmsF110,
  'SUP-F-001':  supF001,
  'AUD-F-002':  audF002,
  'AUD-F-003':  audF003,
  'VDA-F-001':  vdaF001,
  'VDA-F-002':  vdaF002,
  'VDA-F-003':  vdaF003,
  'VDA-F-004':  vdaF004,
  'VDA-F-005':  vdaF005,
  'VDA-F-010':  vdaF010,
  'VDA-F-011':  vdaF011,
  'VDA-F-012':  vdaF012,
  'VDA-F-013':  vdaF003,  // Turtle diagram — same template
  'VDA-F-014':  vdaF014,
  'VDA-F-020':  vdaF020,
  'VDA-F-021':  vdaF021,
  'VDA-F-022':  vdaF022,
}

// ─────────────────────────────────────────────────────────────
// 양식 카탈로그 (서식 자료실 UI 용)
// ─────────────────────────────────────────────────────────────
export const FORMS_LIST = [
  // 검사 양식
  { no: 'IQC-F-001',  title: '수입검사 성적서',          category: '검사 (Inspection)' },
  { no: 'IPQC-F-001', title: '초물검사표',               category: '검사 (Inspection)' },
  { no: 'IPQC-F-002', title: '공정검사 성적서',           category: '검사 (Inspection)' },
  { no: 'IPQC-F-003', title: 'SPC 관리도 (X̄-R Chart)',   category: '검사 (Inspection)' },
  { no: 'OQC-F-001',  title: '출하검사 성적서',           category: '검사 (Inspection)' },
  // 부적합 / CAPA
  { no: 'NCR-F-001',  title: '부적합 보고서',             category: '부적합·CAPA' },
  { no: 'NCR-F-002',  title: '재작업 지시서',             category: '부적합·CAPA' },
  { no: 'NCR-F-010',  title: '시정조치 요청서 (8D CAR)',  category: '부적합·CAPA' },
  { no: 'NCR-F-011',  title: '근본원인 분석서 (5-Why)',   category: '부적합·CAPA' },
  { no: 'NCR-F-012',  title: 'CAPA 추적 대장',           category: '부적합·CAPA' },
  // 품질 관리
  { no: 'QMS-F-003',  title: '리스크 등록부',             category: '품질 관리' },
  { no: 'QMS-F-020',  title: '품질목표 관리표',           category: '품질 관리' },
  { no: 'QMS-F-030',  title: '역량 매트릭스',             category: '품질 관리' },
  { no: 'QMS-F-100',  title: '출하 허가증',               category: '품질 관리' },
  { no: 'QMS-F-101',  title: '특채승인서',                category: '품질 관리' },
  { no: 'QMS-F-102',  title: 'ISIR 초도품 검사 보고서',  category: '품질 관리' },
  { no: 'QMS-F-110',  title: '변경 요청서 (4M 변경)',     category: '품질 관리' },
  // 협력업체 / 심사
  { no: 'SUP-F-001',  title: '공급업체 평가표',           category: '협력업체·심사' },
  { no: 'AUD-F-002',  title: '내부심사 체크리스트',       category: '협력업체·심사' },
  { no: 'AUD-F-003',  title: '심사 지적사항 목록',        category: '협력업체·심사' },
  // VDA 6.3
  { no: 'VDA-F-001',  title: 'VDA 6.3 심사 보고서',      category: 'VDA 6.3' },
  { no: 'VDA-F-002',  title: '개선계획서 (Improvement Plan)', category: 'VDA 6.3' },
  { no: 'VDA-F-003',  title: '거북이 다이어그램 (Turtle Diagram)', category: 'VDA 6.3' },
  { no: 'VDA-F-004',  title: '잠재성 분석 체크시트',      category: 'VDA 6.3' },
  { no: 'VDA-F-005',  title: '공정심사 질문서 (P5~P7)',   category: 'VDA 6.3' },
  { no: 'VDA-F-010',  title: '설비 PM 계획서',            category: 'VDA 6.3' },
  { no: 'VDA-F-011',  title: 'Poka-Yoke 점검 대장',       category: 'VDA 6.3' },
  { no: 'VDA-F-012',  title: '작업자 역량 매트릭스',      category: 'VDA 6.3' },
  { no: 'VDA-F-014',  title: '5S 점검표',                 category: 'VDA 6.3' },
  { no: 'VDA-F-020',  title: '고객요구사항 (CSR) 목록',   category: 'VDA 6.3' },
  { no: 'VDA-F-021',  title: '고객 성과 KPI 보고서',      category: 'VDA 6.3' },
  { no: 'VDA-F-022',  title: 'PPAP 패키지 체크리스트',    category: 'VDA 6.3' },
]

export function printForm(no, title) {
  const rev = '01'
  const generator = FORM_MAP[no]
  const inner = generator ? generator() : genericForm(no, title)
  const html = wrap(no, title, rev, inner)
  const w = window.open('', '_blank', 'width=1200,height=900')
  w.document.write(html)
  w.document.close()
  w.onload = () => { w.focus(); w.print() }
}

export function hasFormTemplate(no) {
  return !!FORM_MAP[no]
}
