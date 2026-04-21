const CUT_HINTS = {
  half: 'Drag a line that fully crosses the shape',
  ratio: 'Drag a line that fully crosses the shape',
  quad: 'Drag a line that fully crosses the shape',
  tri: 'Drag a line that fully crosses the shape',
  angle: 'Drag the line to find the 50/50 spot',
};

function makePiece(piece) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'piece');
  for (const s of piece.shapes) {
    const fill = document.createElementNS(SVG_NS, 'path');
    fill.setAttribute('class', 'shape-fill');
    fill.setAttribute('d', shapeToPath(s));
    g.appendChild(fill);

    const outline = document.createElementNS(SVG_NS, 'path');
    outline.setAttribute('class', 'shape-outline');
    let d = pointsToPath(s.outer);
    if (s.holes && s.holes.length) {
      for (const h of s.holes) if (h.length) d += ' ' + pointsToPath(h);
    }
    outline.setAttribute('d', d);
    g.appendChild(outline);
  }
  return g;
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
  const coarse = isCoarsePointer();
  const haloR = coarse ? 22 : 11;
  const dotR = coarse ? 11 : 5.5;
  for (let i = 0; i < cutState.cuts.length; i++) {
    const cut = cutState.cuts[i];
    for (let j = 0; j < 2; j++) {
      const p = j === 0 ? cut.a : cut.b;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'cut-handle');
      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('cx', p.x); halo.setAttribute('cy', p.y);
      halo.setAttribute('r', haloR); halo.setAttribute('class', 'ch-halo');
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
      dot.setAttribute('r', dotR);
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

function showCutVerdict(off, mainText, subText) {
  let cls;
  if (off < 0.5) cls = 'perfect';
  else if (off < 2) cls = 'great';
  else if (off < 5) cls = 'good';
  else cls = 'fair';
  showVerdict(cls, mainText, subText);
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
