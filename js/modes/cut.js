const cutState = {
  targetRatio: 0.5,
  targetAngle: 0,
  cuts: [],
  drawing: null,
  activePointerId: null,
  dragCutIdx: -1,
  dragEndIdx: -1,
  dragLineMode: false,
  dragLineConstrained: false,
  dragOrigin: null,
  dragInitialCuts: null,
  confirmed: false,
};

function cutVariation() {
  return state.cutVariation || 'half';
}

function cutRequiredCount() {
  const v = cutVariation();
  return (v === 'quad' || v === 'tri') ? 2 : 1;
}

function cutReset() {
  cutState.cuts = [];
  cutState.drawing = null;
  cutState.activePointerId = null;
  cutState.dragCutIdx = -1;
  cutState.dragEndIdx = -1;
  cutState.dragLineMode = false;
  cutState.dragLineConstrained = false;
  cutState.dragOrigin = null;
  cutState.dragInitialCuts = null;
  cutState.confirmed = false;
  dom.cutPreview.style.display = 'none';
  dom.cutPreview.classList.remove('valid');
  dom.cutLines.innerHTML = '';
  dom.cutPoints.innerHTML = '';
  dom.cutLayer.innerHTML = '';
}

function strokeCrossesShape(a, b, polygon) {
  if (Math.hypot(b.x - a.x, b.y - a.y) < MOVE_THRESHOLD) return false;
  if (segIntersectCount(a, b, polygon) < 2) return false;
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return false;
  return true;
}

function lineFullyCrossesShape(a, b, polygon) {
  return segIntersectCount(a, b, polygon) >= 2 &&
    !pointInPolygon(a, polygon) && !pointInPolygon(b, polygon);
}

function spliceHoleIntoOuter(outer, hole, chordStart, onLine, t) {
  const H = hole.length;
  const chordEnd = (chordStart + 1) % H;
  const hA = hole[chordStart], hB = hole[chordEnd];
  const tA = t(hA), tB = t(hB);
  const hLo = Math.min(tA, tB), hHi = Math.max(tA, tB);
  const samePt = (p, q) => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01;

  for (let i = 0, N = outer.length; i < N; i++) {
    const a = outer[i], b = outer[(i + 1) % N];
    if (!(onLine(a) && onLine(b))) continue;
    const ta = t(a), tb = t(b);
    const oLo = Math.min(ta, tb), oHi = Math.max(ta, tb);
    if (hLo < oLo - 0.5 || hHi > oHi + 0.5) continue;

    const outerForward = tb > ta;
    let entryIdx, exitIdx, entryVert, exitVert;
    if (outerForward ? (tA <= tB) : (tA >= tB)) {
      entryIdx = chordStart; exitIdx = chordEnd; entryVert = hA; exitVert = hB;
    } else {
      entryIdx = chordEnd; exitIdx = chordStart; entryVert = hB; exitVert = hA;
    }
    const step = (entryIdx === chordStart) ? -1 : 1;

    const result = [];
    for (let k = 0; k <= i; k++) result.push(outer[k]);
    if (!samePt(a, entryVert)) result.push(entryVert);
    let k = (entryIdx + step + H) % H;
    while (k !== exitIdx) {
      result.push(hole[k]);
      k = (k + step + H) % H;
    }
    if (!samePt(b, exitVert)) result.push(exitVert);
    for (let k2 = i + 1; k2 < N; k2++) result.push(outer[k2]);
    return result;
  }
  return null;
}

function mergeCutHolesIntoOuter(outer, clippedHoles, nx, ny, c) {
  if (!clippedHoles.length) return { outer, holes: [] };
  const EPS = 0.1;
  const ux = -ny, uy = nx;
  const onLine = (p) => Math.abs(nx * p.x + ny * p.y + c) < EPS;
  const t = (p) => p.x * ux + p.y * uy;

  let current = outer.slice();
  const remaining = [];
  for (const hole of clippedHoles) {
    let chordStart = -1;
    for (let i = 0; i < hole.length; i++) {
      const a = hole[i], b = hole[(i + 1) % hole.length];
      if (onLine(a) && onLine(b)) { chordStart = i; break; }
    }
    if (chordStart < 0) {
      remaining.push(hole);
      continue;
    }
    const spliced = spliceHoleIntoOuter(current, hole, chordStart, onLine, t);
    if (spliced) current = spliced;
    else remaining.push(hole);
  }
  return { outer: current, holes: remaining };
}

function clipShapeHalfPlane(shape, nx, ny, c) {
  const outer = clipHalfPlane(shape.outer, nx, ny, c);
  const clippedHoles = [];
  for (const h of shape.holes) {
    const hc = clipHalfPlane(h, nx, ny, c);
    if (hc.length >= 3 && polygonArea(hc) > 1) clippedHoles.push(hc);
  }
  return mergeCutHolesIntoOuter(outer, clippedHoles, nx, ny, c);
}

function halfPlaneFromCut(cut) {
  const dx = cut.b.x - cut.a.x, dy = cut.b.y - cut.a.y;
  let nx = -dy, ny = dx;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len; ny /= len;
  const c = -(nx * cut.a.x + ny * cut.a.y);
  return { nx, ny, c };
}

function lineShapeChord(p0, p1, outer) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len, uy = dy / len;
  const ts = [];
  for (let i = 0, n = outer.length; i < n; i++) {
    const a = outer[i], b = outer[(i + 1) % n];
    const vx = b.x - a.x, vy = b.y - a.y;
    const denom = ux * (-vy) - uy * (-vx);
    if (Math.abs(denom) < 1e-9) continue;
    const tx = a.x - p0.x, ty = a.y - p0.y;
    const t = (tx * (-vy) - ty * (-vx)) / denom;
    const s = (ux * ty - uy * tx) / denom;
    if (s >= 0 && s <= 1) ts.push(t);
  }
  if (ts.length < 2) return null;
  ts.sort((x, y) => x - y);
  const tmin = ts[0], tmax = ts[ts.length - 1];
  return {
    a: { x: p0.x + ux * (tmin - CUT_HANDLE_PAD), y: p0.y + uy * (tmin - CUT_HANDLE_PAD) },
    b: { x: p0.x + ux * (tmax + CUT_HANDLE_PAD), y: p0.y + uy * (tmax + CUT_HANDLE_PAD) },
  };
}

function linesIntersectInsideShape(cutA, cutB, outer) {
  const d1x = cutA.b.x - cutA.a.x, d1y = cutA.b.y - cutA.a.y;
  const d2x = cutB.b.x - cutB.a.x, d2y = cutB.b.y - cutB.a.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const tx = cutB.a.x - cutA.a.x, ty = cutB.a.y - cutA.a.y;
  const t = (tx * d2y - ty * d2x) / denom;
  const ix = cutA.a.x + d1x * t, iy = cutA.a.y + d1y * t;
  return pointInPolygon({ x: ix, y: iy }, outer);
}

function chordSameSideOfLine(cut, otherCut, outer) {
  const c = lineShapeChord(cut.a, cut.b, outer);
  if (!c) return true;
  const { nx, ny, c: k } = halfPlaneFromCut(otherCut);
  const da = nx * c.a.x + ny * c.a.y + k;
  const db = nx * c.b.x + ny * c.b.y + k;
  return (da > 0 && db > 0) || (da < 0 && db < 0);
}

function applyCutsToShape(shape, cuts) {
  let pieces = [shape];
  for (const cut of cuts) {
    const { nx, ny, c } = halfPlaneFromCut(cut);
    const next = [];
    for (const p of pieces) {
      const pos = clipShapeHalfPlane(p, nx, ny, c);
      const neg = clipShapeHalfPlane(p, -nx, -ny, -c);
      if (shapeArea(pos) > 1) next.push(pos);
      if (shapeArea(neg) > 1) next.push(neg);
    }
    pieces = next;
  }
  return pieces;
}

function makePiece(shape) {
  return makeShapeGroup(shape, 'piece');
}

function pieceTouchesCutLine(piece, cut) {
  const { nx, ny, c } = halfPlaneFromCut(cut);
  const EPS = 0.5;
  const outer = piece.outer;
  for (let i = 0, n = outer.length; i < n; i++) {
    const a = outer[i], b = outer[(i + 1) % n];
    if (Math.abs(nx * a.x + ny * a.y + c) < EPS &&
        Math.abs(nx * b.x + ny * b.y + c) < EPS) return true;
  }
  return false;
}

function findTriMiddleIndex(pieces, cuts) {
  for (let i = 0; i < pieces.length; i++) {
    if (pieceTouchesCutLine(pieces[i], cuts[0]) &&
        pieceTouchesCutLine(pieces[i], cuts[1])) return i;
  }
  return -1;
}

function drawCutFlash(cuts) {
  dom.cutLayer.innerHTML = '';
  for (const cut of cuts) {
    const ext = 40;
    const dx = cut.b.x - cut.a.x, dy = cut.b.y - cut.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const a = { x: cut.a.x - ux * ext, y: cut.a.y - uy * ext };
    const b = { x: cut.b.x + ux * ext, y: cut.b.y + uy * ext };
    const ln = document.createElementNS(SVG_NS, 'line');
    ln.setAttribute('class', 'cut-line final');
    ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y);
    ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
    dom.cutLayer.appendChild(ln);
  }
}

function renderCutSegments() {
  dom.cutLines.innerHTML = '';
  for (const cut of cutState.cuts) {
    const ln = document.createElementNS(SVG_NS, 'line');
    ln.setAttribute('class', 'cut-segment');
    ln.setAttribute('x1', cut.a.x.toFixed(2));
    ln.setAttribute('y1', cut.a.y.toFixed(2));
    ln.setAttribute('x2', cut.b.x.toFixed(2));
    ln.setAttribute('y2', cut.b.y.toFixed(2));
    dom.cutLines.appendChild(ln);
  }
}

function renderCutHandles() {
  dom.cutPoints.innerHTML = '';
  if (cutState.confirmed) return;
  const isAngle = cutVariation() === 'angle';
  for (let i = 0; i < cutState.cuts.length; i++) {
    const cut = cutState.cuts[i];
    for (let j = 0; j < 2; j++) {
      const p = j === 0 ? cut.a : cut.b;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'cut-handle');
      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('cx', p.x); halo.setAttribute('cy', p.y);
      halo.setAttribute('r', 11); halo.setAttribute('class', 'ch-halo');
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
      dot.setAttribute('r', 5.5);
      dot.setAttribute('class', 'ch-dot' + (isAngle ? ' locked' : ''));
      g.appendChild(halo);
      g.appendChild(dot);
      dom.cutPoints.appendChild(g);
    }
  }
}

function renderCutAll() {
  renderCutSegments();
  renderCutHandles();
  updateCutHint();
  updateActionButton();
  updateCutCursor(false);
}

function pickCutHandle(p, grabR) {
  const r = grabR ?? POINT_GRAB_R;
  for (let i = 0; i < cutState.cuts.length; i++) {
    const c = cutState.cuts[i];
    for (let j = 0; j < 2; j++) {
      const q = j === 0 ? c.a : c.b;
      if (Math.hypot(p.x - q.x, p.y - q.y) < r) return { cut: i, end: j };
    }
  }
  return null;
}

function pickCutLine(p, threshold) {
  const thr = threshold ?? LINE_GRAB_THRESHOLD;
  let bestD = thr, bestIdx = -1;
  for (let i = 0; i < cutState.cuts.length; i++) {
    const c = cutState.cuts[i];
    const pr = closestOnSegment(p, c.a, c.b);
    const d = Math.hypot(p.x - pr.x, p.y - pr.y);
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  return bestIdx;
}

function targetRatioLabel() {
  const low = Math.min(cutState.targetRatio, 1 - cutState.targetRatio);
  const high = 1 - low;
  return `${Math.round(low * 100)}/${Math.round(high * 100)}`;
}

function targetAngleDeg() {
  let deg = cutState.targetAngle * 180 / Math.PI;
  deg = ((deg % 180) + 180) % 180;
  return Math.round(deg);
}

const CUT_HINTS = {
  half: 'Drag a line that fully crosses the shape',
  ratio: 'Drag a line that fully crosses the shape',
  quad: 'Drag a line that fully crosses the shape',
  tri: 'Drag a line that fully crosses the shape',
  angle: 'Drag the line to find the 50/50 spot',
};

function updateCutHint() {
  if (cutState.confirmed) return;
  const v = cutVariation();
  let msg;
  if (v === 'angle') {
    msg = CUT_HINTS.angle;
  } else {
    const need = cutRequiredCount();
    const placed = cutState.cuts.length;
    if (placed === 0) msg = CUT_HINTS[v];
    else if (placed < need) msg = `Draw ${need - placed} more line${need - placed === 1 ? '' : 's'} — drag endpoints to adjust`;
    else msg = 'Adjust endpoints — then press Confirm';
  }
  let banner = '';
  if (v === 'ratio') banner = `<div class="target-banner">Target split: <b>${targetRatioLabel()}</b></div>`;
  else if (v === 'angle') banner = `<div class="target-banner">Angle: <b>${targetAngleDeg()}°</b></div>`;
  else if (v === 'quad') banner = `<div class="target-banner">Split into <b>4 equal</b> pieces</div>`;
  else if (v === 'tri') banner = `<div class="target-banner">Split into <b>3 equal</b> pieces</div>`;
  dom.scoreLine.innerHTML = `${banner}<div class="hint" id="hint">${msg}</div>`;
}

function flashCutHint(msg) {
  const h = document.getElementById('hint');
  if (!h) return;
  const original = h.textContent;
  h.textContent = msg;
  h.style.color = 'var(--warn)';
  setTimeout(() => {
    h.style.color = '';
    h.textContent = original;
  }, 1400);
}

function addCutLabel(c, nx, ny, sign, offset, pct) {
  const piecePos = { x: c.x + nx * sign * offset, y: c.y + ny * sign * offset };
  const ox = piecePos.x - CX, oy = piecePos.y - CY;
  const ol = Math.hypot(ox, oy) || 1;
  const dist = 44;
  const labelPos = {
    x: piecePos.x + (ox / ol) * dist + nx * sign * 6,
    y: piecePos.y + (oy / ol) * dist + ny * sign * 6,
  };
  labelPos.x = Math.max(34, Math.min(366, labelPos.x));
  labelPos.y = Math.max(20, Math.min(380, labelPos.y));

  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', piecePos.x); dot.setAttribute('cy', piecePos.y);
  dot.setAttribute('r', 2.6); dot.setAttribute('class', 'label-dot');

  const ln = document.createElementNS(SVG_NS, 'line');
  ln.setAttribute('class', 'label-leader');
  ln.setAttribute('x1', piecePos.x); ln.setAttribute('y1', piecePos.y);
  ln.setAttribute('x2', labelPos.x); ln.setAttribute('y2', labelPos.y);

  const txt = document.createElementNS(SVG_NS, 'text');
  txt.setAttribute('class', 'label-text');
  txt.setAttribute('x', labelPos.x);
  const ty = labelPos.y < CY ? labelPos.y - 10 : labelPos.y + 12;
  txt.setAttribute('y', ty);
  txt.textContent = pct.toFixed(1) + '%';

  dom.labelLayer.appendChild(ln);
  dom.labelLayer.appendChild(dot);
  dom.labelLayer.appendChild(txt);

  dom.labelLayer.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ln.classList.add('show');
      dot.classList.add('show');
      txt.classList.add('show');
    });
  });
}

function showCutVerdict(mainText, subText) {
  const off = parseFloat((mainText.match(/[\d.]+/) || [0])[0]);
  let cls;
  if (off < 0.5) cls = 'perfect';
  else if (off < 2) cls = 'great';
  else if (off < 5) cls = 'good';
  else cls = 'fair';
  const sub = subText ? `<div class="score-stats" id="sstats">${subText}</div>` : '';
  dom.scoreLine.innerHTML = `
    <div class="verdict ${cls}" id="verdict">${mainText}</div>
    ${sub}
  `;
  const v = document.getElementById('verdict');
  const s = document.getElementById('sstats');
  v.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      v.classList.add('show');
      if (s) s.classList.add('show');
    });
  });
}

function evaluateCut() {
  const v = cutVariation();
  const pieces = applyCutsToShape(state.shape, cutState.cuts);
  const areas = pieces.map(shapeArea);
  const total = areas.reduce((s, x) => s + x, 0);
  if (total < 1) return null;
  const pcts = areas.map(a => (a / total) * 100);

  if (v === 'half' || v === 'angle') {
    if (pcts.length < 2) return null;
    const off = Math.abs(pcts[0] - pcts[1]) / 2;
    return { off, pieces, pcts, text: `Off by: ${off.toFixed(2)}%` };
  }
  if (v === 'ratio') {
    if (pcts.length < 2) return null;
    const tLo = Math.min(cutState.targetRatio, 1 - cutState.targetRatio) * 100;
    const tHi = 100 - tLo;
    const loPct = Math.min(pcts[0], pcts[1]);
    const off = Math.abs(loPct - tLo);
    return { off, pieces, pcts, text: `Off by: ${off.toFixed(2)}%`, sub: `Target ${tLo.toFixed(0)}/${tHi.toFixed(0)} • got ${loPct.toFixed(1)}/${(100 - loPct).toFixed(1)}` };
  }
  if (v === 'quad') {
    if (pcts.length !== 4) {
      return { invalid: true, msg: pcts.length < 4
        ? 'Lines must intersect inside the shape for 4 pieces'
        : 'Got ' + pcts.length + ' pieces — expected 4' };
    }
    const target = 25;
    const devs = pcts.map(p => Math.abs(p - target));
    const off = Math.max(...devs);
    const sorted = pcts.slice().sort((a, b) => a - b);
    return { off, pieces, pcts, text: `Off by: ${off.toFixed(2)}%`, sub: `pieces ${sorted.map(x => x.toFixed(1)).join(' / ')}` };
  }
  if (v === 'tri') {
    if (pcts.length !== 3) {
      return { invalid: true, msg: 'Got ' + pcts.length + ' pieces — expected 3 (second cut must leave one piece whole)' };
    }
    const target = 100 / 3;
    const devs = pcts.map(p => Math.abs(p - target));
    const off = Math.max(...devs);
    const sorted = pcts.slice().sort((a, b) => a - b);
    return { off, pieces, pcts, text: `Off by: ${off.toFixed(2)}%`, sub: `pieces ${sorted.map(x => x.toFixed(1)).join(' / ')}` };
  }
  return null;
}

function finalizeCut() {
  if (cutState.confirmed) return;
  const v = cutVariation();
  if (cutState.cuts.length !== cutRequiredCount()) {
    flashCutHint('Place all lines first');
    return;
  }
  for (const cut of cutState.cuts) {
    if (!lineFullyCrossesShape(cut.a, cut.b, state.shape.outer)) {
      flashCutHint('Each line must fully cross the shape');
      return;
    }
  }
  if (v === 'quad') {
    if (!linesIntersectInsideShape(cutState.cuts[0], cutState.cuts[1], state.shape.outer)) {
      flashCutHint('Lines must intersect inside the shape');
      return;
    }
  }
  if (v === 'tri') {
    if (linesIntersectInsideShape(cutState.cuts[0], cutState.cuts[1], state.shape.outer)) {
      flashCutHint('Second cut must not cross the first inside the shape');
      return;
    }
    if (!chordSameSideOfLine(cutState.cuts[1], cutState.cuts[0], state.shape.outer)) {
      flashCutHint('Second cut must stay in one half');
      return;
    }
  }
  const res = evaluateCut();
  if (!res) { flashCutHint('Could not score the cut'); return; }
  if (res.invalid) { flashCutHint(res.msg); return; }

  cutState.confirmed = true;
  state.locked = true;
  dom.cutPoints.innerHTML = '';
  dom.cutLines.innerHTML = '';
  drawCutFlash(cutState.cuts);

  dom.shapeLayer.innerHTML = '';
  const groups = res.pieces.map(p => {
    const g = makePiece(p);
    dom.shapeLayer.appendChild(g);
    return g;
  });

  const offset = 22;
  const middleIdx = v === 'tri' ? findTriMiddleIndex(res.pieces, cutState.cuts) : -1;
  const animCenter = middleIdx >= 0
    ? polygonCentroid(res.pieces[middleIdx].outer)
    : { x: CX, y: CY };
  const pieceOffsets = res.pieces.map((p, i) => {
    if (i === middleIdx) return { tx: 0, ty: 0, nx: 0, ny: 0 };
    const cen = polygonCentroid(p.outer);
    const dx = cen.x - animCenter.x, dy = cen.y - animCenter.y;
    const dl = Math.hypot(dx, dy) || 1;
    return { tx: (dx / dl) * offset, ty: (dy / dl) * offset, nx: dx / dl, ny: dy / dl };
  });
  res.pieces.forEach((p, i) => {
    const { tx, ty } = pieceOffsets[i];
    groups[i].style.transform = 'translate(0px, 0px)';
    groups[i].getBoundingClientRect();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        groups[i].style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`;
      });
    });
  });

  setTimeout(() => {
    res.pieces.forEach((p, i) => {
      const cen = polygonCentroid(p.outer);
      const { nx, ny } = pieceOffsets[i];
      const labelOffset = i === middleIdx ? 0 : offset;
      addCutLabel(cen, nx, ny, +1, labelOffset, res.pcts[i]);
    });
  }, 60);

  showCutVerdict(res.text, res.sub);
  recordDiff(res.off);
  updateActionButton();
  setTimeout(() => dom.newBtn.classList.add('pulse'), 1000);
}

function setupAngleChord(offsetRatio) {
  let ang = cutState.targetAngle;
  for (let i = 0; i < 8; i++) {
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const nx = -uy, ny = ux;
    let pMin = Infinity, pMax = -Infinity;
    for (const p of state.shape.outer) {
      const proj = (p.x - CX) * nx + (p.y - CY) * ny;
      if (proj < pMin) pMin = proj;
      if (proj > pMax) pMax = proj;
    }
    const span = pMax - pMin;
    if (span > 0) {
      const margin = span * 0.15;
      const lo = pMin + margin, hi = pMax - margin;
      const t = lo + offsetRatio * (hi - lo);
      const cxp = CX + nx * t, cyp = CY + ny * t;
      const p0 = { x: cxp, y: cyp };
      const p1 = { x: cxp + ux * 10, y: cyp + uy * 10 };
      const chord = lineShapeChord(p0, p1, state.shape.outer);
      if (chord) {
        cutState.cuts = [chord];
        cutState.targetAngle = ang;
        return;
      }
    }
    ang += Math.PI / 8;
  }
  cutState.cuts = [];
}

function cutOnNewShape() {
  const v = cutVariation();
  const hash = state.hash || 'default';
  if (v === 'ratio') {
    cutState.targetRatio = withSeed(
      seedFromString(hash + ':ratio'),
      () => 0.05 + Math.random() * 0.45
    );
  } else if (v === 'angle') {
    cutState.targetAngle = withSeed(
      seedFromString(hash + ':angle'),
      () => Math.random() * Math.PI
    );
    const offsetRatio = withSeed(
      seedFromString(hash + ':angle-offset'),
      () => Math.random()
    );
    setupAngleChord(offsetRatio);
  }
  renderCutAll();
}

function translateCutLine(idx, delta, constrainPerp) {
  const init = cutState.dragInitialCuts && cutState.dragInitialCuts[0];
  if (!init) return;
  const dx = init.b.x - init.a.x, dy = init.b.y - init.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  let sx, sy;
  if (constrainPerp) {
    const shift = delta.x * nx + delta.y * ny;
    sx = nx * shift; sy = ny * shift;
  } else {
    sx = delta.x; sy = delta.y;
  }
  const mx = (init.a.x + init.b.x) / 2 + sx;
  const my = (init.a.y + init.b.y) / 2 + sy;
  const p0 = { x: mx, y: my };
  const p1 = { x: mx + ux * 10, y: my + uy * 10 };
  const chord = lineShapeChord(p0, p1, state.shape.outer);
  if (chord) cutState.cuts[idx] = chord;
}

function updateCutCursor(overHandle) {
  if (state.mode !== 'cut') { dom.hitPad.style.cursor = ''; return; }
  if (cutState.confirmed) { dom.hitPad.style.cursor = 'default'; return; }
  const v = cutVariation();
  if (v === 'angle') {
    dom.hitPad.style.cursor = cutState.dragLineMode ? 'grabbing' : 'grab';
    return;
  }
  if (cutState.dragCutIdx >= 0) { dom.hitPad.style.cursor = 'grabbing'; return; }
  if (overHandle) { dom.hitPad.style.cursor = 'grab'; return; }
  if (cutState.drawing) { dom.hitPad.style.cursor = 'crosshair'; return; }
  if (cutState.cuts.length < cutRequiredCount()) { dom.hitPad.style.cursor = 'crosshair'; return; }
  dom.hitPad.style.cursor = 'default';
}

function setCutHint() { updateCutHint(); }
