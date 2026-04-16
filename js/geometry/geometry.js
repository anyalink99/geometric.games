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
