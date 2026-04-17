const state = {
  mode: 'cut',
  cutVariation: 'half',
  squareVariation: 'square',
  shape: { outer: [], holes: [] },
  locked: false,
  hash: null,
};

function updateActionButton() {
  const btn = dom.newBtn;
  let needsConfirm = false;
  if (state.mode === 'square' && squareState.points.length === squareN() && !squareState.confirmed) needsConfirm = true;
  else if (state.mode === 'mass' && massState.guess && !massState.confirmed) needsConfirm = true;
  else if (state.mode === 'cut' && !cutState.confirmed) {
    const v = cutVariation();
    const placed = cutState.cuts.length;
    if (v === 'angle') needsConfirm = placed >= 1;
    else needsConfirm = placed >= cutRequiredCount();
  }
  if (needsConfirm) {
    btn.textContent = 'Confirm';
    btn.dataset.action = 'confirm';
  } else {
    btn.textContent = 'New Shape';
    btn.dataset.action = 'new';
  }
}

function generateShapeForMode() {
  if (state.mode === 'square') {
    for (let i = 0; i < 40; i++) {
      const s = generateShape();
      if (!s.holes || s.holes.length === 0) return s;
    }
    const s = generateShape();
    return { outer: s.outer, holes: [] };
  }
  if (state.mode === 'mass') {
    return generateMassShape();
  }
  return generateShape();
}

function newShape(hash, nav = 'push') {
  const h = hash || generateHash();
  state.hash = h;
  state.shape = withSeed(seedFromString(h), generateShapeForMode);
  state.locked = false;
  cutReset();
  renderShape(state.shape);
  if (state.mode === 'square') {
    squareReset();
    renderSquareAll();
    precomputeIdeal(state.shape.outer);
  } else if (state.mode === 'mass') {
    massReset();
    updateMassHint();
    dom.hitPad.style.cursor = 'crosshair';
  } else {
    cutOnNewShape();
    dom.hitPad.style.cursor = '';
  }
  dom.newBtn.classList.remove('pulse');
  updateActionButton();
  if (nav === 'replace') replaceRoute(state.mode, state.hash);
  else if (nav === 'push') pushRoute(state.mode, state.hash);
}

function setMode(m) {
  if (m !== 'cut' && m !== 'square' && m !== 'mass') return;
  state.mode = m;
  document.body.dataset.mode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
  newShape();
}

function setCutVariation(v) {
  if (!CUT_VARIATIONS.includes(v)) return;
  state.cutVariation = v;
  document.body.dataset.cutVariation = v;
  try { localStorage.setItem(CUT_VARIATION_KEY, v); } catch (e) {}
  if (state.mode === 'cut') {
    state.locked = false;
    cutReset();
    renderShape(state.shape);
    cutOnNewShape();
    dom.newBtn.classList.remove('pulse');
    updateActionButton();
  }
}

function setSquareVariation(v) {
  if (!SQUARE_VARIATIONS.includes(v)) return;
  state.squareVariation = v;
  document.body.dataset.squareVariation = v;
  try { localStorage.setItem(SQUARE_VARIATION_KEY, v); } catch (e) {}
  if (state.mode === 'square') {
    state.locked = false;
    squareReset();
    renderShape(state.shape);
    precomputeIdeal(state.shape.outer);
    renderSquareAll();
    dom.newBtn.classList.remove('pulse');
    updateActionButton();
  }
}
