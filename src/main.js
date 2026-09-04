import "./style.css";
import { getStroke } from "perfect-freehand";
import { problems, typeColors } from "./data/problems.js";
import { loadStrokes, saveStrokes, clearStrokes, syncFromCloud } from "./storage.js";

// 문제마다 고유 id(원본 배열 인덱스)를 붙여서, 필터링과 무관하게 필기 데이터가
// 항상 같은 문제에 연결되도록 함
const allProblems = problems.map((p, i) => ({ ...p, id: i }));
const allTypes = [...new Set(allProblems.map((p) => p.type))];

let activeType = "all";
let filtered = allProblems;
let current = 0; // filtered 배열 안에서의 위치
let answered = false;
let selectedChoice = null;
let penMode = false;
let tool = "pen"; // 'pen' | 'eraser'
let currentColor = "#12131A";
let currentSize = 1.2;

// 문제별 필기 - 처음엔 localStorage에서 불러오고, 그리기가 끝날 때마다 다시 저장 (id 기준)
const strokesByProblem = {};
const redoByProblem = {};
allProblems.forEach((p) => {
  strokesByProblem[p.id] = loadStrokes(p.id);
  redoByProblem[p.id] = [];
});

const problemText = document.getElementById("problemText");
const tableSlot = document.getElementById("tableSlot");
const typeBadge = document.getElementById("typeBadge");
const progressEl = document.getElementById("progress");
const choicesEl = document.getElementById("choices");
const explainEl = document.getElementById("explain");
const checkBtn = document.getElementById("checkBtn");
const nextBtn = document.getElementById("nextBtn");
const hideDrawingBtn = document.getElementById("hideDrawingBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const canvas = document.getElementById("drawCanvas");
const ctx = canvas.getContext("2d");
// CSS의 touch-action: none이 확실히 적용되도록 JS에서도 인라인으로 한 번 더
// 명시 (CSS 우선순위/타이밍 이슈 배제용)
canvas.style.touchAction = "none";
const appEl = document.getElementById("app");
const headerEl = document.querySelector(".app-header");
const problemCard = document.getElementById("problemCard");
const accentBar = document.getElementById("accentBar");
const typeFilterEl = document.getElementById("typeFilter");

const penDock = document.getElementById("penDock");
const penHandle = document.getElementById("penHandle");
const penDrawer = document.getElementById("penDrawer");
const penModeBtn = document.getElementById("penModeBtn");
const penToolBtn = document.getElementById("penToolBtn");
const eraserToolBtn = document.getElementById("eraserToolBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

function formatFractions(str) {
  return str.replace(/(\d+)\/(\d+)/g, '<span class="frac"><span class="num">$1</span><span class="den">$2</span></span>');
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function currentProblem() {
  return filtered[current];
}

// 캔버스는 #app 최상단(헤더)부터 문제 카드 하단까지 화면에 보이는 전체 영역을
// 덮도록 배치한다 (헤더, 유형 필터, 카드 바깥 여백 어디에 그려도 필기가 남게 됨).
function resizeCanvas() {
  const appRect = appEl.getBoundingClientRect();
  const headerRect = headerEl.getBoundingClientRect();
  const cardRect = problemCard.getBoundingClientRect();
  const top = headerRect.top - appRect.top;
  const height = cardRect.bottom - headerRect.top;
  const width = appRect.width;

  canvas.style.left = "0px";
  canvas.style.top = top + "px";
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

// perfect-freehand로 점 배열(+압력)을 매끄러운 "채워진 도형"의 외곽선으로 계산해서
// fill로 그림. 직접 lineTo/quadraticCurveTo로 선을 잇던 방식보다 압력 반영과
// 매끄러움이 훨씬 안정적이라 draw/redraw 양쪽 모두 이 함수 하나로 통일함.
function drawStroke(strokePoints, color, size, erase) {
  if (strokePoints.length < 2) return;

  const inputPoints = strokePoints.map((p) => [p.x, p.y, p.pressure ?? 0.5]);
  const outline = getStroke(inputPoints, {
    size: size * 1.6,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false,
  });

  if (!outline.length) return;

  ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  ctx.fillStyle = erase ? "rgba(0,0,0,1)" : color;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    ctx.lineTo(outline[i][0], outline[i][1]);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const p = currentProblem();
  const strokes = strokesByProblem[p.id] || [];
  strokes.forEach((s) => drawStroke(s.points, s.color, s.size, s.erase));
}

function persistStrokes() {
  const p = currentProblem();
  saveStrokes(p.id, strokesByProblem[p.id] || []);
}

// ---- 유형 필터 ----
function renderTypeFilter() {
  typeFilterEl.innerHTML = "";
  const makeChip = (label, value, color) => {
    const chip = document.createElement("button");
    chip.className = "type-chip";
    chip.textContent = label;
    if (value === activeType) {
      chip.classList.add("active");
      chip.style.background = color;
    }
    chip.addEventListener("click", () => {
      if (activeType === value) return;
      activeType = value;
      filtered = value === "all" ? allProblems : allProblems.filter((p) => p.type === value);
      current = 0;
      renderTypeFilter();
      renderProblem();
    });
    return chip;
  };
  typeFilterEl.appendChild(makeChip("전체", "all", "#12131A"));
  allTypes.forEach((t) => {
    typeFilterEl.appendChild(makeChip(t, t, typeColors[t] || "#3654FF"));
  });
}

function renderProblem() {
  const p = currentProblem();
  const color = typeColors[p.type] || "#3654FF";
  typeBadge.textContent = p.type;
  typeBadge.style.color = color;
  typeBadge.style.background = color + "1A";
  accentBar.style.background = color;
  progressEl.textContent = `${current + 1} / ${filtered.length}`;
  problemText.innerHTML = formatFractions(escapeHtml(p.text));

  tableSlot.innerHTML = "";
  if (p.table) {
    const table = document.createElement("table");
    table.className = "problem-table";
    p.table.forEach((row, ri) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const el = document.createElement(ri === 0 ? "th" : "td");
        el.innerHTML = formatFractions(escapeHtml(cell));
        tr.appendChild(el);
      });
      table.appendChild(tr);
    });
    tableSlot.appendChild(table);
  }

  choicesEl.innerHTML = "";
  p.choices.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = `<span class="choice-mark">${i + 1}</span><span>${formatFractions(escapeHtml(c))}</span>`;
    btn.addEventListener("click", () => {
      if (answered) resetAnswerUI();
      selectedChoice = i;
      [...choicesEl.children].forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
    });
    choicesEl.appendChild(btn);
  });

  explainEl.classList.remove("show");
  explainEl.innerHTML = "";
  answered = false;
  selectedChoice = null;
  checkBtn.disabled = false;
  checkBtn.textContent = "정답 확인";

  requestAnimationFrame(resizeCanvas);
}

// 정답 확인 후 채점 상태(정답/오답 색상, disabled, 해설)를 되돌려서
// 다시 "정답 확인"을 누를 수 있는 중립 상태로 만듦. 사용자가 골랐던 선택(selectedChoice)
// 자체는 유지하므로 .selected 표시는 그대로 남는다.
function resetAnswerUI() {
  answered = false;
  [...choicesEl.children].forEach((el) => {
    el.removeAttribute("disabled");
    el.classList.remove("correct", "wrong");
  });
  explainEl.classList.remove("show");
  checkBtn.textContent = "정답 확인";
  requestAnimationFrame(resizeCanvas);
}

function gradeAnswer() {
  const p = currentProblem();
  answered = true;
  [...choicesEl.children].forEach((el, i) => {
    el.setAttribute("disabled", "true");
    if (i === p.answer) el.classList.add("correct");
    else if (i === selectedChoice) el.classList.add("wrong");
  });
  explainEl.innerHTML = p.solutions
    .map((s) => `<div class="solution"><div class="solution-title">${s.title}</div>${formatFractions(s.body)}</div>`)
    .join("");
  explainEl.classList.add("show");
  checkBtn.textContent = "정답 가리기";
  requestAnimationFrame(resizeCanvas);
}

// 선지를 고르지 않아도 정답 확인이 가능함 (그 경우 정답만 초록색으로 표시됨)
checkBtn.addEventListener("click", () => {
  if (answered) {
    resetAnswerUI();
    return;
  }
  gradeAnswer();
});

// 정답을 고르지 않아도 다음 문제로 넘어갈 수 있음
nextBtn.addEventListener("click", () => {
  current = (current + 1) % filtered.length;
  renderProblem();
});

// "필기 지우기" 자리는 이제 필기를 지우지 않고 화면에서만 보였다 안 보였다 하는 토글.
// 실제 삭제(데이터 자체를 지우는 것)는 펜 트레이 안의 clearAllBtn으로만 가능.
let drawingHidden = false;
hideDrawingBtn.addEventListener("click", () => {
  drawingHidden = !drawingHidden;
  canvas.style.visibility = drawingHidden ? "hidden" : "visible";
  hideDrawingBtn.textContent = drawingHidden ? "필기 보이기" : "필기 가리기";
});

clearAllBtn.addEventListener("click", () => {
  const p = currentProblem();
  strokesByProblem[p.id] = [];
  redoByProblem[p.id] = [];
  clearStrokes(p.id);
  redraw();
});

// ---- 필기 입력 켜기/끄기 ----
function setPenMode(next) {
  penMode = next;
  penModeBtn.classList.toggle("active", penMode);
  penModeBtn.textContent = penMode ? "✎ 필기 입력 끄기" : "✎ 필기 입력 켜기";
  penHandle.classList.toggle("pen-on", penMode);
  canvas.style.pointerEvents = penMode ? "auto" : "none";
  // 필기 모드 중엔 시스템이 애초에 "스크롤 후보"로 판단할 건수 자체를 없애서
  // pointercancel 오인식을 줄임 (캔버스가 헤더~카드 전체를 덮어 페이지가
  // 스크롤될 여지가 있으므로)
  document.body.style.overflow = penMode ? "hidden" : "";
}
penModeBtn.addEventListener("click", () => setPenMode(!penMode));

function setTool(next) {
  tool = next;
  penToolBtn.classList.toggle("active", tool === "pen");
  eraserToolBtn.classList.toggle("active", tool === "eraser");
}
penToolBtn.addEventListener("click", () => setTool("pen"));
eraserToolBtn.addEventListener("click", () => setTool("eraser"));

undoBtn.addEventListener("click", () => {
  const p = currentProblem();
  const strokes = strokesByProblem[p.id];
  if (strokes && strokes.length) {
    const s = strokes.pop();
    redoByProblem[p.id] = redoByProblem[p.id] || [];
    redoByProblem[p.id].push(s);
    redraw();
    persistStrokes();
  }
});
redoBtn.addEventListener("click", () => {
  const p = currentProblem();
  const redo = redoByProblem[p.id];
  if (redo && redo.length) {
    const s = redo.pop();
    strokesByProblem[p.id] = strokesByProblem[p.id] || [];
    strokesByProblem[p.id].push(s);
    redraw();
    persistStrokes();
  }
});

document.querySelectorAll(".size-btn").forEach((sb) => {
  sb.addEventListener("click", () => {
    document.querySelectorAll(".size-btn").forEach((s) => s.classList.remove("active"));
    sb.classList.add("active");
    currentSize = parseFloat(sb.dataset.size);
  });
});

// .custom-swatch(무지개 스와치)는 자체 클릭 핸들러가 아니라 감싸고 있는
// <input type="color">의 input 이벤트로 색을 반영하므로 여기서 제외
document.querySelectorAll(".swatch:not(.custom-swatch)").forEach((sw) => {
  sw.addEventListener("click", () => {
    document.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
    sw.classList.add("active");
    currentColor = sw.dataset.color;
    setTool("pen");
  });
});

// 무지개 스와치를 탭하면 iOS가 시스템 색상 선택기(최근 사용한 색 포함)를 그대로
// 띄워주므로, 별도 팔레트 UI 없이 "자유롭게 색 고르기"가 해결됨
const customColorInput = document.getElementById("customColorInput");
customColorInput.addEventListener("input", (e) => {
  document.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
  customColorInput.closest(".swatch").classList.add("active");
  currentColor = e.target.value;
  setTool("pen");
});

// ---- 사이드 도킹: 세로/가로 드래그로 위치 이동, 탭하면 서랍 열기/닫기 ----
let dockDragging = false;
let dockDragMoved = false;
let dockStartX = 0;
let dockStartY = 0;
let dockStartTop = 0;
let dockStartLeft = 0;
let dockSide = "right"; // 'left' | 'right'

function clampDockTop(px) {
  const min = 60;
  const max = window.innerHeight - 60;
  return Math.min(max, Math.max(min, px));
}

function setDockSide(side) {
  dockSide = side;
  penDock.classList.toggle("dock-left", side === "left");
  // 드래그 중에 준 인라인 left/right를 지워서 CSS(.dock-left 규칙)가 가장자리에 붙이게 함
  penDock.style.left = "";
  penDock.style.right = "";
}

penHandle.addEventListener("pointerdown", (e) => {
  dockDragging = true;
  dockDragMoved = false;
  dockStartX = e.clientX;
  dockStartY = e.clientY;
  const rect = penDock.getBoundingClientRect();
  dockStartTop = rect.top + penDock.offsetHeight / 2;
  dockStartLeft = rect.left;
  penHandle.setPointerCapture(e.pointerId);
});

penHandle.addEventListener("pointermove", (e) => {
  if (!dockDragging) return;
  const dx = e.clientX - dockStartX;
  const dy = e.clientY - dockStartY;
  if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
    if (!dockDragMoved) {
      // 드래그가 시작되는 순간: 서랍은 닫고, 손잡이를 도킹된 모양(반원)에서
      // 완전한 원 모양으로 바꿔서 "떠 있는" 상태임을 보여줌
      penDrawer.classList.remove("open");
      penDock.classList.add("dragging");
      // 모양이 바뀌면서 크기가 달라지므로, 기준점을 다시 잡아 위치가 튀지 않게 함
      dockStartX = e.clientX;
      dockStartY = e.clientY;
      const rect = penDock.getBoundingClientRect();
      dockStartTop = rect.top + penDock.offsetHeight / 2;
      dockStartLeft = rect.left;
    }
    dockDragMoved = true;
  }
  if (!dockDragMoved) return;

  // dockStartX/Y/Top/Left가 방금 위에서 재조정됐을 수 있으므로 다시 계산해서 사용
  const dx2 = e.clientX - dockStartX;
  const dy2 = e.clientY - dockStartY;

  const newTop = clampDockTop(dockStartTop + dy2);
  penDock.style.top = newTop + "px";

  const dockWidth = penDock.offsetWidth;
  const maxLeft = window.innerWidth - dockWidth;
  const newLeft = Math.min(maxLeft, Math.max(0, dockStartLeft + dx2));
  penDock.style.left = newLeft + "px";
  penDock.style.right = "auto";
});

penHandle.addEventListener("pointerup", () => {
  dockDragging = false;
  penDock.classList.remove("dragging");
  if (!dockDragMoved) {
    penDrawer.classList.toggle("open");
    return;
  }
  // 화면 가로 중앙 기준으로 더 가까운 가장자리에 스냅
  const rect = penDock.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  const side = center < window.innerWidth / 2 ? "left" : "right";
  setDockSide(side);
});
penHandle.addEventListener("pointercancel", () => {
  dockDragging = false;
  penDock.classList.remove("dragging");
});

// ---- 필기 그리기 ----
// perfect-freehand 기반 렌더링(drawStroke)으로 통일했으므로, 그리는 도중에도
// 매 프레임 redraw()(전체 재렌더 + 현재 진행 중인 stroke 포함)를 호출하면
// 됨 — activeStroke가 이미 strokesByProblem 배열에 들어있어 redraw()가
// 자동으로 최신 상태까지 그려줌. requestAnimationFrame으로 한 프레임에 여러
// pointermove 이벤트를 모아 redraw()를 한 번만 호출(scheduleRedraw).
// 좌표 샘플 손실 방지를 위해 getCoalescedEvents()로 세부 좌표까지 전부 저장.
// Apple Pencil 외 입력(손가락/손바닥)은 무시 — 필기 중 손바닥이 닿아도
// 별도 포인터로 잡혀서 획이 끊기거나 겹치지 않게 함.
let drawing = false;
let activeStroke = null;
let rafScheduled = false;

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function scheduleRedraw() {
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => {
    rafScheduled = false;
    redraw();
  });
}

// Safari/iPadOS는 터치 시작 직후의 움직임을 자체적으로 "스크롤/줌 같은 시스템
// 제스처"로 판단해서, 그 판정이 끝나기 전까지 포인터를 붙잡고 있다가 시스템
// 제스처로 결론 내리면 웹페이지 쪽 포인터를 강제로 pointercancel시켜버리는
// 경우가 있음 (온디바이스 로그로 확인: pointercancel로 끝난 획은 전부
// pointsInStroke:0, 즉 그리기 시작 즉시 취소됨). touch-action:none과 pointer
// 이벤트의 preventDefault()만으로는 이 네이티브 판정 자체를 막지 못해서,
// touch 이벤트 레벨에서도 명시적으로 막아줌.
canvas.addEventListener(
  "touchstart",
  (e) => {
    if (penMode) e.preventDefault();
  },
  { passive: false }
);
canvas.addEventListener(
  "touchmove",
  (e) => {
    if (penMode) e.preventDefault();
  },
  { passive: false }
);

canvas.addEventListener("pointerdown", (e) => {
  if (!penMode) return;
  if (e.pointerType !== "pen") return; // 손가락/손바닥 터치는 무시, Apple Pencil만 인정
  e.preventDefault();
  if (drawing) endStroke(e); // 이전 스트로크가 비정상 종료된 경우 방어적으로 먼저 정리
  drawing = true;
  canvas.setPointerCapture(e.pointerId);
  const pos = getPos(e);
  const pressure = e.pressure > 0 ? e.pressure : 0.5;
  const erasing = tool === "eraser";
  const baseSize = erasing ? currentSize * 6 : currentSize + pressure * 2.5;
  activeStroke = { color: currentColor, size: baseSize, erase: erasing, points: [{ ...pos, pressure }] };
  const p = currentProblem();
  strokesByProblem[p.id] = strokesByProblem[p.id] || [];
  strokesByProblem[p.id].push(activeStroke);
  redoByProblem[p.id] = [];
  scheduleRedraw();
});

canvas.addEventListener("pointermove", (e) => {
  if (!drawing || !penMode) return;
  if (e.pointerType !== "pen") return;
  e.preventDefault();
  const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
  const pts = events.length ? events : [e];
  pts.forEach((ev) => {
    activeStroke.points.push({ ...getPos(ev), pressure: ev.pressure || 0.5 });
  });
  scheduleRedraw();
});

// pointerup 시 브라우저가 자동으로 캡처를 풀어야 하지만, Safari/iPadOS
// 조합에서는 이게 확실히 안 풀려서 다음 펜 터치 이벤트가 캔버스에 제대로
// 전달되지 않는(=두 번째 획부터 인식 안 되는) 경우가 있어 명시적으로 해제함.
function endStroke(e) {
  if (drawing) persistStrokes();
  drawing = false;
  activeStroke = null;
  if (e && e.pointerId !== undefined) {
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (err) {
      // 이미 해제되었거나 캡처된 적 없는 경우 조용히 무시
    }
  }
}
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);
canvas.addEventListener("pointerleave", endStroke);

window.addEventListener("resize", () => {
  if (activeTab === "eung") resizeCanvas();
});
window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    if (activeTab === "eung") resizeCanvas();
  }, 150);
});

// ---- 탭 전환 ----
let activeTab = "eung";
const tabButtons = document.querySelectorAll(".tab-item");
const views = {
  dashboard: document.getElementById("view-dashboard"),
  eung: document.getElementById("view-eung"),
  calc: document.getElementById("view-calc"),
  wrong: document.getElementById("view-wrong"),
};

function switchTab(tabId) {
  activeTab = tabId;
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  Object.keys(views).forEach((key) => {
    views[key].classList.toggle("active", key === tabId);
  });
  penDock.classList.toggle("show-tab", tabId === "eung");
  if (tabId !== "eung") penDrawer.classList.remove("open");
  canvas.style.display = tabId === "eung" ? "block" : "none";
  if (tabId === "eung") {
    requestAnimationFrame(resizeCanvas);
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

renderTypeFilter();
renderProblem();
switchTab("dashboard");

// ---- 로딩 화면 ----
// 최소 표시 시간을 채우고, 폰트/초기 렌더 등 페이지 로드가 끝난 뒤에 페이드아웃.
// 이미 load 이벤트가 지난 뒤(스크립트가 늦게 실행된 경우)라면 바로 최소 시간만 기다림.
const loadingScreen = document.getElementById("loadingScreen");
const LOADING_MIN_MS = 600;
const loadingStart = Date.now();
function hideLoadingScreen() {
  const elapsed = Date.now() - loadingStart;
  const wait = Math.max(0, LOADING_MIN_MS - elapsed);
  setTimeout(() => {
    loadingScreen.classList.add("hide");
    loadingScreen.addEventListener(
      "transitionend",
      () => {
        loadingScreen.style.display = "none";
      },
      { once: true }
    );
  }, wait);
}
if (document.readyState === "complete") {
  hideLoadingScreen();
} else {
  window.addEventListener("load", hideLoadingScreen, { once: true });
}

// 시작할 때 로컬 캐시로 먼저 빠르게 그려주고, 클라우드에서 최신 데이터를 가져와 보강
syncFromCloud(
  allProblems.map((p) => p.id),
  (all) => {
    allProblems.forEach((p) => {
      strokesByProblem[p.id] = all[p.id] || [];
    });
    if (activeTab === "eung") redraw();
  }
);
