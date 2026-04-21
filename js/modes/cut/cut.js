const cutState = {
  targetRatio: 0.5,
  targetAngle: 0,
  cuts: [],
  drawing: null,
  activePointerId: null,
  dragCutIdx: -1,
  dragEndIdx: -1,
  dragLineMode: false,
  dragLineConstrained: false,
  dragOrigin: null,
  dragInitialCuts: null,
  confirmed: false,
};

function cutVariation() {
  return state.cutVariation || 'half';
}

function cutRequiredCount() {
  const v = cutVariation();
  return (v === 'quad' || v === 'tri') ? 2 : 1;
}

const cutReset = makeModeReset({
  state: cutState,
  defaults: {
    cuts: [],
    drawing: null,
    activePointerId: null,
    dragCutIdx: -1,
    dragEndIdx: -1,
    dragLineMode: false,
    dragLineConstrained: false,
    dragOrigin: null,
    dragInitialCuts: null,
    confirmed: false,
  },
  layers: [() => dom.cutLines, () => dom.cutPoints, () => dom.cutLayer],
  after() {
    dom.cutPreview.style.display = 'none';
    dom.cutPreview.classList.remove('valid');
  },
});

function evaluateCut() {
  const v = cutVariation();
  const pieces = applyCutsToShape(state.shape, cutState.cuts);
  const areas = pieces.map(pieceArea);
  const total = areas.reduce((s, x) => s + x, 0);
  if (total < 1) return null;
  const pcts = areas.map(a => (a / total) * 100);

  if (v === 'half' || v === 'angle') {
    if (pcts.length < 2) return null;
    const off = Math.abs(pcts[0] - pcts[1]) / 2;
    const text = off < 0.005 ? 'Perfect cut!' : `Off by: ${off.toFixed(2)}%`;
    return { off, pieces, pcts, text };
  }
  if (v === 'ratio') {
    if (pcts.length < 2) return null;
    const tLo = Math.min(cutState.targetRatio, 1 - cutState.targetRatio) * 100;
    const tHi = 100 - tLo;
    const loPct = Math.min(pcts[0], pcts[1]);
    const off = Math.abs(loPct - tLo);
    const text = off < 0.005 ? 'Perfect cut!' : `Off by: ${off.toFixed(2)}%`;
    return { off, pieces, pcts, text, sub: `Target ${tLo.toFixed(0)}/${tHi.toFixed(0)} • got ${loPct.toFixed(1)}/${(100 - loPct).toFixed(1)}` };
  }
  if (v === 'quad') {
    if (pcts.length !== 4) {
      return { invalid: true, msg: pcts.length < 4
        ? 'Lines must intersect inside the shape for 4 pieces'
        : 'Got ' + pcts.length + ' pieces — expected 4' };
    }
    const target = 25;
    const devs = pcts.map(p => Math.abs(p - target));
    const off = Math.max(...devs);
    const sorted = pcts.slice().sort((a, b) => a - b);
    const text = off < 0.005 ? 'Perfect quartering!' : `Off by: ${off.toFixed(2)}%`;
    return { off, pieces, pcts, text, sub: `pieces ${sorted.map(x => x.toFixed(1)).join(' / ')}` };
  }
  if (v === 'tri') {
    if (pcts.length !== 3) {
      return { invalid: true, msg: 'Got ' + pcts.length + ' pieces — expected 3 (second cut must leave one piece whole)' };
    }
    const target = 100 / 3;
    const devs = pcts.map(p => Math.abs(p - target));
    const off = Math.max(...devs);
    const sorted = pcts.slice().sort((a, b) => a - b);
    const text = off < 0.005 ? 'Perfect thirds!' : `Off by: ${off.toFixed(2)}%`;
    return { off, pieces, pcts, text, sub: `pieces ${sorted.map(x => x.toFixed(1)).join(' / ')}` };
  }
  return null;
}

function cutSnapshot() {
  return {
    cuts: cutState.cuts.map(c => ({
      a: { x: c.a.x, y: c.a.y },
      b: { x: c.b.x, y: c.b.y },
    })),
  };
}

function cutRestoreSnapshot(snap) {
  if (!snap || !Array.isArray(snap.cuts)) return;
  cutState.cuts = snap.cuts.map(c => ({
    a: { x: c.a.x, y: c.a.y },
    b: { x: c.b.x, y: c.b.y },
  }));
}

function finalizeCut(opts) {
  const replay = !!(opts && opts.replay);
  if (cutState.confirmed) return;
  const v = cutVariation();
  if (!replay) {
    if (cutState.cuts.length !== cutRequiredCount()) {
      flashCutHint('Place all lines first');
      return;
    }
    for (const cut of cutState.cuts) {
      if (!lineFullyCrossesShape(cut.a, cut.b, state.shape.outer)) {
        flashCutHint('Each line must fully cross the shape');
        return;
      }
    }
    if (v === 'quad') {
      if (!linesIntersectInsideShape(cutState.cuts[0], cutState.cuts[1], state.shape.outer)) {
        flashCutHint('Lines must intersect inside the shape');
        return;
      }
    }
    if (v === 'tri') {
      if (linesIntersectInsideShape(cutState.cuts[0], cutState.cuts[1], state.shape.outer)) {
        flashCutHint('Second cut must not cross the first inside the shape');
        return;
      }
      if (!chordSameSideOfLine(cutState.cuts[1], cutState.cuts[0], state.shape.outer)) {
        flashCutHint('Second cut must stay in one half');
        return;
      }
    }
  }
  const res = evaluateCut();
  if (!res) { if (!replay) flashCutHint('Could not score the cut'); return; }
  if (res.invalid) { if (!replay) flashCutHint(res.msg); return; }

  cutState.confirmed = true;
  state.locked = true;
  if (v === 'half') markCutGhostSeen();
  dom.cutPoints.innerHTML = '';
  dom.cutLines.innerHTML = '';
  drawCutFlash(cutState.cuts);

  dom.shapeLayer.innerHTML = '';
  const groups = res.pieces.map(p => {
    const g = makePiece(p);
    dom.shapeLayer.appendChild(g);
    return g;
  });

  const offset = 22;
  const middleIdx = v === 'tri' ? findTriMiddleIndex(res.pieces, cutState.cuts) : -1;
  const animCenter = middleIdx >= 0
    ? pieceCentroid(res.pieces[middleIdx])
    : { x: CX, y: CY };
  const pieceOffsets = res.pieces.map((p, i) => {
    if (i === middleIdx) return { tx: 0, ty: 0, nx: 0, ny: 0 };
    const cen = pieceCentroid(p);
    const dx = cen.x - animCenter.x, dy = cen.y - animCenter.y;
    const dl = Math.hypot(dx, dy) || 1;
    return { tx: (dx / dl) * offset, ty: (dy / dl) * offset, nx: dx / dl, ny: dy / dl };
  });
  res.pieces.forEach((p, i) => {
    const { tx, ty } = pieceOffsets[i];
    groups[i].style.transform = 'translate(0px, 0px)';
    groups[i].getBoundingClientRect();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        groups[i].style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`;
      });
    });
  });

  setTimeout(() => {
    res.pieces.forEach((p, i) => {
      const cen = pieceCentroid(p);
      const { nx, ny } = pieceOffsets[i];
      const labelOffset = i === middleIdx ? 0 : offset;
      addCutLabel(cen, nx, ny, +1, labelOffset, res.pcts[i]);
    });
  }, 60);

  showCutVerdict(res.off, res.text, res.sub);
  if (!replay) {
    recordCutDiff(v, res.off);
    if (state.daily) {
      recordDailyResult('cut', v, cutSnapshot(), res.off < 0.5);
    }
    trackWithContext('game_complete', {
      score: +res.off.toFixed(2),
      score_metric: 'off_percent',
      perfect: res.off < 0.5,
      hash: state.hash || null,
    });
  }
  updateActionButton();
  if (!(state.daily && getTodayLock('cut', v))) {
    setTimeout(() => dom.newBtn.classList.add('pulse'), 1000);
  }
}

function setupAngleChord(offsetRatio) {
  let ang = cutState.targetAngle;
  for (let i = 0; i < 8; i++) {
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const nx = -uy, ny = ux;
    let pMin = Infinity, pMax = -Infinity;
    for (const p of state.shape.outer) {
      const proj = (p.x - CX) * nx + (p.y - CY) * ny;
      if (proj < pMin) pMin = proj;
      if (proj > pMax) pMax = proj;
    }
    const span = pMax - pMin;
    if (span > 0) {
      const margin = span * 0.15;
      const lo = pMin + margin, hi = pMax - margin;
      const t = lo + offsetRatio * (hi - lo);
      const cxp = CX + nx * t, cyp = CY + ny * t;
      const p0 = { x: cxp, y: cyp };
      const p1 = { x: cxp + ux * 10, y: cyp + uy * 10 };
      const chord = lineShapeChord(p0, p1, state.shape.outer);
      if (chord) {
        cutState.cuts = [chord];
        cutState.targetAngle = ang;
        return;
      }
    }
    ang += Math.PI / 8;
  }
  cutState.cuts = [];
}

function cutOnNewShape() {
  const v = cutVariation();
  const hash = state.hash || 'default';
  if (v === 'ratio') {
    cutState.targetRatio = withSeed(
      seedFromString(hash + ':ratio'),
      () => 0.05 + Math.random() * 0.45
    );
  } else if (v === 'angle') {
    cutState.targetAngle = withSeed(
      seedFromString(hash + ':angle'),
      () => Math.random() * Math.PI
    );
    const offsetRatio = withSeed(
      seedFromString(hash + ':angle-offset'),
      () => Math.random()
    );
    setupAngleChord(offsetRatio);
  }
  renderCutAll();
  renderGhostBisector();
}

function translateCutLine(idx, delta, constrainPerp) {
  const init = cutState.dragInitialCuts && cutState.dragInitialCuts[0];
  if (!init) return;
  const dx = init.b.x - init.a.x, dy = init.b.y - init.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  let sx, sy;
  if (constrainPerp) {
    const shift = delta.x * nx + delta.y * ny;
    sx = nx * shift; sy = ny * shift;
  } else {
    sx = delta.x; sy = delta.y;
  }
  const mx = (init.a.x + init.b.x) / 2 + sx;
  const my = (init.a.y + init.b.y) / 2 + sy;
  const p0 = { x: mx, y: my };
  const p1 = { x: mx + ux * 10, y: my + uy * 10 };
  const chord = lineShapeChord(p0, p1, state.shape.outer);
  if (chord) cutState.cuts[idx] = chord;
}
