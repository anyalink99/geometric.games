const poleState = {
  pole: null,
  confirmed: false,
  dragging: false,
  activePointerId: null,
  pivotY: FLOOR_Y,
  xMin: 0,
  xMax: BOARD_W,
  animFrame: 0,
};

const POLE_HALF_W = 2.5;

const poleReset = makeModeReset({
  state: poleState,
  defaults: () => ({
    pole: null,
    confirmed: false,
    dragging: false,
    activePointerId: null,
    pivotY: FLOOR_Y,
  }),
  layers: [() => dom.poleLayer],
  after() {
    if (poleState.animFrame) {
      cancelAnimationFrame(poleState.animFrame);
      poleState.animFrame = 0;
    }
    const g = dom.shapeLayer.firstElementChild;
    if (g) g.removeAttribute('transform');
  },
});

function shapeBottomAtX(shape, x) {
  const outer = shape.outer;
  let maxY = -Infinity;
  for (let i = 0, n = outer.length; i < n; i++) {
    const a = outer[i], b = outer[(i + 1) % n];
    const xMin = Math.min(a.x, b.x);
    const xMax = Math.max(a.x, b.x);
    if (x < xMin - 1e-6 || x > xMax + 1e-6) continue;
    if (Math.abs(b.x - a.x) < 1e-9) {
      if (a.y > maxY) maxY = a.y;
      if (b.y > maxY) maxY = b.y;
    } else {
      const t = (x - a.x) / (b.x - a.x);
      const y = a.y + t * (b.y - a.y);
      if (y > maxY) maxY = y;
    }
  }
  return maxY === -Infinity ? null : maxY;
}

function onPoleShapeReady() {
  let minX = Infinity, maxX = -Infinity;
  for (const p of state.shape.outer) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  poleState.xMin = minX;
  poleState.xMax = maxX;
  poleState.pivotY = shapeBottomAtX(state.shape, (minX + maxX) / 2) ?? FLOOR_Y;
}

function clampPoleX(x) {
  const pad = 2;
  const lo = poleState.xMin + pad;
  const hi = poleState.xMax - pad;
  if (hi < lo) return (poleState.xMin + poleState.xMax) / 2;
  return Math.max(lo, Math.min(hi, x));
}

function drawPole(x) {
  dom.poleLayer.innerHTML = '';
  const pivotY = shapeBottomAtX(state.shape, x);
  if (pivotY == null) return;
  poleState.pivotY = pivotY;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'pole-group');
  const shaft = document.createElementNS(SVG_NS, 'rect');
  shaft.setAttribute('x', x - POLE_HALF_W);
  shaft.setAttribute('y', pivotY);
  shaft.setAttribute('width', POLE_HALF_W * 2);
  shaft.setAttribute('height', FLOOR_Y - pivotY);
  shaft.setAttribute('class', 'pole-shaft');
  g.appendChild(shaft);
  const tip = document.createElementNS(SVG_NS, 'circle');
  tip.setAttribute('cx', x); tip.setAttribute('cy', pivotY);
  tip.setAttribute('r', 3.5);
  tip.setAttribute('class', 'pole-tip');
  g.appendChild(tip);
  dom.poleLayer.appendChild(g);
}

function drawPoleHover(x) {
  dom.balanceHover.innerHTML = '';
  if (x == null) { updatePoleCursor(false); return; }
  const overExisting = isNearPole(x);
  updatePoleCursor(overExisting);
  if (overExisting) return;
  const hoverPivotY = shapeBottomAtX(state.shape, x);
  if (hoverPivotY == null) return;
  const ln = document.createElementNS(SVG_NS, 'line');
  ln.setAttribute('x1', x); ln.setAttribute('y1', hoverPivotY);
  ln.setAttribute('x2', x); ln.setAttribute('y2', FLOOR_Y);
  ln.setAttribute('class', 'pole-hover');
  dom.balanceHover.appendChild(ln);
}

function isNearPole(x, grabR) {
  if (poleState.pole == null) return false;
  return Math.abs(x - poleState.pole) < (grabR ?? POINT_GRAB_R);
}

function updatePoleCursor(overExisting) {
  if (state.mode !== 'balance' || balanceVariation() !== 'pole') { dom.hitPad.style.cursor = ''; return; }
  if (poleState.confirmed) { dom.hitPad.style.cursor = 'default'; return; }
  if (poleState.dragging) dom.hitPad.style.cursor = 'grabbing';
  else if (overExisting)  dom.hitPad.style.cursor = 'ew-resize';
  else                    dom.hitPad.style.cursor = 'crosshair';
}

function updatePoleHint() {
  if (poleState.confirmed) return;
  const msg = poleState.pole != null
    ? 'Drag the pole to adjust, or press Confirm'
    : 'Tap anywhere to place the pole';
  dom.scoreLine.innerHTML = `<div class="hint" id="hint">${msg}</div>`;
}

function showPoleVerdict(dx, tipped) {
  const abs = Math.abs(dx);
  const side = dx < 0 ? 'left' : 'right';
  const amount = abs.toFixed(1);
  let cls, text;
  if (tipped) {
    cls = 'fair';
    text = `Tipped — off to the ${side} by ${amount}`;
  } else if (abs < 0.05) {
    cls = 'perfect';
    text = 'Perfect balance!';
  } else {
    cls = 'perfect';
    text = `Balanced — off to the ${side} by ${amount}`;
  }
  dom.scoreLine.innerHTML = `<div class="verdict ${cls}" id="verdict">${text}</div>`;
  const v = document.getElementById('verdict');
  v.getBoundingClientRect();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => v.classList.add('show'));
  });
}

function poleSnapshot() {
  return { pole: poleState.pole };
}

function poleRestoreSnapshot(snap) {
  if (!snap || typeof snap.pole !== 'number') return;
  poleState.pole = snap.pole;
  poleState.pivotY = shapeBottomAtX(state.shape, snap.pole) ?? FLOOR_Y;
  drawPole(snap.pole);
}

function confirmPole(opts) {
  const replay = !!(opts && opts.replay);
  if (poleState.confirmed) return;
  if (poleState.pole == null) return;
  poleState.confirmed = true;
  dom.balanceHover.innerHTML = '';
  const actual = shapeCentroid(state.shape);
  const pivotX = poleState.pole;
  const pivotY = poleState.pivotY;
  const dx = actual.x - pivotX;
  const absDx = Math.abs(dx);
  const tipped = absDx > BALANCE_PERFECT_THRESHOLD;
  if (!replay) {
    recordBalanceDist('pole', absDx);
    if (state.daily) {
      recordDailyResult('balance', 'pole', poleSnapshot(), !tipped);
    }
    trackWithContext('game_complete', {
      score: +absDx.toFixed(2),
      score_metric: 'distance_px',
      perfect: !tipped,
      hash: state.hash || null,
    });
  }
  showPoleVerdict(dx, tipped);
  state.locked = true;
  dom.hitPad.style.cursor = 'default';
  updateActionButton();
  if (tipped) runPoleFall(pivotX, pivotY, actual);
  else        runPoleSway(pivotX, pivotY, actual);
}

function runPoleSway(pivotX, pivotY, centroid) {
  const shapeG = dom.shapeLayer.firstElementChild;
  if (!shapeG) return;
  runBodySway({
    shapeG, centroid, pivotX, pivotY,
    setAnimFrame: f => { poleState.animFrame = f; },
    onStop: () => maybePulseNewBtn(400),
  });
}

function runPoleFall(pivotX, pivotY, centroid) {
  const shapeG = dom.shapeLayer.firstElementChild;
  if (!shapeG) return;

  const POLE_XMIN = pivotX - POLE_HALF_W;
  const POLE_XMAX = pivotX + POLE_HALF_W;
  const poleCornerL = { x: POLE_XMIN, y: pivotY };
  const poleCornerR = { x: POLE_XMAX, y: pivotY };

  runBodyFall({
    outer: state.shape.outer,
    centroid, shapeG,
    setAnimFrame: f => { poleState.animFrame = f; },
    onStop: () => maybePulseNewBtn(400),
    collectObstacleContacts(contacts, body) {
      for (let i = 0; i < body.outerN; i++) {
        const p = bodyWorldVert(body, i);
        if (p.x > POLE_XMIN && p.x < POLE_XMAX && p.y > pivotY && p.y < FLOOR_Y) {
          const dTop = p.y - pivotY;
          const dL = p.x - POLE_XMIN;
          const dR = POLE_XMAX - p.x;
          let nx, ny, depth;
          if (dTop <= dL && dTop <= dR) { nx = 0; ny = -1; depth = dTop; }
          else if (dL <= dR)            { nx = -1; ny = 0; depth = dL; }
          else                           { nx = 1; ny = 0; depth = dR; }
          contacts.push({ px: p.x + nx * depth, py: p.y + ny * depth, nx, ny, depth });
        }
      }
      for (const corner of [poleCornerL, poleCornerR]) {
        const local = bodyWorldToLocal(body, corner);
        if (!bodyPointInLocalPoly(body, local)) continue;
        const near = bodyNearestEdgeLocal(body, local);
        if (near.depth < 1e-6) continue;
        const wn = bodyRotateByTheta(body, near.nx, near.ny);
        contacts.push({ px: corner.x, py: corner.y, nx: -wn.x, ny: -wn.y, depth: near.depth, mu: 2.0 });
      }
    },
  });
}
