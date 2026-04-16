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

let squareWorker = null;

function ensureSquareWorker() {
  if (squareWorker) return squareWorker;
  try {
    squareWorker = new Worker('js/workers/square-worker.js');
    squareWorker.onmessage = (e) => {
      if (e.data.gen === squareState.generation) {
        squareState.idealCorners = e.data.corners;
      }
    };
    squareWorker.onerror = () => { squareWorker = null; };
  } catch (e) {
    squareWorker = null;
  }
  return squareWorker;
}

function precomputeIdeal(outer) {
  squareState.idealCorners = null;
  const gen = ++squareState.generation;
  const w = ensureSquareWorker();
  if (w) w.postMessage({ outer, gen });
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
