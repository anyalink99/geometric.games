const dom = {
  svg: document.getElementById('board'),
  hitPad: document.getElementById('hit-pad'),
  shapeLayer: document.getElementById('shape-layer'),
  cutLayer: document.getElementById('cut-layer'),
  labelLayer: document.getElementById('label-layer'),
  cutPreview: document.getElementById('cut-preview'),
  scoreLine: document.getElementById('score-line'),
  newBtn: document.getElementById('new-btn'),
  squareLines: document.getElementById('square-lines-layer'),
  squarePoints: document.getElementById('square-points-layer'),
  squareHover: document.getElementById('square-hover-layer'),
  squareIdeal: document.getElementById('square-ideal-layer'),
  massPoint: document.getElementById('mass-point-layer'),
  massHover: document.getElementById('mass-hover-layer'),
  massIdeal: document.getElementById('mass-ideal-layer'),
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
  dom.labelLayer.innerHTML = '';
  dom.squareLines.innerHTML = '';
  dom.squarePoints.innerHTML = '';
  dom.squareHover.innerHTML = '';
  dom.squareIdeal.innerHTML = '';
  dom.massPoint.innerHTML = '';
  dom.massHover.innerHTML = '';
  dom.massIdeal.innerHTML = '';
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
