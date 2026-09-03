import "./style.css";
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
let currentColor = "#3654FF";
let currentSize = 2.5;

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
const clearBtn = document.getElementById("clearBtn");
const canvas = document.getElementById("drawCanvas");
const ctx = canvas.getContext("2d");
const writable = document.getElementById("writable");
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

function resizeCanvas() {
  const rect = writable.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const p = currentProblem();
  const strokes = strokesByProblem[p.id] || [];
  strokes.forEach((s) => {
    ctx.strokeStyle = s.erase ? "rgba(0,0,0,1)" : s.color;
    ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    ctx.lineWidth = s.size;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    s.points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
  });
  ctx.globalCompositeOperation = "source-over";
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
      if (answered) return;
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

checkBtn.addEventListener("click", () => {
  if (answered) return;
  const p = currentProblem();
  if (selectedChoice === null) {
    alert("답을 먼저 선택해주세요.");
    return;
  }
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
});

// 정답을 고르지 않아도 다음 문제로 넘어갈 수 있음
nextBtn.addEventListener("click", () => {
  current = (current + 1) % filtered.length;
  renderProblem();
});

clearBtn.addEventListener("click", () => {
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

document.querySelectorAll(".swatch").forEach((sw) => {
  sw.addEventListener("click", () => {
    document.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
    sw.classList.add("active");
    currentColor = sw.dataset.color;
    setTool("pen");
  });
});

// ---- 사이드 도킹: 드래그로 위치 이동, 탭하면 서랍 열기/닫기 ----
let dockDragging = false;
let dockDragMoved = false;
let dockStartY = 0;
let dockStartTop = 0;

function clampDockTop(px) {
  const min = 60;
  const max = window.innerHeight - 60;
  return Math.min(max, Math.max(min, px));
}

penHandle.addEventListener("pointerdown", (e) => {
  dockDragging = true;
  dockDragMoved = false;
  dockStartY = e.clientY;
  dockStartTop = penDock.getBoundingClientRect().top + penDock.offsetHeight / 2;
  penHandle.setPointerCapture(e.pointerId);
});

penHandle.addEventListener("pointermove", (e) => {
  if (!dockDragging) return;
  const dy = e.clientY - dockStartY;
  if (Math.abs(dy) > 6) dockDragMoved = true;
  const newTop = clampDockTop(dockStartTop + dy);
  penDock.style.top = newTop + "px";
});

penHandle.addEventListener("pointerup", () => {
  dockDragging = false;
  if (!dockDragMoved) {
    penDrawer.classList.toggle("open");
  }
});
penHandle.addEventListener("pointercancel", () => {
  dockDragging = false;
});

// ---- 필기 그리기 ----
let drawing = false;
let activeStroke = null;

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener("pointerdown", (e) => {
  if (!penMode) return;
  drawing = true;
  canvas.setPointerCapture(e.pointerId);
  const pos = getPos(e);
  const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
  const erasing = tool === "eraser";
  const baseSize = erasing ? currentSize * 6 : currentSize + pressure * 2.5;
  activeStroke = { color: currentColor, size: baseSize, erase: erasing, points: [pos] };
  const p = currentProblem();
  strokesByProblem[p.id] = strokesByProblem[p.id] || [];
  strokesByProblem[p.id].push(activeStroke);
  redoByProblem[p.id] = [];
  redraw();
});

canvas.addEventListener("pointermove", (e) => {
  if (!drawing || !penMode) return;
  const pos = getPos(e);
  activeStroke.points.push(pos);
  redraw();
});

function endStroke() {
  if (drawing) persistStrokes();
  drawing = false;
  activeStroke = null;
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
  if (tabId === "eung") {
    requestAnimationFrame(resizeCanvas);
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

renderTypeFilter();
renderProblem();
switchTab("eung");

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
