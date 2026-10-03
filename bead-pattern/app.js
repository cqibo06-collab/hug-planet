/* ============ 拼豆图纸生成器 ============ */
"use strict";

/* ---------- 48 色近似标准拼豆色 ---------- */
const PALETTE = [
  { n: "白",   h: "#FFFFFF" }, { n: "银白", h: "#E8ECEF" }, { n: "浅灰", h: "#C3C9CC" },
  { n: "灰",   h: "#9AA0A3" }, { n: "深灰", h: "#5E6367" }, { n: "黑",   h: "#212121" },
  { n: "米白", h: "#F6EAD3" }, { n: "奶油", h: "#F3DDAF" }, { n: "浅黄", h: "#FFEF7A" },
  { n: "黄",   h: "#FFD53D" }, { n: "深黄", h: "#F5B301" }, { n: "橙",   h: "#FF8A3C" },
  { n: "橘红", h: "#FF6B46" }, { n: "珊瑚", h: "#FF7E79" }, { n: "红",   h: "#E8392E" },
  { n: "深红", h: "#C0272D" }, { n: "酒红", h: "#8E2438" }, { n: "粉",   h: "#FFA8C0" },
  { n: "桃粉", h: "#FF87A8" }, { n: "玫红", h: "#E0336E" }, { n: "紫红", h: "#B0327B" },
  { n: "淡紫", h: "#CDA9E8" }, { n: "紫",   h: "#9B5BC4" }, { n: "深紫", h: "#6E3A9E" },
  { n: "浅蓝", h: "#A9D7F5" }, { n: "天蓝", h: "#4EB3F0" }, { n: "蓝",   h: "#2D7FD6" },
  { n: "深蓝", h: "#2B55B0" }, { n: "藏青", h: "#27407C" }, { n: "湖水青", h: "#55C9C0" },
  { n: "青绿", h: "#2FA98C" }, { n: "薄荷", h: "#9FD9B4" }, { n: "浅绿", h: "#BCE26E" },
  { n: "草绿", h: "#7CC24A" }, { n: "绿",   h: "#35A94C" }, { n: "深绿", h: "#1F7A3D" },
  { n: "墨绿", h: "#14512F" }, { n: "橄榄", h: "#8A9A3C" }, { n: "芥末", h: "#D9A527" },
  { n: "卡其", h: "#C9B382" }, { n: "浅棕", h: "#C79A6B" }, { n: "棕",   h: "#9A6A3B" },
  { n: "深棕", h: "#6F4A2A" }, { n: "肤色", h: "#FFDBAC" }, { n: "浅肤", h: "#FFE7CF" },
  { n: "棕肤", h: "#C98B5E" }, { n: "深肤", h: "#96603A" }, { n: "金",   h: "#E3B341" },
];
const SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789+×○●△▲▽▼◇◆☆★◎▽◈☕♡";

const $ = (id) => document.getElementById(id);
const EMPTY = -1;

/* ---------- 状态 ---------- */
let W = 29, H = 29;
let grid = new Int16Array(W * H).fill(EMPTY);
let tool = "pencil";
let colorIdx = 34; /* 默认绿色 */
let cellPx = 16;
let zoomStep = 0;
let showGrid = true, showSym = false;
let undoStack = [], redoStack = [];
let symMap = {};          /* 调色板下标 -> 符号 */
let painting = false, lastCell = null, strokeSnapshot = null;
let lastPos = null;         /* 十字定位：最后操作的格子 */
let rulerPx = 0;
let renderQueued = false;
let imgState = null;        /* 弹窗里的图片状态 */
let saveTimer = null;

const board = $("board");
const ctx = board.getContext("2d");

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
function setPos(c) {
  lastPos = c;
  $("posInfo").textContent = c ? `第 ${c.y + 1} 行 · 第 ${c.x + 1} 列` : "";
}

/* ---------- 工具 ---------- */
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.__t);
  toast.__t = setTimeout(() => el.classList.remove("show"), 2200);
}
function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/* Oklab 感知色差 */
function srgbToOklab(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = f(r), G = f(g), B = f(b);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}
PALETTE.forEach((p) => { p.lab = srgbToOklab(...hexToRgb(p.h)); });
function nearestPaletteIdx(lab, allowed) {
  let best = allowed[0], bestD = Infinity;
  for (const i of allowed) {
    const L = PALETTE[i].lab;
    const d = (lab[0] - L[0]) ** 2 + (lab[1] - L[1]) ** 2 + (lab[2] - L[2]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/* ---------- 符号分配 ---------- */
function rebuildSymbols() {
  const used = [...new Set(grid)].filter((v) => v !== EMPTY).sort((a, b) => a - b);
  const next = {};
  used.forEach((idx, i) => { next[idx] = symMap[idx] || SYMBOLS[i] || "?"; });
  symMap = next;
}

/* ---------- 渲染 ---------- */
function fitZoom() {
  const wrap = $("canvasWrap");
  const px = Math.floor(Math.min(
    (wrap.clientWidth - 24) / W,
    (wrap.clientHeight - 24) / H
  ));
  cellPx = Math.max(6, Math.min(40, px));
  zoomStep = 0;
  $("zoomLabel").textContent = "适合";
}
function applyZoom() {
  const steps = [6, 8, 11, 14, 18, 24, 32, 42];
  const i = Math.max(0, Math.min(steps.length - 1, zoomStep));
  cellPx = steps[i];
  $("zoomLabel").textContent = cellPx + "px";
  render();
}
function render() {
  const dpr = window.devicePixelRatio || 1;
  rulerPx = cellPx >= 5 ? 22 : 0;
  const w = W * cellPx, h = H * cellPx;
  board.style.width = (w + rulerPx) + "px";
  board.style.height = (h + rulerPx) + "px";
  board.width = Math.round((w + rulerPx) * dpr);
  board.height = Math.round((h + rulerPx) * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w + rulerPx, h + rulerPx);

  /* 标尺 */
  if (rulerPx) {
    ctx.fillStyle = "#e9f0ea";
    ctx.fillRect(0, 0, w + rulerPx, rulerPx);
    ctx.fillRect(0, 0, rulerPx, h + rulerPx);
    ctx.fillStyle = "#7d9384";
    ctx.font = `${Math.min(11, Math.max(8, Math.floor(cellPx * 0.6)))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const rstep = cellPx < 11 ? 5 : 1;
    for (let x = 0; x < W; x += rstep) ctx.fillText(x, rulerPx + x * cellPx + cellPx / 2, rulerPx / 2 + 1);
    for (let y = 0; y < H; y += rstep) ctx.fillText(y, rulerPx / 2, rulerPx + y * cellPx + cellPx / 2);
  }
  ctx.save();
  ctx.translate(rulerPx, rulerPx);

  /* 十字定位高亮 */
  if (lastPos) {
    ctx.fillStyle = "rgba(95, 149, 120, 0.20)";
    ctx.fillRect(0, lastPos.y * cellPx, W * cellPx, cellPx);
    ctx.fillRect(lastPos.x * cellPx, 0, cellPx, H * cellPx);
  }

  /* 豆子 */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      drawCell(x, y);
    }
  }
  /* 网格线 */
  if (showGrid) {
    ctx.strokeStyle = "rgba(60, 90, 70, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < W; x++) { ctx.moveTo(x * cellPx + 0.5, 0); ctx.lineTo(x * cellPx + 0.5, h); }
    for (let y = 1; y < H; y++) { ctx.moveTo(0, y * cellPx + 0.5); ctx.lineTo(w, y * cellPx + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(60, 90, 70, 0.4)";
    ctx.beginPath();
    for (let x = 10; x < W; x += 10) { ctx.moveTo(x * cellPx + 0.5, 0); ctx.lineTo(x * cellPx + 0.5, h); }
    for (let y = 10; y < H; y += 10) { ctx.moveTo(0, y * cellPx + 0.5); ctx.lineTo(w, y * cellPx + 0.5); }
    ctx.stroke();
  }
  /* 符号 */
  if (showSym && cellPx >= 12) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.floor(cellPx * 0.55)}px sans-serif`;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = grid[y * W + x];
        if (v === EMPTY) continue;
        ctx.fillStyle = luminance(PALETTE[v].h) > 0.6 ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.9)";
        ctx.fillText(symMap[v] || "?", x * cellPx + cellPx / 2, y * cellPx + cellPx / 2 + 1);
      }
    }
  }
  /* 定位框 */
  if (lastPos) {
    ctx.strokeStyle = "#3f7a5c";
    ctx.lineWidth = 2;
    ctx.strokeRect(lastPos.x * cellPx + 1, lastPos.y * cellPx + 1, cellPx - 2, cellPx - 2);
  }
  ctx.restore();
}
function drawCell(x, y) {
  const v = grid[y * W + x];
  if (v === EMPTY) {
    ctx.fillStyle = "#ffffff";
  } else {
    ctx.fillStyle = PALETTE[v].h;
  }
  ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
}
/* 在渲染循环之外直接重画某个格子（坐标系含标尺偏移） */
function paintCellNow(x, y) {
  const v = grid[y * W + x];
  ctx.fillStyle = v === EMPTY ? "#ffffff" : PALETTE[v].h;
  ctx.fillRect(rulerPx + x * cellPx, rulerPx + y * cellPx, cellPx, cellPx);
}

/* ---------- 撤销 / 重做（连同画布尺寸一起存） ---------- */
function snapshot() { return { w: W, h: H, g: grid.slice() }; }
function restore(s) {
  W = s.w; H = s.h;
  grid = new Int16Array(s.g);
  if (+$("sizeSel").value !== W) $("sizeSel").value = String(W);
}
function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 40) undoStack.shift();
  redoStack.length = 0;
}
function undo() {
  if (!undoStack.length) return toast("没有可以撤销的了");
  redoStack.push(snapshot());
  restore(undoStack.pop());
  fitZoom(); rebuildSymbols(); render(); saveSoon(); updateStat();
}
function redo() {
  if (!redoStack.length) return toast("没有可以重做的了");
  undoStack.push(snapshot());
  restore(redoStack.pop());
  fitZoom(); rebuildSymbols(); render(); saveSoon(); updateStat();
}

/* ---------- 绘制交互 ---------- */
function cellFromEvent(e) {
  const r = board.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left - rulerPx) / cellPx);
  const y = Math.floor((e.clientY - r.top - rulerPx) / cellPx);
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  return { x, y };
}
function putCell(x, y) {
  const idx = y * W + x;
  const v = tool === "eraser" ? EMPTY : colorIdx;
  if (grid[idx] === v) return false;
  grid[idx] = v;
  paintCellNow(x, y);
  return true;
}
function floodFill(sx, sy) {
  const target = grid[sy * W + sx];
  const v = tool === "eraser" ? EMPTY : colorIdx;
  if (target === v) return;
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop();
    const i = y * W + x;
    if (grid[i] !== target) continue;
    grid[i] = v;
    paintCellNow(x, y);
    if (x > 0) q.push([x - 1, y]);
    if (x < W - 1) q.push([x + 1, y]);
    if (y > 0) q.push([x, y - 1]);
    if (y < H - 1) q.push([x, y + 1]);
  }
}
board.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const c = cellFromEvent(e);
  if (!c) return;
  try { board.setPointerCapture(e.pointerId); } catch {}
  setPos(c);
  painting = true;
  if (tool === "fill") {
    pushUndo();
    floodFill(c.x, c.y);
    painting = false;
    afterChange();
    return;
  }
  if (tool === "picker") {
    const v = grid[c.y * W + c.x];
    if (v !== EMPTY) { colorIdx = v; refreshColorUI(); toast(`取色：${PALETTE[v].n}`); }
    painting = false;
    render();
    return;
  }
  strokeSnapshot = grid.slice();
  lastCell = c;
  if (putCell(c.x, c.y)) { /* 首格已画 */ }
  queueRender();
});
board.addEventListener("pointermove", (e) => {
  if (!painting) return;
  const c = cellFromEvent(e);
  if (!c || (lastCell && c.x === lastCell.x && c.y === lastCell.y)) return;
  lastCell = c;
  setPos(c);
  putCell(c.x, c.y);
});
function endStroke() {
  if (!painting) return;
  painting = false;
  if (strokeSnapshot) {
    /* 只有真的画了东西才入栈 */
    let changed = false;
    for (let i = 0; i < grid.length; i++) if (grid[i] !== strokeSnapshot[i]) { changed = true; break; }
    if (changed) { undoStack.push({ w: W, h: H, g: strokeSnapshot }); if (undoStack.length > 40) undoStack.shift(); redoStack.length = 0; }
    strokeSnapshot = null;
  }
  afterChange();
}
board.addEventListener("pointerup", endStroke);
board.addEventListener("pointercancel", endStroke);

function afterChange() {
  rebuildSymbols();
  render();
  saveSoon();
  updateStat();
}

/* ---------- 调色板 ---------- */
function buildPalette() {
  const box = $("palette");
  PALETTE.forEach((p, i) => {
    const s = document.createElement("button");
    s.className = "swatch";
    s.style.background = p.h;
    s.title = p.n;
    s.dataset.idx = i;
    s.addEventListener("click", () => { colorIdx = i; refreshColorUI(); });
    box.appendChild(s);
  });
  refreshColorUI();
}
function refreshColorUI() {
  $("curColor").style.background = PALETTE[colorIdx].h;
  document.querySelectorAll(".swatch").forEach((s) =>
    s.classList.toggle("picked", +s.dataset.idx === colorIdx));
}

/* ---------- 统计 ---------- */
function beadCounts() {
  const counts = {};
  for (const v of grid) if (v !== EMPTY) counts[v] = (counts[v] || 0) + 1;
  return counts;
}
function updateStat() {
  const c = beadCounts();
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  $("statInfo").textContent = `${W}×${H} · ${Object.keys(c).length} 色 · ${total} 颗`;
}
function openStats() {
  const counts = beadCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  $("statsSummary").textContent =
    `画布 ${W}×${H}，共 ${total} 颗，${Object.keys(counts).length} 种颜色`;
  const list = $("statsList");
  list.innerHTML = "";
  Object.keys(counts).map(Number).sort((a, b) => a - b).forEach((idx) => {
    const row = document.createElement("div");
    row.className = "stat-row";
    const sym = symMap[idx] || "";
    const dark = luminance(PALETTE[idx].h) > 0.6;
    row.innerHTML = `
      <span class="sym" style="background:${PALETTE[idx].h};color:${dark ? "#333" : "#fff"}">${sym}</span>
      <span class="name">${PALETTE[idx].n}（${PALETTE[idx].h.toUpperCase()}）</span>
      <span class="cnt">× ${counts[idx]}</span>`;
    list.appendChild(row);
  });
  $("statsModal").hidden = false;
}

/* ---------- 图片转图纸 ---------- */
$("colorN").addEventListener("input", (e) => {
  $("colorNLabel").textContent = e.target.value;
  if (imgState) { quantizePreview(); cmpSoon(); }
});
$("dropZone").addEventListener("click", () => $("fileImg").click());
$("dropZone").addEventListener("dragover", (e) => { e.preventDefault(); });
$("dropZone").addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) loadImgFile(f);
});
$("fileImg").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) loadImgFile(f);
  e.target.value = "";
});
function loadImgFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    imgState = { img };
    $("previewWrap").hidden = false;
    quantizePreview();
    renderCompare();
    $("imgGo").disabled = false;
  };
  img.onerror = () => toast("这张图片读不出来，换一张试试");
  img.src = url;
}
function quantOpts() {
  return {
    dither: $("enDither").checked,
    removeBg: $("enRemoveBg").checked,
    outline: $("enOutline").checked,
  };
}
["enSharp", "enContrast", "enSat", "enDither", "enRemoveBg", "enOutline"].forEach((id) =>
  $(id).addEventListener("change", () => { if (imgState) { quantizePreview(); cmpSoon(); } }));
function quantizePreview() {
  const size = +$("imgSize").value;
  const maxColors = +$("colorN").value;
  const fit = document.querySelector('input[name="fit"]:checked').value;
  const data = sampleToGrid(imgState.img, size, size, fit, enhanceOpts());
  const { grid: g, used } = quantizeGrid(data, size, size, maxColors, quantOpts());
  imgState.result = g;
  imgState.used = used;

  const pc = $("previewCanvas");
  pc.width = size; pc.height = size;
  const pctx = pc.getContext("2d");
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = g[y * size + x];
      pctx.fillStyle = v === EMPTY ? "#ffffff" : PALETTE[v].h;
      pctx.fillRect(x, y, 1, 1);
    }
  }
  $("previewHint").textContent =
    `${size}×${size} · 用了 ${used.length} 种颜色（上限 ${maxColors}）`;
}
/* 把图片多级缩小绘制到 size×size（多步缩小比一步到位清晰得多），返回像素数组 */
function sampleToGrid(img, tw, th, fit, enhance) {
  let src = img, sw = img.width, sh = img.height;
  /* 先反复减半到接近目标，再最终缩放，保留更多细节 */
  while (sw * 0.5 > tw && sh * 0.5 > th) {
    const c = document.createElement("canvas");
    c.width = Math.max(tw, Math.round(sw / 2));
    c.height = Math.max(th, Math.round(sh / 2));
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(src, 0, 0, c.width, c.height);
    src = c; sw = c.width; sh = c.height;
  }
  const c = document.createElement("canvas");
  c.width = tw; c.height = th;
  const x2 = c.getContext("2d");
  x2.imageSmoothingEnabled = true;
  x2.imageSmoothingQuality = "high";
  const scale = fit === "cover"
    ? Math.max(tw / sw, th / sh)
    : Math.min(tw / sw, th / sh);
  const dw = sw * scale, dh = sh * scale;
  x2.drawImage(src, (tw - dw) / 2, (th - dh) / 2, dw, dh);

  if (enhance) applyEnhance(x2, tw, th, enhance);
  return x2.getImageData(0, 0, tw, th).data;
}
/* 画质增强：自动对比度 → 提高鲜艳度 → 锐化 */
function applyEnhance(x2, tw, th, opts) {
  const imgd = x2.getImageData(0, 0, tw, th);
  const p = imgd.data;
  const n = tw * th;
  if (opts.contrast) {
    /* 按亮度直方图 1%~99% 拉伸，整体同缩放避免偏色 */
    const hist = new Array(256).fill(0);
    let opaque = 0;
    for (let i = 0; i < n; i++) {
      if (p[i * 4 + 3] < 128) continue;
      const l = Math.round(0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]);
      hist[l]++; opaque++;
    }
    if (opaque > 16) {
      let lo = 0, hi = 255, acc = 0;
      for (let l = 0; l < 256; l++) { acc += hist[l]; if (acc >= opaque * 0.01) { lo = l; break; } }
      acc = 0;
      for (let l = 255; l >= 0; l--) { acc += hist[l]; if (acc >= opaque * 0.01) { hi = l; break; } }
      if (hi - lo > 24) {
        const k = 255 / (hi - lo), off = -lo * k;
        for (let i = 0; i < n; i++) {
          if (p[i * 4 + 3] < 128) continue;
          for (let ch = 0; ch < 3; ch++) {
            p[i * 4 + ch] = Math.max(0, Math.min(255, p[i * 4 + ch] * k + off));
          }
        }
      }
    }
  }
  if (opts.sat) {
    const k = 1.15;
    for (let i = 0; i < n; i++) {
      if (p[i * 4 + 3] < 128) continue;
      const r = p[i * 4], g = p[i * 4 + 1], b = p[i * 4 + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      p[i * 4]     = Math.max(0, Math.min(255, gray + (r - gray) * k));
      p[i * 4 + 1] = Math.max(0, Math.min(255, gray + (g - gray) * k));
      p[i * 4 + 2] = Math.max(0, Math.min(255, gray + (b - gray) * k));
    }
  }
  if (opts.sharp) {
    /* unsharp：先做 3×3 均值模糊，再叠加差值 */
    const blur = new Float32Array(n * 3);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        let r = 0, g = 0, b = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= th) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= tw) continue;
            const i = (yy * tw + xx) * 4;
            r += p[i]; g += p[i + 1]; b += p[i + 2]; cnt++;
          }
        }
        const o = (y * tw + x) * 3;
        blur[o] = r / cnt; blur[o + 1] = g / cnt; blur[o + 2] = b / cnt;
      }
    }
    const amt = 0.5;
    for (let i = 0; i < n; i++) {
      if (p[i * 4 + 3] < 128) continue;
      for (let ch = 0; ch < 3; ch++) {
        const orig = p[i * 4 + ch];
        const v = orig + amt * (orig - blur[i * 3 + ch]);
        p[i * 4 + ch] = Math.max(0, Math.min(255, v));
      }
    }
  }
  x2.putImageData(imgd, 0, 0);
}
function enhanceOpts() {
  return {
    sharp: $("enSharp").checked,
    contrast: $("enContrast").checked,
    sat: $("enSat").checked,
  };
}

/* ---------- 尺寸对比条 ---------- */
const CMP_SIZES = [16, 24, 29, 40, 50, 58, 72, 100];
let cmpTimer = null;
function cmpSoon() {
  clearTimeout(cmpTimer);
  cmpTimer = setTimeout(renderCompare, 350);
}
function renderCompare() {
  if (!imgState || !imgState.img) return;
  const strip = $("cmpStrip");
  strip.innerHTML = "";
  const maxColors = +$("colorN").value;
  const fit = document.querySelector('input[name="fit"]:checked').value;
  const enh = enhanceOpts();
  const qo = quantOpts();
  const cur = +$("imgSize").value;
  for (const size of CMP_SIZES) {
    const data = sampleToGrid(imgState.img, size, size, fit, enh);
    const { grid: g } = quantizeGrid(data, size, size, maxColors, qo);
    let total = 0;
    const used = new Set();
    for (const v of g) if (v !== EMPTY) { used.add(v); total++; }

    const card = document.createElement("button");
    card.className = "cmp-card" + (size === cur ? " sel" : "");
    const cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    const cc = cv.getContext("2d");
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = g[y * size + x];
      cc.fillStyle = v === EMPTY ? "#ffffff" : PALETTE[v].h;
      cc.fillRect(x, y, 1, 1);
    }
    const cap = document.createElement("div");
    cap.className = "cap";
    cap.innerHTML = `<b>${size}×${size}</b><br>${used.size} 色 · ${total} 颗`;
    card.appendChild(cv);
    card.appendChild(cap);
    card.addEventListener("click", () => {
      $("imgSize").value = String(size);
      quantizePreview();
      strip.querySelectorAll(".cmp-card").forEach((c) => c.classList.remove("sel"));
      card.classList.add("sel");
    });
    strip.appendChild(card);
  }
}
/* k-means 限色 + 拼豆色板直接优化 + 可选抖动/去背景/描边，返回 {grid, used} */
function quantizeGrid(data, w, h, maxColors, opts = {}) {
  const dither = !!opts.dither, removeBg = !!opts.removeBg, outline = !!opts.outline;

  /* 0) 自动去背景：从边界出发，把和四角颜色相近的连通区域挖空 */
  if (removeBg) {
    const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4].map((i) => [
      data[i], data[i + 1], data[i + 2],
    ]);
    const tol2 = 62 * 62;
    const nearCorner = (i) => {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      return corners.some((c) => {
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        return dr * dr + dg * dg + db * db < tol2;
      });
    };
    const seen = new Uint8Array(w * h);
    const q = [];
    for (let x = 0; x < w; x++) { q.push([x, 0], [x, h - 1]); }
    for (let y = 0; y < h; y++) { q.push([0, y], [w - 1, y]); }
    while (q.length) {
      const [x, y] = q.pop();
      const i = y * w + x;
      if (seen[i]) continue;
      seen[i] = 1;
      if (data[i * 4 + 3] < 128 || !nearCorner(i * 4)) continue;
      data[i * 4 + 3] = 0;
      if (x > 0) q.push([x - 1, y]);
      if (x < w - 1) q.push([x + 1, y]);
      if (y > 0) q.push([x, y - 1]);
      if (y < h - 1) q.push([x, y + 1]);
    }
  }

  /* 1) 采样 */
  const samples = [], pos = [];
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 128) continue;
    samples.push(srgbToOklab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]));
    pos.push(i);
  }
  const out = new Int16Array(w * h).fill(EMPTY);
  if (!samples.length) return { grid: out, used: [] };
  const k = Math.min(maxColors, samples.length);

  /* 2) k-means 初始聚类 */
  let centers = [];
  const step = Math.max(1, Math.floor(samples.length / k));
  for (let i = 0; i < k; i++) centers.push(samples[Math.min(i * step, samples.length - 1)].slice());
  const assign = new Int16Array(samples.length);
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  for (let iter = 0; iter < 8; iter++) {
    for (let s = 0; s < samples.length; s++) {
      let bd = Infinity, bi = 0;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(samples[s], centers[c]);
        if (d < bd) { bd = d; bi = c; }
      }
      assign[s] = bi;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let s = 0; s < samples.length; s++) {
      const t = sums[assign[s]];
      t[0] += samples[s][0]; t[1] += samples[s][1]; t[2] += samples[s][2]; t[3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3] > 0) centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
  }

  /* 3) 吸附到豆色板 */
  let subset = [...new Set(centers.map((c) => nearestPaletteIdx(c, PALETTE.map((_, i) => i))))].sort((a, b) => a - b);

  /* 4) 在豆色板上迭代优化：按豆色分组重算中心 → 重新吸附 → 去重 */
  for (let round = 0; round < 3; round++) {
    const groups = new Map(); /* 豆色下标 -> [sum, count] */
    for (let s = 0; s < samples.length; s++) {
      const bead = nearestPaletteIdx(samples[s], subset);
      const g = groups.get(bead) || [0, 0, 0, 0];
      g[0] += samples[s][0]; g[1] += samples[s][1]; g[2] += samples[s][2]; g[3]++;
      groups.set(bead, g);
    }
    const allIdx = PALETTE.map((_, i) => i);
    const next = [...new Set([...groups.values()].map((g) => nearestPaletteIdx([g[0] / g[3], g[1] / g[3], g[2] / g[3]], allIdx)))].sort((a, b) => a - b);
    if (next.join(",") === subset.join(",")) break;
    subset = next;
  }

  /* 5) 最终上色 */
  const subsetLab = subset.map((i) => PALETTE[i].lab);
  if (!dither) {
    for (let s = 0; s < samples.length; s++) {
      out[pos[s]] = subset[nearestInList(samples[s], subsetLab)];
    }
  } else {
    /* Floyd–Steinberg 误差扩散，渐变更细腻 */
    const err = new Float32Array(w * h * 3);
    const posIdx = new Map(pos.map((p, s) => [p, s]));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const s = posIdx.get(p);
        if (s === undefined) continue;
        const cur = [
          samples[s][0] + err[p * 3],
          samples[s][1] + err[p * 3 + 1],
          samples[s][2] + err[p * 3 + 2],
        ];
        const bi = nearestInList(cur, subsetLab);
        out[p] = subset[bi];
        const d = [
          cur[0] - PALETTE[subset[bi]].lab[0],
          cur[1] - PALETTE[subset[bi]].lab[1],
          cur[2] - PALETTE[subset[bi]].lab[2],
        ];
        const spread = (nx, ny, f) => {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
          const np = ny * w + nx;
          if (!posIdx.has(np)) return;
          err[np * 3] += d[0] * f;
          err[np * 3 + 1] += d[1] * f;
          err[np * 3 + 2] += d[2] * f;
        };
        spread(x + 1, y, 7 / 16);
        spread(x - 1, y + 1, 3 / 16);
        spread(x, y + 1, 5 / 16);
        spread(x + 1, y + 1, 1 / 16);
      }
    }
  }

  /* 6) 深色描边：色差突变处且本身不是深色 → 换成用到的最深豆色 */
  if (outline && subset.length) {
    let darkest = subset[0];
    for (const i of subset) if (PALETTE[i].lab[0] < PALETTE[darkest].lab[0]) darkest = i;
    const cellLab = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return null;
      const i = y * w + x;
      if (data[i * 4 + 3] < 128 || out[i] === EMPTY) return null;
      return {
        lab: srgbToOklab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]),
        lum: (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255,
      };
    };
    const marks = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const me = cellLab(x, y);
        if (!me) continue;
        let maxD = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = cellLab(x + dx, y + dy);
          if (!n) { maxD = 9; break; }   /* 空格子 = 轮廓边界 */
          const d = Math.sqrt((me.lab[0] - n.lab[0]) ** 2 + (me.lab[1] - n.lab[1]) ** 2 + (me.lab[2] - n.lab[2]) ** 2);
          if (d > maxD) maxD = d;
        }
        if (maxD > 0.2 && me.lum > 0.4) marks.push(y * w + x);
      }
    }
    for (const i of marks) out[i] = darkest;
  }

  const used = [...new Set(out)].filter((v) => v !== EMPTY).sort((a, b) => a - b);
  return { grid: out, used };
}
function nearestInList(lab, labs) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < labs.length; i++) {
    const L = labs[i];
    const d = (lab[0] - L[0]) ** 2 + (lab[1] - L[1]) ** 2 + (lab[2] - L[2]) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
$("imgGo").addEventListener("click", () => {
  if (!imgState || !imgState.result) return;
  if (W !== +$("imgSize").value || H !== +$("imgSize").value) {
    resizeBoard(+$("imgSize").value, +$("imgSize").value, true);
  }
  pushUndo();
  grid.set(imgState.result);
  fitZoom(); render();
  rebuildSymbols(); saveSoon(); updateStat();
  $("imgModal").hidden = true;
  toast(`图纸生成好啦，用了 ${imgState.used.length} 种颜色 🧩`);
});

/* ---------- 尺寸 / 缩放 / 开关 ---------- */
function resizeBoard(nw, nh, skipUndo) {
  if (!skipUndo) pushUndo();
  const ng = new Int16Array(nw * nh).fill(EMPTY);
  for (let y = 0; y < Math.min(H, nh); y++) {
    for (let x = 0; x < Math.min(W, nw); x++) ng[y * nw + x] = grid[y * W + x];
  }
  W = nw; H = nh; grid = ng;
  fitZoom(); render(); rebuildSymbols(); saveSoon(); updateStat();
}
$("sizeSel").addEventListener("change", (e) => {
  const n = +e.target.value;
  if (n === W) return;
  resizeBoard(n, n);
  toast(`画布换成 ${n}×${n}，原内容保留在左上角`);
});
$("zoomIn").addEventListener("click", () => { zoomStep++; applyZoom(); });
$("zoomOut").addEventListener("click", () => { zoomStep--; applyZoom(); });
$("tgGrid").addEventListener("change", (e) => { showGrid = e.target.checked; render(); });
$("tgSym").addEventListener("change", (e) => { showSym = e.target.checked; render(); });

/* ---------- 工具切换 / 顶栏 ---------- */
document.querySelectorAll(".tool").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tool").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    tool = b.dataset.tool;
    board.style.cursor = tool === "picker" ? "copy" : "crosshair";
  });
});
$("btnUndo").addEventListener("click", undo);
$("btnRedo").addEventListener("click", redo);
$("btnImage").addEventListener("click", () => { $("imgModal").hidden = false; });
$("imgCancel").addEventListener("click", () => { $("imgModal").hidden = true; });
$("btnStats").addEventListener("click", () => { openStats(); $("menu").hidden = true; });
$("statsClose").addEventListener("click", () => { $("statsModal").hidden = true; });
$("statsCopy").addEventListener("click", () => {
  const counts = beadCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const lines = [`拼豆用量清单 ${W}×${H}，共 ${total} 颗：`];
  Object.keys(counts).map(Number).sort((a, b) => a - b).forEach((idx) => {
    lines.push(`${symMap[idx] || ""} ${PALETTE[idx].n}（${PALETTE[idx].h.toUpperCase()}）× ${counts[idx]}`);
  });
  navigator.clipboard.writeText(lines.join("\n"))
    .then(() => toast("清单复制好啦 ✨"))
    .catch(() => toast("这台设备不允许复制"));
});
$("btnMenu").addEventListener("click", (e) => {
  e.stopPropagation();
  $("menu").hidden = !$("menu").hidden;
});
document.addEventListener("click", () => { $("menu").hidden = true; });
$("btnClear").addEventListener("click", () => {
  if (!confirm("确定要清空整个画布吗？")) return;
  pushUndo();
  grid.fill(EMPTY);
  afterChange();
  $("menu").hidden = true;
  toast("画布已清空，撤销可以找回");
});

/* ---------- 导出 PNG ---------- */
$("btnExport").addEventListener("click", () => {
  $("menu").hidden = true;
  const big = W > 60 || H > 60;
  const cell = big ? 22 : 40;
  const margin = big ? 20 : 28;
  const dpr = big ? 1 : 2;

  /* 图例区高度 */
  const counts = beadCounts();
  const entries = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const total = entries.reduce((a, i) => a + counts[i], 0);
  const perRow = 3, rowH = big ? 17 : 21;
  const legendRows = Math.ceil(entries.length / perRow);
  const legendH = entries.length ? 34 + legendRows * rowH : 0;

  const w = W * cell + margin, h = H * cell + margin + legendH;
  const c = document.createElement("canvas");
  c.width = w * dpr; c.height = h * dpr;
  const x2 = c.getContext("2d");
  x2.setTransform(dpr, 0, 0, dpr, 0, 0);
  x2.fillStyle = "#fff";
  x2.fillRect(0, 0, w, h);
  x2.save();
  x2.translate(margin, margin);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = grid[y * W + x];
      x2.fillStyle = v === EMPTY ? "#ffffff" : PALETTE[v].h;
      x2.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  x2.strokeStyle = "rgba(60,90,70,0.25)";
  x2.lineWidth = 1;
  x2.beginPath();
  for (let i = 0; i <= W; i++) { x2.moveTo(i * cell + 0.5, 0); x2.lineTo(i * cell + 0.5, H * cell); }
  for (let i = 0; i <= H; i++) { x2.moveTo(0, i * cell + 0.5); x2.lineTo(W * cell, i * cell + 0.5); }
  x2.stroke();
  x2.strokeStyle = "rgba(60,90,70,0.55)";
  x2.strokeRect(0.5, 0.5, W * cell, H * cell);
  /* 标尺：大图每 5 格，小图每格 */
  const rstep = big ? 5 : (W <= 48 ? 1 : 5);
  x2.fillStyle = "#8aa393";
  x2.font = `${big ? 10 : 11}px sans-serif`;
  x2.textAlign = "center"; x2.textBaseline = "middle";
  for (let x = 0; x < W; x += rstep) x2.fillText(x, x * cell + cell / 2, -margin / 2);
  x2.textAlign = "right";
  for (let y = 0; y < H; y += rstep) x2.fillText(y, -6, y * cell + cell / 2);
  /* 符号 */
  if (showSym) {
    x2.textAlign = "center";
    x2.font = `700 ${Math.floor(cell * 0.5)}px sans-serif`;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = grid[y * W + x];
        if (v === EMPTY) continue;
        x2.fillStyle = luminance(PALETTE[v].h) > 0.6 ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.92)";
        x2.fillText(symMap[v] || "?", x * cell + cell / 2, y * cell + cell / 2 + 1);
      }
    }
  }
  x2.restore();

  /* 图例 */
  if (entries.length) {
    const colW = (W * cell) / perRow;
    let ly = margin + H * cell + 6;
    x2.fillStyle = "#33463a";
    x2.font = `600 ${big ? 11 : 13}px sans-serif`;
    x2.textAlign = "left"; x2.textBaseline = "middle";
    x2.fillText(`${W}×${H} · 共 ${total} 颗 · ${entries.length} 种颜色`, margin, ly + 10);
    ly += 30;
    entries.forEach((idx, i) => {
      const ex = margin + (i % perRow) * colW;
      const ey = ly + Math.floor(i / perRow) * rowH;
      x2.fillStyle = PALETTE[idx].h;
      x2.fillRect(ex, ey, 16, 16);
      x2.strokeStyle = "rgba(0,0,0,0.35)";
      x2.lineWidth = 1;
      x2.strokeRect(ex + 0.5, ey + 0.5, 15, 15);
      if (showSym && symMap[idx]) {
        x2.fillStyle = luminance(PALETTE[idx].h) > 0.6 ? "#333" : "#fff";
        x2.font = `700 10px sans-serif`;
        x2.textAlign = "center";
        x2.fillText(symMap[idx], ex + 8, ey + 9);
      }
      x2.fillStyle = "#33463a";
      x2.font = `${big ? 10 : 12}px sans-serif`;
      x2.textAlign = "left";
      x2.fillText(`${PALETTE[idx].n} ${PALETTE[idx].h.toUpperCase()}`, ex + 21, ey + 9);
      x2.textAlign = "right";
      x2.fillText(`×${counts[idx]}`, ex + colW - 10, ey + 9);
    });
  }
  c.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `拼豆图纸_${W}x${H}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("图纸已导出 ✅");
  });
});

/* ---------- 工程保存 / 读取 ---------- */
$("btnSave").addEventListener("click", () => {
  $("menu").hidden = true;
  const data = { app: "bead-pattern", v: 1, w: W, h: H, grid: Array.from(grid), symbols: symMap };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `拼豆工程_${W}x${H}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("工程文件已保存 💾");
});
$("btnLoad").addEventListener("click", () => { $("menu").hidden = true; $("fileProj").click(); });
$("fileProj").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (d.app !== "bead-pattern" || !Array.isArray(d.grid)) throw new Error("格式不对");
      pushUndo();
      W = +d.w || 29; H = +d.h || 29;
      grid = new Int16Array(W * H);
      for (let i = 0; i < Math.min(W * H, d.grid.length); i++) grid[i] = d.grid[i] | 0;
      symMap = d.symbols || {};
      $("sizeSel").value = String(W);
      fitZoom(); render(); rebuildSymbols(); saveSoon(); updateStat();
      toast("工程读取成功 📂");
    } catch { toast("这个文件不是有效的拼豆工程"); }
  };
  reader.readAsText(f);
});

/* ---------- 自动保存 ---------- */
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem("bp_project", JSON.stringify({
        w: W, h: H, grid: Array.from(grid), symbols: symMap,
        showGrid, showSym,
      }));
    } catch {}
  }, 400);
}
function loadSaved() {
  try {
    const d = JSON.parse(localStorage.getItem("bp_project") || "null");
    if (!d || !Array.isArray(d.grid)) return;
    W = +d.w || 29; H = +d.h || 29;
    grid = new Int16Array(W * H);
    for (let i = 0; i < Math.min(W * H, d.grid.length); i++) grid[i] = d.grid[i] | 0;
    symMap = d.symbols || {};
    $("sizeSel").value = String(W);
    showGrid = d.showGrid !== false; $("tgGrid").checked = showGrid;
    showSym = !!d.showSym; $("tgSym").checked = showSym;
  } catch {}
}

/* ---------- 启动 ---------- */
loadSaved();
buildPalette();
fitZoom();
render();
rebuildSymbols();
updateStat();

/* 暴露给自动化测试 */
window.__bead = {
  get grid() { return grid; },
  set grid(v) { grid = v; },
  quantizeGrid, sampleToGrid, resizeBoard, pushUndo, render, afterChange, fitZoom,
  loadImgFile, renderCompare,
  get W() { return W; }, get H() { return H; },
};

/* ---------- 成品预览（模拟烫后效果） ---------- */
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}
function shadeHex(hex, f) {
  /* f>0 向白靠，f<0 向黑靠 */
  const [r, g, b] = hexToRgb(hex);
  const t = Math.abs(f);
  const m = f >= 0 ? [255 - r, 255 - g, 255 - b] : [r, g, b];
  return `rgb(${Math.round(r + m[0] * t)},${Math.round(g + m[1] * t)},${Math.round(b + m[2] * t)})`;
}
function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function finLabel(t) {
  return t < 0.3 ? "生豆 / 轻烫" : t < 0.7 ? "半融合" : "烫透";
}
function renderFinished() {
  const t = +$("finSlider").value / 100;
  $("finLabel").textContent = finLabel(t);
  const stage = $("finCanvas").parentElement;
  const maxW = Math.min(stage.clientWidth - 16, 440);
  const cell = Math.max(3, Math.floor(maxW / W));
  const w = W * cell, h = H * cell;
  const dpr = 2;
  const fc = $("finCanvas");
  fc.width = w * dpr; fc.height = h * dpr;
  fc.style.width = w + "px"; fc.style.height = h + "px";
  const x2 = fc.getContext("2d");
  x2.setTransform(dpr, 0, 0, dpr, 0, 0);
  x2.clearRect(0, 0, w, h);

  /* 烫透后整体略微收缩变圆润 */
  x2.translate(w / 2, h / 2);
  x2.scale(1 - 0.035 * t, 1 - 0.035 * t);
  x2.translate(-w / 2, -h / 2);

  const round = (cell / 2) * (1 - 0.64 * smoothstep(0.12, 0.72, t));
  const sizeF = 0.86 + 0.15 * smoothstep(0.08, 0.55, t);
  const connA = smoothstep(0.32, 0.78, t);
  const holeK = Math.max(0, 1 - smoothstep(0.02, 0.42, t));   /* 中孔可见度 */
  const shadeK = 0.18 * (1 - 0.6 * t);
  const s = cell * sizeF;

  const bead = (x, y, v) => {
    const cx = x * cell + cell / 2, cy = y * cell + cell / 2;
    const hex = PALETTE[v].h;
    if (t < 0.2) {
      /* 生豆：圆形带中孔 */
      x2.fillStyle = hex;
      x2.beginPath(); x2.arc(cx, cy, s / 2, 0, 7); x2.fill();
      if (shadeK > 0.03) {
        x2.fillStyle = `rgba(255,255,255,${shadeK * 0.7})`;
        x2.beginPath(); x2.arc(cx - s * 0.08, cy - s * 0.1, s / 2 - 1, 0, 7); x2.fill();
      }
      if (holeK > 0.02) {
        x2.save();
        x2.globalCompositeOperation = "destination-out";
        x2.globalAlpha = holeK;
        x2.beginPath(); x2.arc(cx, cy, s * 0.2, 0, 7); x2.fill();
        x2.restore();
      }
      return;
    }
    /* 烫中/烫透：圆角方块，同色相邻融合 */
    const r = Math.min(round, s / 2);
    const left = cx - s / 2, top = cy - s / 2;
    x2.fillStyle = hex;
    x2.beginPath();
    x2.roundRect(left, top, s, s, r);
    x2.fill();
    /* 同色连接（融合成一片） */
    if (connA > 0.02) {
      x2.globalAlpha = connA;
      if (x < W - 1 && grid[y * W + x + 1] === v) {
        x2.fillRect(cx, top + r, cell, s - r * 2);
      }
      if (y < H - 1 && grid[(y + 1) * W + x] === v) {
        x2.fillRect(left + r, cy, s - r * 2, cell);
      }
      x2.globalAlpha = 1;
    }
    /* 简单明暗：上亮下暗 */
    if (shadeK > 0.03) {
      x2.fillStyle = `rgba(255,255,255,${shadeK * 0.8})`;
      x2.fillRect(left + r * 0.3, top + 1, s - r * 0.6, s * 0.28);
      x2.fillStyle = `rgba(0,0,0,${shadeK * 0.55})`;
      x2.fillRect(left + r * 0.3, top + s * 0.78, s - r * 0.6, s * 0.2);
    }
    /* 半融合时的残留中孔 */
    if (holeK > 0.04) {
      x2.fillStyle = `rgba(0,0,0,${0.28 * holeK})`;
      x2.beginPath(); x2.arc(cx, cy, s * 0.13, 0, 7); x2.fill();
    }
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = grid[y * W + x];
    if (v !== EMPTY) bead(x, y, v);
  }
  /* 全局光泽 */
  if (t > 0.35) {
    const gl = x2.createLinearGradient(0, 0, w, h);
    const a = 0.2 * smoothstep(0.35, 1, t);
    gl.addColorStop(0, `rgba(255,255,255,${a})`);
    gl.addColorStop(0.4, "rgba(255,255,255,0)");
    gl.addColorStop(1, `rgba(255,255,255,${a * 0.25})`);
    x2.fillStyle = gl;
    x2.fillRect(0, 0, w, h);
  }
}
function openPreview() {
  if (!Object.keys(beadCounts()).length) { toast("先画点什么，或转一张图纸再来 ✍️"); return; }
  $("finModal").hidden = false;
  requestAnimationFrame(renderFinished);
}
$("btnPreview").addEventListener("click", () => { openPreview(); $("menu").hidden = true; });
$("finClose").addEventListener("click", () => { $("finModal").hidden = true; });
$("finSlider").addEventListener("input", renderFinished);
window.addEventListener("resize", () => { if (!$("finModal").hidden) renderFinished(); });

/* ---------- PWA ---------- */
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
