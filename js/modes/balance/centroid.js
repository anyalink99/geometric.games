const centroidState = {
  guess: null,
  hover: null,
  confirmed: false,
  pointerType: null,
  dragging: false,
  activePointerId: null,
};

const centroidReset = makeModeReset({
  state: centroidState,
  defaults: {
    guess: null,
    hover: null,
    confirmed: false,
    pointerType: null,
    dragging: false,
    activePointerId: null,
  },
  layers: [
    () => dom.centroidPoint,
    () => dom.balanceHover,
    () => dom.centroidIdeal,
  ],
});

function isNearGuess(p, grabR) {
  if (!centroidState.guess) return false;
  const d = Math.hypot(p.x - centroidState.guess.x, p.y - centroidState.guess.y);
  return d < (grabR ?? POINT_GRAB_R);
}

function updateCentroidCursor(overExisting) {
  if (state.mode !== 'balance') { dom.hitPad.style.cursor = ''; return; }
  if (centroidState.confirmed) { dom.hitPad.style.cursor = 'default'; return; }
  if (centroidState.dragging) dom.hitPad.style.cursor = 'grabbing';
  else if (overExisting)      dom.hitPad.style.cursor = 'grab';
  else                        dom.hitPad.style.cursor = 'crosshair';
}

function clampToBoard(p) {
  return {
    x: Math.max(4, Math.min(396, p.x)),
    y: Math.max(4, Math.min(396, p.y)),
  };
}

function drawCentroidGuess(p) {
  dom.centroidPoint.innerHTML = '';
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'centroid-guess');
  const halo = document.createElementNS(SVG_NS, 'circle');
  halo.setAttribute('cx', p.x); halo.setAttribute('cy', p.y);
  halo.setAttribute('r', 13); halo.setAttribute('class', 'centroid-halo');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
  dot.setAttribute('r', 6); dot.setAttribute('class', 'centroid-dot');
  g.appendChild(halo);
  g.appendChild(dot);
  dom.centroidPoint.appendChild(g);
}

function drawCentroidHover(p) {
  dom.balanceHover.innerHTML = '';
  if (!p) { updateCentroidCursor(false); return; }
  const overExisting = isNearGuess(p);
  updateCentroidCursor(overExisting);
  if (overExisting) return;
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
  c.setAttribute('r', 5); c.setAttribute('class', 'centroid-hover');
  dom.balanceHover.appendChild(c);
}

function drawCentroidReveal(guess, actual, dist) {
  dom.centroidIdeal.innerHTML = '';
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'centroid-reveal');

  const ln = document.createElementNS(SVG_NS, 'line');
  ln.setAttribute('x1', guess.x); ln.setAttribute('y1', guess.y);
  ln.setAttribute('x2', actual.x); ln.setAttribute('y2', actual.y);
  ln.setAttribute('class', 'centroid-connector');
  g.appendChild(ln);

  const arm = 10;
  const lh = document.createElementNS(SVG_NS, 'line');
  lh.setAttribute('x1', actual.x - arm); lh.setAttribute('y1', actual.y);
  lh.setAttribute('x2', actual.x + arm); lh.setAttribute('y2', actual.y);
  lh.setAttribute('class', 'centroid-arm');
  g.appendChild(lh);
  const lv = document.createElementNS(SVG_NS, 'line');
  lv.setAttribute('x1', actual.x); lv.setAttribute('y1', actual.y - arm);
  lv.setAttribute('x2', actual.x); lv.setAttribute('y2', actual.y + arm);
  lv.setAttribute('class', 'centroid-arm');
  g.appendChild(lv);
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', actual.x); ring.setAttribute('cy', actual.y);
  ring.setAttribute('r', 6); ring.setAttribute('class', 'centroid-ring');
  g.appendChild(ring);

  dom.centroidIdeal.appendChild(g);
  dom.centroidIdeal.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => g.classList.add('show'));
  });
}

function updateCentroidHint() {
  if (centroidState.confirmed) return;
  const msg = centroidState.guess
    ? 'Drag the point to adjust, or press Confirm'
    : 'Tap anywhere to place your center of mass guess';
  dom.scoreLine.innerHTML = `<div class="hint" id="hint">${msg}</div>`;
}

function showCentroidVerdict(dist) {
  let cls;
  if (dist <= 5)       cls = 'perfect';
  else if (dist <= 15) cls = 'great';
  else if (dist <= 35) cls = 'good';
  else                 cls = 'fair';
  const text = dist < 0.05 ? 'Perfect centroid!' : `Off by ${dist.toFixed(1)}`;
  showVerdict(cls, text);
}

function centroidSnapshot() {
  return { guess: { x: centroidState.guess.x, y: centroidState.guess.y } };
}

function centroidRestoreSnapshot(snap) {
  if (!snap || !snap.guess) return;
  centroidState.guess = { x: snap.guess.x, y: snap.guess.y };
  drawCentroidGuess(centroidState.guess);
}

function confirmCentroid(opts) {
  const replay = !!(opts && opts.replay);
  if (centroidState.confirmed) return;
  if (!centroidState.guess) return;
  centroidState.confirmed = true;
  centroidState.hover = null;
  dom.balanceHover.innerHTML = '';
  const actual = shapeCentroid(state.shape);
  const dist = Math.hypot(centroidState.guess.x - actual.x, centroidState.guess.y - actual.y);
  drawCentroidReveal(centroidState.guess, actual, dist);
  showCentroidVerdict(dist);
  if (!replay) {
    recordBalanceDist('centroid', dist);
    if (state.daily) {
      recordDailyResult('balance', 'centroid', centroidSnapshot(), dist <= 5);
    }
    trackWithContext('game_complete', {
      score: +dist.toFixed(2),
      score_metric: 'distance_px',
      perfect: dist <= 5,
      hash: state.hash || null,
    });
  }
  state.locked = true;
  dom.hitPad.style.cursor = 'default';
  updateActionButton();
  maybePulseNewBtn(900);
}
