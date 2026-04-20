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

function isCurrentDailyLocked() {
  return !!(state.daily && getTodayLock(state.mode, currentVariation()));
}

function maybePulseNewBtn(delayMs) {
  if (isCurrentDailyLocked()) return;
  setTimeout(() => dom.newBtn.classList.add('pulse'), delayMs);
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
    btn.disabled = false;
  } else if (isCurrentDailyLocked()) {
    // Today's daily for this mode+variation is already answered. Replace
    // "New Shape" with a countdown to the next UTC day so the user can't
    // regenerate and re-guess.
    btn.textContent = nextDailyCountdownLabel();
    btn.dataset.action = 'locked';
    btn.disabled = true;
    btn.classList.remove('pulse');
  } else {
    btn.textContent = 'New Shape';
    btn.dataset.action = 'new';
    btn.disabled = false;
  }
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) shareBtn.hidden = !state.locked;
}

function finalizeWithHoles(shape) {
  const centered = centerShapeObject(shape);
  return normalizeShapeArea(centered);
}

// One shot per branch: try the Balance-style path with probability, fall back
// to the plain generator if it doesn't yield a normalizable result. No retries
// — the plain generator is fast and always succeeds.
function generateShapeForMode() {
  if (state.mode === 'inscribe') {
    if (Math.random() < 0.25) {
      const balance = generateInscribeBalanceShape();
      if (balance) {
        const finalized = finalizeWithHoles(balance);
        if (finalized) return finalized;
      }
    }
    return generateShape({ noHoles: true, noSymmetry: true });
  }
  if (state.mode === 'balance') {
    return generateBalanceShape();
  }
  if (Math.random() < 0.15) {
    const finalized = finalizeWithHoles(generateBalanceShape());
    if (finalized) return finalized;
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

// Precomputed next endless shape for the current mode+variation. Best-effort:
// populated in idle time after each newShape(); if not ready when the user
// clicks, we just generate synchronously. Idle-only — no setTimeout fallback
// (a timer that fires during interaction is worse than a small sync freeze).
let precomputed = null; // { mode, variation, hash, shape }
let precomputeId = null;

function cancelPrecompute() {
  if (precomputeId != null && typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(precomputeId);
  }
  precomputeId = null;
}

function schedulePrecompute() {
  cancelPrecompute();
  precomputed = null;
  if (state.daily) return;
  if (typeof requestIdleCallback !== 'function') return;
  const mode = state.mode;
  const variation = currentVariation();
  precomputeId = requestIdleCallback(() => {
    precomputeId = null;
    if (state.mode !== mode || currentVariation() !== variation || state.daily) return;
    const hash = generateHash();
    let shape;
    try { shape = withSeed(seedFromString(hash), generateShapeForMode); }
    catch (e) { return; }
    if (state.mode !== mode || currentVariation() !== variation || state.daily) return;
    precomputed = { mode, variation, hash, shape };
  }, { timeout: 1500 });
}

function takePrecomputed() {
  if (!precomputed) return null;
  if (precomputed.mode !== state.mode || precomputed.variation !== currentVariation()) {
    precomputed = null;
    return null;
  }
  const p = precomputed;
  precomputed = null;
  return p;
}

function newShape(hash, nav = 'push') {
  cancelPrecompute();
  let h = hash;
  let cachedShape = null;
  if (!h && !state.daily) {
    const p = takePrecomputed();
    if (p) { h = p.hash; cachedShape = p.shape; }
  } else {
    precomputed = null;
  }
  if (!h) {
    h = state.daily
      ? dailyHashFor(state.mode, currentVariation())
      : generateHash();
  }
  state.hash = h;
  state.shape = cachedShape || withSeed(seedFromString(h), generateShapeForMode);
  state.locked = false;
  resetAllModes();
  renderShape(state.shape);
  MODE_HOOKS[state.mode].init();
  dom.newBtn.classList.remove('pulse');
  updateActionButton();

  // If this is a daily that's already been confirmed today, restore the
  // user's original placements and replay the confirm flow so the board
  // shows their locked result instead of a fresh attempt.
  if (state.daily) {
    const lock = getTodayLock(state.mode, currentVariation());
    if (lock && lock.snapshot) replayDailyLock(lock);
  }

  // In daily mode the URL is ?daily=1 (no seed hash — it's derived from the date).
  const urlHash = state.daily ? null : state.hash;
  if (nav === 'replace') replaceRoute(state.mode, currentVariation(), urlHash, state.daily);
  else if (nav === 'push') pushRoute(state.mode, currentVariation(), urlHash, state.daily);

  schedulePrecompute();
}

function replayDailyLock(lock) {
  if (state.mode === 'cut') {
    cutRestoreSnapshot(lock.snapshot);
    finalizeCut({ replay: true });
  } else if (state.mode === 'inscribe') {
    inscribeRestoreSnapshot(lock.snapshot);
    confirmInscribe({ replay: true });
  } else if (state.mode === 'balance') {
    if (balanceVariation() === 'pole') {
      poleRestoreSnapshot(lock.snapshot);
      confirmPole({ replay: true });
    } else {
      centroidRestoreSnapshot(lock.snapshot);
      confirmCentroid({ replay: true });
    }
  }
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
  // In daily mode the seed depends on (mode, variation) — changing variation
  // means a different shape, and any existing daily lock belongs to the new
  // variation. Regenerate so newShape() picks up the right seed + replay.
  if (state.daily) {
    newShape();
    return;
  }
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
