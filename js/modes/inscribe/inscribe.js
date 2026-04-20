const inscribeState = {
  points: [],
  hover: null,
  hoverRaw: null,
  dragIdx: -1,
  dragLineIdxs: null,
  dragInitialPoints: null,
  dragOrigin: null,
  confirmed: false,
  activePointerId: null,
  pointerType: null,
  idealCorners: null,
  idealDrawn: false,
  generation: 0,
};

function inscribeVariation() {
  return state.inscribeVariation || 'square';
}

registerModeAPI('inscribe', {
  pickShape() {
    if (Math.random() < 0.25) {
      const balance = generateInscribeBalanceShape();
      if (balance) {
        const finalized = finalizeWithHoles(balance);
        if (finalized) return finalized;
      }
    }
    return generateShape({ noHoles: true, noSymmetry: true });
  },
  nudge(dx, dy) {
    if (inscribeState.confirmed) return;
    if (!inscribeState.points.length) return;
    const idx = inscribeState.dragIdx >= 0 ? inscribeState.dragIdx : inscribeState.points.length - 1;
    const p = inscribeState.points[idx];
    if (!p) return;
    const proj = projectToOutline({ x: p.x + dx, y: p.y + dy }, state.shape.outer);
    if (!proj) return;
    inscribeState.points[idx] = proj;
    renderInscribeLines();
    renderInscribePoints();
    updateActionButton();
  },
});

function inscribeN() {
  return inscribeVariation() === 'triangle' ? 3 : 4;
}

function shapeLabel(N) {
  return N === 3 ? 'Triangle' : 'Square';
}

function pickExistingPoint(p, grabR) {
  let idx = -1, bestD = grabR ?? POINT_GRAB_R;
  for (let i = 0; i < inscribeState.points.length; i++) {
    const d = Math.hypot(p.x - inscribeState.points[i].x, p.y - inscribeState.points[i].y);
    if (d < bestD) { bestD = d; idx = i; }
  }
  return idx;
}

function orderByCentroid(pts) {
  return orderedIndicesByCentroid(pts).map(i => pts[i]);
}

function orderedIndicesByCentroid(pts) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  const idxs = pts.map((_, i) => i);
  idxs.sort((a, b) =>
    Math.atan2(pts[a].y - cy, pts[a].x - cx) - Math.atan2(pts[b].y - cy, pts[b].x - cx)
  );
  return idxs;
}

function ngonEdges(pts, N) {
  const k = pts.length;
  if (k < 2) return [];
  const idxs = orderedIndicesByCentroid(pts);
  if (k >= N) {
    const out = [];
    for (let i = 0; i < N; i++) out.push([idxs[i], idxs[(i + 1) % N]]);
    return out;
  }
  if (N === 4 && k === 3) {
    const ordered = idxs.map(i => pts[i]);
    const edges = [[0, 1], [1, 2], [0, 2]];
    const lens = edges.map(([i, j]) =>
      Math.hypot(ordered[i].x - ordered[j].x, ordered[i].y - ordered[j].y)
    );
    let bestSkip = 0, bestDiff = Infinity;
    for (let s = 0; s < 3; s++) {
      const kept = [0, 1, 2].filter(x => x !== s);
      const d = Math.abs(lens[kept[0]] - lens[kept[1]]);
      if (d < bestDiff) { bestDiff = d; bestSkip = s; }
    }
    const out = [];
    for (let s = 0; s < 3; s++) {
      if (s === bestSkip) continue;
      out.push([idxs[edges[s][0]], idxs[edges[s][1]]]);
    }
    return out;
  }
  const out = [];
  for (let i = 0; i < k - 1; i++) out.push([idxs[i], idxs[i + 1]]);
  return out;
}

function pickInscribeLine(p, threshold) {
  const thr = threshold ?? LINE_GRAB_THRESHOLD;
  let bestD = thr, bestPair = null;
  const pts = inscribeState.points;
  for (const [i, j] of ngonEdges(pts, inscribeN())) {
    const pr = closestOnSegment(p, pts[i], pts[j]);
    const d = Math.hypot(p.x - pr.x, p.y - pr.y);
    if (d < bestD) { bestD = d; bestPair = [i, j]; }
  }
  return bestPair;
}

function translateInscribeLine(delta) {
  if (!inscribeState.dragLineIdxs || !inscribeState.dragInitialPoints) return;
  const [iA, iB] = inscribeState.dragLineIdxs;
  const [A0, B0] = inscribeState.dragInitialPoints;
  const dx = B0.x - A0.x, dy = B0.y - A0.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return;
  const ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux;
  const perpShift = delta.x * nx + delta.y * ny;
  const mx = (A0.x + B0.x) / 2 + nx * perpShift;
  const my = (A0.y + B0.y) / 2 + ny * perpShift;

  const outer = state.shape.outer;
  const ts = [];
  for (let i = 0, n = outer.length; i < n; i++) {
    const a = outer[i], b = outer[(i + 1) % n];
    const vx = b.x - a.x, vy = b.y - a.y;
    const denom = ux * (-vy) - uy * (-vx);
    if (Math.abs(denom) < 1e-9) continue;
    const tx = a.x - mx, ty = a.y - my;
    const t = (tx * (-vy) - ty * (-vx)) / denom;
    const s = (ux * ty - uy * tx) / denom;
    if (s >= -0.001 && s <= 1.001) ts.push(t);
  }
  if (ts.length < 2) return;

  const targetA = -L / 2, targetB = L / 2;
  let bestA = null, bestAd = Infinity;
  for (const t of ts) {
    const d = Math.abs(t - targetA);
    if (d < bestAd) { bestAd = d; bestA = t; }
  }
  let bestB = null, bestBd = Infinity;
  for (const t of ts) {
    if (bestA !== null && Math.abs(t - bestA) < 1e-6) continue;
    const d = Math.abs(t - targetB);
    if (d < bestBd) { bestBd = d; bestB = t; }
  }
  if (bestA === null || bestB === null) return;

  inscribeState.points[iA] = { x: mx + ux * bestA, y: my + uy * bestA };
  inscribeState.points[iB] = { x: mx + ux * bestB, y: my + uy * bestB };
}

const inscribeReset = makeModeReset({
  state: inscribeState,
  defaults: {
    points: [],
    hover: null,
    hoverRaw: null,
    dragIdx: -1,
    dragLineIdxs: null,
    dragInitialPoints: null,
    dragOrigin: null,
    confirmed: false,
    activePointerId: null,
    idealCorners: null,
    idealDrawn: false,
  },
  layers: [
    () => dom.inscribeLines,
    () => dom.inscribePoints,
    () => dom.inscribeHover,
    () => dom.inscribeIdeal,
  ],
  after() {
    inscribeState.generation++;
  },
});

setWorkerHandler('inscribe', (e) => {
  if (e.data.gen !== inscribeState.generation) return;
  inscribeState.idealCorners = e.data.corners;
  if (inscribeState.confirmed && e.data.corners && !inscribeState.idealDrawn) {
    drawIdealInscribe(e.data.corners);
    inscribeState.idealDrawn = true;
  }
});

function precomputeIdeal(outer) {
  inscribeState.idealCorners = null;
  const gen = ++inscribeState.generation;
  const w = ensureWorker('inscribe');
  if (w) w.postMessage({ outer, gen, N: inscribeN() });
}

function drawInscribeLine(a, b, cls = 'inscribe-line') {
  const ln = document.createElementNS(SVG_NS, 'line');
  ln.setAttribute('class', cls);
  ln.setAttribute('x1', a.x.toFixed(2));
  ln.setAttribute('y1', a.y.toFixed(2));
  ln.setAttribute('x2', b.x.toFixed(2));
  ln.setAttribute('y2', b.y.toFixed(2));
  return ln;
}

function drawInscribePoint(p, idx) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'inscribe-point');
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

function renderInscribeLines() {
  dom.inscribeLines.innerHTML = '';
  const pts = inscribeState.points;
  for (const [i, j] of ngonEdges(pts, inscribeN())) {
    dom.inscribeLines.appendChild(drawInscribeLine(pts[i], pts[j]));
  }
}

function renderInscribePoints() {
  dom.inscribePoints.innerHTML = '';
  inscribeState.points.forEach((p, i) => {
    dom.inscribePoints.appendChild(drawInscribePoint(p, i));
  });
}

function updateInscribeCursor(overGrabbable, dragging) {
  if (state.mode !== 'inscribe') { dom.hitPad.style.cursor = ''; return; }
  if (inscribeState.confirmed) { dom.hitPad.style.cursor = 'default'; return; }
  if (dragging) dom.hitPad.style.cursor = 'grabbing';
  else if (overGrabbable) dom.hitPad.style.cursor = 'grab';
  else if (inscribeState.points.length >= inscribeN()) dom.hitPad.style.cursor = 'default';
  else dom.hitPad.style.cursor = 'crosshair';
}

function isInscribeDragging() {
  return inscribeState.dragIdx >= 0 || !!inscribeState.dragLineIdxs;
}

function renderInscribeHover() {
  dom.inscribeHover.innerHTML = '';
  if (inscribeState.confirmed) return;
  const dragging = isInscribeDragging();
  const raw = inscribeState.hoverRaw;
  if (!raw) { updateInscribeCursor(false, dragging); return; }
  if (inscribeState.pointerType && inscribeState.pointerType !== 'mouse') return;
  const overExisting = pickExistingPoint(raw) >= 0;
  const overLine = !overExisting && pickInscribeLine(raw) !== null;
  updateInscribeCursor(overExisting || overLine, dragging);
  if (overExisting || overLine) return;
  if (inscribeState.points.length >= inscribeN()) return;
  if (!inscribeState.hover) return;
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', inscribeState.hover.x);
  c.setAttribute('cy', inscribeState.hover.y);
  c.setAttribute('r', 5);
  c.setAttribute('class', 'sp-hover');
  dom.inscribeHover.appendChild(c);
}

function renderInscribeAll() {
  renderInscribeLines();
  renderInscribePoints();
  renderInscribeHover();
  updateInscribeHint();
  updateActionButton();
}

function updateInscribeHint() {
  if (inscribeState.confirmed) return;
  const N = inscribeN();
  const n = inscribeState.points.length;
  const label = shapeLabel(N).toLowerCase();
  let msg;
  if (n === 0) msg = 'Tap on the outline to place your first point';
  else if (n < N) {
    const left = N - n;
    msg = `Place ${left} more point${left === 1 ? '' : 's'} — drag any point to adjust`;
  } else {
    msg = `${N} points set — press Confirm to score your ${label}`;
  }
  dom.scoreLine.innerHTML = `<div class="hint" id="hint">${msg}</div>`;
}

function fitRegularNgon(ordered, N) {
  let cx = 0, cy = 0;
  for (const p of ordered) { cx += p.x; cy += p.y; }
  cx /= N; cy /= N;
  let ax = 0, ay = 0;
  for (let k = 0; k < N; k++) {
    const zx = ordered[k].x - cx;
    const zy = ordered[k].y - cy;
    const ang = -2 * Math.PI * k / N;
    const c = Math.cos(ang), s = Math.sin(ang);
    ax += zx * c - zy * s;
    ay += zx * s + zy * c;
  }
  ax /= N; ay /= N;
  const corners = new Array(N);
  for (let k = 0; k < N; k++) {
    const ang = 2 * Math.PI * k / N;
    const c = Math.cos(ang), s = Math.sin(ang);
    corners[k] = { x: cx + ax * c - ay * s, y: cy + ax * s + ay * c };
  }
  let sse = 0;
  for (let k = 0; k < N; k++) {
    const dx = ordered[k].x - corners[k].x;
    const dy = ordered[k].y - corners[k].y;
    sse += dx * dx + dy * dy;
  }
  return { corners, ordered, center: { x: cx, y: cy }, R: Math.hypot(ax, ay), sse };
}

function computeIdealNgon(pts, N) {
  const base = orderByCentroid(pts);
  let best = null;
  for (let shift = 0; shift < N; shift++) {
    const cand = [];
    for (let k = 0; k < N; k++) cand.push(base[(shift + k) % N]);
    const fit = fitRegularNgon(cand, N);
    if (!best || fit.sse < best.sse) best = fit;
  }
  return best;
}

function evaluateNgon(pts, N) {
  const ideal = computeIdealNgon(pts, N);
  const o = ideal.ordered;
  const sides = [];
  for (let i = 0; i < N; i++) {
    sides.push(Math.hypot(o[i].x - o[(i + 1) % N].x, o[i].y - o[(i + 1) % N].y));
  }
  const meanSide = sides.reduce((s, x) => s + x, 0) / N;
  const angles = [];
  for (let i = 0; i < N; i++) {
    const a = o[(i + N - 1) % N], b = o[i], c = o[(i + 1) % N];
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const cos = (v1x * v2x + v1y * v2y) /
      (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
    angles.push(Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI);
  }
  const idealAngle = (N - 2) * 180 / N;
  const angleErr = angles.reduce((s, a) => s + Math.abs(idealAngle - a), 0) / N;
  const worstAngle = angles.reduce((worst, a) =>
    Math.abs(idealAngle - a) > Math.abs(idealAngle - worst) ? a : worst, angles[0]);
  let sumSq = 0;
  for (let i = 0; i < N; i++) {
    const dx = o[i].x - ideal.corners[i].x;
    const dy = o[i].y - ideal.corners[i].y;
    sumSq += dx * dx + dy * dy;
  }
  const rms = Math.sqrt(sumSq / N);
  const rel = meanSide > 0 ? rms / meanSide : 1;
  const score = Math.max(0, Math.min(100, (1 - rel * 2.2) * 100));
  const maxS = Math.max(...sides), minS = Math.min(...sides);
  const sideRatio = maxS > 0 ? minS / maxS : 0;
  return { ideal, sides, meanSide, angles, angleErr, worstAngle, rms, rel, score, sideRatio, idealAngle };
}

function drawIdealInscribe(corners) {
  dom.inscribeIdeal.innerHTML = '';
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'ideal-inscribe');
  const N = corners.length;
  for (let i = 0; i < N; i++) {
    const a = corners[i], b = corners[(i + 1) % N];
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
  dom.inscribeIdeal.appendChild(g);
  dom.inscribeIdeal.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => g.classList.add('show'));
  });
}

function showInscribeVerdict(res, N) {
  const perfectThreshold = N === 3 ? 98 : 95;
  let cls;
  if (res.score >= perfectThreshold) cls = 'perfect';
  else if (res.score >= 90)          cls = 'great';
  else if (res.score >= 75)          cls = 'good';
  else                               cls = 'fair';
  const label = shapeLabel(N);
  dom.scoreLine.innerHTML = `
    <div class="verdict ${cls}" id="verdict">${label}: ${res.score.toFixed(1)}%</div>
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

function computeInscribedSync(outer, N) {
  if (N === 4) return findInscribedSquare(outer, {
    N: 18, coarseIters: 22, topK: 40, refineIters: 260,
  });
  return findInscribedRegularNgon(outer, N, {
    Nsamp: 16, coarseIters: 16, topK: 30, refineIters: 180,
  });
}

function inscribeSnapshot() {
  return {
    points: inscribeState.points.map(p => ({ x: p.x, y: p.y })),
  };
}

function inscribeRestoreSnapshot(snap) {
  if (!snap || !Array.isArray(snap.points)) return;
  inscribeState.points = snap.points.map(p => ({ x: p.x, y: p.y }));
  renderInscribeAll();
}

function confirmInscribe(opts) {
  const replay = !!(opts && opts.replay);
  if (inscribeState.confirmed) return;
  const N = inscribeN();
  if (inscribeState.points.length !== N) return;
  inscribeState.confirmed = true;
  inscribeState.hover = null;
  dom.inscribeHover.innerHTML = '';
  const res = evaluateNgon(inscribeState.points, N);
  const inscribed = inscribeState.idealCorners || computeInscribedSync(state.shape.outer, N);
  if (inscribed) {
    inscribeState.idealCorners = inscribed;
    drawIdealInscribe(inscribed);
    inscribeState.idealDrawn = true;
  }
  showInscribeVerdict(res, N);
  const v = inscribeVariation();
  if (!replay) {
    recordInscribeScore(v, res.score);
    const winThreshold = v === 'triangle' ? 98 : 95;
    if (state.daily) {
      recordDailyResult('inscribe', v, inscribeSnapshot(), res.score >= winThreshold);
    }
    trackWithContext('game_complete', {
      score: +res.score.toFixed(2),
      score_metric: 'fit_percent',
      perfect: res.score >= winThreshold,
      hash: state.hash || null,
    });
  }
  state.locked = true;
  updateActionButton();
  if (!(state.daily && getTodayLock('inscribe', v))) {
    setTimeout(() => dom.newBtn.classList.add('pulse'), 900);
  }
}
