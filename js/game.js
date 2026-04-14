const state = {
  shape: { outer: [], holes: [] },
  locked: false,
};

function newShape() {
  state.shape = generateShape();
  state.locked = false;
  input.reset();
  renderShape(state.shape);
  setHintResting();
  dom.newBtn.classList.remove('pulse');
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
  const pieceA = makePiece(sideA);
  const pieceB = makePiece(sideB);
  dom.shapeLayer.appendChild(pieceA);
  dom.shapeLayer.appendChild(pieceB);

  drawCutFlash(p0, p1);

  const offset = 22;
  requestAnimationFrame(() => {
    pieceA.style.transform = `translate(${(nx * offset).toFixed(2)}px, ${(ny * offset).toFixed(2)}px)`;
    pieceB.style.transform = `translate(${(-nx * offset).toFixed(2)}px, ${(-ny * offset).toFixed(2)}px)`;
  });

  const cA = polygonCentroid(sideA.outer);
  const cB = polygonCentroid(sideB.outer);
  setTimeout(() => {
    addLabel(cA, nx, ny, +1, offset, pctA);
    addLabel(cB, nx, ny, -1, offset, pctB);
  }, 50);

  showVerdict(diff);
  setTimeout(() => dom.newBtn.classList.add('pulse'), 1000);
}

const input = initInput({
  getOuter: () => state.shape.outer,
  isLocked: () => state.locked,
  onCut: performCut,
});
