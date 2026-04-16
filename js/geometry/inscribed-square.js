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
  const B2 = projectToOutline(B, outer);
  const D2 = projectToOutline(D, outer);
  return { corners: [A, B2, C, D2], side: diag / Math.SQRT2 };
}

function findInscribedSquare(outer, opts) {
  const N = (opts && opts.N) || 24;
  const coarseIters = (opts && opts.coarseIters) || 35;
  const topK = (opts && opts.topK) || 80;
  const refineIters = (opts && opts.refineIters) || 400;
  const MAX_COST = 200;
  const param = buildOutlineParam(outer);
  const coarse = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (Math.abs(i - j) < 2) continue;
      coarse.push(diagOptimize(i / N, j / N, param, outer, coarseIters));
    }
  }
  coarse.sort((a, b) => a.cost - b.cost);
  let best = null;
  for (const c of coarse.slice(0, topK)) {
    const r = diagOptimize(c.tA, c.tC, param, outer, refineIters);
    if (r.cost > MAX_COST) continue;
    const v = diagValidate(r.tA, r.tC, param, outer);
    if (!v) continue;
    if (!best || v.side > best.side) best = v;
  }
  return best ? best.corners : null;
}
