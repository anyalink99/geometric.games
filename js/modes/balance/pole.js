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
  let cls, text;
  if (tipped) {
    cls = 'fair';
    text = `Tipped — off by ${Math.abs(dx).toFixed(1)}`;
  } else {
    cls = 'perfect';
    text = `Balanced — off by ${Math.abs(dx).toFixed(1)}`;
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
  const dx = centroid.x - pivotX;
  const dy = Math.max(1, pivotY - centroid.y);
  const wn = 6.2;
  const zeta = 0.22;
  let theta = 0;
  let omega = Math.atan2(dx, dy) * wn;
  let lastT = performance.now();

  function step(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const alpha = -wn * wn * Math.sin(theta) - 2 * zeta * wn * omega;
    omega += alpha * dt;
    theta += omega * dt;
    shapeG.setAttribute('transform', `rotate(${theta * 180 / Math.PI} ${pivotX} ${pivotY})`);
    if (Math.abs(theta) < 0.0015 && Math.abs(omega) < 0.02) {
      shapeG.removeAttribute('transform');
      poleState.animFrame = 0;
      maybePulseNewBtn(400);
      return;
    }
    poleState.animFrame = requestAnimationFrame(step);
  }
  poleState.animFrame = requestAnimationFrame(step);
}

const WALL_L = -120;
const WALL_R = 520;

function runPoleFall(pivotX, pivotY, centroid) {
  const shapeG = dom.shapeLayer.firstElementChild;
  if (!shapeG) return;

  const outer = state.shape.outer;
  const outerN = outer.length;
  const localVerts = outer.map(p => ({ x: p.x - centroid.x, y: p.y - centroid.y }));

  let bw = 0, bh = 0;
  for (const p of localVerts) {
    const ax = Math.abs(p.x) * 2, ay = Math.abs(p.y) * 2;
    if (ax > bw) bw = ax;
    if (ay > bh) bh = ay;
  }
  const invMass = 1;
  const invInertia = 12 / (bw * bw + bh * bh);

  const G = 1400;
  const FLOOR = FLOOR_Y;
  const POLE_XMIN = pivotX - POLE_HALF_W;
  const POLE_XMAX = pivotX + POLE_HALF_W;
  const poleCornerL = { x: POLE_XMIN, y: pivotY };
  const poleCornerR = { x: POLE_XMAX, y: pivotY };

  let comX = centroid.x, comY = centroid.y;
  let theta = 0;
  let vx = 0, vy = 0, omega = 0;
  let lastT = performance.now();
  let idleT = 0;

  function worldVert(i) {
    const c = Math.cos(theta), s = Math.sin(theta);
    const v = localVerts[i];
    return { x: comX + v.x * c - v.y * s, y: comY + v.x * s + v.y * c };
  }

  function worldToLocal(wp) {
    const c = Math.cos(-theta), s = Math.sin(-theta);
    const dx = wp.x - comX, dy = wp.y - comY;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  function rotateByTheta(vx_, vy_) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return { x: vx_ * c - vy_ * s, y: vx_ * s + vy_ * c };
  }

  function pointInLocalPoly(pt) {
    let inside = false;
    for (let i = 0, j = outerN - 1; i < outerN; j = i++) {
      const vi = localVerts[i], vj = localVerts[j];
      if (((vi.y > pt.y) !== (vj.y > pt.y)) &&
          (pt.x < (vj.x - vi.x) * (pt.y - vi.y) / (vj.y - vi.y) + vi.x)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function nearestEdgeLocal(pt) {
    let bestD2 = Infinity;
    let nx = 0, ny = 0;
    for (let i = 0; i < outerN; i++) {
      const a = localVerts[i], b = localVerts[(i + 1) % outerN];
      const ex = b.x - a.x, ey = b.y - a.y;
      const el2 = ex * ex + ey * ey;
      if (el2 === 0) continue;
      let t = ((pt.x - a.x) * ex + (pt.y - a.y) * ey) / el2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = a.x + t * ex, cy = a.y + t * ey;
      const dx = pt.x - cx, dy = pt.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        const d = Math.sqrt(d2);
        if (d > 1e-6) { nx = -dx / d; ny = -dy / d; }
        else { const el = Math.sqrt(el2); nx = ey / el; ny = -ex / el; }
      }
    }
    return { nx, ny, depth: Math.sqrt(bestD2) };
  }

  function collectContacts() {
    const contacts = [];
    for (let i = 0; i < outerN; i++) {
      const p = worldVert(i);
      if (p.y > FLOOR) {
        contacts.push({ px: p.x, py: FLOOR, nx: 0, ny: -1, depth: p.y - FLOOR });
      }
      if (p.x < WALL_L) {
        contacts.push({ px: WALL_L, py: p.y, nx: 1, ny: 0, depth: WALL_L - p.x });
      }
      if (p.x > WALL_R) {
        contacts.push({ px: WALL_R, py: p.y, nx: -1, ny: 0, depth: p.x - WALL_R });
      }
      if (p.x > POLE_XMIN && p.x < POLE_XMAX && p.y > pivotY && p.y < FLOOR) {
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
      const local = worldToLocal(corner);
      if (!pointInLocalPoly(local)) continue;
      const near = nearestEdgeLocal(local);
      if (near.depth < 1e-6) continue;
      const wn = rotateByTheta(near.nx, near.ny);
      contacts.push({ px: corner.x, py: corner.y, nx: -wn.x, ny: -wn.y, depth: near.depth, mu: 2.0 });
    }
    return contacts;
  }

  function resolveContact(c) {
    const slop = 0.01;
    const correction = Math.max(c.depth - slop, 0) * 0.4;
    comX += c.nx * correction;
    comY += c.ny * correction;

    const rx = c.px - comX;
    const ry = c.py - comY;
    const vpx = vx - omega * ry;
    const vpy = vy + omega * rx;
    const vn = vpx * c.nx + vpy * c.ny;
    if (vn >= 0) return;

    const rCrossN = rx * c.ny - ry * c.nx;
    const denom = invMass + rCrossN * rCrossN * invInertia;
    const j = -vn / denom;
    vx += c.nx * j * invMass;
    vy += c.ny * j * invMass;
    omega += (rx * c.ny - ry * c.nx) * j * invInertia;

    const tx = -c.ny, ty = c.nx;
    const vpx2 = vx - omega * ry;
    const vpy2 = vy + omega * rx;
    const vt = vpx2 * tx + vpy2 * ty;
    const rCrossT = rx * ty - ry * tx;
    const denomT = invMass + rCrossT * rCrossT * invInertia;
    let jt = -vt / denomT;
    const mu = c.mu != null ? c.mu : 0.45;
    const jtMax = j * mu;
    if (jt > jtMax) jt = jtMax;
    else if (jt < -jtMax) jt = -jtMax;
    vx += tx * jt * invMass;
    vy += ty * jt * invMass;
    omega += (rx * ty - ry * tx) * jt * invInertia;
  }

  function applyTransform() {
    shapeG.setAttribute('transform',
      `translate(${comX - centroid.x} ${comY - centroid.y}) rotate(${theta * 180 / Math.PI} ${centroid.x} ${centroid.y})`);
  }

  function stopAnim() {
    applyTransform();
    poleState.animFrame = 0;
    maybePulseNewBtn(400);
  }

  function step(now) {
    const dt = Math.min(1 / 60, (now - lastT) / 1000);
    lastT = now;

    vy += G * dt;
    vx *= 0.997;
    vy *= 0.997;
    omega *= 0.994;

    comX += vx * dt;
    comY += vy * dt;
    theta += omega * dt;

    for (let iter = 0; iter < 6; iter++) {
      const contacts = collectContacts();
      if (contacts.length === 0) break;
      for (const c of contacts) resolveContact(c);
    }

    applyTransform();

    const kinetic = vx * vx + vy * vy + omega * omega * (bw * bw + bh * bh);
    if (kinetic < 4) {
      idleT += dt;
      if (idleT > 0.35) { stopAnim(); return; }
    } else {
      idleT = 0;
    }

    if (comY > FLOOR + 400 || Math.abs(theta) > Math.PI * 6) {
      stopAnim();
      return;
    }

    poleState.animFrame = requestAnimationFrame(step);
  }
  poleState.animFrame = requestAnimationFrame(step);
}
