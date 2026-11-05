"""MES 현장 모니터 HTML 서빙"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["MES모니터"])

MONITOR_HTML = r"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MES 현장 모니터</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0f1e;--surface:#111827;--border:#1e293b;
  --blue:#3b82f6;--green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--gray:#64748b;
  --text:#f1f5f9;--text-sm:#94a3b8;
}
body{background:var(--bg);color:var(--text);font-family:'Malgun Gothic',sans-serif;min-height:100vh;display:flex;flex-direction:column}

/* 헤더 */
#header{background:var(--surface);border-bottom:2px solid var(--border);padding:12px 24px;display:flex;align-items:center;justify-content:space-between}
#machine-title{font-size:24px;font-weight:700;color:var(--blue)}
#header-right{display:flex;align-items:center;gap:16px;font-size:13px;color:var(--text-sm)}
#clock{font-size:20px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums}
#status-badge{padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:1px}
.badge-idle{background:#1e293b;color:var(--gray)}
.badge-running{background:#14532d;color:var(--green)}
.badge-down{background:#450a0a;color:var(--red)}

/* 메인 그리드 */
#main{flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:auto auto;gap:12px;padding:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px}
.card-label{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-sm);margin-bottom:8px}

/* 대형 숫자 카드 */
.big-num{font-size:64px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.big-sub{font-size:14px;color:var(--text-sm);margin-top:6px}
.pct{font-size:20px;font-weight:600;margin-left:8px}

/* 진행률 바 */
.progress-wrap{margin-top:12px}
.progress-bg{background:#1e293b;border-radius:4px;height:12px;overflow:hidden}
.progress-fill{height:100%;border-radius:4px;transition:width 0.5s}

/* OEE 카드 */
.oee-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px}
.oee-item{text-align:center;background:#0f172a;border-radius:6px;padding:10px}
.oee-val{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.oee-lbl{font-size:10px;color:var(--text-sm);margin-top:2px}

/* 작업자 카드 */
.worker-info{display:flex;align-items:center;gap:12px;margin-top:8px}
.worker-avatar{width:48px;height:48px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700}
.worker-name{font-size:22px;font-weight:700}
.worker-rank{font-size:12px;color:var(--yellow);margin-top:2px}

/* KPI 테이블 */
.kpi-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}
.kpi-row:last-child{border-bottom:none}
.kpi-val{font-weight:700;font-variant-numeric:tabular-nums}
.ok{color:var(--green)}
.warn{color:var(--yellow)}
.bad{color:var(--red)}

/* 비가동 오버레이 */
#downtime-overlay{display:none;position:fixed;inset:0;background:rgba(239,68,68,0.15);border:4px solid var(--red);pointer-events:none;z-index:10;animation:blink 1.5s infinite}
@keyframes blink{0%,100%{border-color:#ef4444}50%{border-color:#450a0a}}
#downtime-banner{display:none;background:#450a0a;color:var(--red);text-align:center;padding:8px;font-size:14px;font-weight:700;letter-spacing:1px}

/* 대기화면 */
#idle-screen{display:none;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:24px;text-align:center}
#idle-screen h2{font-size:28px;color:var(--text-sm)}
#qr-hint{font-size:14px;color:var(--gray);margin-top:4px}
#scan-input{position:absolute;opacity:0;width:1px;height:1px}

/* 입력 모달 */
.modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;align-items:center;justify-content:center}
.modal-bg.open{display:flex}
.modal{background:#1e293b;border-radius:12px;padding:28px;min-width:320px;max-width:400px}
.modal h3{font-size:18px;font-weight:700;margin-bottom:16px}
.modal-input{width:100%;padding:10px;background:#0f172a;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:18px;text-align:center;font-variant-numeric:tabular-nums}
.modal-input:focus{outline:none;border-color:var(--blue)}
.modal-btns{display:flex;gap:8px;margin-top:16px}
.btn{padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;flex:1}
.btn-primary{background:var(--blue);color:#fff}
.btn-danger{background:var(--red);color:#fff}
.btn-gray{background:#334155;color:var(--text)}

/* 비가동 선택 */
.reason-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.reason-btn{padding:12px;background:#0f172a;border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;font-size:13px;text-align:center}
.reason-btn:hover{border-color:var(--yellow);color:var(--yellow)}

/* 액션 버튼바 */
#action-bar{background:var(--surface);border-top:1px solid var(--border);padding:12px 16px;display:flex;gap:10px}
.action-btn{flex:1;padding:14px;border:none;border-radius:6px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit}
.action-btn:disabled{opacity:.4;cursor:not-allowed}

/* 로그인 화면 */
#login-screen{display:none;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:16px}
.login-box{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:32px;width:320px;text-align:center}
.login-box h2{margin-bottom:20px;font-size:20px}
.login-box input{width:100%;padding:10px;background:#0f172a;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:16px;margin-bottom:10px;text-align:center}
.login-box input:focus{outline:none;border-color:var(--blue)}
</style>
</head>
<body>

<!-- 비가동 경보 -->
<div id="downtime-banner">🔴 비가동 중 — <span id="downtime-reason-text"></span></div>
<div id="downtime-overlay"></div>

<!-- 헤더 -->
<div id="header">
  <div id="machine-title">-- 호기</div>
  <div id="header-right">
    <span id="worker-label" style="font-size:15px;color:var(--text)"></span>
    <div id="status-badge" class="badge-idle">대기</div>
    <div id="clock">00:00:00</div>
  </div>
</div>

<!-- 로그인 화면 -->
<div id="login-screen" style="display:flex">
  <div class="login-box">
    <h2>🏭 작업자 로그인</h2>
    <p style="font-size:12px;color:var(--text-sm);margin-bottom:16px">사원증 바코드를 스캔하거나 ID를 입력하세요</p>
    <input id="worker-input" placeholder="작업자 ID / 바코드 스캔" autofocus />
    <button class="btn btn-primary" onclick="doLogin()" style="width:100%;padding:12px;margin-top:4px">로그인</button>
  </div>
</div>

<!-- 대기 화면 (로그인 후) -->
<div id="idle-screen">
  <div>
    <div style="font-size:48px;margin-bottom:8px">📋</div>
    <h2>작업지시서 QR을 스캔하세요</h2>
    <div id="qr-hint">화면을 클릭하면 스캔 준비됩니다</div>
  </div>
  <input id="scan-input" autofocus />
</div>

<!-- 작업 중 메인 화면 -->
<div id="main" style="display:none">
  <!-- 생산 현황 -->
  <div class="card" style="grid-column:1/3">
    <div class="card-label">생산 현황</div>
    <div style="display:flex;align-items:flex-end;gap:16px">
      <div>
        <div class="big-num" id="good-qty">0</div>
        <div class="big-sub">양품 / 목표 <strong id="target-qty">0</strong></div>
      </div>
      <div style="font-size:36px;font-weight:700;padding-bottom:8px" id="achieve-pct">0%</div>
    </div>
    <div class="progress-wrap">
      <div class="progress-bg"><div class="progress-fill" id="progress-bar" style="width:0%;background:var(--green)"></div></div>
    </div>
    <div style="display:flex;gap:24px;margin-top:12px;font-size:13px">
      <span>불량 <strong id="defect-qty" class="bad">0</strong></span>
      <span>이론생산 <strong id="theory-qty">0</strong></span>
      <span>가동 <strong id="working-min">0</strong>분</span>
      <span>비가동 <strong id="downtime-min" class="warn">0</strong>분</span>
    </div>
  </div>

  <!-- 작업자 -->
  <div class="card">
    <div class="card-label">작업자</div>
    <div class="worker-info">
      <div class="worker-avatar" id="worker-avatar">?</div>
      <div>
        <div class="worker-name" id="worker-name">-</div>
        <div class="worker-rank" id="worker-rank"></div>
      </div>
    </div>
    <div style="margin-top:16px">
      <div class="kpi-row"><span>이번달 OEE</span><span class="kpi-val" id="month-oee">-</span></div>
      <div class="kpi-row"><span>이번달 불량률</span><span class="kpi-val" id="month-defect">-</span></div>
      <div class="kpi-row"><span>이번달 순위</span><span class="kpi-val" id="month-rank">-</span></div>
    </div>
  </div>

  <!-- OEE -->
  <div class="card" style="grid-column:1/2">
    <div class="card-label">OEE</div>
    <div style="font-size:48px;font-weight:800;color:var(--blue)" id="oee-val">0%</div>
    <div class="oee-grid">
      <div class="oee-item">
        <div class="oee-val" id="avail-val">0%</div>
        <div class="oee-lbl">가용률</div>
      </div>
      <div class="oee-item">
        <div class="oee-val" id="perf-val">0%</div>
        <div class="oee-lbl">성능률</div>
      </div>
      <div class="oee-item">
        <div class="oee-val" id="qual-val">0%</div>
        <div class="oee-lbl">품질률</div>
      </div>
    </div>
  </div>

  <!-- 품목정보 -->
  <div class="card" style="grid-column:2/4">
    <div class="card-label">작업 정보</div>
    <div style="font-size:18px;font-weight:700;margin-bottom:8px" id="part-name">-</div>
    <div class="kpi-row"><span>품번</span><span class="kpi-val" id="part-no">-</span></div>
    <div class="kpi-row"><span>작업지시번호</span><span class="kpi-val" id="wo-no">-</span></div>
    <div class="kpi-row"><span>작업 시작</span><span class="kpi-val" id="start-time">-</span></div>
    <div class="kpi-row"><span>시간당 목표</span><span class="kpi-val" id="uph-target">-</span></div>
  </div>
</div>

<!-- 액션 버튼바 -->
<div id="action-bar" style="display:none">
  <button class="action-btn" style="background:#1e40af;color:#fff" onclick="openProdModal()">➕ 수량 입력</button>
  <button class="action-btn" style="background:#7f1d1d;color:#fff" onclick="openDefectModal()">❌ 불량 등록</button>
  <button class="action-btn" id="downtime-btn" style="background:#78350f;color:#fff" onclick="toggleDowntime()">⏸ 비가동</button>
  <button class="action-btn" style="background:#14532d;color:#fff" onclick="confirmComplete()">✅ 작업 완료</button>
</div>

<!-- 수량 입력 모달 -->
<div class="modal-bg" id="prod-modal">
  <div class="modal">
    <h3>✅ 양품 수량 입력</h3>
    <input class="modal-input" type="number" id="prod-qty-input" placeholder="수량" min="1" />
    <div class="modal-btns">
      <button class="btn btn-gray" onclick="closeModal('prod-modal')">취소</button>
      <button class="btn btn-primary" onclick="submitProd()">확인</button>
    </div>
  </div>
</div>

<!-- 불량 등록 모달 -->
<div class="modal-bg" id="defect-modal">
  <div class="modal">
    <h3>❌ 불량 등록</h3>
    <input class="modal-input" type="number" id="defect-qty-input" placeholder="불량 수량" min="1" style="margin-bottom:10px" />
    <input class="modal-input" type="text" id="defect-type-input" placeholder="불량 유형 (예: 미성형, 플래쉬)" />
    <div class="modal-btns">
      <button class="btn btn-gray" onclick="closeModal('defect-modal')">취소</button>
      <button class="btn btn-danger" onclick="submitDefect()">등록</button>
    </div>
  </div>
</div>

<!-- 비가동 사유 모달 -->
<div class="modal-bg" id="downtime-modal">
  <div class="modal">
    <h3>⏸ 비가동 사유 선택</h3>
    <div class="reason-grid">
      <button class="reason-btn" onclick="startDowntime('설비고장')">🔧 설비고장</button>
      <button class="reason-btn" onclick="startDowntime('금형교체')">🔩 금형교체</button>
      <button class="reason-btn" onclick="startDowntime('재료교체')">🧱 재료교체</button>
      <button class="reason-btn" onclick="startDowntime('품질이슈')">⚠️ 품질이슈</button>
      <button class="reason-btn" onclick="startDowntime('휴식')">☕ 휴식</button>
      <button class="reason-btn" onclick="startDowntime('기타')">📝 기타</button>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-gray" onclick="closeModal('downtime-modal')" style="width:100%">취소</button>
    </div>
  </div>
</div>

<script>
const BASE = '';
const params = new URLSearchParams(location.search);
const MACHINE_ID = params.get('machine') || 'M01';

let sessionId = null;
let workerId = null;
let isDown = false;
let refreshTimer = null;

// ── 시계 ──
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}
setInterval(updateClock, 1000);
updateClock();

// ── 로그인 ──
document.getElementById('worker-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

async function doLogin() {
  const id = document.getElementById('worker-input').value.trim();
  if (!id) return;
  workerId = id;
  document.getElementById('worker-label').textContent = `👤 ${id}`;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('idle-screen').style.display = 'flex';
  document.getElementById('machine-title').textContent = `${MACHINE_ID.replace('M','').replace(/^0/,'')}호기`;

  // 현재 진행중 세션 확인
  await refreshData();
  setTimeout(() => document.getElementById('scan-input').focus(), 100);
}

// ── QR 스캔 ──
document.getElementById('idle-screen').addEventListener('click', () => {
  document.getElementById('scan-input').focus();
});

let scanBuffer = '';
let scanTimer = null;
document.getElementById('scan-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    processQR(scanBuffer.trim());
    scanBuffer = '';
  } else {
    scanBuffer += e.key;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { scanBuffer = ''; }, 500);
  }
});

async function processQR(raw) {
  if (!raw) return;
  let data;
  try { data = JSON.parse(raw); } catch { alert('유효하지 않은 QR'); return; }
  if (!data.wo_no) { alert('작업지시서 QR이 아닙니다'); return; }

  if (data.machine_id !== MACHINE_ID && !confirm(`이 QR은 ${data.machine_id}용입니다. 계속하시겠습니까?`)) return;

  try {
    const r = await fetch(`${BASE}/mes-floor/sessions/start`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wo_no: data.wo_no, worker_id: workerId }),
    });
    if (!r.ok) { alert((await r.json()).detail); return; }
    const d = await r.json();
    sessionId = d.session_id;
    showWorkScreen(d);
  } catch(e) { alert('서버 오류: ' + e.message); }
}

// ── 화면 전환 ──
function showWorkScreen(d) {
  document.getElementById('idle-screen').style.display = 'none';
  document.getElementById('main').style.display = 'grid';
  document.getElementById('action-bar').style.display = 'flex';
  updateUI(d);
  startRefresh();
}

function updateUI(d) {
  if (!d) return;

  // 생산 현황
  const good = d.good_qty || 0;
  const target = d.target_qty || 1;
  const pct = Math.min(Math.round(good / target * 100), 100);
  document.getElementById('good-qty').textContent = good.toLocaleString();
  document.getElementById('target-qty').textContent = target.toLocaleString();
  document.getElementById('achieve-pct').textContent = pct + '%';
  document.getElementById('achieve-pct').className = pct >= 100 ? 'ok' : pct >= 80 ? 'warn' : 'bad';
  const bar = document.getElementById('progress-bar');
  bar.style.width = pct + '%';
  bar.style.background = pct >= 100 ? '#22c55e' : pct >= 80 ? '#f59e0b' : '#3b82f6';

  document.getElementById('defect-qty').textContent = (d.defect_qty || 0).toLocaleString();
  document.getElementById('theory-qty').textContent = (d.theory_qty || 0).toLocaleString();
  document.getElementById('working-min').textContent = Math.round(d.working_min || 0);
  document.getElementById('downtime-min').textContent = Math.round(d.downtime_min || 0);

  // 작업자
  const wid = d.worker_id || workerId || '-';
  document.getElementById('worker-name').textContent = wid;
  document.getElementById('worker-avatar').textContent = wid.charAt(0).toUpperCase();

  // OEE
  const oee = d.oee || 0;
  document.getElementById('oee-val').textContent = oee + '%';
  document.getElementById('oee-val').style.color = oee >= 85 ? '#22c55e' : oee >= 70 ? '#f59e0b' : '#ef4444';
  document.getElementById('avail-val').textContent = (d.avail_rate || 0) + '%';
  document.getElementById('perf-val').textContent = (d.performance || 0) + '%';
  document.getElementById('qual-val').textContent = (d.quality_rate || 0) + '%';

  // 작업 정보
  document.getElementById('part-name').textContent = d.part_name || '-';
  document.getElementById('part-no').textContent = d.part_no || '-';
  document.getElementById('wo-no').textContent = d.wo_no || '-';
  if (d.start_time) {
    document.getElementById('start-time').textContent = new Date(d.start_time).toLocaleTimeString('ko-KR');
  }

  // 비가동 상태
  isDown = d.is_down;
  const overlay = document.getElementById('downtime-overlay');
  const banner = document.getElementById('downtime-banner');
  const dtBtn = document.getElementById('downtime-btn');
  const badge = document.getElementById('status-badge');

  if (isDown) {
    overlay.style.display = 'block';
    banner.style.display = 'block';
    document.getElementById('downtime-reason-text').textContent = d.downtime_reason || '';
    dtBtn.textContent = '▶ 비가동 종료';
    dtBtn.style.background = '#dc2626';
    badge.textContent = '비가동';
    badge.className = 'badge-down';
  } else {
    overlay.style.display = 'none';
    banner.style.display = 'none';
    dtBtn.textContent = '⏸ 비가동';
    dtBtn.style.background = '#78350f';
    badge.textContent = '가동중';
    badge.className = 'badge-running';
  }
}

// ── 자동 새로고침 ──
function startRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshData, 10000);
}

async function refreshData() {
  try {
    const r = await fetch(`${BASE}/mes-floor/floor/${MACHINE_ID}`);
    if (!r.ok) return;
    const d = await r.json();
    if (d.session) {
      sessionId = d.session.session_id;
      workerId = workerId || d.session.worker_id;
      if (document.getElementById('main').style.display === 'none' &&
          document.getElementById('login-screen').style.display === 'none') {
        showWorkScreen(d.session);
      } else {
        updateUI(d.session);
      }
      // KPI 불러오기
      loadWorkerKPI(d.session.worker_id);
    }
  } catch(e) {}
}

async function loadWorkerKPI(wid) {
  try {
    const r = await fetch(`${BASE}/mes-floor/kpi/worker`);
    if (!r.ok) return;
    const d = await r.json();
    const me = d.workers.find(w => w.worker_id === wid);
    if (me) {
      document.getElementById('month-oee').textContent = me.avg_oee + '%';
      document.getElementById('month-oee').className = 'kpi-val ' + (me.avg_oee >= 85 ? 'ok' : me.avg_oee >= 70 ? 'warn' : 'bad');
      document.getElementById('month-defect').textContent = me.defect_rate + '%';
      document.getElementById('month-defect').className = 'kpi-val ' + (me.defect_rate <= 1 ? 'ok' : me.defect_rate <= 3 ? 'warn' : 'bad');
      document.getElementById('month-rank').textContent = `${me.rank}위 / ${d.workers.length}명`;
      document.getElementById('worker-rank').textContent =
        me.rank === 1 ? '🏆 이번달 1위!' :
        me.rank <= 3 ? `🥈 ${me.rank}위` : `${me.rank}위`;
    }
  } catch(e) {}
}

// ── 수량 입력 ──
function openProdModal() {
  document.getElementById('prod-qty-input').value = '';
  document.getElementById('prod-modal').classList.add('open');
  setTimeout(() => document.getElementById('prod-qty-input').focus(), 100);
}
document.getElementById('prod-qty-input').addEventListener('keydown', e => { if (e.key==='Enter') submitProd(); });

async function submitProd() {
  const qty = parseInt(document.getElementById('prod-qty-input').value);
  if (!qty || qty < 1) { alert('수량을 입력하세요'); return; }
  closeModal('prod-modal');
  try {
    const r = await fetch(`${BASE}/mes-floor/sessions/${sessionId}/log`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ good_qty: qty, defect_qty: 0 }),
    });
    if (!r.ok) { alert((await r.json()).detail); return; }
    updateUI(await r.json());
  } catch(e) { alert('오류: ' + e.message); }
}

// ── 불량 등록 ──
function openDefectModal() {
  document.getElementById('defect-qty-input').value = '';
  document.getElementById('defect-type-input').value = '';
  document.getElementById('defect-modal').classList.add('open');
  setTimeout(() => document.getElementById('defect-qty-input').focus(), 100);
}

async function submitDefect() {
  const qty = parseInt(document.getElementById('defect-qty-input').value);
  const type = document.getElementById('defect-type-input').value.trim();
  if (!qty || qty < 1) { alert('불량 수량을 입력하세요'); return; }
  closeModal('defect-modal');
  try {
    const r = await fetch(`${BASE}/mes-floor/sessions/${sessionId}/log`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ good_qty: 0, defect_qty: qty, defect_type: type || null }),
    });
    if (!r.ok) { alert((await r.json()).detail); return; }
    updateUI(await r.json());
  } catch(e) { alert('오류: ' + e.message); }
}

// ── 비가동 ──
function toggleDowntime() {
  if (isDown) {
    endDowntime();
  } else {
    document.getElementById('downtime-modal').classList.add('open');
  }
}

async function startDowntime(reason) {
  closeModal('downtime-modal');
  try {
    await fetch(`${BASE}/mes-floor/sessions/${sessionId}/downtime/start`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ reason }),
    });
    await refreshData();
  } catch(e) { alert('오류: ' + e.message); }
}

async function endDowntime() {
  try {
    const r = await fetch(`${BASE}/mes-floor/sessions/${sessionId}/downtime/end`, { method: 'POST' });
    if (!r.ok) { alert((await r.json()).detail); return; }
    const d = await r.json();
    alert(`비가동 종료 — ${d.duration_min}분`);
    await refreshData();
  } catch(e) { alert('오류: ' + e.message); }
}

// ── 작업 완료 ──
async function confirmComplete() {
  if (!confirm('작업을 완료하시겠습니까?\n완료 시 재고에 자동 반영됩니다.')) return;
  try {
    const r = await fetch(`${BASE}/mes-floor/sessions/${sessionId}/complete`, { method: 'POST' });
    if (!r.ok) { alert((await r.json()).detail); return; }
    clearInterval(refreshTimer);
    alert('작업 완료! 재고가 자동 반영되었습니다.');
    sessionId = null;
    document.getElementById('main').style.display = 'none';
    document.getElementById('action-bar').style.display = 'none';
    document.getElementById('idle-screen').style.display = 'flex';
    document.getElementById('status-badge').textContent = '대기';
    document.getElementById('status-badge').className = 'badge-idle';
    document.getElementById('scan-input').focus();
  } catch(e) { alert('오류: ' + e.message); }
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }
</script>
</body>
</html>"""


@router.get("/mes/monitor", response_class=HTMLResponse, include_in_schema=False)
def monitor_page():
    return HTMLResponse(content=MONITOR_HTML)
