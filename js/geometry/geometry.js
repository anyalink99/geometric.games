function polygonArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function polygonCentroid(pts) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    a += f; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-6) {
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; }
    return { x: sx / pts.length, y: sy / pts.length };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function pointInPolygon(pt, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function segIntersectCount(a, b, poly) {
  let count = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const c = poly[i], d = poly[(i + 1) % n];
    const r1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const r2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
    const r3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
    const r4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
    if (((r1 > 0) !== (r2 > 0)) && ((r3 > 0) !== (r4 > 0))) count++;
  }
  return count;
}

function clipHalfPlane(pts, nx, ny, c) {
  const out = [];
  const n = pts.length;
  if (!n) return out;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const da = nx * a.x + ny * a.y + c;
    const db = nx * b.x + ny * b.y + c;
    const aIn = da >= 0, bIn = db >= 0;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = da / (da - db);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

function pointsToPath(pts) {
  if (!pts.length) return '';
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
  return d + ' Z';
}

function shapeToPath(shape) {
  let d = pointsToPath(shape.outer);
  for (const h of shape.holes) if (h.length) d += ' ' + pointsToPath(h);
  return d;
}

function shapeArea(shape) {
  let a = polygonArea(shape.outer);
  for (const h of shape.holes) a -= polygonArea(h);
  return a;
}

function distPointToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function shapeCentroid(shape) {
  const aOuter = polygonArea(shape.outer);
  const cOuter = polygonCentroid(shape.outer);
  let totalArea = aOuter;
  let cx = aOuter * cOuter.x;
  let cy = aOuter * cOuter.y;
  for (const h of shape.holes) {
    const a = polygonArea(h);
    const c = polygonCentroid(h);
    totalArea -= a;
    cx -= a * c.x;
    cy -= a * c.y;
  }
  if (totalArea < 1e-6) return { x: CX, y: CY };
  return { x: cx / totalArea, y: cy / totalArea };
}

function distPointToPolygon(p, pts) {
  let m = Infinity;
  for (let i = 0, n = pts.length; i < n; i++) {
    const d = distPointToSegment(p, pts[i], pts[(i + 1) % n]);
    if (d < m) m = d;
  }
  return m;
}

function intersectPolygonWithConvex(subject, convex) {
  if (!subject || subject.length < 3 || !convex || convex.length < 3) return [];
  let cx = 0, cy = 0;
  for (const p of convex) { cx += p.x; cy += p.y; }
  cx /= convex.length; cy /= convex.length;

  let result = subject.slice();
  for (let i = 0, n = convex.length; i < n; i++) {
    const a = convex[i], b = convex[(i + 1) % n];
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    let c = -(nx * a.x + ny * a.y);
    if (nx * cx + ny * cy + c < 0) { nx = -nx; ny = -ny; c = -c; }
    result = clipHalfPlane(result, nx, ny, c);
    if (!result.length) return [];
  }
  return result;
}

function locateOnPolygonBoundary(p, polygon, eps = 0.8) {
  let best = null, bestDist = eps;
  for (let i = 0, n = polygon.length; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) continue;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < bestDist) {
      best = { edge: i, t, point: { x: px, y: py } };
      bestDist = d;
    }
  }
  return best;
}

function walkPolygonBetween(polygon, locStart, locEnd, dir) {
  const N = polygon.length;
  const result = [];
  if (dir === 1) {
    if (locStart.edge === locEnd.edge && locEnd.t >= locStart.t) return [];
    let idx = (locStart.edge + 1) % N;
    const stopIdx = (locEnd.edge + 1) % N;
    for (let s = 0; s < N + 1; s++) {
      result.push(polygon[idx]);
      idx = (idx + 1) % N;
      if (idx === stopIdx) break;
    }
  } else {
    if (locStart.edge === locEnd.edge && locEnd.t <= locStart.t) return [];
    let idx = locStart.edge;
    const stopIdx = locEnd.edge;
    for (let s = 0; s < N + 1; s++) {
      result.push(polygon[idx]);
      idx = (idx - 1 + N) % N;
      if (idx === stopIdx) break;
    }
  }
  return result;
}

function _dedupRing(pts) {
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

function _spliceInteriorCurve(currentOuter, interiorCurve, eps) {
  const locStart = locateOnPolygonBoundary(interiorCurve[0], currentOuter, eps);
  const locEnd = locateOnPolygonBoundary(interiorCurve[interiorCurve.length - 1], currentOuter, eps);
  if (!locStart || !locEnd) return null;

  const lens = [];
  let totalPerim = 0;
  for (let i = 0, n = currentOuter.length; i < n; i++) {
    const a = currentOuter[i], b = currentOuter[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(l);
    totalPerim += l;
  }
  if (totalPerim < 1e-6) return null;
  const perimPos = (loc) => {
    let s = 0;
    for (let i = 0; i < loc.edge; i++) s += lens[i];
    return s + loc.t * lens[loc.edge];
  };
  const pS = perimPos(locStart), pE = perimPos(locEnd);
  const forwardDist = ((pE - pS) % totalPerim + totalPerim) % totalPerim;
  const contactDir = forwardDist < totalPerim / 2 ? 1 : -1;
  const walkDir = -contactDir;
  const outerPath = walkPolygonBetween(currentOuter, locStart, locEnd, walkDir);

  const merged = [];
  merged.push(locStart.point);
  for (const p of outerPath) merged.push(p);
  merged.push(locEnd.point);
  for (let i = interiorCurve.length - 2; i >= 1; i--) merged.push(interiorCurve[i]);

  const dedup = _dedupRing(merged);
  if (dedup.length < 3) return null;
  return dedup;
}

function mergeBoundaryHoleIntoOuter(outer, hole, eps = 1.5) {
  const H = hole.length;
  if (H < 3) return { merged: null, leftover: hole };

  const locs = hole.map(p => locateOnPolygonBoundary(p, outer, eps));
  const onBoundary = locs.map(l => l !== null);

  const anyOn = onBoundary.some(b => b);
  const allOn = onBoundary.every(b => b);
  if (!anyOn) return { merged: null, leftover: hole };
  if (allOn) return { merged: outer, leftover: null };

  const runs = [];
  let i = 0;
  while (i < H && !onBoundary[i]) i++;
  if (i === H) return { merged: null, leftover: hole };
  const start = i;
  let pos = start;
  do {
    if (onBoundary[pos] && !onBoundary[(pos + 1) % H]) {
      const runStart = (pos + 1) % H;
      let runEnd = runStart;
      while (!onBoundary[(runEnd + 1) % H]) {
        runEnd = (runEnd + 1) % H;
        if (runEnd === runStart) break;
      }
      runs.push({ runStart, runEnd });
    }
    pos = (pos + 1) % H;
  } while (pos !== start);

  if (runs.length === 0) return { merged: null, leftover: hole };

  let tempOuter = outer.slice();
  let allOk = true;
  for (const { runStart, runEnd } of runs) {
    const boundaryBefore = (runStart - 1 + H) % H;
    const boundaryAfter = (runEnd + 1) % H;
    const interiorCurve = [hole[boundaryBefore]];
    let k = runStart;
    while (true) {
      interiorCurve.push(hole[k]);
      if (k === runEnd) break;
      k = (k + 1) % H;
    }
    interiorCurve.push(hole[boundaryAfter]);

    const spliced = _spliceInteriorCurve(tempOuter, interiorCurve, eps * 2);
    if (!spliced) { allOk = false; break; }
    tempOuter = spliced;
  }

  if (!allOk) return { merged: null, leftover: hole };
  return { merged: tempOuter, leftover: null };
}

function polygonsOverlap(a, b) {
  if (!a.length || !b.length) return false;
  let aMinX = Infinity, aMaxX = -Infinity, aMinY = Infinity, aMaxY = -Infinity;
  for (const p of a) {
    if (p.x < aMinX) aMinX = p.x; if (p.x > aMaxX) aMaxX = p.x;
    if (p.y < aMinY) aMinY = p.y; if (p.y > aMaxY) aMaxY = p.y;
  }
  let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
  for (const p of b) {
    if (p.x < bMinX) bMinX = p.x; if (p.x > bMaxX) bMaxX = p.x;
    if (p.y < bMinY) bMinY = p.y; if (p.y > bMaxY) bMaxY = p.y;
  }
  if (aMaxX < bMinX || bMaxX < aMinX || aMaxY < bMinY || bMaxY < aMinY) return false;
  for (const p of a) if (pointInPolygon(p, b)) return true;
  for (const p of b) if (pointInPolygon(p, a)) return true;
  return false;
}
