const state = {
  mode: 'cut',
  shape: { outer: [], holes: [] },
  locked: false,
};

function updateActionButton() {
  const btn = dom.newBtn;
  const needsConfirm =
    (state.mode === 'square' && squareState.points.length === 4 && !squareState.confirmed) ||
    (state.mode === 'mass' && massState.guess && !massState.confirmed);
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

function newShape() {
  state.shape = generateShapeForMode();
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
    setCutHint();
    dom.hitPad.style.cursor = '';
  }
  dom.newBtn.classList.remove('pulse');
  updateActionButton();
}

function setMode(m) {
  if (m !== 'cut' && m !== 'square' && m !== 'mass') return;
  state.mode = m;
  document.body.dataset.mode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
  newShape();
}
