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

function sampleZigzag(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 50) return sampleLine(a, b, 6);
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const inSign = (px * (CX - mx) + py * (CY - my)) > 0 ? 1 : -1;
  const outSign = -inSign;
  const teeth = 3 + Math.floor(Math.random() * 4);
  const amp = Math.min(len * rand(0.06, 0.13), BASE_R * 0.14);
  const pts = [];
  pts.push(a);
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

function sampleScallop(a, b, sign) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 50) return sampleLine(a, b, 6);
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const inSign = (px * (CX - mx) + py * (CY - my)) > 0 ? 1 : -1;
  const outSign = sign > 0 ? -inSign : inSign;
  const bumps = 3 + Math.floor(Math.random() * 3);
  const segLen = len / bumps;
  const bulge = segLen * rand(0.28, 0.46) * outSign;
  const pts = [];
  pts.push(a);
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

function sampleStepped(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 70) return sampleLine(a, b, 6);
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const inSign = (px * (CX - mx) + py * (CY - my)) > 0 ? 1 : -1;
  const outSign = -inSign;
  const notches = 2 + Math.floor(Math.random() * 3);
  const amp = Math.min(len * rand(0.05, 0.10), BASE_R * 0.11);
  const pts = [];
  pts.push(a);
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
    case 'zigzag':  return sampleZigzag(a, b);
    case 'scallop': return sampleScallop(a, b, +1);
    case 'scallopIn': return sampleScallop(a, b, -1);
    case 'stepped': return sampleStepped(a, b);
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

const POOL_NORMAL = [
  'line','line','bezOut','bezOut','bezOut','bezOut','bezIn','bezIn',
  'arcOut','arcOut','arcIn','sCurve','bite','bump',
];
const POOL_STAR = [
  'line','line','arcIn','arcIn','bezIn','bezIn','bezDeep','sCurve','bite','bump',
];
const POOL_SYMMETRIC = [
  'line','line','bezOut','bezOut','bezIn','arcOut','arcIn','sCurve','bite','bump',
];
const POOL_NEW = ['zigzag','scallop','scallopIn','stepped'];
const NEW_TREATMENT_CHANCE = 0.07;

function pickTreatment(basePool) {
  return Math.random() < NEW_TREATMENT_CHANCE ? pick(POOL_NEW) : pick(basePool);
}

function buildClassicOuter() {
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

  const pool = starMode ? POOL_STAR : POOL_NORMAL;
  const edges = [];
  for (let i = 0; i < totalAnchors; i++) edges.push(pickTreatment(pool));

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

function buildSymmetricOuter() {
  const k = pick([2, 2, 3, 3, 3, 4, 4, 5, 6]);
  const perFold = 2 + Math.floor(Math.random() * 3);

  const baseR = BASE_R * rand(0.85, 1.15);
  const radialJitter = rand(0.1, 0.35);
  const radiiFold = [];
  for (let i = 0; i < perFold; i++) {
    radiiFold.push(baseR * (1 + rand(-radialJitter, radialJitter)));
  }

  const edgesFold = [];
  for (let i = 0; i < perFold; i++) edgesFold.push(pickTreatment(POOL_SYMMETRIC));
  if (edgesFold.every(e => e === edgesFold[0])) {
    edgesFold[Math.floor(Math.random() * perFold)] = pick(['bezOut','bezIn','bite','bump']);
  }

  const seed = rand(0, TAU);
  const foldAngle = TAU / k;
  const stepAngle = foldAngle / perFold;
  const foldAnchors = [];
  for (let i = 0; i <= perFold; i++) {
    const a = seed + i * stepAngle;
    const r = radiiFold[i % perFold];
    foldAnchors.push({ x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r });
  }

  const foldSampled = [];
  for (let i = 0; i < perFold; i++) {
    foldSampled.push(sampleEdge(foldAnchors[i], foldAnchors[i + 1], edgesFold[i]));
  }

  const pts = [];
  for (let j = 0; j < k; j++) {
    const rot = j * foldAngle;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    for (const edgePts of foldSampled) {
      for (const p of edgePts) {
        const dx = p.x - CX, dy = p.y - CY;
        pts.push({
          x: CX + dx * ca - dy * sa,
          y: CY + dx * sa + dy * ca,
        });
      }
    }
  }

  const hasBiteBump = edgesFold.some(e => e === 'bite' || e === 'bump');
  return { pts, starMode: false, hasBiteBump, edgeCount: k * perFold, symmetric: true, symmetryK: k };
}

function buildCompositeOuter() {
  const blobCount = Math.random() < 0.55 ? 2 : 3;
  const blobs = [];
  const overallScale = BASE_R * rand(0.55, 0.8);
  const spread = overallScale * rand(0.4, 0.75);
  const seedA = rand(0, TAU);
  for (let i = 0; i < blobCount; i++) {
    const a = seedA + (i / blobCount) * TAU;
    const cx = CX + Math.cos(a) * spread;
    const cy = CY + Math.sin(a) * spread;
    const r = overallScale * rand(0.7, 1.2);
    const n = 20 + Math.floor(Math.random() * 10);
    const offset = rand(0, TAU);
    const jitter = rand(0.06, 0.22);
    const radii = [];
    for (let m = 0; m < n; m++) radii.push(r * (1 + rand(-jitter, jitter)));
    blobs.push({ cx, cy, n, offset, radii });
  }

  const blobR = (b, ang) => {
    const tNorm = ((ang - b.offset) / TAU % 1 + 1) % 1;
    const scaled = tNorm * b.n;
    const idx = Math.floor(scaled);
    const t = scaled - idx;
    const r0 = b.radii[idx % b.n];
    const r1 = b.radii[(idx + 1) % b.n];
    return r0 + (r1 - r0) * t;
  };

  const insideUnion = (px, py) => {
    for (const b of blobs) {
      const dx = px - b.cx, dy = py - b.cy;
      const d = Math.hypot(dx, dy);
      if (d < 0.0001) return true;
      const ang = Math.atan2(dy, dx);
      if (d <= blobR(b, ang)) return true;
    }
    return false;
  };

  let startX = 0, startY = 0;
  for (const b of blobs) { startX += b.cx; startY += b.cy; }
  startX /= blobs.length; startY /= blobs.length;
  if (!insideUnion(startX, startY)) {
    startX = blobs[0].cx;
    startY = blobs[0].cy;
  }

  const N = 144;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * TAU;
    const dx = Math.cos(theta), dy = Math.sin(theta);
    let lo = 0, hi = BASE_R * 4;
    for (let iter = 0; iter < 22; iter++) {
      const mid = (lo + hi) / 2;
      if (insideUnion(startX + dx * mid, startY + dy * mid)) lo = mid;
      else hi = mid;
    }
    pts.push({ x: startX + dx * lo, y: startY + dy * lo });
  }

  return { pts, starMode: false, hasBiteBump: false, edgeCount: N, composite: true };
}

function generateOuter() {
  const roll = Math.random();
  if (roll < 0.10) return buildCompositeOuter();
  if (roll < 0.25) return buildSymmetricOuter();
  return buildClassicOuter();
}

function cavityFitsInside(pts, outer, margin) {
  for (const p of pts) {
    if (!pointInPolygon(p, outer)) return false;
    if (distPointToPolygon(p, outer) < margin) return false;
  }
  return true;
}

function makeCircleCavity(cx, cy, r) {
  const N = Math.max(32, Math.min(72, Math.round(r * 1.4)));
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
  const N = 22;
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
    const typeRoll = Math.random();
    let type;
    if (typeRoll < 0.5) type = 'circle';
    else if (typeRoll < 0.8) type = 'lens';
    else type = 'slit';
    let pts;
    if (type === 'circle') {
      const r = rand(9, maxR);
      pts = makeCircleCavity(cx, cy, r);
    } else if (type === 'lens') {
      const ang = rand(0, TAU);
      const len = rand(22, Math.min(64, (interiorDist - margin) * 2 * 0.85));
      const bulge = len * rand(0.22, 0.42);
      if (bulge > maxR) continue;
      pts = makeLensCavity(cx, cy, len, ang, bulge);
    } else {
      const ang = rand(0, TAU);
      const maxLen = (interiorDist - margin) * 2 * 0.9;
      if (maxLen < 40) continue;
      const len = rand(40, Math.min(130, maxLen));
      const bulge = Math.min(maxR * 0.7, len * rand(0.06, 0.14));
      if (bulge < 3) continue;
      pts = makeLensCavity(cx, cy, len, ang, bulge);
    }
    if (cavityFitsInside(pts, outer, margin)) return pts;
  }
  return null;
}

function tryMakeSmallHoleAvoiding(outer, existing) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outer) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const margin = 7;
  for (let tries = 0; tries < 80; tries++) {
    const cx = rand(minX, maxX);
    const cy = rand(minY, maxY);
    const center = { x: cx, y: cy };
    if (!pointInPolygon(center, outer)) continue;
    let blocked = false;
    for (const h of existing) {
      if (pointInPolygon(center, h)) { blocked = true; break; }
    }
    if (blocked) continue;
    let minDist = distPointToPolygon(center, outer);
    for (const h of existing) {
      minDist = Math.min(minDist, distPointToPolygon(center, h));
    }
    if (minDist < 12) continue;
    const maxR = Math.min(minDist - margin, 14);
    if (maxR < 6) continue;
    const r = rand(6, maxR);
    const pts = makeCircleCavity(cx, cy, r);
    if (!cavityFitsInside(pts, outer, margin)) continue;
    let overlaps = false;
    for (const h of existing) {
      for (const p of pts) {
        if (pointInPolygon(p, h)) { overlaps = true; break; }
      }
      if (overlaps) break;
    }
    if (overlaps) continue;
    return pts;
  }
  return null;
}

function tryMakeClusterHoles(outer) {
  const count = 3 + Math.floor(Math.random() * 4);
  const holes = [];
  for (let i = 0; i < count; i++) {
    const hole = tryMakeSmallHoleAvoiding(outer, holes);
    if (!hole) break;
    holes.push(hole);
  }
  return holes.length >= 3 ? holes : null;
}

function tryMakeSymmetricBreakingHoles(outer) {
  const count = 1 + Math.floor(Math.random() * 3);
  const targetRatio = 0.10 + Math.random() * 0.20;
  const outerArea = polygonArea(outer);
  const targetHoleArea = outerArea * targetRatio;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of outer) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const padX = (maxX - minX) * 0.3;
  const padY = (maxY - minY) * 0.3;

  for (let layout = 0; layout < 15; layout++) {
    const clippedHoles = [];
    let totalArea = 0;
    for (let h = 0; h < count; h++) {
      const remaining = Math.max(0, targetHoleArea - totalArea);
      const slots = count - h;
      const perHoleTarget = Math.max(300, remaining / slots);
      const placed = placeBalanceHole(
        outer, clippedHoles, perHoleTarget,
        minX - padX, maxX + padX, minY - padY, maxY + padY
      );
      if (!placed) break;
      clippedHoles.push(placed);
      totalArea += polygonArea(placed);
    }
    if (clippedHoles.length !== count) continue;
    const tol = outerArea * 0.05;
    const lo = Math.max(outerArea * 0.08, targetHoleArea - tol);
    const hi = Math.min(outerArea * 0.32, targetHoleArea + tol);
    if (totalArea < lo || totalArea > hi) continue;

    let currentOuter = outer;
    const interiorHoles = [];
    for (const hole of clippedHoles) {
      const { merged, leftover } = mergeBoundaryHoleIntoOuter(currentOuter, hole, 1.2);
      if (merged) { currentOuter = merged; continue; }
      if (!leftover) continue;
      let touchesBoundary = false;
      for (const p of leftover) {
        if (locateOnPolygonBoundary(p, currentOuter, 2.0)) { touchesBoundary = true; break; }
      }
      if (!touchesBoundary) interiorHoles.push(leftover);
    }
    return { outer: currentOuter, holes: interiorHoles };
  }
  return null;
}

function sampleBalanceHoleCount() {
  const roll = Math.random() * 100;
  if (roll < 20)   return 1;
  if (roll < 40)   return 2;
  if (roll < 60)   return 3;
  if (roll < 70)   return 4;
  if (roll < 77.5) return 5;
  if (roll < 85)   return 6;
  if (roll < 90)   return 7;
  if (roll < 94)   return 8;
  if (roll < 97)   return 9;
  if (roll < 98.5) return 10;
  if (roll < 99.5) return 11;
  return 12;
}

function placeBalanceHole(outer, existing, targetArea, minX, maxX, minY, maxY) {
  for (let tries = 0; tries < 120; tries++) {
    const cx = rand(minX, maxX);
    const cy = rand(minY, maxY);
    const slack = rand(1.15, 1.9);
    const unclippedArea = targetArea * slack;
    const r = Math.sqrt(unclippedArea / Math.PI);
    if (r < 8 || r > 220) continue;

    let pts;
    if (Math.random() < 0.7) {
      pts = makeCircleCavity(cx, cy, r);
    } else {
      const len = r * 1.8;
      const ang = rand(0, TAU);
      const bulge = len * rand(0.22, 0.4);
      pts = makeLensCavity(cx, cy, len, ang, bulge);
    }

    let hasOutside = false, hasInside = false;
    for (const p of pts) {
      if (pointInPolygon(p, outer)) hasInside = true;
      else hasOutside = true;
      if (hasOutside && hasInside) break;
    }
    if (!hasOutside || !hasInside) continue;

    const clipped = intersectPolygonWithConvex(outer, pts);
    if (!clipped || clipped.length < 3) continue;
    const area = polygonArea(clipped);
    if (area < 80) continue;

    let overlaps = false;
    for (const h of existing) {
      if (polygonsOverlap(clipped, h)) { overlaps = true; break; }
    }
    if (overlaps) continue;

    return clipped;
  }
  return null;
}

function tryBalanceShapeWithCount(targetHoleCount) {
  const targetRatio = 0.30 + Math.random() * 0.60;

  for (let outerAttempt = 0; outerAttempt < 12; outerAttempt++) {
    const built = generateOuter();
    let shape = { outer: built.pts, holes: [] };
    shape = centerShapeObject(shape);
    const normalized = normalizeShapeArea(shape);
    if (!normalized) continue;

    const outer = normalized.outer;
    const outerArea = polygonArea(outer);
    const targetHoleArea = outerArea * targetRatio;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of outer) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const padX = (maxX - minX) * 0.3;
    const padY = (maxY - minY) * 0.3;

    for (let layout = 0; layout < 15; layout++) {
      const clippedHoles = [];
      let totalArea = 0;

      for (let h = 0; h < targetHoleCount; h++) {
        const remaining = Math.max(0, targetHoleArea - totalArea);
        const slots = targetHoleCount - h;
        const perHoleTarget = Math.max(300, remaining / slots);
        const placed = placeBalanceHole(
          outer, clippedHoles, perHoleTarget,
          minX - padX, maxX + padX, minY - padY, maxY + padY
        );
        if (!placed) break;
        clippedHoles.push(placed);
        totalArea += polygonArea(placed);
      }

      if (clippedHoles.length !== targetHoleCount) continue;
      const tol = outerArea * 0.10;
      const lo = Math.max(outerArea * 0.28, targetHoleArea - tol);
      const hi = Math.min(outerArea * 0.92, targetHoleArea + tol);
      if (totalArea >= lo && totalArea <= hi) {
        let currentOuter = outer;
        const interiorHoles = [];
        for (const hole of clippedHoles) {
          const { merged, leftover } = mergeBoundaryHoleIntoOuter(currentOuter, hole, 1.2);
          if (merged) { currentOuter = merged; continue; }
          if (!leftover) continue;
          let touchesBoundary = false;
          for (const p of leftover) {
            if (locateOnPolygonBoundary(p, currentOuter, 2.0)) { touchesBoundary = true; break; }
          }
          if (!touchesBoundary) interiorHoles.push(leftover);
        }
        return { outer: currentOuter, holes: interiorHoles };
      }
    }
  }
  return null;
}

function generateBalanceShape() {
  let count = sampleBalanceHoleCount();
  for (let round = 0; round < 4; round++) {
    const result = tryBalanceShapeWithCount(count);
    if (result) return result;
    if (count <= 1) break;
    count = Math.max(1, Math.floor(count * 0.6));
  }
  return generateShape();
}

// Place one boundary-crossing indent and merge it into the outer contour.
// Returns the new outer, or null if we couldn't find a placement that merges
// cleanly within a few tries.
function placeIndentAndMerge(outer, targetArea) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of outer) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const padX = (maxX - minX) * 0.3;
  const padY = (maxY - minY) * 0.3;
  for (let tries = 0; tries < 10; tries++) {
    const placed = placeBalanceHole(
      outer, [], targetArea,
      minX - padX, maxX + padX, minY - padY, maxY + padY
    );
    if (!placed) continue;
    const { merged } = mergeBoundaryHoleIntoOuter(outer, placed, 1.2);
    if (merged) return merged;
  }
  return null;
}

// Inscribe-flavored Balance shape: a plain outer with 1–2 boundary indents
// merged into the contour. No interior holes, no splits. Moderate indent
// ratio (10–25%) keeps the shape inscribable and avoids self-intersection.
function generateInscribeBalanceShape() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const built = generateOuter();
    if (built.symmetric) continue;
    const start = normalizeShapeArea(centerShapeObject({ outer: built.pts, holes: [] }));
    if (!start) continue;

    let current = start.outer;
    const count = 1 + Math.floor(Math.random() * 2);
    const ratio = 0.10 + Math.random() * 0.15;
    const perHole = polygonArea(current) * ratio / count;

    let ok = true;
    for (let i = 0; i < count; i++) {
      const next = placeIndentAndMerge(current, perHole);
      if (!next) { ok = false; break; }
      current = next;
    }
    if (!ok) continue;
    if (!isSimplePolygon(current)) continue;
    return { outer: current, holes: [] };
  }
  return null;
}

function generateShape(opts) {
  const noHoles = !!(opts && opts.noHoles);
  const noSymmetry = !!(opts && opts.noSymmetry);
  for (let attempt = 0; attempt < 30; attempt++) {
    let built = generateOuter();
    if (noSymmetry) {
      let guard = 0;
      while (built.symmetric && guard < 20) { built = generateOuter(); guard++; }
      if (built.symmetric) continue;
    }
    let shape = { outer: built.pts, holes: [] };
    shape = centerShapeObject(shape);
    const normalized = normalizeShapeArea(shape);
    if (!normalized) continue;

    if (noHoles) return normalized;

    if (built.symmetric) {
      const breaking = tryMakeSymmetricBreakingHoles(normalized.outer);
      if (breaking) {
        const holes = breaking.holes.slice();
        if (Math.random() < 0.4) {
          const extra = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < extra; i++) {
            const small = tryMakeSmallHoleAvoiding(breaking.outer, holes);
            if (!small) break;
            holes.push(small);
          }
        }
        const withHoles = { outer: breaking.outer, holes };
        const renormalized = normalizeShapeArea(withHoles);
        if (renormalized) return renormalized;
      }
      const cavity = tryMakeCavity(normalized.outer);
      if (cavity) {
        const withHole = { outer: normalized.outer, holes: [cavity] };
        const renormalized = normalizeShapeArea(withHole);
        if (renormalized) return renormalized;
      }
      continue;
    }

    let cavityChance = 0.15;
    const needsExtra = built.starMode && !built.hasBiteBump;
    if (needsExtra) cavityChance = 0.6;

    const clusterRoll = Math.random();
    if (!needsExtra && clusterRoll < 0.08) {
      const cluster = tryMakeClusterHoles(normalized.outer);
      if (cluster) {
        const withHoles = { outer: normalized.outer, holes: cluster };
        const renormalized = normalizeShapeArea(withHoles);
        if (renormalized) return renormalized;
      }
    }

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
