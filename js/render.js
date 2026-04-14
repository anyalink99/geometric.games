const dom = {
  svg: document.getElementById('board'),
  hitPad: document.getElementById('hit-pad'),
  shapeLayer: document.getElementById('shape-layer'),
  cutLayer: document.getElementById('cut-layer'),
  labelLayer: document.getElementById('label-layer'),
  cutPreview: document.getElementById('cut-preview'),
  scoreLine: document.getElementById('score-line'),
  newBtn: document.getElementById('new-btn'),
};

function clearLayers() {
  dom.shapeLayer.innerHTML = '';
  dom.cutLayer.innerHTML = '';
  dom.labelLayer.innerHTML = '';
}

function renderShape(shape) {
  clearLayers();
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', 'shape');
  path.setAttribute('d', shapeToPath(shape));
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'shape-group');
  g.appendChild(path);
  dom.shapeLayer.appendChild(g);
}

function makePiece(shape) {
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

function addLabel(c, nx, ny, sign, offset, pct) {
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

function flashHint(msg) {
  const h = document.getElementById('hint');
  if (!h) return;
  h.textContent = msg;
  h.style.color = 'var(--warn)';
  setTimeout(() => {
    h.style.color = '';
    h.textContent = 'Drag a line that fully crosses the shape';
  }, 1400);
}

function setHintResting() {
  dom.scoreLine.innerHTML = `
    <div class="hint" id="hint">Drag a line that fully crosses the shape</div>
  `;
}

function showVerdict(diff) {
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
