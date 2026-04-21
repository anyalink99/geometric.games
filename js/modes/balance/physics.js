/* 2D rigid-body physics for balance modes (Pole, Perch).
   Both modes share an identical fall-and-settle loop — gravity, linear
   damping, angular damping, impulse-based contact resolution with Coulomb
   friction, and an idle-based stop condition. The only thing that differs is
   which obstacles the shape can hit: Pole has the pole rectangle + its two
   top corners; Perch has the pyramid (three half-planes) + its three corner
   points. That variation is expressed through a `collectObstacleContacts`
   callback — floor and side walls are handled here.

   Both modes also share an identical damped-pendulum "sway" animation when
   the shape balances correctly — same here via `runBodySway`.

   setAnimFrame is a setter so each mode can track its own cancel-on-reset
   handle (poleState.animFrame / perchState.animFrame). */

const BODY_G = 1400;
const BODY_WALL_L = -120;
const BODY_WALL_R = 520;

function bodyCreateFromShape(outer, centroid) {
  const outerN = outer.length;
  const localVerts = outer.map(p => ({ x: p.x - centroid.x, y: p.y - centroid.y }));
  let bw = 0, bh = 0;
  for (const p of localVerts) {
    const ax = Math.abs(p.x) * 2, ay = Math.abs(p.y) * 2;
    if (ax > bw) bw = ax;
    if (ay > bh) bh = ay;
  }
  return {
    outerN, localVerts, bw, bh,
    invMass: 1,
    invInertia: 12 / (bw * bw + bh * bh),
    comX: centroid.x, comY: centroid.y,
    theta: 0, vx: 0, vy: 0, omega: 0,
  };
}

function bodyWorldVert(body, i) {
  const c = Math.cos(body.theta), s = Math.sin(body.theta);
  const v = body.localVerts[i];
  return { x: body.comX + v.x * c - v.y * s, y: body.comY + v.x * s + v.y * c };
}

function bodyWorldToLocal(body, wp) {
  const c = Math.cos(-body.theta), s = Math.sin(-body.theta);
  const dx = wp.x - body.comX, dy = wp.y - body.comY;
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function bodyRotateByTheta(body, vx, vy) {
  const c = Math.cos(body.theta), s = Math.sin(body.theta);
  return { x: vx * c - vy * s, y: vx * s + vy * c };
}

function bodyPointInLocalPoly(body, pt) {
  const vs = body.localVerts;
  const n = body.outerN;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vs[i], vj = vs[j];
    if (((vi.y > pt.y) !== (vj.y > pt.y)) &&
        (pt.x < (vj.x - vi.x) * (pt.y - vi.y) / (vj.y - vi.y) + vi.x)) {
      inside = !inside;
    }
  }
  return inside;
}

function bodyNearestEdgeLocal(body, pt) {
  let bestD2 = Infinity;
  let nx = 0, ny = 0;
  const vs = body.localVerts;
  const n = body.outerN;
  for (let i = 0; i < n; i++) {
    const a = vs[i], b = vs[(i + 1) % n];
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

function bodyResolveContact(body, c) {
  const slop = 0.01;
  const correction = Math.max(c.depth - slop, 0) * 0.4;
  body.comX += c.nx * correction;
  body.comY += c.ny * correction;

  const rx = c.px - body.comX;
  const ry = c.py - body.comY;
  const vpx = body.vx - body.omega * ry;
  const vpy = body.vy + body.omega * rx;
  const vn = vpx * c.nx + vpy * c.ny;
  if (vn >= 0) return;

  const rCrossN = rx * c.ny - ry * c.nx;
  const denom = body.invMass + rCrossN * rCrossN * body.invInertia;
  const j = -vn / denom;
  body.vx += c.nx * j * body.invMass;
  body.vy += c.ny * j * body.invMass;
  body.omega += (rx * c.ny - ry * c.nx) * j * body.invInertia;

  const tx = -c.ny, ty = c.nx;
  const vpx2 = body.vx - body.omega * ry;
  const vpy2 = body.vy + body.omega * rx;
  const vt = vpx2 * tx + vpy2 * ty;
  const rCrossT = rx * ty - ry * tx;
  const denomT = body.invMass + rCrossT * rCrossT * body.invInertia;
  let jt = -vt / denomT;
  const mu = c.mu != null ? c.mu : 0.45;
  const jtMax = j * mu;
  if (jt > jtMax) jt = jtMax;
  else if (jt < -jtMax) jt = -jtMax;
  body.vx += tx * jt * body.invMass;
  body.vy += ty * jt * body.invMass;
  body.omega += (rx * ty - ry * tx) * jt * body.invInertia;
}

function runBodyFall(opts) {
  const {
    outer, centroid, shapeG, setAnimFrame,
    collectObstacleContacts,
    onStop,
  } = opts;
  const FLOOR = opts.FLOOR != null ? opts.FLOOR : FLOOR_Y;
  const WALL_L = opts.WALL_L != null ? opts.WALL_L : BODY_WALL_L;
  const WALL_R = opts.WALL_R != null ? opts.WALL_R : BODY_WALL_R;
  const G = opts.G != null ? opts.G : BODY_G;
  const body = bodyCreateFromShape(outer, centroid);
  let lastT = performance.now();
  let idleT = 0;

  function collectContacts() {
    const contacts = [];
    for (let i = 0; i < body.outerN; i++) {
      const p = bodyWorldVert(body, i);
      if (p.y > FLOOR) contacts.push({ px: p.x, py: FLOOR, nx: 0, ny: -1, depth: p.y - FLOOR });
      if (p.x < WALL_L) contacts.push({ px: WALL_L, py: p.y, nx: 1, ny: 0, depth: WALL_L - p.x });
      if (p.x > WALL_R) contacts.push({ px: WALL_R, py: p.y, nx: -1, ny: 0, depth: p.x - WALL_R });
    }
    if (collectObstacleContacts) collectObstacleContacts(contacts, body);
    return contacts;
  }

  function applyTransform() {
    shapeG.setAttribute(
      'transform',
      `translate(${body.comX - centroid.x} ${body.comY - centroid.y}) rotate(${body.theta * 180 / Math.PI} ${centroid.x} ${centroid.y})`
    );
  }

  function stopAnim() {
    applyTransform();
    setAnimFrame(0);
    if (onStop) onStop();
  }

  function step(now) {
    const dt = Math.min(1 / 60, (now - lastT) / 1000);
    lastT = now;

    body.vy += G * dt;
    body.vx *= 0.997;
    body.vy *= 0.997;
    body.omega *= 0.994;

    body.comX += body.vx * dt;
    body.comY += body.vy * dt;
    body.theta += body.omega * dt;

    for (let iter = 0; iter < 6; iter++) {
      const contacts = collectContacts();
      if (contacts.length === 0) break;
      for (const c of contacts) bodyResolveContact(body, c);
    }

    applyTransform();

    const kinetic = body.vx * body.vx + body.vy * body.vy +
      body.omega * body.omega * (body.bw * body.bw + body.bh * body.bh);
    if (kinetic < 4) {
      idleT += dt;
      if (idleT > 0.35) { stopAnim(); return; }
    } else {
      idleT = 0;
    }

    if (body.comY > FLOOR + 400 || Math.abs(body.theta) > Math.PI * 6) {
      stopAnim();
      return;
    }

    setAnimFrame(requestAnimationFrame(step));
  }
  setAnimFrame(requestAnimationFrame(step));
}

function runBodySway(opts) {
  const { shapeG, centroid, pivotX, pivotY, setAnimFrame, onStop } = opts;
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
      setAnimFrame(0);
      if (onStop) onStop();
      return;
    }
    setAnimFrame(requestAnimationFrame(step));
  }
  setAnimFrame(requestAnimationFrame(step));
}
