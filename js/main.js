const statsEls = {
  attempts: document.getElementById('s-attempts'),
  best: document.getElementById('s-best'),
  avg: document.getElementById('s-avg'),
  perfect: document.getElementById('s-perfect'),
  inAttempts: document.getElementById('in-attempts'),
  inBest: document.getElementById('in-best'),
  inAvg: document.getElementById('in-avg'),
  inPerfect: document.getElementById('in-perfect'),
  blAttempts: document.getElementById('bl-attempts'),
  blBest: document.getElementById('bl-best'),
  blAvg: document.getElementById('bl-avg'),
  blPerfect: document.getElementById('bl-perfect'),
};

const MODES = ['cut', 'inscribe', 'balance'];

// ---- Main action button (Confirm / New Shape) ----
document.getElementById('new-btn').addEventListener('click', () => {
  const action = dom.newBtn.dataset.action;
  if (action === 'confirm') {
    if (state.mode === 'inscribe') confirmInscribe();
    else if (state.mode === 'balance') confirmBalance();
    else if (state.mode === 'cut') finalizeCut();
  } else {
    newShape();
  }
});

// ---- Help + Stats modals ----
document.getElementById('help-btn').addEventListener('click', () => openModal('help-modal'));
document.getElementById('close-help').addEventListener('click', () => closeModal('help-modal'));
document.getElementById('close-stats').addEventListener('click', () => closeModal('stats-modal'));

const statsCutSection = document.getElementById('stats-cut-section');
const statsInscribeSection = document.getElementById('stats-inscribe-section');
const statsBalanceSection = document.getElementById('stats-balance-section');
const statsSubtitle = document.getElementById('stats-subtitle');

const CUT_VARIATION_LABELS = {
  half: 'Half',
  ratio: 'Target Ratio',
  quad: 'Quad Cut',
  tri: 'Tri Cut',
  angle: 'Constrained Angle',
};
const INSCRIBE_VARIATION_LABELS = {
  square: 'Square',
  triangle: 'Equilateral Triangle',
};
const BALANCE_VARIATION_LABELS = {
  centroid: 'Centroid',
  pole: 'Pole Balance',
};

function currentStatsVariation() {
  if (state.mode === 'cut') return state.cutVariation;
  if (state.mode === 'inscribe') return state.inscribeVariation;
  if (state.mode === 'balance') return state.balanceVariation;
  return null;
}

function updateStatsSubtitle() {
  if (!statsSubtitle) return;
  if (state.mode === 'cut') {
    statsSubtitle.textContent = 'Cut · ' + (CUT_VARIATION_LABELS[state.cutVariation] || state.cutVariation);
  } else if (state.mode === 'inscribe') {
    statsSubtitle.textContent = 'Inscribe · ' + (INSCRIBE_VARIATION_LABELS[state.inscribeVariation] || state.inscribeVariation);
  } else if (state.mode === 'balance') {
    statsSubtitle.textContent = 'Balance · ' + (BALANCE_VARIATION_LABELS[state.balanceVariation] || state.balanceVariation);
  }
}

function openStatsModal() {
  statsCutSection.style.display = state.mode === 'cut' ? '' : 'none';
  statsInscribeSection.style.display = state.mode === 'inscribe' ? '' : 'none';
  statsBalanceSection.style.display = state.mode === 'balance' ? '' : 'none';
  updateStatsSubtitle();
  renderStatsInto(statsEls, state.mode, currentStatsVariation());
  openModal('stats-modal');
}

document.getElementById('reset-stats').addEventListener('click', () => {
  if (confirm('Reset stats?')) {
    resetStats(state.mode, currentStatsVariation());
    renderStatsInto(statsEls, state.mode, currentStatsVariation());
  }
});
document.getElementById('stats-btn').addEventListener('click', openStatsModal);

// ---- Unified Puzzle modal (mode + variation + endless/daily) ----
//
// Flow: opening the modal initializes the tab to the current mode and marks
// the current variation with a dot. Clicking a mode tab only switches which
// variation list is visible; game state doesn't change until the user picks a
// variation card (which commits mode + variation + current daily state in one
// shot and closes the modal). The Endless/Daily pills are live — toggling
// regenerates immediately without closing.
let puzzleModalTab = null;

function refreshPuzzleModal() {
  document.querySelectorAll('#puzzle-modal .mode-tab').forEach(t => {
    const on = t.dataset.mode === puzzleModalTab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('#puzzle-modal .var-group').forEach(g => {
    g.classList.toggle('active', g.dataset.mode === puzzleModalTab);
  });
  // Active dot only on the card that matches the variation currently in play
  // within the mode currently in play.
  document.querySelectorAll('#puzzle-modal .var-card').forEach(c => {
    const groupMode = c.closest('.var-group').dataset.mode;
    const isCurrentMode = groupMode === state.mode;
    const currentVar = currentVariation();
    c.classList.toggle('active', isCurrentMode && c.dataset.var === currentVar);
  });
  document.querySelectorAll('#puzzle-modal .seed-pill').forEach(p => {
    const isDaily = p.dataset.seed === 'daily';
    const on = isDaily === !!state.daily;
    p.classList.toggle('active', on);
    p.setAttribute('aria-selected', String(on));
  });
  const sub = document.getElementById('daily-sub');
  if (sub) sub.textContent = '#' + dailyIndex() + ' · everyone plays the same';
}

function openPuzzleModal() {
  puzzleModalTab = state.mode;
  refreshPuzzleModal();
  openModal('puzzle-modal');
}

document.getElementById('gamemode-btn').addEventListener('click', openPuzzleModal);
document.getElementById('close-puzzle').addEventListener('click', () => closeModal('puzzle-modal'));

// Switch the visible variation group with a smooth height animation. Uses
// Web Animations API so there's no inline style residue and no interference
// with CSS transitions on child opacity/backgrounds.
function switchPuzzleTab(newMode) {
  if (puzzleModalTab === newMode) return;
  const container = document.querySelector('#puzzle-modal .var-groups');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!container || reduceMotion || typeof container.animate !== 'function') {
    puzzleModalTab = newMode;
    refreshPuzzleModal();
    return;
  }

  // Cancel any prior in-flight animation so we don't stack.
  if (container._heightAnim) {
    container._heightAnim.cancel();
    container._heightAnim = null;
  }

  const startH = container.offsetHeight;
  puzzleModalTab = newMode;
  refreshPuzzleModal();
  const endH = container.offsetHeight;
  if (startH === endH) return;

  const anim = container.animate(
    [{ height: startH + 'px' }, { height: endH + 'px' }],
    { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
  );
  container._heightAnim = anim;
  anim.finished.finally(() => {
    if (container._heightAnim === anim) {
      container._heightAnim = null;
    }
  });
}

document.querySelectorAll('#puzzle-modal .mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    switchPuzzleTab(tab.dataset.mode);
  });
});

document.querySelectorAll('#puzzle-modal .var-card').forEach(card => {
  card.addEventListener('click', () => {
    const v = card.dataset.var;
    const groupMode = card.closest('.var-group').dataset.mode;
    closeModal('puzzle-modal');
    applyPuzzleChoice(groupMode, v);
  });
});

document.querySelectorAll('#puzzle-modal .seed-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    setDailyMode(pill.dataset.seed === 'daily');
    refreshPuzzleModal();
  });
});

bindModalDismissers();
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });

initCutInput();
initInscribeInput();
initBalanceInput();

loadStats();

const initialRoute = parseLocation();

// Authoritative source for mode+variation is the HTML file that was served.
// Each generated page exposes window.__INITIAL_MODE / __INITIAL_VARIATION.
// parseLocation() is used as a fallback (e.g. if 404 redirected us here) and
// always to pull the ?s= hash and ?daily=1 flag.
let initialMode = window.__INITIAL_MODE || initialRoute.mode;
if (!initialMode || !MODES.includes(initialMode)) {
  try { initialMode = localStorage.getItem(MODE_KEY); } catch (e) {}
  if (!initialMode || !MODES.includes(initialMode)) initialMode = 'cut';
}
state.mode = initialMode;
try { localStorage.setItem(MODE_KEY, state.mode); } catch (e) {}
document.body.dataset.mode = state.mode;

function pickInitialVariation(mode, urlVar, validList, storageKey, fallback) {
  if (state.mode === mode && window.__INITIAL_VARIATION && validList.includes(window.__INITIAL_VARIATION)) {
    return window.__INITIAL_VARIATION;
  }
  if (state.mode === mode && urlVar && validList.includes(urlVar)) {
    return urlVar;
  }
  try {
    const v = localStorage.getItem(storageKey);
    if (v && validList.includes(v)) return v;
  } catch (e) {}
  return fallback;
}

state.cutVariation = pickInitialVariation('cut', initialRoute.variation, CUT_VARIATIONS, CUT_VARIATION_KEY, 'half');
document.body.dataset.cutVariation = state.cutVariation;

state.inscribeVariation = pickInitialVariation('inscribe', initialRoute.variation, INSCRIBE_VARIATIONS, INSCRIBE_VARIATION_KEY, 'square');
document.body.dataset.inscribeVariation = state.inscribeVariation;

state.balanceVariation = pickInitialVariation('balance', initialRoute.variation, BALANCE_VARIATIONS, BALANCE_VARIATION_KEY, 'pole');
document.body.dataset.balanceVariation = state.balanceVariation;

state.daily = !!initialRoute.daily;

newShape(initialRoute.hash || undefined, 'replace');

window.addEventListener('popstate', () => {
  const loc = parseLocation();
  const targetMode = loc.mode || state.mode;
  if (targetMode !== state.mode) {
    state.mode = targetMode;
    document.body.dataset.mode = state.mode;
    try { localStorage.setItem(MODE_KEY, state.mode); } catch (e) {}
  }
  if (loc.variation) {
    if (state.mode === 'cut' && loc.variation !== state.cutVariation) {
      state.cutVariation = loc.variation;
      document.body.dataset.cutVariation = loc.variation;
    } else if (state.mode === 'inscribe' && loc.variation !== state.inscribeVariation) {
      state.inscribeVariation = loc.variation;
      document.body.dataset.inscribeVariation = loc.variation;
    } else if (state.mode === 'balance' && loc.variation !== state.balanceVariation) {
      state.balanceVariation = loc.variation;
      document.body.dataset.balanceVariation = loc.variation;
    }
  }
  const dailyChanged = !!loc.daily !== !!state.daily;
  state.daily = !!loc.daily;
  updateMeta(state.mode, currentVariation());
  if (dailyChanged || (loc.hash && loc.hash !== state.hash)) {
    // Seed source changed or explicit different hash — regenerate.
    newShape(loc.daily ? undefined : loc.hash, 'skip');
  } else if (!loc.hash && !loc.daily) {
    newShape(undefined, 'replace');
  } else {
    newShape(state.hash, 'skip');
  }
});
