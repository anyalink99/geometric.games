function centerPoints(pts, cx, cy) {
  const dx = CX - cx, dy = CY - cy;
  return pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

function centerShapeObject(shape) {
  const c = polygonCentroid(shape.outer);
  return {
    outer: centerPoints(shape.outer, c.x, c.y),
    holes: shape.holes.map(h => centerPoints(h, c.x, c.y)),
  };
}

function normalizeShapeArea(shape) {
  const net = shapeArea(shape);
  if (net < 1) return null;
  const scale = Math.sqrt(TARGET_AREA / net);
  const scalePts = pts => pts.map(p => ({ x: CX + (p.x - CX) * scale, y: CY + (p.y - CY) * scale }));
  const outer = scalePts(shape.outer);
  let maxD = 0;
  for (const p of outer) {
    const d = Math.hypot(p.x - CX, p.y - CY);
    if (d > maxD) maxD = d;
  }
  if (maxD > MAX_R) return null;
  return { outer, holes: shape.holes.map(scalePts) };
}

function sampleLine(a, b, N = 6) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = i / N;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function sampleBez(a, b, bulge, N = 18) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = mx - CX, dy = my - CY;
  const dl = Math.hypot(dx, dy) || 1;
  const cx_ = mx + (dx / dl) * bulge;
  const cy_ = my + (dy / dl) * bulge;
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = i / N, u = 1 - t;
    out.push({
      x: u * u * a.x + 2 * u * t * cx_ + t * t * b.x,
      y: u * u * a.y + 2 * u * t * cy_ + t * t * b.y,
    });
  }
  return out;
}

function sampleSCurve(a, b, amp, N = 22) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const c1 = { x: a.x + dx / 3 + px * amp,  y: a.y + dy / 3 + py * amp };
  const c2 = { x: a.x + 2 * dx / 3 - px * amp, y: a.y + 2 * dy / 3 - py * amp };
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = i / N, u = 1 - t;
    out.push({
      x: u*u*u*a.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*b.x,
      y: u*u*u*a.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*b.y,
    });
  }
  return out;
}

function sampleArc(a, b, sign, N = 22) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const chord = Math.hypot(dx, dy) || 1;
  const px = -dy / chord, py = dx / chord;
  const inwardSign = (px * (CX - mx) + py * (CY - my)) > 0 ? 1 : -1;
  const centerSide = sign > 0 ? inwardSign : -inwardSign;
  const offset = chord * rand(0.28, 0.6);
  const acx = mx + px * centerSide * offset;
  const acy = my + py * centerSide * offset;
  const radius = Math.hypot(a.x - acx, a.y - acy);
  const sa = Math.atan2(a.y - acy, a.x - acx);
  const ea = Math.atan2(b.y - acy, b.x - acx);
  let delta = ea - sa;
  while (delta >  Math.PI) delta -= TAU;
  while (delta < -Math.PI) delta += TAU;
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const ang = sa + delta * t;
    out.push({ x: acx + Math.cos(ang) * radius, y: acy + Math.sin(ang) * radius });
  }
  return out;
}

function sampleNotchedLine(a, b, sign) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 60) return sampleLine(a, b, 6);
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const inSign = (px * (CX - mx) + py * (CY - my)) > 0 ? 1 : -1;
  const t = rand(0.35, 0.65);
  const r = Math.min(len * rand(0.13, 0.20), BASE_R * 0.35);
  const t1 = t * len - r, t2 = t * len + r;
  if (t1 < 6 || t2 > len - 6) return sampleLine(a, b, 6);
  const cx_ = a.x + ux * t * len, cy_ = a.y + uy * t * len;
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

function sampleEdge(a, b, treatment) {
  switch (treatment) {
    case 'line':    return sampleLine(a, b, 6);
    case 'bezOut':  return sampleBez(a, b, +BASE_R * rand(0.18, 0.42));
    case 'bezIn':   return sampleBez(a, b, -BASE_R * rand(0.15, 0.35));
    case 'bezDeep': return sampleBez(a, b, -BASE_R * rand(0.35, 0.55));
    case 'arcOut':  return sampleArc(a, b, +1);
    case 'arcIn':   return sampleArc(a, b, -1);
    case 'sCurve':  return sampleSCurve(a, b, BASE_R * rand(0.18, 0.4) * (Math.random() < 0.5 ? 1 : -1));
    case 'bite':    return sampleNotchedLine(a, b, -1);
    case 'bump':    return sampleNotchedLine(a, b, +1);
  }
  return sampleLine(a, b, 6);
}

function applyElongation(pts, angle, factor) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const inv = 1 / Math.sqrt(factor);
  for (const p of pts) {
    const dx = p.x - CX, dy = p.y - CY;
    const u =  dx * ca + dy * sa;
    const v = -dx * sa + dy * ca;
    const u2 = u * factor;
    const v2 = v * inv;
    p.x = CX + u2 * ca - v2 * sa;
    p.y = CY + u2 * sa + v2 * ca;
  }
}

function applyShear(pts, angle, amount) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (const p of pts) {
    const dx = p.x - CX, dy = p.y - CY;
    const u =  dx * ca + dy * sa;
    const v = -dx * sa + dy * ca;
    const u2 = u + v * amount;
    const v2 = v;
    p.x = CX + u2 * ca - v2 * sa;
    p.y = CY + u2 * sa + v2 * ca;
  }
}

function generateOuter() {
  const starMode = Math.random() < 0.40;
  const K = starMode
    ? (3 + Math.floor(Math.random() * 5))
    : (3 + Math.floor(Math.random() * 6));
  const totalAnchors = starMode ? K * 2 : K;

  const outerR = BASE_R * rand(0.95, 1.2);
  const innerR = outerR * rand(0.22, 0.55);

  const angleJitter  = starMode ? rand(0.10, 0.28) : rand(0.05, 0.25);
  const radialJitter = starMode ? rand(0.18, 0.40) : rand(0.08, 0.35);

  const armVary   = starMode ? rand(0.25, 0.55) : 0;
  const valleyVary = starMode ? rand(0.15, 0.35) : 0;

  const seed = rand(0, TAU);
  const anchors = [];
  for (let i = 0; i < totalAnchors; i++) {
    const baseA = seed + (i / totalAnchors) * TAU;
    const a = baseA + rand(-angleJitter, angleJitter);
    let r;
    if (starMode) {
      const isOuter = i % 2 === 0;
      const vary = isOuter ? armVary : valleyVary;
      r = (isOuter ? outerR : innerR) * (1 + rand(-vary, vary));
    } else {
      r = outerR * rand(0.55, 1.15);
    }
    r *= (1 + rand(-radialJitter, radialJitter));
    anchors.push({ x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r });
  }

  const POOL_NORMAL = [
    'line','line','bezOut','bezOut','bezOut','bezOut','bezIn','bezIn',
    'arcOut','arcOut','arcIn','sCurve','bite','bump',
  ];
  const POOL_STAR = [
    'line','line','arcIn','arcIn','bezIn','bezIn','bezDeep','sCurve','bite','bump',
  ];
  const pool = starMode ? POOL_STAR : POOL_NORMAL;
  const edges = [];
  for (let i = 0; i < totalAnchors; i++) edges.push(pick(pool));

  if (edges.every(e => e === edges[0])) {
    const alt = pick(['bezOut','bezIn','bite','bump','sCurve']);
    edges[Math.floor(Math.random() * totalAnchors)] = alt;
  }

  const pts = [];
  for (let i = 0; i < totalAnchors; i++) {
    pts.push(...sampleEdge(anchors[i], anchors[(i + 1) % totalAnchors], edges[i]));
  }

  if (Math.random() < 0.30) {
    applyElongation(pts, rand(0, TAU), rand(1.15, 1.55));
  }
  if (Math.random() < 0.20) {
    applyShear(pts, rand(0, TAU), rand(-0.3, 0.3));
  }

  const hasBiteBump = edges.some(e => e === 'bite' || e === 'bump');
  return { pts, starMode, hasBiteBump, edgeCount: edges.length };
}

function cavityFitsInside(pts, outer, margin) {
  for (const p of pts) {
    if (!pointInPolygon(p, outer)) return false;
    if (distPointToPolygon(p, outer) < margin) return false;
  }
  return true;
}

function makeCircleCavity(cx, cy, r) {
  const N = 24;
  const angOff = rand(0, TAU);
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = angOff + (i / N) * TAU;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function makeLensCavity(cx, cy, len, ang, bulge) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const px = -dy, py = dx;
  const a = { x: cx - dx * len / 2, y: cy - dy * len / 2 };
  const b = { x: cx + dx * len / 2, y: cy + dy * len / 2 };
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const c1 = { x: mx + px * bulge, y: my + py * bulge };
  const c2 = { x: mx - px * bulge, y: my - py * bulge };
  const pts = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const t = i / N, u = 1 - t;
    pts.push({
      x: u * u * a.x + 2 * u * t * c1.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c1.y + t * t * b.y,
    });
  }
  for (let i = 0; i < N; i++) {
    const t = i / N, u = 1 - t;
    pts.push({
      x: u * u * b.x + 2 * u * t * c2.x + t * t * a.x,
      y: u * u * b.y + 2 * u * t * c2.y + t * t * a.y,
    });
  }
  return pts;
}

function tryMakeCavity(outer) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outer) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  for (let tries = 0; tries < 50; tries++) {
    const cx = rand(minX, maxX);
    const cy = rand(minY, maxY);
    if (!pointInPolygon({ x: cx, y: cy }, outer)) continue;
    const interiorDist = distPointToPolygon({ x: cx, y: cy }, outer);
    if (interiorDist < 20) continue;
    const margin = 9;
    const maxR = Math.min(interiorDist - margin, 30);
    if (maxR < 9) continue;
    const type = Math.random() < 0.6 ? 'circle' : 'lens';
    let pts;
    if (type === 'circle') {
      const r = rand(9, maxR);
      pts = makeCircleCavity(cx, cy, r);
    } else {
      const ang = rand(0, TAU);
      const len = rand(22, Math.min(64, (interiorDist - margin) * 2 * 0.85));
      const bulge = len * rand(0.22, 0.42);
      if (bulge > maxR) continue;
      pts = makeLensCavity(cx, cy, len, ang, bulge);
    }
    if (cavityFitsInside(pts, outer, margin)) return pts;
  }
  return null;
}

function generateShape() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const built = generateOuter();
    let shape = { outer: built.pts, holes: [] };
    shape = centerShapeObject(shape);
    const normalized = normalizeShapeArea(shape);
    if (!normalized) continue;

    let cavityChance = 0.15;
    const needsExtra = built.starMode && !built.hasBiteBump;
    if (needsExtra) cavityChance = 0.6;

    if (Math.random() < cavityChance) {
      const cavity = tryMakeCavity(normalized.outer);
      if (cavity) {
        const withHole = { outer: normalized.outer, holes: [cavity] };
        const renormalized = normalizeShapeArea(withHole);
        if (renormalized) return renormalized;
      }
      if (needsExtra) continue;
    } else if (needsExtra) {
      continue;
    }

    return normalized;
  }
  const fallbackAnchors = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + rand(-0.3, 0.3);
    const r = BASE_R * rand(0.7, 1.0);
    fallbackAnchors.push({ x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r });
  }
  const pts = [];
  for (let i = 0; i < 4; i++) pts.push(...sampleEdge(fallbackAnchors[i], fallbackAnchors[(i + 1) % 4], 'bezOut'));
  let shape = { outer: pts, holes: [] };
  shape = centerShapeObject(shape);
  return normalizeShapeArea(shape) || shape;
}
