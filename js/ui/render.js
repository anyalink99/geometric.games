const dom = {
  svg: document.getElementById('board'),
  hitPad: document.getElementById('hit-pad'),
  shapeLayer: document.getElementById('shape-layer'),
  cutLayer: document.getElementById('cut-layer'),
  cutLines: document.getElementById('cut-lines-layer'),
  cutPoints: document.getElementById('cut-points-layer'),
  labelLayer: document.getElementById('label-layer'),
  cutPreview: document.getElementById('cut-preview'),
  scoreLine: document.getElementById('score-line'),
  newBtn: document.getElementById('new-btn'),
  inscribeLines: document.getElementById('inscribe-lines-layer'),
  inscribePoints: document.getElementById('inscribe-points-layer'),
  inscribeHover: document.getElementById('inscribe-hover-layer'),
  inscribeIdeal: document.getElementById('inscribe-ideal-layer'),
  centroidPoint: document.getElementById('centroid-point-layer'),
  balanceHover: document.getElementById('balance-hover-layer'),
  centroidIdeal: document.getElementById('centroid-ideal-layer'),
  poleLayer: document.getElementById('pole-layer'),
};

function svgPoint(evt) {
  const pt = dom.svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = dom.svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const r = pt.matrixTransform(ctm.inverse());
  return { x: r.x, y: r.y };
}

function clearLayers() {
  dom.shapeLayer.innerHTML = '';
  dom.cutLayer.innerHTML = '';
  dom.cutLines.innerHTML = '';
  dom.cutPoints.innerHTML = '';
  dom.labelLayer.innerHTML = '';
  dom.inscribeLines.innerHTML = '';
  dom.inscribePoints.innerHTML = '';
  dom.inscribeHover.innerHTML = '';
  dom.inscribeIdeal.innerHTML = '';
  dom.centroidPoint.innerHTML = '';
  dom.balanceHover.innerHTML = '';
  dom.centroidIdeal.innerHTML = '';
  dom.poleLayer.innerHTML = '';
}

function makeShapeGroup(shape, groupClass) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', groupClass);

  const fill = document.createElementNS(SVG_NS, 'path');
  fill.setAttribute('class', 'shape-fill');
  fill.setAttribute('d', shapeToPath(shape));
  g.appendChild(fill);

  const outline = document.createElementNS(SVG_NS, 'path');
  outline.setAttribute('class', 'shape-outline');
  outline.setAttribute('d', pointsToPath(shape.outer));
  if (shape.holes && shape.holes.length) {
    let holesD = '';
    for (const h of shape.holes) if (h.length) holesD += ' ' + pointsToPath(h);
    outline.setAttribute('d', pointsToPath(shape.outer) + holesD);
  }
  g.appendChild(outline);

  return g;
}

function renderShape(shape) {
  clearLayers();
  dom.shapeLayer.appendChild(makeShapeGroup(shape, 'shape-group'));
}

// Replaces the score-line content with a verdict + optional stat lines, then
// double-RAFs a 'show' class so CSS can fade them in. Double-RAF forces a
// layout pass between paint and class-add, otherwise the transition collapses
// to a single frame (the pre-show state is never observed). Called on confirm
// by every mode — shared here so one reveal rhythm applies everywhere.
function showVerdict(cls, text, subs) {
  const subList = Array.isArray(subs) ? subs.filter(Boolean) : (subs ? [subs] : []);
  const subsHtml = subList
    .map(s => `<div class="score-stats">${s}</div>`)
    .join('');
  dom.scoreLine.innerHTML = `<div class="verdict ${cls}">${text}</div>${subsHtml}`;
  const verdictEl = dom.scoreLine.querySelector('.verdict');
  const statEls = dom.scoreLine.querySelectorAll('.score-stats');
  verdictEl.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      verdictEl.classList.add('show');
      for (const el of statEls) el.classList.add('show');
    });
  });
}
