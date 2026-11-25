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
  .sec { background: #1e3a5f; color: #fff; font-weight: 700; font-size: 9pt;
         padding: 4px 10px; margin: 8px 0 0; letter-spacing: 1px; }
  .blank { height: 22px; }
  .blank2 { height: 44px; }
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
<table><tr>
  <td class="lc">GR No.</td><td></td>
  <td class="lc">검사일자</td><td></td>
  <td class="lc">공급업체명</td><td></td>
</tr><tr>
  <td class="lc">품번</td><td></td>
  <td class="lc">품명</td><td></td>
  <td class="lc">발주번호</td><td></td>
</tr><tr>
  <td class="lc">입고수량</td><td></td>
  <td class="lc">샘플수</td><td></td>
  <td class="lc">AQL 수준</td><td></td>
</tr></table>

<div class="sec">검사 결과</div>
<table>
  <tr><th style="width:30px">No.</th><th>검사항목</th><th>규격 (기준값)</th>
      <th>측정값 1</th><th>측정값 2</th><th>측정값 3</th><th>측정값 4</th><th>측정값 5</th><th style="width:50px">판정</th></tr>
  ${rows(12, ['','','','','','','',''])}
</table>

<div class="sec">검사 판정</div>
<table><tr>
  <td class="lc">외관 검사</td><td><span class="cb"></span>합격 &nbsp; <span class="cb"></span>불합격</td>
  <td class="lc">치수 검사</td><td><span class="cb"></span>합격 &nbsp; <span class="cb"></span>불합격</td>
  <td class="lc">기능 검사</td><td><span class="cb"></span>합격 &nbsp; <span class="cb"></span>불합격</td>
</tr><tr>
  <td class="lc">종합 판정</td>
  <td colspan="3" style="font-size:11pt;font-weight:900;text-align:center">
    <span class="cb"></span> 합격 (PASS) &nbsp;&nbsp;&nbsp; <span class="cb"></span> 불합격 (FAIL) &nbsp;&nbsp;&nbsp; <span class="cb"></span> 특채
  </td>
  <td class="lc">처리방법</td>
  <td><span class="cb"></span>입고 &nbsp; <span class="cb"></span>반품 &nbsp; <span class="cb"></span>특채</td>
</tr></table>
<table><tr>
  <td class="lc">불합격 사유</td><td colspan="5" class="blank2"></td>
</tr></table>

<div class="sign sign3">
  <div class="sbox"><div class="st">검사원 (서명 / 날짜)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (검토 / 날짜)</div></div>
  <div class="sbox"><div class="st">구매팀 확인 (서명 / 날짜)</div></div>
</div>`
}

function ipqcF001() {
  return `
<table><tr>
  <td class="lc">작업지시번호</td><td></td>
  <td class="lc">작업일자</td><td></td>
  <td class="lc">품번</td><td></td>
</tr><tr>
  <td class="lc">품명</td><td></td>
  <td class="lc">금형번호</td><td></td>
  <td class="lc">설비번호</td><td></td>
</tr><tr>
  <td class="lc">작업자</td><td></td>
  <td class="lc">초물채취수량</td><td></td>
  <td class="lc">검사원</td><td></td>
</tr></table>

<div class="sec">초물 검사 결과 (5-SHOT 측정)</div>
<table>
  <tr><th style="width:28px">No.</th><th>검사항목</th><th>규격 (기준값)</th>
      <th>샘플 1</th><th>샘플 2</th><th>샘플 3</th><th>샘플 4</th><th>샘플 5</th><th style="width:45px">Xbar</th><th style="width:45px">판정</th></tr>
  ${rows(10, ['','','','','','','','',''])}
</table>

<div class="sec">외관 검사</div>
<table><tr>
  <td class="lc">외관 판정</td>
  <td><span class="cb"></span>합격 &nbsp; <span class="cb"></span>불합격</td>
  <td class="lc">외관 불량 내용</td><td colspan="3" class="blank"></td>
</tr></table>

<div class="sec">초물 종합 판정</div>
<table><tr>
  <td style="text-align:center;font-size:11pt;font-weight:900;padding:12px">
    <span class="cb"></span> 합격 → 양산 시작 &nbsp;&nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 불합격 → 조건 재조정 후 재초물 &nbsp;&nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 품질보증팀 에스컬레이션
  </td>
</tr></table>
<table><tr><td class="lc">조건 재조정 내용</td><td class="blank2"></td></tr></table>

<div class="sign sign3">
  <div class="sbox"><div class="st">작업자 (서명 / 날짜)</div></div>
  <div class="sbox"><div class="st">검사원 QA (서명 / 날짜)</div></div>
  <div class="sbox"><div class="st">생산팀장 (승인 / 날짜)</div></div>
</div>`
}

function ipqcF002() {
  return `
<table><tr>
  <td class="lc">작업지시번호</td><td></td>
  <td class="lc">검사일시</td><td></td>
  <td class="lc">검사 회차</td><td></td>
</tr><tr>
  <td class="lc">품번</td><td></td>
  <td class="lc">품명</td><td></td>
  <td class="lc">설비/금형</td><td></td>
</tr><tr>
  <td class="lc">검사원</td><td></td>
  <td class="lc">검사 주기</td><td></td>
  <td class="lc">누계 생산수량</td><td></td>
</tr></table>

<div class="sec">치수 검사 (5-SHOT)</div>
<table>
  <tr><th style="width:28px">No.</th><th>검사항목</th><th>규격</th>
      <th>측정 1</th><th>측정 2</th><th>측정 3</th><th>측정 4</th><th>측정 5</th><th>Xbar</th><th>판정</th></tr>
  ${rows(8, ['','','','','','','','',''])}
</table>

<div class="sec">외관 순회 검사</div>
<table>
  <tr><th style="width:28px">No.</th><th>불량 유형</th><th>불량 수량</th><th>불량률(%)</th><th>조치 내용</th></tr>
  ${rows(5, ['','','',''])}
</table>

<div class="sec">SPC 관리도 타점 (이상 패턴 기록)</div>
<table><tr>
  <td class="lc">이상 패턴</td>
  <td><span class="cb"></span>없음 &nbsp; <span class="cb"></span>관리한계 초과 &nbsp; <span class="cb"></span>연속7점추세 &nbsp; <span class="cb"></span>기타</td>
</tr><tr>
  <td class="lc">조치 내용</td><td class="blank2"></td>
</tr></table>

<table><tr>
  <td class="lc">공정불량률</td><td></td>
  <td class="lc">임계치 초과</td>
  <td><span class="cb"></span>미만(계속생산) &nbsp; <span class="cb"></span>초과(라인중단)</td>
  <td class="lc">라인재가동 승인</td><td></td>
</tr></table>

<div class="sign sign3">
  <div class="sbox"><div class="st">검사원 QA (서명 / 날짜)</div></div>
  <div class="sbox"><div class="st">생산팀장 (확인 / 날짜)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (검토)</div></div>
</div>`
}

function ipqcF003() {
  const cols = Array.from({ length: 25 }, (_, i) => `<th style="width:28px">${i + 1}</th>`).join('')
  const xRow = Array.from({ length: 25 }, () => `<td style="height:16px;border:1px solid #ccc"></td>`).join('')
  return `
<table><tr>
  <td class="lc">품번</td><td></td><td class="lc">품명</td><td></td>
  <td class="lc">관리 특성</td><td></td><td class="lc">규격</td><td></td>
</tr><tr>
  <td class="lc">UCL</td><td></td><td class="lc">CL (Xbar)</td><td></td>
  <td class="lc">LCL</td><td></td><td class="lc">기간</td><td></td>
</tr></table>

<div class="sec">Xbar 관리도 (평균값)</div>
<table>
  <tr><th style="width:60px">측정일시</th>${cols}</tr>
  <tr><td class="lc" style="font-size:7.5pt">측정값1</td>${xRow}</tr>
  <tr><td class="lc" style="font-size:7.5pt">측정값2</td>${xRow}</tr>
  <tr><td class="lc" style="font-size:7.5pt">측정값3</td>${xRow}</tr>
  <tr><td class="lc" style="font-size:7.5pt">측정값4</td>${xRow}</tr>
  <tr><td class="lc" style="font-size:7.5pt">측정값5</td>${xRow}</tr>
  <tr><td class="lc" style="font-size:7.5pt;font-weight:900">Xbar</td>${xRow}</tr>
</table>

<div class="sec">R 관리도 (범위값)</div>
<table>
  <tr><th style="width:60px">회차</th>${cols}</tr>
  <tr><td class="lc" style="font-size:7.5pt;font-weight:900">R값</td>${xRow}</tr>
</table>
<table><tr>
  <td class="lc">UCL(R)</td><td></td><td class="lc">CL(R)</td><td></td><td class="lc">LCL(R)</td><td></td>
  <td class="lc">Cp</td><td></td><td class="lc">Cpk</td><td></td><td class="lc">판정</td><td></td>
</tr></table>

<div class="sec">이상 패턴 기록</div>
<table>
  <tr><th>이상 발생 시점</th><th>이상 유형</th><th>조치 내용</th><th>조치자</th></tr>
  ${rows(3, ['','',''])}
</table>`
}

function oqcF001() {
  return `
<table><tr>
  <td class="lc">OQC 번호</td><td></td>
  <td class="lc">검사일자</td><td></td>
  <td class="lc">납품처</td><td></td>
</tr><tr>
  <td class="lc">품번</td><td></td>
  <td class="lc">품명</td><td></td>
  <td class="lc">납품수량</td><td></td>
</tr><tr>
  <td class="lc">납품일</td><td></td>
  <td class="lc">AQL 수준</td><td></td>
  <td class="lc">샘플수</td><td></td>
</tr></table>

<div class="sec">출하 검사 결과</div>
<table>
  <tr><th style="width:28px">No.</th><th>검사항목</th><th>규격</th>
      <th>측정값 1</th><th>측정값 2</th><th>측정값 3</th><th>판정</th></tr>
  ${rows(10, ['','','','','',''])}
</table>

<div class="sec">포장 검사</div>
<table><tr>
  <td class="lc">라벨 표기</td><td><span class="cb"></span>적합 &nbsp; <span class="cb"></span>부적합</td>
  <td class="lc">수량 확인</td><td><span class="cb"></span>적합 &nbsp; <span class="cb"></span>부적합</td>
  <td class="lc">포장 상태</td><td><span class="cb"></span>적합 &nbsp; <span class="cb"></span>부적합</td>
</tr></table>

<div class="sec">최종 판정</div>
<table><tr>
  <td style="text-align:center;font-size:12pt;font-weight:900;padding:12px">
    <span class="cb"></span> 합격 (출하 허가) &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 불합격 (출하 보류) &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> 조건부 출하
  </td>
</tr></table>
<table><tr><td class="lc">불합격 사유</td><td class="blank2"></td></tr></table>

<div class="sign sign4">
  <div class="sbox"><div class="st">검사원 QA (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인)</div></div>
  <div class="sbox"><div class="st">물류팀 확인</div></div>
  <div class="sbox"><div class="st">출하 허가일시</div></div>
</div>`
}

function ncrF001() {
  return `
<div class="sec">1. 발생 정보</div>
<table><tr>
  <td class="lc">NCR 번호</td><td></td>
  <td class="lc">발생일시</td><td></td>
  <td class="lc">발생 장소</td>
  <td><span class="cb"></span>수입검사 &nbsp;<span class="cb"></span>공정 &nbsp;<span class="cb"></span>출하검사 &nbsp;<span class="cb"></span>고객반품</td>
</tr><tr>
  <td class="lc">품번</td><td></td>
  <td class="lc">품명</td><td></td>
  <td class="lc">LOT 번호</td><td></td>
</tr><tr>
  <td class="lc">부적합 수량</td><td></td>
  <td class="lc">총 로트 수량</td><td></td>
  <td class="lc">발견자</td><td></td>
</tr></table>

<div class="sec">2. 불량 내용</div>
<table><tr>
  <td class="lc">불량 유형</td>
  <td><span class="cb"></span>치수불량 &nbsp;<span class="cb"></span>외관불량 &nbsp;<span class="cb"></span>기능불량 &nbsp;<span class="cb"></span>재질불량 &nbsp;<span class="cb"></span>기타</td>
</tr><tr>
  <td class="lc">불량 현상</td><td class="blank2"></td>
</tr><tr>
  <td class="lc">사진/증거</td><td style="height:60px;font-size:8pt;color:#999">사진 첨부란 (인쇄 후 부착)</td>
</tr></table>

<div class="sec">3. 즉각 격리 조치</div>
<table><tr>
  <td class="lc">격리 조치</td>
  <td><span class="cb"></span>완료 &nbsp;<span class="cb"></span>미완료 &nbsp; 격리 위치: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
  <td class="lc">격리 완료 시각</td><td></td>
</tr><tr>
  <td class="lc">소급 평가</td>
  <td><span class="cb"></span>필요(동일 LOT/공정 소급) &nbsp;<span class="cb"></span>불필요</td>
  <td class="lc">소급 범위</td><td></td>
</tr></table>

<div class="sec">4. 처리 결정</div>
<table><tr>
  <td class="lc">처리 방법</td>
  <td><span class="cb"></span>반품 &nbsp;<span class="cb"></span>재작업 &nbsp;<span class="cb"></span>특채(조건부사용) &nbsp;<span class="cb"></span>폐기</td>
  <td class="lc">결정자</td><td></td>
  <td class="lc">결정일시</td><td></td>
</tr><tr>
  <td class="lc">처리 내용</td><td colspan="5" class="blank2"></td>
</tr></table>

<table><tr>
  <td class="lc">CAPA 개시 필요</td>
  <td><span class="cb"></span>예 (CAR 발행: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;) &nbsp;<span class="cb"></span>아니오</td>
  <td class="lc">귀책</td>
  <td><span class="cb"></span>자사 &nbsp;<span class="cb"></span>공급업체 &nbsp;<span class="cb"></span>고객 &nbsp;<span class="cb"></span>불명</td>
</tr></table>

<div class="sign sign4">
  <div class="sbox"><div class="st">발견자 (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (결정)</div></div>
  <div class="sbox"><div class="st">생산팀장 (확인)</div></div>
  <div class="sbox"><div class="st">처리 완료 확인 (날짜)</div></div>
</div>`
}

function ncrF002() {
  return `
<table><tr>
  <td class="lc">재작업 지시번호</td><td></td>
  <td class="lc">NCR 번호</td><td></td>
  <td class="lc">발행일</td><td></td>
</tr><tr>
  <td class="lc">품번</td><td></td>
  <td class="lc">품명</td><td></td>
  <td class="lc">재작업 수량</td><td></td>
</tr><tr>
  <td class="lc">재작업 담당자</td><td></td>
  <td class="lc">완료 기한</td><td></td>
  <td class="lc">재작업 장소</td><td></td>
</tr></table>

<div class="sec">재작업 내용</div>
<table>
  <tr><th style="width:28px">No.</th><th>재작업 항목</th><th>작업 방법</th><th>작업 시간(분)</th><th>완료여부</th></tr>
  ${rows(6, ['','','',''])}
</table>
<table><tr><td class="lc">주의사항</td><td class="blank2"></td></tr></table>

<div class="sec">재작업 완료 기록</div>
<table><tr>
  <td class="lc">완료일시</td><td></td>
  <td class="lc">완료 수량</td><td></td>
  <td class="lc">폐기 수량</td><td></td>
</tr></table>

<div class="sec">재검사 결과</div>
<table><tr>
  <td class="lc">재검사 결과</td>
  <td><span class="cb"></span>합격 (합격 태그 교체) &nbsp;&nbsp;<span class="cb"></span>불합격 (추가 조치 필요)</td>
  <td class="lc">재검사원</td><td></td>
  <td class="lc">재검사일</td><td></td>
</tr><tr>
  <td class="lc">재검사 의견</td><td colspan="5" class="blank2"></td>
</tr></table>

<div class="sign sign3">
  <div class="sbox"><div class="st">재작업 담당자 (서명)</div></div>
  <div class="sbox"><div class="st">재검사원 QA (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (종결 승인)</div></div>
</div>`
}

function ncrF010() {
  return `
<table><tr>
  <td class="lc">CAR 번호</td><td></td>
  <td class="lc">발행일</td><td></td>
  <td class="lc">완료 기한</td><td></td>
</tr><tr>
  <td class="lc">발생 유형</td>
  <td colspan="5"><span class="cb"></span>고객불만 &nbsp;<span class="cb"></span>내부부적합 &nbsp;<span class="cb"></span>공급업체 &nbsp;<span class="cb"></span>내부심사 &nbsp;<span class="cb"></span>반복발생</td>
</tr></table>

<div class="sec">D1 — 팀 구성 (Team Formation)</div>
<table><tr>
  <td class="lc">팀 리더</td><td></td>
  <td class="lc">팀원</td><td colspan="3"></td>
</tr></table>

<div class="sec">D2 — 문제 기술 (Problem Description)</div>
<table><tr><td style="height:60px"></td></tr></table>

<div class="sec">D3 — 긴급 봉쇄 조치 (Containment Action) — 24시간 이내</div>
<table><tr>
  <td class="lc">봉쇄 조치 내용</td><td style="height:50px"></td>
</tr><tr>
  <td class="lc">봉쇄 완료 일시</td><td></td>
</tr></table>

<div class="sec">D4 — 근본원인 분석 (Root Cause Analysis)</div>
<table>
  <tr><th style="width:80px">Why</th><th>발생 원인</th><th style="width:200px">증거 / 근거</th></tr>
  <tr><td class="lc">1st Why</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc">2nd Why</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc">3rd Why</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc">4th Why</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc">5th Why (근본원인)</td><td style="font-weight:700" class="blank2"></td><td class="blank2"></td></tr>
</table>
<table><tr><th style="width:80px">Why</th><th>유출 원인 (왜 검출 못했나)</th><th>증거 / 근거</th></tr>
  <tr><td class="lc">유출 원인</td><td class="blank2"></td><td class="blank2"></td></tr>
</table>

<div class="sec">D5 — 시정조치 계획 (Corrective Action Plan)</div>
<table>
  <tr><th>조치 항목</th><th style="width:120px">담당자</th><th style="width:90px">완료 기한</th><th style="width:60px">완료여부</th></tr>
  ${rows(4, ['','',''])}
</table>

<div class="sec">D6 — 조치 이행 확인 (Verification)</div>
<table><tr>
  <td class="lc">효과 검증 방법</td><td></td>
  <td class="lc">검증 기간</td><td></td>
  <td class="lc">검증 결과</td>
  <td><span class="cb"></span>효과확인 &nbsp;<span class="cb"></span>효과미흡</td>
</tr></table>

<div class="sec">D7 — 수평 전개 / 재발방지 (D7)</div>
<table><tr><td class="lc">수평 전개 대상</td><td></td><td class="lc">문서 개정</td><td class="blank"></td></tr></table>

<div class="sec">D8 — 완료 및 종결 (Closure)</div>
<div class="sign sign4">
  <div class="sbox"><div class="st">작성자 (서명)</div></div>
  <div class="sbox"><div class="st">부서장 확인</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (종결 승인)</div></div>
  <div class="sbox"><div class="st">종결 일자</div></div>
</div>`
}

function ncrF011() {
  return `
<table><tr>
  <td class="lc">분석서 번호</td><td></td>
  <td class="lc">NCR/CAR 번호</td><td></td>
  <td class="lc">분석일</td><td></td>
</tr></table>

<div class="sec">현상 기술 (Is / Is Not 분석)</div>
<table>
  <tr><th style="width:120px">구분</th><th>IS (해당하는 것)</th><th>IS NOT (해당하지 않는 것)</th></tr>
  <tr><td class="lc">무엇(What)</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc">어디서(Where)</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc">언제(When)</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc">규모(How Much)</td><td class="blank2"></td><td class="blank2"></td></tr>
</table>

<div class="sec">특성요인도 (이시카와 다이어그램) — 잠재 원인 나열</div>
<table>
  <tr><th style="width:120px">분류</th><th>잠재 원인 목록</th></tr>
  <tr><td class="lc">Man (사람)</td><td style="height:40px"></td></tr>
  <tr><td class="lc">Machine (설비)</td><td style="height:40px"></td></tr>
  <tr><td class="lc">Material (재료)</td><td style="height:40px"></td></tr>
  <tr><td class="lc">Method (방법)</td><td style="height:40px"></td></tr>
  <tr><td class="lc">Measurement</td><td style="height:40px"></td></tr>
  <tr><td class="lc">Environment</td><td style="height:40px"></td></tr>
</table>

<div class="sec">5-Why 분석 — 발생 원인</div>
<table>
  <tr><th style="width:90px">단계</th><th>질문 (왜?)</th><th>답변 (원인)</th></tr>
  <tr><td class="lc">1st Why</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc">2nd Why</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc">3rd Why</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc">4th Why</td><td class="blank2"></td><td class="blank2"></td></tr>
  <tr><td class="lc" style="background:#ffd">5th Why (근본원인)</td><td style="font-weight:700" class="blank2"></td><td style="font-weight:700" class="blank2"></td></tr>
</table>

<div class="sec">5-Why 분석 — 유출 원인 (왜 검출하지 못했는가)</div>
<table>
  <tr><td class="lc">유출 경로</td><td class="blank2"></td></tr>
  <tr><td class="lc">유출 근본원인</td><td class="blank2"></td></tr>
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">분석 담당자 (서명)</div></div>
  <div class="sbox"><div class="st">부서장 (검토)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인)</div></div>
</div>`
}

function ncrF012() {
  return `
<div class="sec">CAPA 추적 대장</div>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>CAR 번호</th>
    <th>발생일</th>
    <th>발생 유형</th>
    <th>불량 내용</th>
    <th>담당 부서</th>
    <th>완료 기한</th>
    <th>D3 봉쇄<br>완료</th>
    <th>D5 조치<br>완료</th>
    <th>D6 검증<br>완료</th>
    <th>종결<br>일자</th>
    <th>상태</th>
  </tr>
  ${rows(15, ['','','','','','','','','','',''])}
</table>
<div class="note">※ 상태: O(진행중) / V(효과확인) / C(종결) / H(보류)</div>`
}

function qmsF003() {
  return `
<table><tr>
  <td class="lc">부서</td><td></td>
  <td class="lc">작성자</td><td></td>
  <td class="lc">작성일</td><td></td>
  <td class="lc">검토일</td><td></td>
</tr></table>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>리스크 항목</th>
    <th>카테고리</th>
    <th>발생가능성<br>(1~5)</th>
    <th>심각도<br>(1~5)</th>
    <th>위험도<br>(P×S)</th>
    <th>등급</th>
    <th>처리 방법</th>
    <th>대응 계획</th>
    <th>담당자</th>
    <th>기한</th>
    <th>재평가<br>위험도</th>
  </tr>
  ${rows(12, ['','','','','','','','','','',''])}
</table>
<div class="note">※ 위험도 등급: ≥16 긴급(빨강) / 9~15 중기(노랑) / ≤8 모니터링(초록) | 카테고리: 품질/생산/공급망/규제/환경</div>
<div class="sign sign3">
  <div class="sbox"><div class="st">작성자 (서명)</div></div>
  <div class="sbox"><div class="st">부서장 (검토)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인)</div></div>
</div>`
}

function qmsF020() {
  return `
<table><tr>
  <td class="lc">대상 연도</td><td></td>
  <td class="lc">수립일</td><td></td>
  <td class="lc">승인자</td><td></td>
</tr></table>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th>품질 목표 항목</th>
    <th>단위</th>
    <th>전년도 실적</th>
    <th>당해 목표</th>
    <th>1Q 실적</th>
    <th>2Q 실적</th>
    <th>3Q 실적</th>
    <th>4Q 실적</th>
    <th>연간 실적</th>
    <th>달성여부</th>
    <th>미달 원인</th>
  </tr>
  <tr><td class="lc" colspan="2">불량률 (내부)</td><td>%</td>${Array(9).fill('<td></td>').join('')}</tr>
  <tr><td class="lc" colspan="2">고객 불만 건수</td><td>건</td>${Array(9).fill('<td></td>').join('')}</tr>
  <tr><td class="lc" colspan="2">납기준수율 (OTD)</td><td>%</td>${Array(9).fill('<td></td>').join('')}</tr>
  <tr><td class="lc" colspan="2">협력사 품질지수</td><td>점</td>${Array(9).fill('<td></td>').join('')}</tr>
  <tr><td class="lc" colspan="2">CAPA 완결률</td><td>%</td>${Array(9).fill('<td></td>').join('')}</tr>
  ${rows(5, ['','','','','','','','','','',''])}
</table>
<div class="sign sign3">
  <div class="sbox"><div class="st">품질보증팀장 (작성)</div></div>
  <div class="sbox"><div class="st">임원 (검토)</div></div>
  <div class="sbox"><div class="st">대표이사 (승인)</div></div>
</div>`
}

function qmsF030() {
  return `
<table><tr>
  <td class="lc">부서</td><td></td>
  <td class="lc">작성자</td><td></td>
  <td class="lc">작성일</td><td></td>
  <td class="lc">검토일</td><td></td>
</tr></table>
<div class="note">※ 역량 수준: 1=교육필요 / 2=기본수행 / 3=독자수행 / 4=타인지도 | 목표: 주요 직무 Level 3 이상</div>
<table>
  <tr>
    <th rowspan="2" style="width:100px">직무 항목</th>
    <th rowspan="2">직무 설명</th>
    <th rowspan="2">목표<br>수준</th>
    <th colspan="8">사원별 현재 수준</th>
    <th rowspan="2">교육 계획</th>
  </tr>
  <tr>
    <th style="width:55px">성명</th><th style="width:55px">성명</th><th style="width:55px">성명</th>
    <th style="width:55px">성명</th><th style="width:55px">성명</th><th style="width:55px">성명</th>
    <th style="width:55px">성명</th><th style="width:55px">성명</th>
  </tr>
  ${rows(12, ['','','','','','','','','',''])}
</table>`
}

function qmsF100() {
  return `
<table><tr>
  <td class="lc">출하허가 번호</td><td></td>
  <td class="lc">허가 일시</td><td></td>
  <td class="lc">납품처</td><td></td>
</tr><tr>
  <td class="lc">품번</td><td></td>
  <td class="lc">품명</td><td></td>
  <td class="lc">출하 수량</td><td></td>
</tr><tr>
  <td class="lc">LOT 번호</td><td></td>
  <td class="lc">OQC 번호</td><td></td>
  <td class="lc">납품 예정일</td><td></td>
</tr></table>

<div class="sec">검사 완료 확인</div>
<table>
  <tr>
    <th style="width:160px">확인 항목</th>
    <th style="width:80px">결과</th>
    <th>비고</th>
  </tr>
  <tr><td class="lc">출하검사 성적서 완비</td><td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>X</td><td></td></tr>
  <tr><td class="lc">OQC 합격 판정 확인</td><td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>X</td><td></td></tr>
  <tr><td class="lc">수량 일치 확인</td><td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>X</td><td></td></tr>
  <tr><td class="lc">라벨/포장 상태 확인</td><td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>X</td><td></td></tr>
  <tr><td class="lc">부적합·보류품 혼입 없음</td><td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>X</td><td></td></tr>
</table>

<div style="text-align:center;font-size:14pt;font-weight:900;border:2px solid #000;padding:14px;margin:12px 0">
  <span class="cb"></span> 출하 허가 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span class="cb"></span> 출하 보류
</div>

<div class="sign sign4">
  <div class="sbox"><div class="st">출하검사원 QA</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (최종 허가)</div></div>
  <div class="sbox"><div class="st">물류팀 수령 확인</div></div>
  <div class="sbox"><div class="st">허가 일시</div></div>
</div>`
}

function qmsF101() {
  return `
<table><tr>
  <td class="lc">특채승인 번호</td><td></td>
  <td class="lc">NCR 번호</td><td></td>
  <td class="lc">요청일</td><td></td>
</tr><tr>
  <td class="lc">품번</td><td></td>
  <td class="lc">품명</td><td></td>
  <td class="lc">특채 수량</td><td></td>
</tr><tr>
  <td class="lc">LOT 번호</td><td></td>
  <td class="lc">공급업체</td><td></td>
  <td class="lc">사용 공정</td><td></td>
</tr></table>

<div class="sec">부적합 내용</div>
<table>
  <tr><td class="lc">부적합 항목</td><td class="blank2"></td></tr>
  <tr><td class="lc">실측값</td><td></td></tr>
  <tr><td class="lc">규격</td><td></td></tr>
  <tr><td class="lc">이탈량</td><td></td></tr>
</table>

<div class="sec">특채 사유 및 위험 평가</div>
<table>
  <tr><td class="lc">특채 사유</td><td class="blank2"></td></tr>
  <tr><td class="lc">기능에 미치는 영향</td>
    <td><span class="cb"></span>무영향 &nbsp;<span class="cb"></span>경미 &nbsp;<span class="cb"></span>영향있음(고객승인필요)</td></tr>
  <tr><td class="lc">고객 사전 승인 필요</td>
    <td><span class="cb"></span>필요 (고객 승인번호: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;) &nbsp;<span class="cb"></span>불필요</td></tr>
  <tr><td class="lc">재발방지 대책</td><td class="blank2"></td></tr>
</table>

<div class="sign sign5">
  <div class="sbox"><div class="st">요청자 (서명)</div></div>
  <div class="sbox"><div class="st">엔지니어링 (검토)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (승인)</div></div>
  <div class="sbox"><div class="st">고객 담당자 (필요시)</div></div>
  <div class="sbox"><div class="st">승인 일자</div></div>
</div>`
}

function qmsF102() {
  return `
<table><tr>
  <td class="lc">ISIR 번호</td><td></td>
  <td class="lc">제출일</td><td></td>
  <td class="lc">납품처</td><td></td>
</tr><tr>
  <td class="lc">품번</td><td></td>
  <td class="lc">품명</td><td></td>
  <td class="lc">도면 개정번호</td><td></td>
</tr><tr>
  <td class="lc">초도 로트 수량</td><td></td>
  <td class="lc">PPAP Level</td><td></td>
  <td class="lc">제출 사유</td>
  <td><span class="cb"></span>신규 &nbsp;<span class="cb"></span>설계변경 &nbsp;<span class="cb"></span>공정변경 &nbsp;<span class="cb"></span>기타</td>
</tr></table>

<div class="sec">치수 측정 결과 (전항목)</div>
<table>
  <tr><th style="width:28px">No.</th><th>도면 풍선번호</th><th>특성항목</th>
      <th>규격</th><th>측정값 1</th><th>측정값 2</th><th>측정값 3</th><th>평균</th><th>Cpk</th><th>판정</th></tr>
  ${rows(15, ['','','','','','','','',''])}
</table>

<div class="sec">PPAP 체크리스트</div>
<table>
  <tr><th style="width:28px">No.</th><th>제출 항목</th><th style="width:70px">적용여부</th><th style="width:70px">제출여부</th><th>비고</th></tr>
  ${[
    '설계 기록 (도면)', '설계 FMEA (DFMEA)', '공정흐름도 (PFD)', '공정 FMEA (PFMEA)',
    '관리계획서 (Control Plan)', '측정시스템 분석 (MSA)', '초기 공정능력 (Ppk)',
    '수입검사 성적서', '외관 승인 보고서 (AAR)', '초도품 현물 샘플', '재질 성적서 (Mill Sheet)'
  ].map((item, i) => `<tr><td style="text-align:center;color:#bbb">${i + 1}</td><td>${item}</td>
    <td style="text-align:center"><span class="cb"></span>적용 &nbsp;<span class="cb"></span>면제</td>
    <td style="text-align:center"><span class="cb"></span>O &nbsp;<span class="cb"></span>X</td><td></td></tr>`).join('')}
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">품질보증팀장 (작성)</div></div>
  <div class="sbox"><div class="st">개발/생산 담당자</div></div>
  <div class="sbox"><div class="st">고객 승인 (날짜)</div></div>
</div>`
}

function qmsF110() {
  return `
<table><tr>
  <td class="lc">변경 요청 번호</td><td></td>
  <td class="lc">요청일</td><td></td>
  <td class="lc">요청 부서</td><td></td>
</tr><tr>
  <td class="lc">변경 유형</td>
  <td colspan="5"><span class="cb"></span>제품/도면 &nbsp;<span class="cb"></span>공정(4M) &nbsp;<span class="cb"></span>원자재 &nbsp;<span class="cb"></span>공급업체 &nbsp;<span class="cb"></span>설비 &nbsp;<span class="cb"></span>기타</td>
</tr><tr>
  <td class="lc">4M 세부</td>
  <td><span class="cb"></span>Man &nbsp;<span class="cb"></span>Machine &nbsp;<span class="cb"></span>Material &nbsp;<span class="cb"></span>Method</td>
  <td class="lc">대상 품번</td><td></td>
  <td class="lc">대상 공정</td><td></td>
</tr></table>

<div class="sec">변경 내용</div>
<table>
  <tr><td class="lc">변경 전 (Before)</td><td style="height:55px"></td></tr>
  <tr><td class="lc">변경 후 (After)</td><td style="height:55px"></td></tr>
  <tr><td class="lc">변경 사유</td><td style="height:40px"></td></tr>
  <tr><td class="lc">기대 효과</td><td style="height:40px"></td></tr>
</table>

<div class="sec">영향 평가</div>
<table>
  <tr><td class="lc">고객 사전 승인</td>
    <td><span class="cb"></span>필요 (승인 획득 전 적용 불가) &nbsp;<span class="cb"></span>불필요</td>
    <td class="lc">PPAP 재제출</td>
    <td><span class="cb"></span>필요 &nbsp;<span class="cb"></span>불필요</td></tr>
  <tr><td class="lc">관련 문서 개정 필요</td><td colspan="3"></td></tr>
  <tr><td class="lc">시험 / 검증 필요</td>
    <td><span class="cb"></span>필요 (검증 계획: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;) &nbsp;<span class="cb"></span>불필요</td>
    <td class="lc">예상 적용일</td><td></td></tr>
</table>

<div class="sign sign4">
  <div class="sbox"><div class="st">요청자 (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (영향평가)</div></div>
  <div class="sbox"><div class="st">개발팀장 (기술검토)</div></div>
  <div class="sbox"><div class="st">대표이사 (최종 승인)</div></div>
</div>`
}

function supF001() {
  return `
<table><tr>
  <td class="lc">공급업체명</td><td></td>
  <td class="lc">평가일</td><td></td>
  <td class="lc">평가자</td><td></td>
</tr><tr>
  <td class="lc">대표자</td><td></td>
  <td class="lc">소재지</td><td colspan="3"></td>
</tr><tr>
  <td class="lc">주요 납품 품목</td><td></td>
  <td class="lc">인증 현황</td><td></td>
  <td class="lc">평가 목적</td>
  <td><span class="cb"></span>신규등록 &nbsp;<span class="cb"></span>정기평가 &nbsp;<span class="cb"></span>특별평가</td>
</tr></table>

<div class="sec">평가 항목 (100점 만점)</div>
<table>
  <tr><th style="width:120px">평가 분야</th><th>평가 항목</th><th style="width:60px">배점</th><th style="width:60px">취득점수</th><th>평가 의견</th></tr>
  <tr><td class="lc" rowspan="4">품질시스템<br>(40점)</td>
    <td>ISO 9001/IATF 16949 인증 보유</td><td style="text-align:center">10</td><td></td><td></td></tr>
  <tr><td>품질 조직 및 역할 명확성</td><td style="text-align:center">10</td><td></td><td></td></tr>
  <tr><td>공정관리 체계(PFMEA/CP) 보유</td><td style="text-align:center">10</td><td></td><td></td></tr>
  <tr><td>측정장비 교정 관리</td><td style="text-align:center">10</td><td></td><td></td></tr>
  <tr><td class="lc" rowspan="3">기술능력<br>(30점)</td>
    <td>주요 설비 보유 현황</td><td style="text-align:center">10</td><td></td><td></td></tr>
  <tr><td>품질 실적(PPM, 클레임 이력)</td><td style="text-align:center">10</td><td></td><td></td></tr>
  <tr><td>기술인력 보유 수준</td><td style="text-align:center">10</td><td></td><td></td></tr>
  <tr><td class="lc">가격경쟁력<br>(15점)</td>
    <td>견적가 경쟁력 / 원가절감 의지</td><td style="text-align:center">15</td><td></td><td></td></tr>
  <tr><td class="lc">납기능력<br>(15점)</td>
    <td>납기준수율 이력 / 생산 CAPA</td><td style="text-align:center">15</td><td></td><td></td></tr>
  <tr><th style="font-weight:900">합계</th><td></td><td style="text-align:center;font-weight:900">100</td><td style="font-weight:900"></td><td></td></tr>
</table>

<div class="sec">종합 판정</div>
<table><tr>
  <td style="text-align:center;font-size:12pt;font-weight:900;padding:12px">
    <span class="cb"></span> A: 70점 이상 → 등록 승인 &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> B: 60~69점 → 조건부 등록 &nbsp;&nbsp;&nbsp;
    <span class="cb"></span> C: 60점 미만 → 등록 불가
  </td>
</tr></table>
<table><tr><td class="lc">총점</td><td></td><td class="lc">판정</td><td></td><td class="lc">조건(조건부 시)</td><td></td></tr></table>

<div class="sign sign3">
  <div class="sbox"><div class="st">평가자 (서명)</div></div>
  <div class="sbox"><div class="st">품질보증팀장 (검토)</div></div>
  <div class="sbox"><div class="st">구매팀장 (승인)</div></div>
</div>`
}

function audF002() {
  return `
<table><tr>
  <td class="lc">심사 번호</td><td></td>
  <td class="lc">심사일</td><td></td>
  <td class="lc">수감 부서</td><td></td>
</tr><tr>
  <td class="lc">심사원</td><td></td>
  <td class="lc">수감 부서장</td><td></td>
  <td class="lc">심사 범위</td><td></td>
</tr></table>

<div class="sec">심사 체크리스트</div>
<div class="note">※ 판정: O(적합) / × (부적합) / △ (관찰사항) / N/A (해당없음)</div>
<table>
  <tr><th style="width:60px">조항</th><th>심사 항목</th><th style="width:50px">판정</th><th>증거 / 관찰 내용</th></tr>
  ${[
    ['§4.1','조직의 상황 및 이슈 파악'],
    ['§4.2','이해관계자 요구사항 파악'],
    ['§5.1','리더십 및 경영 의지'],
    ['§5.2','품질 방침 수립 및 전달'],
    ['§6.1','리스크 및 기회 관리'],
    ['§6.2','품질목표 수립 및 모니터링'],
    ['§7.1','자원(인원/인프라) 충족'],
    ['§7.2','인원 역량 및 교육훈련'],
    ['§7.5','문서화된 정보 관리'],
    ['§8.1','운영 계획 및 관리'],
    ['§8.4','외부 공급업체 관리'],
    ['§8.5','생산·서비스 제공'],
    ['§8.6','제품·서비스 적합성 확인'],
    ['§8.7','부적합품 관리'],
    ['§9.1','성과 모니터링·측정'],
    ['§9.2','내부심사 실시'],
    ['§10.2','시정조치 및 재발방지'],
  ].map(([clause, item]) =>
    `<tr><td style="text-align:center;font-size:8pt">${clause}</td><td>${item}</td><td style="text-align:center"></td><td class="blank"></td></tr>`
  ).join('')}
</table>

<div class="sec">지적사항 요약</div>
<table>
  <tr><th style="width:28px">No.</th><th>조항</th><th>지적 유형</th><th>지적 내용</th><th style="width:90px">완료 기한</th></tr>
  ${rows(5, ['','','',''])}
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">심사원 (서명)</div></div>
  <div class="sbox"><div class="st">수감 부서장 (확인)</div></div>
  <div class="sbox"><div class="st">심사팀장 (승인)</div></div>
</div>`
}

function audF003() {
  return `
<table><tr>
  <td class="lc">심사 번호</td><td></td>
  <td class="lc">심사일</td><td></td>
  <td class="lc">심사원</td><td></td>
</tr></table>
<table>
  <tr>
    <th style="width:28px">No.</th>
    <th style="width:60px">조항</th>
    <th style="width:70px">유형</th>
    <th>지적 내용</th>
    <th style="width:120px">증거 (기록/관찰)</th>
    <th style="width:90px">시정조치 기한</th>
    <th style="width:70px">종결여부</th>
  </tr>
  ${rows(10, ['','','','','',''])}
</table>
<div class="note">※ 유형: 중대부적합(MAJ) / 경미부적합(MIN) / 관찰사항(OBS) / 강점(STR)</div>

<div class="sign sign3">
  <div class="sbox"><div class="st">심사원 (서명)</div></div>
  <div class="sbox"><div class="st">수감 부서장 (확인)</div></div>
  <div class="sbox"><div class="st">심사팀장 (승인)</div></div>
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
<table><tr>
  <td class="lc">부서</td><td></td>
  <td class="lc">작성자</td><td></td>
  <td class="lc">작성일</td><td>${today}</td>
</tr><tr>
  <td class="lc">검토자</td><td></td>
  <td class="lc">검토일</td><td></td>
  <td class="lc">승인자</td><td></td>
</tr></table>

<div class="sec">내용</div>
<table>
  ${rows(18, ['','','','',''])}
</table>
<table>
  <tr><th style="width:28px">No.</th><th>항목</th><th>내용</th><th style="width:100px">비고</th></tr>
  ${rows(8, ['','',''])}
</table>

<div class="sign sign3">
  <div class="sbox"><div class="st">작성자 (서명 / 날짜)</div></div>
  <div class="sbox"><div class="st">검토자 (서명 / 날짜)</div></div>
  <div class="sbox"><div class="st">승인자 (서명 / 날짜)</div></div>
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
    <th>CSR 항목</th>
    <th style="width:120px">내부 이행 근거 (문서/공정)</th>
    <th style="width:60px">준수 여부</th>
    <th style="width:90px">조치 계획 / 비고</th>
  </tr>
  ${rows(15, ['','','','',''])}
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
