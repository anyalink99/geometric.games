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

function isCurrentDailyLocked() {
  return !!(state.daily && getTodayLock(state.mode, currentVariation()));
}

function maybePulseNewBtn(delayMs) {
  if (isCurrentDailyLocked()) return;
  setTimeout(() => dom.newBtn.classList.add('pulse'), delayMs);
}

function updateActionButton() {
  const btn = dom.newBtn;
  const needsConfirm = modeRunner[state.mode].hasPendingConfirm();
  if (needsConfirm) {
    btn.textContent = 'Confirm';
    btn.dataset.action = 'confirm';
    btn.disabled = false;
  } else if (isCurrentDailyLocked()) {
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

// Single-shot: on failure drop straight to the plain generator; no retries.
function generateShapeForMode() {
  const api = MODE_REGISTRY[state.mode] && MODE_REGISTRY[state.mode].api;
  if (api && api.pickShape) return api.pickShape();
  return generateShape();
}

function resetAllModes() {
  for (const m of MODE_LIST) modeRunner[m].reset();
}

let precomputed = null;
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
  modeRunner[state.mode].onShapeReady();
  dom.newBtn.classList.remove('pulse');
  updateActionButton();

  // Replay today's locked daily instead of a fresh attempt.
  if (state.daily) {
    const lock = getTodayLock(state.mode, currentVariation());
    if (lock && lock.snapshot) replayDailyLock(lock);
  }

  const urlHash = state.daily ? null : state.hash;
  if (nav === 'replace') replaceRoute(state.mode, currentVariation(), urlHash, state.daily);
  else if (nav === 'push') pushRoute(state.mode, currentVariation(), urlHash, state.daily);

  trackWithContext('game_start', { hash: state.hash || null });
  schedulePrecompute();
}

function replayDailyLock(lock) {
  modeRunner[state.mode].restoreSnapshot(lock.snapshot);
  modeRunner[state.mode].confirm({ replay: true });
}

function setMode(m) {
  if (!isValidMode(m)) return;
  const from = state.mode;
  state.mode = m;
  document.body.dataset.mode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
  if (from !== m) trackEvent('mode_switch', { from, to: m });
  newShape();
}

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
  const from = state[cfg.stateKey];
  commitVariationChoice(mode, variation);
  trackEvent('variation_switch', { mode, from, to: variation });
  if (state.mode !== mode) return;
  // Daily seed depends on (mode, variation), so changing variation = new shape + lock.
  if (state.daily) {
    newShape();
    return;
  }
  state.locked = false;
  modeRunner[mode].reset();
  renderShape(state.shape);
  modeRunner[mode].onShapeReady();
  dom.newBtn.classList.remove('pulse');
  updateActionButton();
  pushRoute(mode, variation, state.daily ? null : state.hash, state.daily);
}

// URL is the source of truth: ?daily=1 on, absent off.
function setDailyMode(daily) {
  daily = !!daily;
  if (state.daily === daily) return;
  state.daily = daily;
  trackEvent('daily_toggle', { mode: state.mode, variation: currentVariation(), on: daily });
  newShape();
}

// Same-mode: re-render only. Cross-mode: commit variation first, then setMode
// so newShape() generates a shape already wired to the target variation.
function applyPuzzleChoice(mode, variation) {
  if (!isValidVariation(mode, variation)) return;
  if (state.mode === mode) {
    setVariation(mode, variation);
    return;
  }
  commitVariationChoice(mode, variation);
  setMode(mode);
}
