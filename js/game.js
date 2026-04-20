const state = {
  mode: 'cut',
  cutVariation: 'half',
  inscribeVariation: 'square',
  balanceVariation: 'pole',
  shape: { outer: [], holes: [] },
  locked: false,
  hash: null,
  daily: false,
};

function currentVariation() {
  const cfg = modeConfig(state.mode);
  return cfg ? state[cfg.stateKey] : 'half';
}

// Per-mode lifecycle hooks. `reset()` clears in-memory state + transient SVG
// layers; `init()` runs after the fresh shape is rendered. Both are looked up
// by mode at the call site, so newShape() / setVariation() never branch on
// mode themselves.
const MODE_HOOKS = {
  cut: {
    reset() { cutReset(); },
    init() {
      cutOnNewShape();
      dom.hitPad.style.cursor = '';
    },
  },
  inscribe: {
    reset() { inscribeReset(); },
    init() {
      precomputeIdeal(state.shape.outer);
      renderInscribeAll();
    },
  },
  balance: {
    reset() { balanceReset(); },
    init() {
      if (balanceVariation() === 'pole') onPoleShapeReady();
      updateBalanceHint();
      dom.hitPad.style.cursor = 'crosshair';
    },
  },
};

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
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) shareBtn.hidden = !state.locked;
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

// Reset every mode's in-memory state on each new shape so leftover state from
// a prior mode never bleeds through after a mode switch. Cheap (just clears
// SVG layers and zeroes a few state objects); safer than the prior
// always-call-cutReset-only quirk.
function resetAllModes() {
  for (const m of MODE_LIST) MODE_HOOKS[m].reset();
}

function newShape(hash, nav = 'push') {
  let h = hash;
  if (!h) {
    h = state.daily
      ? dailyHashFor(state.mode, currentVariation())
      : generateHash();
  }
  state.hash = h;
  state.shape = withSeed(seedFromString(h), generateShapeForMode);
  state.locked = false;
  resetAllModes();
  renderShape(state.shape);
  MODE_HOOKS[state.mode].init();
  dom.newBtn.classList.remove('pulse');
  updateActionButton();
  // In daily mode the URL is ?daily=1 (no seed hash — it's derived from the date).
  const urlHash = state.daily ? null : state.hash;
  if (nav === 'replace') replaceRoute(state.mode, currentVariation(), urlHash, state.daily);
  else if (nav === 'push') pushRoute(state.mode, currentVariation(), urlHash, state.daily);
}

function setMode(m) {
  if (!isValidMode(m)) return;
  state.mode = m;
  document.body.dataset.mode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
  newShape();
}

// Write a variation choice for `mode` into state, body dataset, and storage.
// Used both as a primitive by setVariation and by cross-mode applyPuzzleChoice
// (where we want to commit the variation before switching modes so newShape()
// generates the right kind of shape).
function commitVariationChoice(mode, variation) {
  const cfg = modeConfig(mode);
  if (!cfg) return;
  state[cfg.stateKey] = variation;
  document.body.dataset[cfg.bodyAttr] = variation;
  try { localStorage.setItem(cfg.storageKey, variation); } catch (e) {}
}

function setVariation(mode, variation) {
  if (!isValidVariation(mode, variation)) return;
  const cfg = modeConfig(mode);
  if (state[cfg.stateKey] === variation && state.mode === mode) return;
  commitVariationChoice(mode, variation);
  if (state.mode !== mode) return;
  state.locked = false;
  MODE_HOOKS[mode].reset();
  renderShape(state.shape);
  MODE_HOOKS[mode].init();
  dom.newBtn.classList.remove('pulse');
  updateActionButton();
  pushRoute(mode, variation, state.daily ? null : state.hash, state.daily);
}

// Toggle between endless (random each shape) and daily (one shared seed per
// mode+variation per UTC day). URL is the source of truth: ?daily=1 on, absent
// off. Regenerates the current shape to match the new seed source.
function setDailyMode(daily) {
  daily = !!daily;
  if (state.daily === daily) return;
  state.daily = daily;
  newShape();
}

// Apply a combined mode+variation selection from the unified puzzle modal.
// Same-mode case uses setVariation (re-renders without a new shape); cross-mode
// commits the target variation first, then setMode generates a fresh shape
// already wired to the right variation.
function applyPuzzleChoice(mode, variation) {
  if (!isValidVariation(mode, variation)) return;
  if (state.mode === mode) {
    setVariation(mode, variation);
    return;
  }
  commitVariationChoice(mode, variation);
  setMode(mode);
}
