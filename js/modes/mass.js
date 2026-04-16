const massState = {
  guess: null,
  hover: null,
  confirmed: false,
  pointerType: null,
  dragging: false,
  activePointerId: null,
};

function massReset() {
  massState.guess = null;
  massState.hover = null;
  massState.confirmed = false;
  massState.pointerType = null;
  massState.dragging = false;
  massState.activePointerId = null;
  dom.massPoint.innerHTML = '';
  dom.massHover.innerHTML = '';
  dom.massIdeal.innerHTML = '';
}

function isNearGuess(p, grabR) {
  if (!massState.guess) return false;
  const d = Math.hypot(p.x - massState.guess.x, p.y - massState.guess.y);
  return d < (grabR ?? POINT_GRAB_R);
}

function updateMassCursor(overExisting) {
  if (state.mode !== 'mass') { dom.hitPad.style.cursor = ''; return; }
  if (massState.confirmed) { dom.hitPad.style.cursor = 'default'; return; }
  if (massState.dragging) dom.hitPad.style.cursor = 'grabbing';
  else if (overExisting)  dom.hitPad.style.cursor = 'grab';
  else                    dom.hitPad.style.cursor = 'crosshair';
}

function clampToBoard(p) {
  return {
    x: Math.max(4, Math.min(396, p.x)),
    y: Math.max(4, Math.min(396, p.y)),
  };
}

function drawMassGuessPoint(p) {
  dom.massPoint.innerHTML = '';
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'mass-guess');
  const halo = document.createElementNS(SVG_NS, 'circle');
  halo.setAttribute('cx', p.x); halo.setAttribute('cy', p.y);
  halo.setAttribute('r', 13); halo.setAttribute('class', 'mg-halo');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
  dot.setAttribute('r', 6); dot.setAttribute('class', 'mg-dot');
  g.appendChild(halo);
  g.appendChild(dot);
  dom.massPoint.appendChild(g);
}

function drawMassHover(p) {
  dom.massHover.innerHTML = '';
  if (!p) { updateMassCursor(false); return; }
  const overExisting = isNearGuess(p);
  updateMassCursor(overExisting);
  if (overExisting) return;
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
  c.setAttribute('r', 5); c.setAttribute('class', 'mg-hover');
  dom.massHover.appendChild(c);
}

function drawMassReveal(guess, actual, dist) {
  dom.massIdeal.innerHTML = '';
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'mass-reveal');

  // Connecting line from guess to actual
  const ln = document.createElementNS(SVG_NS, 'line');
  ln.setAttribute('x1', guess.x); ln.setAttribute('y1', guess.y);
  ln.setAttribute('x2', actual.x); ln.setAttribute('y2', actual.y);
  ln.setAttribute('class', 'mass-connector');
  g.appendChild(ln);

  // Actual centroid marker: crosshair + circle
  const arm = 10;
  const lh = document.createElementNS(SVG_NS, 'line');
  lh.setAttribute('x1', actual.x - arm); lh.setAttribute('y1', actual.y);
  lh.setAttribute('x2', actual.x + arm); lh.setAttribute('y2', actual.y);
  lh.setAttribute('class', 'mass-centroid-arm');
  g.appendChild(lh);
  const lv = document.createElementNS(SVG_NS, 'line');
  lv.setAttribute('x1', actual.x); lv.setAttribute('y1', actual.y - arm);
  lv.setAttribute('x2', actual.x); lv.setAttribute('y2', actual.y + arm);
  lv.setAttribute('class', 'mass-centroid-arm');
  g.appendChild(lv);
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', actual.x); ring.setAttribute('cy', actual.y);
  ring.setAttribute('r', 6); ring.setAttribute('class', 'mass-centroid-ring');
  g.appendChild(ring);

  dom.massIdeal.appendChild(g);
  dom.massIdeal.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => g.classList.add('show'));
  });
}

function updateMassHint() {
  if (massState.confirmed) return;
  const msg = massState.guess
    ? 'Drag the point to adjust, or press Confirm'
    : 'Tap anywhere to place your center of mass guess';
  dom.scoreLine.innerHTML = `<div class="hint" id="hint">${msg}</div>`;
}

function showMassVerdict(dist) {
  let cls;
  if (dist <= 5)       cls = 'perfect';
  else if (dist <= 15) cls = 'great';
  else if (dist <= 35) cls = 'good';
  else                 cls = 'fair';
  dom.scoreLine.innerHTML = `
    <div class="verdict ${cls}" id="verdict">Off by ${dist.toFixed(1)}</div>
  `;
  const v = document.getElementById('verdict');
  v.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => v.classList.add('show'));
  });
}

function confirmMass() {
  if (massState.confirmed) return;
  if (!massState.guess) return;
  massState.confirmed = true;
  massState.hover = null;
  dom.massHover.innerHTML = '';
  const actual = shapeCentroid(state.shape);
  const dist = Math.hypot(massState.guess.x - actual.x, massState.guess.y - actual.y);
  drawMassReveal(massState.guess, actual, dist);
  showMassVerdict(dist);
  recordMassDist(dist);
  state.locked = true;
  dom.hitPad.style.cursor = 'default';
  updateActionButton();
  setTimeout(() => dom.newBtn.classList.add('pulse'), 900);
}

function initMassInput() {
  const hit = dom.hitPad;

  hit.addEventListener('pointerdown', e => {
    if (state.mode !== 'mass') return;
    if (massState.confirmed) return;
    if (massState.activePointerId !== null) return;
    e.preventDefault();
    massState.pointerType = e.pointerType;
    const p = clampToBoard(svgPoint(e));
    const grabR = e.pointerType !== 'mouse' ? POINT_GRAB_R * 3 : POINT_GRAB_R;
    if (!isNearGuess(p, grabR)) {
      massState.guess = p;
      drawMassGuessPoint(p);
      updateMassHint();
      updateActionButton();
    }
    massState.dragging = true;
    massState.activePointerId = e.pointerId;
    hit.setPointerCapture(e.pointerId);
    massState.hover = null;
    dom.massHover.innerHTML = '';
    updateMassCursor(true);
  });

  hit.addEventListener('pointermove', e => {
    if (state.mode !== 'mass') return;
    if (massState.confirmed) return;
    e.preventDefault();
    massState.pointerType = e.pointerType;
    const p = clampToBoard(svgPoint(e));
    if (massState.dragging && e.pointerId === massState.activePointerId) {
      massState.guess = p;
      drawMassGuessPoint(p);
    } else if (e.pointerType === 'mouse') {
      massState.hover = p;
      drawMassHover(p);
    }
  });

  function endDrag(e) {
    if (state.mode !== 'mass') return;
    if (e.pointerId !== massState.activePointerId) return;
    if (hit.hasPointerCapture && hit.hasPointerCapture(e.pointerId)) {
      hit.releasePointerCapture(e.pointerId);
    }
    massState.activePointerId = null;
    massState.dragging = false;
    updateMassCursor(false);
  }
  hit.addEventListener('pointerup', endDrag);
  hit.addEventListener('pointercancel', endDrag);

  hit.addEventListener('pointerleave', e => {
    if (state.mode !== 'mass') return;
    if (massState.confirmed) return;
    if (e.pointerType !== 'mouse') return;
    massState.hover = null;
    drawMassHover(null);
  });
}
