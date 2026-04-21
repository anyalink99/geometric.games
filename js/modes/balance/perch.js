const TIP_PT  = { x: 200, y: 420 };
const BASE_L_PT = { x: 120, y: 480 };
const BASE_R_PT = { x: 280, y: 480 };

const PYR_EDGES = [
  { a: TIP_PT,    nx: -0.6, ny: -0.8 },
  { a: BASE_L_PT, nx:  0,   ny:  1   },
  { a: BASE_R_PT, nx:  0.6, ny: -0.8 },
];

const PERCH_VIEW  = { x0: -60, y0: -80, x1: 460, y1: 480 };
const PERCH_VIEW_PAD = 2;
const TIP_TOUCH_EPS = 0.6;
const TIP_SNAP_DIST = 7;
const HANDLE_R = 11;
const HANDLE_GAP = 22;
function perchHandleR() { return isCoarsePointer() ? HANDLE_R * 2 : HANDLE_R; }
function perchHandleIconR() { return isCoarsePointer() ? 10.4 : 5.2; }
const perchState = {
  pivot: null,
  tx: 0, ty: 0, theta: 0,
  confirmed: false,
  touched: false,
  drag: null,
  animFrame: 0,
};

const perchReset = makeModeReset({
  state: perchState,
  defaults: () => ({
    pivot: null,
    tx: 0, ty: 0, theta: 0,
    confirmed: false,
    touched: false,
    drag: null,
  }),
  layers: [
    () => document.getElementById('pyramid-layer'),
    () => document.getElementById('handle-layer'),
  ],
  after() {
    if (perchState.animFrame) {
      cancelAnimationFrame(perchState.animFrame);
      perchState.animFrame = 0;
    }
    const outer = dom.shapeLayer.firstElementChild;
    if (outer) {
      outer.classList.remove('dragging', 'locked');
      const inner = outer.firstElementChild;
      if (inner && inner.tagName === 'g') inner.removeAttribute('transform');
    }
  },
});

function perchRotPoint(p, cx, cy, th) {
  const c = Math.cos(th), s = Math.sin(th);
  const dx = p.x - cx, dy = p.y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

function perchToWorld(p) {
  const r = perchRotPoint(p, perchState.pivot.x, perchState.pivot.y, perchState.theta);
  return { x: r.x + perchState.tx, y: r.y + perchState.ty };
}

function perchWorldOuter() { return state.shape.outer.map(perchToWorld); }
function perchWorldHoles() { return (state.shape.holes || []).map(h => h.map(perchToWorld)); }
function perchWorldPivot() { return { x: perchState.pivot.x + perchState.tx, y: perchState.pivot.y + perchState.ty }; }

function perchSegClosest(p, a, b) {
  const ex = b.x - a.x, ey = b.y - a.y;
  const l2 = ex * ex + ey * ey;
  let t = l2 > 0 ? ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return { x: a.x + t * ex, y: a.y + t * ey };
}

function perchPointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const vi = poly[i], vj = poly[j];
    if (((vi.y > p.y) !== (vj.y > p.y)) &&
        (p.x < (vj.x - vi.x) * (p.y - vi.y) / (vj.y - vi.y) + vi.x)) {
      inside = !inside;
    }
  }
  return inside;
}

function perchNearestBoundary(q, poly) {
  let bestD = Infinity, bx = 0, by = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = perchSegClosest(q, a, b);
    const dx = q.x - c.x, dy = q.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; bx = c.x; by = c.y; }
  }
  return { d: bestD, cx: bx, cy: by };
}

function perchResolve() {
  for (let iter = 0; iter < 14; iter++) {
    const verts = perchWorldOuter();
    let best = null;

    for (const p of verts) {
      let maxSd = -Infinity, bestE = null, allInside = true;
      for (const e of PYR_EDGES) {
        const sd = (p.x - e.a.x) * e.nx + (p.y - e.a.y) * e.ny;
        if (sd > 0) { allInside = false; break; }
        if (sd > maxSd) { maxSd = sd; bestE = e; }
      }
      if (allInside && bestE) {
        const depth = -maxSd;
        if (!best || depth > best.mag) {
          best = { x: bestE.nx * depth, y: bestE.ny * depth, mag: depth };
        }
      }
    }

    for (const q of [TIP_PT, BASE_L_PT, BASE_R_PT]) {
      if (perchPointInPoly(q, verts)) {
        const nb = perchNearestBoundary(q, verts);
        if (!best || nb.d > best.mag) {
          best = { x: q.x - nb.cx, y: q.y - nb.cy, mag: nb.d };
        }
      }
    }

    const lo = PERCH_VIEW.x0 + PERCH_VIEW_PAD;
    const hi = PERCH_VIEW.x1 - PERCH_VIEW_PAD;
    const top = PERCH_VIEW.y0 + PERCH_VIEW_PAD;
    const bot = PERCH_VIEW.y1 - PERCH_VIEW_PAD;
    for (const p of verts) {
      if (p.x < lo) {
        const depth = lo - p.x;
        if (!best || depth > best.mag) best = { x: depth, y: 0, mag: depth };
      }
      if (p.x > hi) {
        const depth = p.x - hi;
        if (!best || depth > best.mag) best = { x: -depth, y: 0, mag: depth };
      }
      if (p.y < top) {
        const depth = top - p.y;
        if (!best || depth > best.mag) best = { x: 0, y: depth, mag: depth };
      }
      if (p.y > bot) {
        const depth = p.y - bot;
        if (!best || depth > best.mag) best = { x: 0, y: -depth, mag: depth };
      }
    }

    if (!best || best.mag < 0.01) return true;
    perchState.tx += best.x * 1.02;
    perchState.ty += best.y * 1.02;
  }
  return false;
}

function trySnapToTip() {
  const outerW = perchWorldOuter();
  if (perchPointInPoly(TIP_PT, outerW)) return;
  const nb = perchNearestBoundary(TIP_PT, outerW);
  if (nb.d <= TIP_TOUCH_EPS || nb.d > TIP_SNAP_DIST) return;
  const saveTx = perchState.tx, saveTy = perchState.ty;
  perchState.tx += (TIP_PT.x - nb.cx);
  perchState.ty += (TIP_PT.y - nb.cy);
  if (perchResolve() && perchHandleFits() && isTouchingTip()) return;
  perchState.tx = saveTx;
  perchState.ty = saveTy;
}

function perchShapeBoundingRadius() {
  let br = 0;
  for (const p of state.shape.outer) {
    const dx = p.x - perchState.pivot.x, dy = p.y - perchState.pivot.y;
    const d = Math.hypot(dx, dy);
    if (d > br) br = d;
  }
  return br;
}

function perchComputeHandlePos() {
  const wc = perchWorldPivot();
  const R = perchShapeBoundingRadius() + HANDLE_GAP;
  const pad = perchHandleR() + 7;
  const baseDirs = [[0, -1], [1, 0], [-1, 0], [0, 1]];
  const a = 10 * Math.PI / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const dirs = baseDirs.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]);
  for (const [dx, dy] of dirs) {
    const hx = wc.x + dx * R, hy = wc.y + dy * R;
    if (hx >= PERCH_VIEW.x0 + pad && hx <= PERCH_VIEW.x1 - pad &&
        hy >= PERCH_VIEW.y0 + pad && hy <= PERCH_VIEW.y1 - pad) {
      return { hx, hy, ok: true };
    }
  }
  return { hx: wc.x, hy: wc.y - R, ok: false };
}

function perchHandleFits() { return perchComputeHandlePos().ok; }

function drawPyramid() {
  const layer = document.getElementById('pyramid-layer');
  layer.innerHTML = '';
  const poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('points',
    `${TIP_PT.x},${TIP_PT.y} ${BASE_L_PT.x},${BASE_L_PT.y} ${BASE_R_PT.x},${BASE_R_PT.y}`);
  poly.setAttribute('class', 'pyramid-fill');
  layer.appendChild(poly);
  const tip = document.createElementNS(SVG_NS, 'circle');
  tip.setAttribute('cx', TIP_PT.x);
  tip.setAttribute('cy', TIP_PT.y);
  tip.setAttribute('r', 2.6);
  tip.setAttribute('class', 'perch-tip');
  layer.appendChild(tip);
}

function perchContentG() {
  const outer = dom.shapeLayer.firstElementChild;
  return outer && outer.firstElementChild && outer.firstElementChild.tagName === 'g'
    ? outer.firstElementChild
    : null;
}

function updateShapeTransform() {
  const inner = perchContentG();
  if (!inner) return;
  const c = perchState.pivot;
  inner.setAttribute(
    'transform',
    `translate(${perchState.tx} ${perchState.ty}) rotate(${perchState.theta * 180 / Math.PI} ${c.x} ${c.y})`
  );
  const outer = dom.shapeLayer.firstElementChild;
  if (perchState.confirmed) outer.classList.add('locked');
  else outer.classList.remove('locked');
}

function buildHandle() {
  const layer = document.getElementById('handle-layer');
  layer.innerHTML = '';
  const g = document.createElementNS(SVG_NS, 'g');
  const circ = document.createElementNS(SVG_NS, 'circle');
  circ.setAttribute('r', perchHandleR());
  circ.setAttribute('class', 'rot-handle');
  circ.addEventListener('pointerdown', onHandlePointerDown);
  g.appendChild(circ);
  const icon = document.createElementNS(SVG_NS, 'path');
  icon.setAttribute('class', 'rot-handle-icon');
  g.appendChild(icon);
  layer.appendChild(g);
  updateHandlePos();
}

function updateHandlePos() {
  const layer = document.getElementById('handle-layer');
  const g = layer && layer.firstElementChild;
  if (!g) return;
  const hidden = perchState.confirmed || (perchState.drag && perchState.drag.type === 'rot');
  g.style.display = hidden ? 'none' : '';
  if (hidden) return;
  const { hx, hy } = perchComputeHandlePos();
  const circ = g.firstElementChild;
  const icon = g.lastElementChild;
  circ.setAttribute('cx', hx);
  circ.setAttribute('cy', hy);
  circ.setAttribute('r', perchHandleR());
  const r = perchHandleIconR();
  const tick = r / 5.2 * 2.5;
  icon.setAttribute('d',
    `M ${hx - r} ${hy} A ${r} ${r} 0 1 1 ${hx + r} ${hy}` +
    `M ${hx + r - tick} ${hy - tick} L ${hx + r} ${hy} L ${hx + r + tick} ${hy - tick}`
  );
}

function onShapePointerDown(e) {
  if (perchState.confirmed) return;
  const pt = svgPoint(e);
  perchState.drag = {
    type: 'body',
    pointerId: e.pointerId,
    startPx: pt.x, startPy: pt.y,
    startTx: perchState.tx, startTy: perchState.ty,
  };
  try { dom.svg.setPointerCapture(e.pointerId); } catch (_) {}
  dom.shapeLayer.firstElementChild?.classList.add('dragging');
  if (!perchState.touched) { perchState.touched = true; updateActionButton(); }
  e.stopPropagation();
  e.preventDefault();
}

function onHandlePointerDown(e) {
  if (perchState.confirmed) return;
  const pt = svgPoint(e);
  const wc = perchWorldPivot();
  perchState.drag = {
    type: 'rot',
    pointerId: e.pointerId,
    startAng: Math.atan2(pt.y - wc.y, pt.x - wc.x),
    startTheta: perchState.theta,
  };
  try { dom.svg.setPointerCapture(e.pointerId); } catch (_) {}
  e.currentTarget.classList.add('dragging');
  updateHandlePos();
  if (!perchState.touched) { perchState.touched = true; updateActionButton(); }
  e.stopPropagation();
  e.preventDefault();
}

function onPerchPointerMove(e) {
  const d = perchState.drag;
  if (!d || e.pointerId !== d.pointerId) return;
  const pt = svgPoint(e);
  if (d.type === 'body') {
    const prevTx = perchState.tx, prevTy = perchState.ty;
    perchState.tx = d.startTx + (pt.x - d.startPx);
    perchState.ty = d.startTy + (pt.y - d.startPy);
    if (!perchResolve() || !perchHandleFits()) {
      perchState.tx = prevTx;
      perchState.ty = prevTy;
    } else {
      trySnapToTip();
    }
  } else {
    const wc = perchWorldPivot();
    const cur = Math.atan2(pt.y - wc.y, pt.x - wc.x);
    const prevTheta = perchState.theta;
    perchState.theta = d.startTheta + (cur - d.startAng);
    if (!perchResolve()) perchState.theta = prevTheta;
  }
  updateShapeTransform();
  updateHandlePos();
}

function onPerchPointerUp(e) {
  const d = perchState.drag;
  if (!d || e.pointerId !== d.pointerId) return;
  try { dom.svg.releasePointerCapture(e.pointerId); } catch (_) {}
  dom.shapeLayer.firstElementChild?.classList.remove('dragging');
  const handleEl = document.querySelector('#handle-layer .rot-handle');
  handleEl?.classList.remove('dragging');
  perchState.drag = null;
  updateHandlePos();
}

function onPerchShapeReady() {
  perchState.pivot = polygonCentroid(state.shape.outer);
  perchState.tx = 0;
  perchState.ty = 0;
  perchState.theta = 0;
  perchState.confirmed = false;
  perchState.drag = null;
  drawPyramid();

  const outer = dom.shapeLayer.firstElementChild;
  if (outer) {
    const inner = document.createElementNS(SVG_NS, 'g');
    while (outer.firstChild) inner.appendChild(outer.firstChild);
    outer.appendChild(inner);
    outer.addEventListener('pointerdown', onShapePointerDown);
  }
  updateShapeTransform();
  buildHandle();
}

function updatePerchHint() {
  if (perchState.confirmed) return;
  dom.scoreLine.innerHTML = `<div class="hint" id="hint">Drag the shape onto the pyramid tip. Use the purple handle to rotate.</div>`;
}

function isTouchingTip() {
  const outerW = perchWorldOuter();
  if (perchPointInPoly(TIP_PT, outerW)) {
    for (const h of perchWorldHoles()) {
      if (perchPointInPoly(TIP_PT, h)) return false;
    }
    return true;
  }
  const nb = perchNearestBoundary(TIP_PT, outerW);
  return nb.d <= TIP_TOUCH_EPS;
}

function perchSnapshot() {
  return { tx: perchState.tx, ty: perchState.ty, theta: perchState.theta };
}

function perchRestoreSnapshot(snap) {
  if (!snap) return;
  perchState.tx = +snap.tx || 0;
  perchState.ty = +snap.ty || 0;
  perchState.theta = +snap.theta || 0;
  updateShapeTransform();
  updateHandlePos();
}

function showPerchVerdict(dx, tipped) {
  const abs = Math.abs(dx);
  const cls = tipped ? 'fair' : 'perfect';
  const side = dx < 0 ? 'left' : 'right';
  const amount = abs.toFixed(1);
  let text;
  if (tipped) text = `Tipped — off to the ${side} by ${amount}`;
  else if (abs < 0.05) text = 'Perfect balance!';
  else text = `Balanced — off to the ${side} by ${amount}`;
  dom.scoreLine.innerHTML = `<div class="verdict ${cls}" id="verdict">${text}</div>`;
  const v = document.getElementById('verdict');
  v.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => v.classList.add('show'));
  });
}

function confirmPerch(opts) {
  const replay = !!(opts && opts.replay);
  if (perchState.confirmed) return;
  if (!isTouchingTip()) {
    dom.scoreLine.innerHTML = `<div class="hint" id="hint">The shape must touch the pyramid tip.</div>`;
    return;
  }

  const bakedOuter = perchWorldOuter();
  const bakedHoles = perchWorldHoles();
  const bakedShape = { outer: bakedOuter, holes: bakedHoles };
  const inner = perchContentG();
  if (inner) {
    inner.removeAttribute('transform');
    const fill = inner.querySelector('.shape-fill');
    const outline = inner.querySelector('.shape-outline');
    if (fill) fill.setAttribute('d', shapeToPath(bakedShape));
    if (outline) {
      let d = pointsToPath(bakedShape.outer);
      for (const h of bakedShape.holes) if (h.length) d += ' ' + pointsToPath(h);
      outline.setAttribute('d', d);
    }
  }

  perchState.confirmed = true;
  const actual = shapeCentroid(bakedShape);
  const dx = actual.x - TIP_PT.x;
  const absDx = Math.abs(dx);
  const tipped = absDx > BALANCE_PERFECT_THRESHOLD;

  if (!replay) {
    recordBalanceDist('perch', absDx);
    if (state.daily) {
      recordDailyResult('balance', 'perch', perchSnapshot(), !tipped);
    }
    trackWithContext('game_complete', {
      score: +absDx.toFixed(2),
      score_metric: 'distance_px',
      perfect: !tipped,
      hash: state.hash || null,
    });
  }

  showPerchVerdict(dx, tipped);
  state.locked = true;
  updateHandlePos();
  updateActionButton();
  if (tipped) runPerchFall(bakedOuter, actual);
  else        runPerchSway(actual);
}

dom.svg.addEventListener('pointermove', onPerchPointerMove);
dom.svg.addEventListener('pointerup', onPerchPointerUp);
dom.svg.addEventListener('pointercancel', onPerchPointerUp);

function runPerchSway(centroid) {
  const g = perchContentG();
  if (!g) return;
  runBodySway({
    shapeG: g, centroid,
    pivotX: TIP_PT.x, pivotY: TIP_PT.y,
    setAnimFrame: f => { perchState.animFrame = f; },
    onStop: () => maybePulseNewBtn(400),
  });
}

function runPerchFall(bakedOuter, centroid) {
  const g = perchContentG();
  if (!g) return;

  runBodyFall({
    outer: bakedOuter,
    centroid, shapeG: g,
    setAnimFrame: f => { perchState.animFrame = f; },
    onStop: () => maybePulseNewBtn(400),
    collectObstacleContacts(contacts, body) {
      for (let i = 0; i < body.outerN; i++) {
        const p = bodyWorldVert(body, i);
        let maxSd = -Infinity, bestE = null, allInside = true;
        for (const e of PYR_EDGES) {
          const sd = (p.x - e.a.x) * e.nx + (p.y - e.a.y) * e.ny;
          if (sd > 0) { allInside = false; break; }
          if (sd > maxSd) { maxSd = sd; bestE = e; }
        }
        if (allInside && bestE) {
          const depth = -maxSd;
          contacts.push({
            px: p.x + bestE.nx * depth,
            py: p.y + bestE.ny * depth,
            nx: bestE.nx, ny: bestE.ny, depth,
          });
        }
      }
      for (const corner of [TIP_PT, BASE_L_PT, BASE_R_PT]) {
        const local = bodyWorldToLocal(body, corner);
        if (!bodyPointInLocalPoly(body, local)) continue;
        const near = bodyNearestEdgeLocal(body, local);
        if (near.depth < 1e-6) continue;
        const wn = bodyRotateByTheta(body, near.nx, near.ny);
        const mu = corner === TIP_PT ? 10.0 : 2.0;
        contacts.push({ px: corner.x, py: corner.y, nx: -wn.x, ny: -wn.y, depth: near.depth, mu });
      }
    },
  });
}
