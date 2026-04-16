const cutState = {
  p0: null,
  p1: null,
  moved: false,
  activePointerId: null,
};

function cutReset() {
  cutState.p0 = null;
  cutState.p1 = null;
  cutState.moved = false;
  cutState.activePointerId = null;
  dom.cutPreview.style.display = 'none';
  dom.cutPreview.classList.remove('valid');
}

function strokeCrossesShape(a, b, polygon) {
  if (Math.hypot(b.x - a.x, b.y - a.y) < MOVE_THRESHOLD) return false;
  if (segIntersectCount(a, b, polygon) < 2) return false;
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return false;
  return true;
}

function clipShapeHalfPlane(shape, nx, ny, c) {
  const outer = clipHalfPlane(shape.outer, nx, ny, c);
  const holes = [];
  for (const h of shape.holes) {
    const hc = clipHalfPlane(h, nx, ny, c);
    if (hc.length >= 3 && polygonArea(hc) > 1) holes.push(hc);
  }
  return { outer, holes };
}

function makeCutPiece(shape) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'piece');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('class', 'shape');
  p.setAttribute('d', shapeToPath(shape));
  g.appendChild(p);
  return g;
}

function drawCutFlash(p0, p1) {
  const ext = 60;
  const tx = (p1.x - p0.x), ty = (p1.y - p0.y);
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl, uy = ty / tl;
  const a = { x: p0.x - ux * ext, y: p0.y - uy * ext };
  const b = { x: p1.x + ux * ext, y: p1.y + uy * ext };
  const ln = document.createElementNS(SVG_NS, 'line');
  ln.setAttribute('class', 'cut-line final');
  ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y);
  ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
  dom.cutLayer.innerHTML = '';
  dom.cutLayer.appendChild(ln);
}

function addCutLabel(c, nx, ny, sign, offset, pct) {
  const piecePos = { x: c.x + nx * sign * offset, y: c.y + ny * sign * offset };
  const ox = piecePos.x - CX, oy = piecePos.y - CY;
  const ol = Math.hypot(ox, oy) || 1;
  const dist = 50;
  const labelPos = {
    x: piecePos.x + (ox / ol) * dist + nx * sign * 8,
    y: piecePos.y + (oy / ol) * dist + ny * sign * 8,
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
  const ty = labelPos.y < CY ? labelPos.y - 12 : labelPos.y + 14;
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

const CUT_RESTING_HINT = 'Drag a line that fully crosses the shape';

function setCutHint() {
  dom.scoreLine.innerHTML = `
    <div class="hint" id="hint">${CUT_RESTING_HINT}</div>
  `;
}

function flashCutHint(msg) {
  const h = document.getElementById('hint');
  if (!h) return;
  h.textContent = msg;
  h.style.color = 'var(--warn)';
  setTimeout(() => {
    h.style.color = '';
    h.textContent = CUT_RESTING_HINT;
  }, 1400);
}

function showCutVerdict(diff) {
  let cls;
  if (diff < 0.5)      cls = 'perfect';
  else if (diff < 2)   cls = 'great';
  else if (diff < 5)   cls = 'good';
  else                 cls = 'fair';
  dom.scoreLine.innerHTML = `
    <div class="verdict ${cls}" id="verdict">Diff: ${diff.toFixed(2)}%</div>
  `;
  const v = document.getElementById('verdict');
  v.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      v.classList.add('show');
    });
  });
}

function performCut(p0, p1) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  let nx = -dy, ny = dx;
  const len = Math.hypot(nx, ny);
  nx /= len; ny /= len;
  const c = -(nx * p0.x + ny * p0.y);

  const sideA = clipShapeHalfPlane(state.shape, nx, ny, c);
  const sideB = clipShapeHalfPlane(state.shape, -nx, -ny, -c);
  const aA = shapeArea(sideA);
  const aB = shapeArea(sideB);
  const total = aA + aB;
  if (total < 1) return;
  const pctA = (aA / total) * 100;
  const pctB = (aB / total) * 100;
  const diff = Math.abs(pctA - pctB);

  recordDiff(diff);
  state.locked = true;

  dom.shapeLayer.innerHTML = '';
  const pieceA = makeCutPiece(sideA);
  const pieceB = makeCutPiece(sideB);
  dom.shapeLayer.appendChild(pieceA);
  dom.shapeLayer.appendChild(pieceB);

  drawCutFlash(p0, p1);

  const offset = 22;
  pieceA.style.transform = 'translate(0px, 0px)';
  pieceB.style.transform = 'translate(0px, 0px)';
  pieceA.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pieceA.style.transform = `translate(${(nx * offset).toFixed(2)}px, ${(ny * offset).toFixed(2)}px)`;
      pieceB.style.transform = `translate(${(-nx * offset).toFixed(2)}px, ${(-ny * offset).toFixed(2)}px)`;
    });
  });

  const cA = polygonCentroid(sideA.outer);
  const cB = polygonCentroid(sideB.outer);
  setTimeout(() => {
    addCutLabel(cA, nx, ny, +1, offset, pctA);
    addCutLabel(cB, nx, ny, -1, offset, pctB);
  }, 50);

  showCutVerdict(diff);
  setTimeout(() => dom.newBtn.classList.add('pulse'), 1000);
}

function initCutInput() {
  const { hitPad, cutPreview } = dom;

  function setPreview() {
    cutPreview.setAttribute('x1', cutState.p0.x);
    cutPreview.setAttribute('y1', cutState.p0.y);
    cutPreview.setAttribute('x2', cutState.p1.x);
    cutPreview.setAttribute('y2', cutState.p1.y);
    cutPreview.classList.toggle('valid', strokeCrossesShape(cutState.p0, cutState.p1, state.shape.outer));
  }

  function clearPreview() {
    cutPreview.style.display = 'none';
    cutPreview.classList.remove('valid');
  }

  hitPad.addEventListener('pointerdown', e => {
    if (state.mode !== 'cut') return;
    if (state.locked) return;
    if (cutState.activePointerId !== null) return;
    e.preventDefault();
    cutState.activePointerId = e.pointerId;
    hitPad.setPointerCapture(e.pointerId);
    cutState.p0 = svgPoint(e);
    cutState.p1 = { ...cutState.p0 };
    cutState.moved = false;
    clearPreview();
  });

  hitPad.addEventListener('pointermove', e => {
    if (state.mode !== 'cut') return;
    if (e.pointerId !== cutState.activePointerId) return;
    e.preventDefault();
    cutState.p1 = svgPoint(e);
    if (!cutState.moved) {
      if (Math.hypot(cutState.p1.x - cutState.p0.x, cutState.p1.y - cutState.p0.y) < MOVE_THRESHOLD) return;
      cutState.moved = true;
      cutPreview.style.display = '';
    }
    setPreview();
  });

  function endStroke(e, cancelled) {
    if (state.mode !== 'cut') return;
    if (e.pointerId !== cutState.activePointerId) return;
    cutState.activePointerId = null;
    if (hitPad.hasPointerCapture && hitPad.hasPointerCapture(e.pointerId)) {
      hitPad.releasePointerCapture(e.pointerId);
    }
    clearPreview();
    if (cancelled || !cutState.moved) return;
    cutState.p1 = svgPoint(e);
    if (!strokeCrossesShape(cutState.p0, cutState.p1, state.shape.outer)) {
      flashCutHint('Stroke must fully cross the shape');
      return;
    }
    performCut(cutState.p0, cutState.p1);
  }

  hitPad.addEventListener('pointerup',     e => endStroke(e, false));
  hitPad.addEventListener('pointercancel', e => endStroke(e, true));
}
