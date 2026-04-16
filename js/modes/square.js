const squareState = {
  points: [],
  hover: null,
  dragIdx: -1,
  confirmed: false,
  activePointerId: null,
  pointerType: null,
  idealCorners: null,
  generation: 0,
};

function closestOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function projectToOutline(p, outer) {
  let best = null, bestD = Infinity;
  for (let i = 0, n = outer.length; i < n; i++) {
    const proj = closestOnSegment(p, outer[i], outer[(i + 1) % n]);
    const d = Math.hypot(p.x - proj.x, p.y - proj.y);
    if (d < bestD) { bestD = d; best = proj; }
  }
  return best;
}

function pickExistingPoint(p, grabR) {
  let idx = -1, bestD = grabR ?? POINT_GRAB_R;
  for (let i = 0; i < squareState.points.length; i++) {
    const d = Math.hypot(p.x - squareState.points[i].x, p.y - squareState.points[i].y);
    if (d < bestD) { bestD = d; idx = i; }
  }
  return idx;
}

function orderByCentroid(pts) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  return pts.slice().sort((a, b) =>
    Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
}

function squareReset() {
  squareState.points = [];
  squareState.hover = null;
  squareState.dragIdx = -1;
  squareState.confirmed = false;
  squareState.activePointerId = null;
  squareState.idealCorners = null;
  squareState.generation++;
  dom.squareLines.innerHTML = '';
  dom.squarePoints.innerHTML = '';
  dom.squareHover.innerHTML = '';
  dom.squareIdeal.innerHTML = '';
}

async function precomputeIdeal(outer) {
  squareState.idealCorners = null;
  const gen = ++squareState.generation;
  squareState.idealCorners = await findInscribedSquareAsync(outer, gen);
}

function drawSquareLine(a, b, cls = 'square-line') {
  const ln = document.createElementNS(SVG_NS, 'line');
  ln.setAttribute('class', cls);
  ln.setAttribute('x1', a.x.toFixed(2));
  ln.setAttribute('y1', a.y.toFixed(2));
  ln.setAttribute('x2', b.x.toFixed(2));
  ln.setAttribute('y2', b.y.toFixed(2));
  return ln;
}

function drawSquarePoint(p, idx) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'square-point');
  const halo = document.createElementNS(SVG_NS, 'circle');
  halo.setAttribute('cx', p.x); halo.setAttribute('cy', p.y);
  halo.setAttribute('r', 11);
  halo.setAttribute('class', 'sp-halo');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
  dot.setAttribute('r', 5.5);
  dot.setAttribute('class', 'sp-dot');
  g.appendChild(halo);
  g.appendChild(dot);
  g.dataset.idx = idx;
  return g;
}

function renderSquareLines() {
  dom.squareLines.innerHTML = '';
  const pts = squareState.points;
  if (pts.length === 2) {
    dom.squareLines.appendChild(drawSquareLine(pts[0], pts[1]));
  } else if (pts.length === 3) {
    const ordered = orderByCentroid(pts);
    const edges = [[0, 1], [1, 2], [0, 2]];
    const lens = edges.map(([i, j]) =>
      Math.hypot(ordered[i].x - ordered[j].x, ordered[i].y - ordered[j].y)
    );
    let bestSkip = 0, bestDiff = Infinity;
    for (let s = 0; s < 3; s++) {
      const kept = [0, 1, 2].filter(k => k !== s);
      const d = Math.abs(lens[kept[0]] - lens[kept[1]]);
      if (d < bestDiff) { bestDiff = d; bestSkip = s; }
    }
    for (let s = 0; s < 3; s++) {
      if (s === bestSkip) continue;
      const [i, j] = edges[s];
      dom.squareLines.appendChild(drawSquareLine(ordered[i], ordered[j]));
    }
  } else if (pts.length === 4) {
    const ordered = orderByCentroid(pts);
    for (let i = 0; i < 4; i++) {
      dom.squareLines.appendChild(drawSquareLine(ordered[i], ordered[(i + 1) % 4]));
    }
  }
}

function renderSquarePoints() {
  dom.squarePoints.innerHTML = '';
  squareState.points.forEach((p, i) => {
    dom.squarePoints.appendChild(drawSquarePoint(p, i));
  });
}

function updateSquareCursor(overExisting, dragging) {
  if (state.mode !== 'square') { dom.hitPad.style.cursor = ''; return; }
  if (squareState.confirmed) { dom.hitPad.style.cursor = 'default'; return; }
  if (dragging) dom.hitPad.style.cursor = 'grabbing';
  else if (overExisting) dom.hitPad.style.cursor = 'grab';
  else if (squareState.points.length >= 4) dom.hitPad.style.cursor = 'default';
  else dom.hitPad.style.cursor = 'crosshair';
}

function renderSquareHover() {
  dom.squareHover.innerHTML = '';
  if (squareState.confirmed) return;
  if (!squareState.hover) { updateSquareCursor(false, squareState.dragIdx >= 0); return; }
  if (squareState.pointerType && squareState.pointerType !== 'mouse') return;
  const overExisting = pickExistingPoint(squareState.hover) >= 0;
  updateSquareCursor(overExisting, squareState.dragIdx >= 0);
  if (overExisting) return;
  if (squareState.points.length >= 4) return;
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', squareState.hover.x);
  c.setAttribute('cy', squareState.hover.y);
  c.setAttribute('r', 5);
  c.setAttribute('class', 'sp-hover');
  dom.squareHover.appendChild(c);
}

function renderSquareAll() {
  renderSquareLines();
  renderSquarePoints();
  renderSquareHover();
  updateSquareHint();
  updateActionButton();
}

function updateSquareHint() {
  if (squareState.confirmed) return;
  const n = squareState.points.length;
  let msg;
  if (n === 0) msg = 'Tap on the outline to place your first point';
  else if (n < 4) msg = `Place ${4 - n} more point${n === 3 ? '' : 's'} — drag any point to adjust`;
  else msg = 'Four points set — press Confirm to score your square';
  dom.scoreLine.innerHTML = `<div class="hint" id="hint">${msg}</div>`;
}

function fitSquareForOrder(ordered) {
  let cx = 0, cy = 0;
  for (const p of ordered) { cx += p.x; cy += p.y; }
  cx /= 4; cy /= 4;
  const p = ordered.map(q => ({ x: q.x - cx, y: q.y - cy }));
  const vx = (p[0].x + p[1].y - p[2].x - p[3].y) / 4;
  const vy = (p[0].y - p[1].x - p[2].y + p[3].x) / 4;
  const corners = [
    { x: cx + vx, y: cy + vy },
    { x: cx - vy, y: cy + vx },
    { x: cx - vx, y: cy - vy },
    { x: cx + vy, y: cy - vx },
  ];
  let sse = 0;
  for (let i = 0; i < 4; i++) {
    const dx = ordered[i].x - corners[i].x;
    const dy = ordered[i].y - corners[i].y;
    sse += dx * dx + dy * dy;
  }
  const r = Math.hypot(vx, vy);
  return { corners, ordered, center: { x: cx, y: cy }, r, vx, vy, sse };
}

function computeIdealSquare(pts) {
  const base = orderByCentroid(pts);
  let best = null;
  for (let shift = 0; shift < 4; shift++) {
    const cand = [base[shift], base[(shift + 1) % 4], base[(shift + 2) % 4], base[(shift + 3) % 4]];
    const fit = fitSquareForOrder(cand);
    if (!best || fit.sse < best.sse) best = fit;
  }
  return best;
}

function buildOutlineParam(outer) {
  const n = outer.length;
  const edgeLens = new Array(n);
  const cumLens = new Array(n + 1);
  cumLens[0] = 0;
  for (let i = 0; i < n; i++) {
    const a = outer[i], b = outer[(i + 1) % n];
    edgeLens[i] = Math.hypot(b.x - a.x, b.y - a.y);
    cumLens[i + 1] = cumLens[i] + edgeLens[i];
  }
  return { total: cumLens[n], edgeLens, cumLens, outer };
}

function pointAtT(t, param) {
  const { outer, total, edgeLens, cumLens } = param;
  let u = t - Math.floor(t);
  u *= total;
  let lo = 0, hi = outer.length;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cumLens[mid] <= u) lo = mid;
    else hi = mid;
  }
  const a = outer[lo], b = outer[(lo + 1) % outer.length];
  const L = edgeLens[lo] || 1;
  const localT = (u - cumLens[lo]) / L;
  return { x: a.x + (b.x - a.x) * localT, y: a.y + (b.y - a.y) * localT };
}

const _yieldToUI = () => new Promise(r => setTimeout(r, 0));

function distToOutlineSq(p, outer) {
  let m = Infinity;
  for (let i = 0, n = outer.length; i < n; i++) {
    const a = outer[i], b = outer[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let t = 0;
    if (l2 > 1e-9) {
      t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
    }
    const qx = a.x + t * dx, qy = a.y + t * dy;
    const d = (p.x - qx) * (p.x - qx) + (p.y - qy) * (p.y - qy);
    if (d < m) m = d;
  }
  return m;
}

// Diagonal parameterisation: A=outline(tA) and C=outline(tC) are opposite corners,
// always exactly on the boundary. B and D are computed analytically from the diagonal.
// Cost = d²(B, outline) + d²(D, outline) — smooth 2-D optimisation.

function diagCorners(tA, tC, param) {
  const A = pointAtT(tA, param), C = pointAtT(tC, param);
  const rx = (A.y - C.y) / 2, ry = (C.x - A.x) / 2;
  const mx = (A.x + C.x) / 2, my = (A.y + C.y) / 2;
  return {
    A, C,
    B: { x: mx + rx, y: my + ry },
    D: { x: mx - rx, y: my - ry },
    diag: Math.hypot(C.x - A.x, C.y - A.y),
  };
}

function diagCost(tA, tC, param, outer) {
  const { B, D } = diagCorners(tA, tC, param);
  return distToOutlineSq(B, outer) + distToOutlineSq(D, outer);
}

function diagOptimize(tA, tC, param, outer, iters) {
  const h = 5e-4;
  let step = 1 / 28;
  for (let iter = 0; iter < iters; iter++) {
    const f0 = diagCost(tA, tC, param, outer);
    if (f0 < 4e-5) break;
    const gA = (diagCost(tA + h, tC, param, outer) - diagCost(tA - h, tC, param, outer)) / (2 * h);
    const gC = (diagCost(tA, tC + h, param, outer) - diagCost(tA, tC - h, param, outer)) / (2 * h);
    const gm = Math.hypot(gA, gC);
    if (gm < 1e-11) break;
    let lr = step, ok = false;
    for (let k = 0; k < 24; k++) {
      if (diagCost(tA - lr * gA / gm, tC - lr * gC / gm, param, outer) < f0) {
        tA -= lr * gA / gm; tC -= lr * gC / gm; ok = true; break;
      }
      lr *= 0.5;
    }
    if (!ok) { step *= 0.5; if (step < 1e-9) break; }
  }
  return { tA, tC, cost: diagCost(tA, tC, param, outer) };
}

function diagValidate(tA, tC, param, outer) {
  const { A, B, C, D, diag } = diagCorners(tA, tC, param);
  if (diag < 14 * Math.SQRT2) return null;
  const mx = (A.x + C.x) / 2, my = (A.y + C.y) / 2;
  if (!pointInPolygon({ x: mx, y: my }, outer)) return null;
  // Project B and D to the nearest outline point — all 4 corners are then exactly on boundary.
  const B2 = projectToOutline(B, outer);
  const D2 = projectToOutline(D, outer);
  return { corners: [A, B2, C, D2], side: diag / Math.SQRT2 };
}

async function findInscribedSquareAsync(outer, gen) {
  const abort = () => squareState.generation !== gen;
  const param = buildOutlineParam(outer);
  const N = 34;
  const MAX_COST = 200;

  const coarse = [];
  for (let i = 0; i < N; i++) {
    if (abort()) return null;
    await _yieldToUI();
    for (let j = 0; j < N; j++) {
      if (Math.abs(i - j) < 2) continue;
      const r = diagOptimize(i / N, j / N, param, outer, 35);
      if (isFinite(r.cost)) coarse.push(r);
    }
  }
  if (abort()) return null;
  coarse.sort((a, b) => a.cost - b.cost);

  let best = null;
  for (let idx = 0; idx < Math.min(130, coarse.length); idx++) {
    if (idx % 14 === 0) { if (abort()) return null; await _yieldToUI(); }
    const c = coarse[idx];
    const r = diagOptimize(c.tA, c.tC, param, outer, 500);
    if (r.cost > MAX_COST) continue;
    const v = diagValidate(r.tA, r.tC, param, outer);
    if (!v) continue;
    if (!best || v.side > best.side) best = v;
  }
  return best ? best.corners : null;
}

function findInscribedSquare(outer) {
  const param = buildOutlineParam(outer);
  const N = 24;
  const MAX_COST = 200;
  const coarse = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (Math.abs(i - j) < 2) continue;
      coarse.push(diagOptimize(i / N, j / N, param, outer, 35));
    }
  }
  coarse.sort((a, b) => a.cost - b.cost);
  let best = null;
  for (const c of coarse.slice(0, 80)) {
    const r = diagOptimize(c.tA, c.tC, param, outer, 400);
    if (r.cost > MAX_COST) continue;
    const v = diagValidate(r.tA, r.tC, param, outer);
    if (!v) continue;
    if (!best || v.side > best.side) best = v;
  }
  return best ? best.corners : null;
}

function evaluateSquare(pts) {
  const ideal = computeIdealSquare(pts);
  const o = ideal.ordered;
  const sides = [];
  for (let i = 0; i < 4; i++) {
    sides.push(Math.hypot(o[i].x - o[(i + 1) % 4].x, o[i].y - o[(i + 1) % 4].y));
  }
  const meanSide = (sides[0] + sides[1] + sides[2] + sides[3]) / 4;
  const angles = [];
  for (let i = 0; i < 4; i++) {
    const a = o[(i + 3) % 4], b = o[i], c = o[(i + 1) % 4];
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const cos = (v1x * v2x + v1y * v2y) /
      (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
    angles.push(Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI);
  }
  const angleErr = angles.reduce((s, a) => s + Math.abs(90 - a), 0) / 4;
  const worstAngle = angles.reduce((worst, a) => Math.abs(90 - a) > Math.abs(90 - worst) ? a : worst, angles[0]);
  let sumSq = 0;
  for (let i = 0; i < 4; i++) {
    const dx = o[i].x - ideal.corners[i].x;
    const dy = o[i].y - ideal.corners[i].y;
    sumSq += dx * dx + dy * dy;
  }
  const rms = Math.sqrt(sumSq / 4);
  const rel = meanSide > 0 ? rms / meanSide : 1;
  const score = Math.max(0, Math.min(100, (1 - rel * 2.2) * 100));
  const maxS = Math.max(...sides), minS = Math.min(...sides);
  const sideRatio = maxS > 0 ? minS / maxS : 0;
  return { ideal, sides, meanSide, angles, angleErr, worstAngle, rms, rel, score, sideRatio };
}

function drawIdealSquare(corners) {
  dom.squareIdeal.innerHTML = '';
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'ideal-square');
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const ln = document.createElementNS(SVG_NS, 'line');
    ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y);
    ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
    ln.setAttribute('class', 'ideal-edge');
    g.appendChild(ln);
  }
  for (const c of corners) {
    const d = document.createElementNS(SVG_NS, 'circle');
    d.setAttribute('cx', c.x); d.setAttribute('cy', c.y);
    d.setAttribute('r', 3.2);
    d.setAttribute('class', 'ideal-corner');
    g.appendChild(d);
  }
  dom.squareIdeal.appendChild(g);
  dom.squareIdeal.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => g.classList.add('show'));
  });
}

function showSquareVerdict(res) {
  let cls;
  if (res.score >= 97)      cls = 'perfect';
  else if (res.score >= 90) cls = 'great';
  else if (res.score >= 75) cls = 'good';
  else                      cls = 'fair';
  dom.scoreLine.innerHTML = `
    <div class="verdict ${cls}" id="verdict">Square: ${res.score.toFixed(1)}%</div>
    <div class="score-stats" id="sstats">
      sides ${(res.sideRatio * 100).toFixed(1)}% even
    </div>
    <div class="score-stats" id="sstats2">
      worst angle ${res.worstAngle.toFixed(1)}°
    </div>
  `;
  const v = document.getElementById('verdict');
  const s = document.getElementById('sstats');
  const s2 = document.getElementById('sstats2');
  v.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      v.classList.add('show');
      s.classList.add('show');
      s2.classList.add('show');
    });
  });
}

function confirmSquare() {
  if (squareState.confirmed) return;
  if (squareState.points.length !== 4) return;
  squareState.confirmed = true;
  squareState.hover = null;
  dom.squareHover.innerHTML = '';
  const res = evaluateSquare(squareState.points);
  const inscribed = squareState.idealCorners
    || findInscribedSquare(state.shape.outer);
  if (inscribed) drawIdealSquare(inscribed);
  showSquareVerdict(res);
  recordSquareScore(res.score);
  state.locked = true;
  updateActionButton();
  setTimeout(() => dom.newBtn.classList.add('pulse'), 900);
}

function initSquareInput() {
  const hit = dom.hitPad;

  hit.addEventListener('pointerdown', e => {
    if (state.mode !== 'square') return;
    if (squareState.confirmed) return;
    if (squareState.activePointerId !== null) return;
    e.preventDefault();
    const p = svgPoint(e);
    squareState.pointerType = e.pointerType;
    const outer = state.shape.outer;
    const grabR = e.pointerType !== 'mouse' ? POINT_GRAB_R * 3 : POINT_GRAB_R;
    const existing = pickExistingPoint(p, grabR);
    if (existing >= 0) {
      squareState.dragIdx = existing;
    } else if (squareState.points.length < 4) {
      const proj = projectToOutline(p, outer);
      if (!proj) return;
      squareState.points.push(proj);
      squareState.dragIdx = squareState.points.length - 1;
    } else {
      return;
    }
    squareState.activePointerId = e.pointerId;
    hit.setPointerCapture(e.pointerId);
    squareState.hover = null;
    renderSquareAll();
  });

  hit.addEventListener('pointermove', e => {
    if (state.mode !== 'square') return;
    if (squareState.confirmed) return;
    e.preventDefault();
    squareState.pointerType = e.pointerType;
    const p = svgPoint(e);
    const outer = state.shape.outer;
    if (squareState.dragIdx >= 0 && e.pointerId === squareState.activePointerId) {
      const proj = projectToOutline(p, outer);
      if (proj) {
        squareState.points[squareState.dragIdx] = proj;
        renderSquareLines();
        renderSquarePoints();
      }
    } else if (e.pointerType === 'mouse') {
      squareState.hover = projectToOutline(p, outer);
      renderSquareHover();
    }
  });

  function endDrag(e) {
    if (state.mode !== 'square') return;
    if (e.pointerId !== squareState.activePointerId) return;
    if (hit.hasPointerCapture && hit.hasPointerCapture(e.pointerId)) {
      hit.releasePointerCapture(e.pointerId);
    }
    squareState.activePointerId = null;
    squareState.dragIdx = -1;
    renderSquareAll();
  }
  hit.addEventListener('pointerup', endDrag);
  hit.addEventListener('pointercancel', endDrag);

  hit.addEventListener('pointerleave', e => {
    if (state.mode !== 'square') return;
    if (e.pointerType !== 'mouse') return;
    squareState.hover = null;
    renderSquareHover();
  });
}
