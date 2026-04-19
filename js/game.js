const state = {
  mode: 'cut',
  cutVariation: 'half',
  inscribeVariation: 'square',
  balanceVariation: 'pole',
  shape: { outer: [], holes: [] },
  locked: false,
  hash: null,
};

function balanceVariation() {
  return state.balanceVariation || 'pole';
}

function updateActionButton() {
  const btn = dom.newBtn;
  let needsConfirm = false;
  if (state.mode === 'inscribe' && inscribeState.points.length === inscribeN() && !inscribeState.confirmed) needsConfirm = true;
  else if (state.mode === 'balance') {
    if (balanceVariation() === 'pole') needsConfirm = !poleState.confirmed && poleState.pole != null;
    else needsConfirm = !centroidState.confirmed && centroidState.guess != null;
  }
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
  if (state.mode === 'inscribe') {
    for (let i = 0; i < 40; i++) {
      const s = generateShape();
      if (!s.holes || s.holes.length === 0) return s;
    }
    const s = generateShape();
    return { outer: s.outer, holes: [] };
  }
  if (state.mode === 'balance') {
    return generateBalanceShape();
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
  if (state.mode === 'inscribe') {
    inscribeReset();
    renderInscribeAll();
    precomputeIdeal(state.shape.outer);
  } else if (state.mode === 'balance') {
    balanceReset();
    updateBalanceHint();
    dom.hitPad.style.cursor = 'crosshair';
    if (balanceVariation() === 'pole') onPoleShapeReady();
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
  if (m !== 'cut' && m !== 'inscribe' && m !== 'balance') return;
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

function setBalanceVariation(v) {
  if (!BALANCE_VARIATIONS.includes(v)) return;
  state.balanceVariation = v;
  document.body.dataset.balanceVariation = v;
  try { localStorage.setItem(BALANCE_VARIATION_KEY, v); } catch (e) {}
  if (state.mode === 'balance') {
    state.locked = false;
    balanceReset();
    renderShape(state.shape);
    if (v === 'pole') onPoleShapeReady();
    updateBalanceHint();
    dom.hitPad.style.cursor = 'crosshair';
    dom.newBtn.classList.remove('pulse');
    updateActionButton();
  }
}

function setInscribeVariation(v) {
  if (!INSCRIBE_VARIATIONS.includes(v)) return;
  state.inscribeVariation = v;
  document.body.dataset.inscribeVariation = v;
  try { localStorage.setItem(INSCRIBE_VARIATION_KEY, v); } catch (e) {}
  if (state.mode === 'inscribe') {
    state.locked = false;
    inscribeReset();
    renderShape(state.shape);
    precomputeIdeal(state.shape.outer);
    renderInscribeAll();
    dom.newBtn.classList.remove('pulse');
    updateActionButton();
  }
}
