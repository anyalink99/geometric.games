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

function generateShapeForMode() {
  return pickShapeFor(state.mode);
}

function resetAllModes() {
  for (const m of MODE_LIST) modeRunner[m].reset();
}

// Shape precompute runs in a Web Worker and fills a per-mode queue, so "New Shape"
// reads a ready result instead of blocking the main thread. Queues are keyed by mode
// (not variation) because pickShape logic is variation-agnostic — switching variation
// within a mode reuses prebuilt shapes.
const SHAPE_QUEUE_TARGET = 3;
const shapeQueue = {};
const shapePendingByMode = {};
const shapePendingReq = {};
let shapeReqIdCounter = 0;

function shapeQueueFor(mode) {
  return shapeQueue[mode] || (shapeQueue[mode] = []);
}

function requestShapeFill() {
  if (state.daily) return;
  const w = ensureWorker('shape');
  if (!w) return;
  const mode = state.mode;
  const q = shapeQueueFor(mode);
  const pending = shapePendingByMode[mode] || 0;
  const slots = SHAPE_QUEUE_TARGET - q.length - pending;
  if (slots <= 0) return;
  shapePendingByMode[mode] = pending + slots;
  for (let i = 0; i < slots; i++) {
    const reqId = ++shapeReqIdCounter;
    shapePendingReq[reqId] = mode;
    w.postMessage({ type: 'gen', reqId, hash: generateHash(), mode });
  }
}

function takeFromShapeQueue() {
  const q = shapeQueue[state.mode];
  return q && q.length ? q.shift() : null;
}

setWorkerHandler('shape', (e) => {
  const d = e.data;
  if (!d || d.type !== 'gen') return;
  const mode = shapePendingReq[d.reqId];
  if (!mode) return;
  delete shapePendingReq[d.reqId];
  shapePendingByMode[mode] = Math.max(0, (shapePendingByMode[mode] || 1) - 1);
  if (!d.error && d.shape) {
    shapeQueueFor(mode).push({ hash: d.hash, shape: d.shape });
  }
  requestShapeFill();
});

function newShape(hash, nav = 'push') {
  let h = hash;
  let cachedShape = null;
  if (!h && !state.daily) {
    const p = takeFromShapeQueue();
    if (p) { h = p.hash; cachedShape = p.shape; }
  }
  if (!h) {
    h = state.daily
      ? dailyHashFor(state.mode, currentVariation())
      : generateHash();
  }
  // Custom shapes from the editor travel as c-<base64url> tokens. The payload
  // itself carries the geometry, so we skip the random generator entirely. If
  // decoding fails (tampered URL, wrong version), fall back to a fresh random
  // shape so the page still loads.
  let customShape = null;
  if (isCustomShapeHash(h)) {
    customShape = decodeCustomShape(h);
    if (!customShape) {
      h = generateHash();
    }
  }
  state.hash = h;
  state.shape = customShape
    || cachedShape
    || withSeed(seedFromString(h), generateShapeForMode);
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
  requestShapeFill();
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
