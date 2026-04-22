/* Edge samplers for the custom-shape codec (pen-tool model).
   Every edge between two anchors is a cubic bézier whose control points are
   the anchors' tangent offsets:
     p0 = anchor[i]
     p1 = anchor[i] + anchor[i].h2
     p2 = anchor[i+1] + anchor[i+1].h1
     p3 = anchor[i+1]
   A SMOOTH edge samples this bézier directly. Procedural edges (zigzag,
   scallop, stepped, bite, bump) use it as a base curve — the straight-chord
   sampler runs first, then each output point's perpendicular offset from the
   chord is re-projected onto the bézier's local normal, so any curvature the
   user drew carries through the ornament. ARC edges are a separate geometric
   primitive (circular arc) and ignore tangents.
   All samplers are pure: encode → decode → resample is exact. */

const EDGE_KIND = {
  SMOOTH: 0,
  ARC_OUT: 1,
  ARC_IN: 2,
  S_CURVE: 3,
  ZIGZAG: 4,
  SCALLOP_OUT: 5,
  SCALLOP_IN: 6,
  STEPPED: 7,
  BITE: 8,
  BUMP: 9,
};

const EDGE_KIND_COUNT = 10;

const EDGE_KIND_LABELS = [
  'Smooth', 'Arc out', 'Arc in', 'S-curve',
  'Zigzag', 'Scallop out', 'Scallop in', 'Stepped',
  'Bite', 'Bump',
];

// ─── Cubic bézier primitives ────────────────────────────────────────

function sampleCubicBezier(p0, p1, p2, p3, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({
      x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
      y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    });
  }
  return pts;
}

function _bezierAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const p = {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
  };
  const d = {
    x: 3*u*u*(p1.x - p0.x) + 6*u*t*(p2.x - p1.x) + 3*t*t*(p3.x - p2.x),
    y: 3*u*u*(p1.y - p0.y) + 6*u*t*(p2.y - p1.y) + 3*t*t*(p3.y - p2.y),
  };
  const dl = Math.hypot(d.x, d.y) || 1;
  // Perpendicular rotated 90° ccw (matches the chord-perp sign used by
  // straight-chord samplers below, so offset signs transfer correctly).
  return { p, perp: { x: -d.y / dl, y: d.x / dl } };
}

function _anchorControls(a, b) {
  return {
    p0: { x: a.x, y: a.y },
    p1: { x: a.x + (a.h2x || 0), y: a.y + (a.h2y || 0) },
    p2: { x: b.x + (b.h1x || 0), y: b.y + (b.h1y || 0) },
    p3: { x: b.x, y: b.y },
  };
}

// De Casteljau split of the cubic bezier at t. Returns both halves' control
// points + the split anchor. Used by the editor to insert a midpoint anchor
// into an existing SMOOTH edge without distorting the curve.
function splitCubicBezier(p0, p1, p2, p3, t) {
  const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const q0 = lerp(p0, p1, t);
  const q1 = lerp(p1, p2, t);
  const q2 = lerp(p2, p3, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const s = lerp(r0, r1, t);
  return { left: { p0, p1: q0, p2: r0, p3: s }, right: { p0: s, p1: r1, p2: q2, p3 } };
}

// ─── Straight-chord procedural samplers (pure, deterministic) ───────

function _straightLine(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function _inSign(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return (px * (CX - mx) + py * (CY - my)) > 0 ? 1 : -1;
}

function _straightZigzag(a, b, param01) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 30) return _straightLine(a, b, 6);
  const teeth = 2 + Math.round(param01 * 5);
  const ampFrac = 0.08 + param01 * 0.1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const outSign = -_inSign(a, b);
  const amp = Math.min(len * ampFrac, BASE_R * 0.18);
  const pts = [{ x: a.x, y: a.y }];
  for (let i = 0; i < teeth; i++) {
    const baseT = i / teeth;
    const peakT = (i + 0.5) / teeth;
    if (i > 0) pts.push({ x: a.x + dx * baseT, y: a.y + dy * baseT });
    pts.push({
      x: a.x + dx * peakT + px * amp * outSign,
      y: a.y + dy * peakT + py * amp * outSign,
    });
  }
  return pts;
}

function _straightScallop(a, b, sign, param01) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 40) return _straightLine(a, b, 6);
  const bumps = 2 + Math.round(param01 * 4);
  const bulgeFrac = 0.3 + param01 * 0.15;
  const px = -dy / len, py = dx / len;
  const inS = _inSign(a, b);
  const outSign = sign > 0 ? -inS : inS;
  const bulge = (len / bumps) * bulgeFrac * outSign;
  const pts = [{ x: a.x, y: a.y }];
  const arcN = 8;
  for (let i = 0; i < bumps; i++) {
    const t0 = i / bumps, t1 = (i + 1) / bumps;
    const a0x = a.x + dx * t0, a0y = a.y + dy * t0;
    const b0x = a.x + dx * t1, b0y = a.y + dy * t1;
    const mx2 = (a0x + b0x) / 2, my2 = (a0y + b0y) / 2;
    const cx_ = mx2 + px * bulge;
    const cy_ = my2 + py * bulge;
    for (let s = 1; s <= arcN; s++) {
      const t = s / arcN, u = 1 - t;
      pts.push({
        x: u * u * a0x + 2 * u * t * cx_ + t * t * b0x,
        y: u * u * a0y + 2 * u * t * cy_ + t * t * b0y,
      });
    }
  }
  return pts;
}

function _straightStepped(a, b, param01) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 40) return _straightLine(a, b, 6);
  const notches = 1 + Math.round(param01 * 3);
  const ampFrac = 0.06 + param01 * 0.08;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const outSign = -_inSign(a, b);
  const amp = Math.min(len * ampFrac, BASE_R * 0.14);
  const pts = [{ x: a.x, y: a.y }];
  const segCount = notches * 2;
  let raised = false;
  for (let i = 1; i <= segCount; i++) {
    const t = i / (segCount + 1);
    const bx = a.x + dx * t, by = a.y + dy * t;
    const prevOff = raised ? amp * outSign : 0;
    raised = !raised;
    const newOff = raised ? amp * outSign : 0;
    pts.push({ x: bx + px * prevOff, y: by + py * prevOff });
    pts.push({ x: bx + px * newOff, y: by + py * newOff });
  }
  return pts;
}

function _straightNotch(a, b, sign, param01) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 60) return _straightLine(a, b, 6);
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const inSign = _inSign(a, b);
  const r = Math.min(len * (0.10 + param01 * 0.12), BASE_R * 0.35);
  const tFrac = 0.5;
  const t1 = tFrac * len - r, t2 = tFrac * len + r;
  if (t1 < 6 || t2 > len - 6) return _straightLine(a, b, 6);
  const cx_ = a.x + ux * tFrac * len, cy_ = a.y + uy * tFrac * len;
  const dxn = (sign < 0 ? inSign : -inSign);
  const out = [];
  for (let k = 0; k < 4; k++) {
    const f = k / 4 * (t1 / len);
    out.push({ x: a.x + dx * f, y: a.y + dy * f });
  }
  out.push({ x: a.x + ux * t1, y: a.y + uy * t1 });
  const arcN = 18;
  for (let i = 1; i < arcN; i++) {
    const th = Math.PI * i / arcN;
    const c = Math.cos(th), s = Math.sin(th);
    out.push({
      x: cx_ + r * (-ux * c + dxn * px * s),
      y: cy_ + r * (-uy * c + dxn * py * s),
    });
  }
  out.push({ x: a.x + ux * t2, y: a.y + uy * t2 });
  for (let k = 1; k < 4; k++) {
    const f = t2 / len + (k / 4) * (1 - t2 / len);
    out.push({ x: a.x + dx * f, y: a.y + dy * f });
  }
  return out;
}

// Cubic S-curve along the chord with perpendicular amp that switches sign
// mid-segment. Param maps to signed amp magnitude: [0, 0.5) outward,
// [0.5, 1) inward, with 0.5 as the flat midpoint.
function _straightSCurve(a, b, param01) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const sign = param01 < 0.5 ? +1 : -1;
  const mag = Math.abs(param01 - 0.5) * 2;
  const amp = BASE_R * (0.1 + mag * 0.35) * sign;
  const c1 = { x: a.x + dx / 3 + px * amp, y: a.y + dy / 3 + py * amp };
  const c2 = { x: a.x + 2 * dx / 3 - px * amp, y: a.y + 2 * dy / 3 - py * amp };
  const out = [];
  const n = 24;
  for (let i = 0; i < n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u*u*u*a.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*b.x,
      y: u*u*u*a.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*b.y,
    });
  }
  return out;
}

function _straightForKind(a, b, kind, param01) {
  switch (kind) {
    case EDGE_KIND.S_CURVE: return _straightSCurve(a, b, param01);
    case EDGE_KIND.ZIGZAG: return _straightZigzag(a, b, param01);
    case EDGE_KIND.SCALLOP_OUT: return _straightScallop(a, b, +1, param01);
    case EDGE_KIND.SCALLOP_IN: return _straightScallop(a, b, -1, param01);
    case EDGE_KIND.STEPPED: return _straightStepped(a, b, param01);
    case EDGE_KIND.BITE: return _straightNotch(a, b, -1, param01);
    case EDGE_KIND.BUMP: return _straightNotch(a, b, +1, param01);
  }
  return _straightLine(a, b, 6);
}

// ─── Arc (circular, ignores tangents) ───────────────────────────────

function _sampleArc(a, b, sign, param01, n) {
  const offsetFrac = 0.28 + param01 * 0.42;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const chord = Math.hypot(dx, dy) || 1;
  const px = -dy / chord, py = dx / chord;
  const inwardSign = (px * (CX - mx) + py * (CY - my)) > 0 ? 1 : -1;
  const centerSide = sign > 0 ? inwardSign : -inwardSign;
  const offset = chord * offsetFrac;
  const acx = mx + px * centerSide * offset;
  const acy = my + py * centerSide * offset;
  const radius = Math.hypot(a.x - acx, a.y - acy);
  const sa = Math.atan2(a.y - acy, a.x - acx);
  const ea = Math.atan2(b.y - acy, b.x - acx);
  let delta = ea - sa;
  while (delta > Math.PI) delta -= TAU;
  while (delta < -Math.PI) delta += TAU;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const ang = sa + delta * t;
    out.push({ x: acx + Math.cos(ang) * radius, y: acy + Math.sin(ang) * radius });
  }
  return out;
}

// ─── Top-level edge sampler ─────────────────────────────────────────

function sampleEdge(a, b, edge) {
  const kind = edge ? edge.kind : EDGE_KIND.SMOOTH;
  const param = Math.max(0, Math.min(1, edge ? (edge.param || 0) : 0));
  const { p0, p1, p2, p3 } = _anchorControls(a, b);

  if (kind === EDGE_KIND.SMOOTH) return sampleCubicBezier(p0, p1, p2, p3, 20);
  if (kind === EDGE_KIND.ARC_OUT) return _sampleArc(p0, p3, +1, param, 22);
  if (kind === EDGE_KIND.ARC_IN) return _sampleArc(p0, p3, -1, param, 22);

  // Procedural modifier: run the straight-chord treatment, then rebend each
  // output point around the bézier curve by the same perpendicular offset.
  const straight = _straightForKind(p0, p3, kind, param);
  const chordDx = p3.x - p0.x, chordDy = p3.y - p0.y;
  const chordL2 = chordDx * chordDx + chordDy * chordDy;
  if (chordL2 < 1e-6) return [{ x: p0.x, y: p0.y }];
  const chordLen = Math.sqrt(chordL2);
  const chordPerpX = -chordDy / chordLen, chordPerpY = chordDx / chordLen;

  const pts = [];
  for (const sp of straight) {
    const lx = sp.x - p0.x, ly = sp.y - p0.y;
    const t = Math.max(0, Math.min(1, (lx * chordDx + ly * chordDy) / chordL2));
    const offset = lx * chordPerpX + ly * chordPerpY;
    const { p, perp } = _bezierAt(p0, p1, p2, p3, t);
    pts.push({ x: p.x + perp.x * offset, y: p.y + perp.y * offset });
  }
  return pts;
}

// ─── Hole primitives (deterministic) ────────────────────────────────

function buildCircleHole(cx, cy, r) {
  const n = Math.max(24, Math.min(56, Math.round(r * 1.1)));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU;
    pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
  }
  return pts;
}

function buildLensHole(cx, cy, len, ang, bulge) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const px = -dy, py = dx;
  const a = { x: cx - dx * len / 2, y: cy - dy * len / 2 };
  const b = { x: cx + dx * len / 2, y: cy + dy * len / 2 };
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const c1 = { x: mx + px * bulge, y: my + py * bulge };
  const c2 = { x: mx - px * bulge, y: my - py * bulge };
  const pts = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({
      x: u * u * a.x + 2 * u * t * c1.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c1.y + t * t * b.y,
    });
  }
  for (let i = 0; i < n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({
      x: u * u * b.x + 2 * u * t * c2.x + t * t * a.x,
      y: u * u * b.y + 2 * u * t * c2.y + t * t * a.y,
    });
  }
  return pts;
}

// ─── K-fold expansion ───────────────────────────────────────────────
// Anchors are stored in sector space (one slice of angle 2π/k). Expansion
// replicates them k times around board centre, also rotating each anchor's
// tangent offsets so curves transform consistently.

function _rotVec(x, y, ca, sa) {
  return { x: x * ca - y * sa, y: x * sa + y * ca };
}

function expandKFold(anchors, edges, k) {
  if (k <= 1) return { anchors: anchors.slice(), edges: edges.slice() };
  const foldAngle = TAU / k;
  const outA = [], outE = [];
  for (let j = 0; j < k; j++) {
    const rot = j * foldAngle;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const dx = a.x - CX, dy = a.y - CY;
      const r1 = _rotVec(a.h1x || 0, a.h1y || 0, ca, sa);
      const r2 = _rotVec(a.h2x || 0, a.h2y || 0, ca, sa);
      outA.push({
        x: CX + dx * ca - dy * sa,
        y: CY + dx * sa + dy * ca,
        h1x: r1.x, h1y: r1.y,
        h2x: r2.x, h2y: r2.y,
      });
      outE.push(edges[i] || { kind: EDGE_KIND.SMOOTH, param: 0 });
    }
  }
  return { anchors: outA, edges: outE };
}

function buildPolyFromAnchors(anchors, edges) {
  const n = anchors.length;
  if (n < 3) return anchors.map(a => ({ x: a.x, y: a.y }));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const seg = sampleEdge(anchors[i], anchors[(i + 1) % n], edges[i]);
    for (const p of seg) pts.push(p);
  }
  return pts;
}

// ─── Bite-carve (circle that straddles the outer) ──────────────────
// Inlined here so the editor and the codec don't need shape-holes.js.
// Matches shape-holes.js#mergeBiteIntoOuter; the generator has its own copy
// for the random-shape pipeline. Kept pure (no Math.random).

function _dedupRingLocal(pts) {
  const out = [];
  for (const p of pts) {
    if (out.length) {
      const q = out[out.length - 1];
      if (Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01) continue;
    }
    out.push(p);
  }
  while (out.length >= 2) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) out.pop();
    else break;
  }
  return out;
}

function _mergeBiteIntoOuter(outer, biteClipped, biteArea) {
  const eps = 1.5;
  const H = biteClipped.length;
  if (H < 3) return null;
  const locs = biteClipped.map(p => locateOnPolygonBoundary(p, outer, eps));
  const onB = locs.map(l => l !== null);
  if (!onB.some(b => b) || onB.every(b => b)) return null;

  let runStart = -1, runEnd = -1;
  for (let i = 0; i < H; i++) {
    if (onB[i] && !onB[(i + 1) % H]) {
      runStart = (i + 1) % H;
      let k = runStart;
      while (!onB[(k + 1) % H]) {
        k = (k + 1) % H;
        if (k === runStart) break;
      }
      runEnd = k;
      break;
    }
  }
  if (runStart < 0) return null;

  let after = (runEnd + 1) % H;
  while (after !== runStart) {
    if (!onB[after]) return null;
    after = (after + 1) % H;
  }

  const boundaryBefore = biteClipped[(runStart - 1 + H) % H];
  const boundaryAfter = biteClipped[(runEnd + 1) % H];
  const interiorCurve = [boundaryBefore];
  let k = runStart;
  while (true) {
    interiorCurve.push(biteClipped[k]);
    if (k === runEnd) break;
    k = (k + 1) % H;
  }
  interiorCurve.push(boundaryAfter);

  const locStart = locateOnPolygonBoundary(boundaryBefore, outer, eps * 2);
  const locEnd = locateOnPolygonBoundary(boundaryAfter, outer, eps * 2);
  if (!locStart || !locEnd) return null;

  const trySplice = (walkDir) => {
    const outerPath = walkPolygonBetween(outer, locStart, locEnd, walkDir);
    if (!outerPath.length) return null;
    const merged = [locStart.point];
    for (const p of outerPath) merged.push(p);
    merged.push(locEnd.point);
    for (let i = interiorCurve.length - 2; i >= 1; i--) merged.push(interiorCurve[i]);
    const dedup = _dedupRingLocal(merged);
    return dedup.length >= 3 ? dedup : null;
  };

  const s1 = trySplice(1);
  const s2 = trySplice(-1);
  const s1Ok = s1 && isSimplePolygon(s1);
  const s2Ok = s2 && isSimplePolygon(s2);
  if (!s1Ok && !s2Ok) return null;
  if (!s1Ok) return s2;
  if (!s2Ok) return s1;
  const expected = polygonArea(outer) - biteArea;
  const d1 = Math.abs(polygonArea(s1) - expected);
  const d2 = Math.abs(polygonArea(s2) - expected);
  return d1 < d2 ? s1 : s2;
}

function biteCircleIntoOuter(outer, cx, cy, r) {
  const circle = buildCircleHole(cx, cy, r);
  let anyInside = false, anyOutside = false;
  for (const p of circle) {
    if (pointInPolygon(p, outer)) anyInside = true;
    else anyOutside = true;
    if (anyInside && anyOutside) break;
  }
  if (!anyInside) return { outer, consumed: true };           // dropped
  if (!anyOutside) return { outer, consumed: false };         // regular hole

  const clipped = intersectPolygonWithConvex(outer, circle);
  if (!clipped || clipped.length < 3) return { outer, consumed: false };
  const biteArea = polygonArea(clipped);
  const merged = _mergeBiteIntoOuter(outer, clipped, biteArea);
  if (!merged) return { outer, consumed: false };
  return { outer: merged, consumed: true };
}
