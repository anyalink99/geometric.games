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

function updateStatsSubtitle() {
  const cfg = modeConfig(state.mode);
  if (!statsSubtitle || !cfg) return;
  statsSubtitle.textContent = cfg.label + ' · ' + variationLabel(state.mode, currentVariation());
}

function openStatsModal() {
  statsCutSection.style.display = state.mode === 'cut' ? '' : 'none';
  statsInscribeSection.style.display = state.mode === 'inscribe' ? '' : 'none';
  statsBalanceSection.style.display = state.mode === 'balance' ? '' : 'none';
  updateStatsSubtitle();
  renderStatsInto(statsEls, state.mode, currentVariation());
  openModal('stats-modal');
}

document.getElementById('reset-stats').addEventListener('click', () => {
  if (confirm('Reset stats?')) {
    resetStats(state.mode, currentVariation());
    renderStatsInto(statsEls, state.mode, currentVariation());
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
  // Suppress scrollbar for the first couple of frames only — the initial
  // layout pass can briefly compute an overflow before flex settles, which
  // flashes a scrollbar on tall viewports where one isn't needed at all.
  // Two rAFs is ~32ms (imperceptible) and guarantees the first paint has
  // committed. If scroll is actually needed, CSS overflow-y: auto shows
  // it right after — no awkward delay.
  const container = document.querySelector('#puzzle-modal .var-groups');
  if (container) {
    container.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Don't stomp on tab-switch animation's own overflow handling.
        if (!container._heightAnim) container.style.overflow = '';
      });
    });
  }
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
    container.style.overflow = '';
  }

  const startH = container.offsetHeight;
  puzzleModalTab = newMode;
  refreshPuzzleModal();
  const endH = container.offsetHeight;
  if (startH === endH) return;

  // Clip overflow during the animation so transient content > container
  // mismatch doesn't show a scrollbar while the height is mid-morph.
  container.style.overflow = 'hidden';
  const anim = container.animate(
    [{ height: startH + 'px' }, { height: endH + 'px' }],
    { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
  );
  container._heightAnim = anim;
  anim.finished.finally(() => {
    if (container._heightAnim === anim) {
      container.style.overflow = '';
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
if (!isValidMode(initialMode)) {
  try { initialMode = localStorage.getItem(MODE_KEY); } catch (e) {}
  if (!isValidMode(initialMode)) initialMode = 'cut';
}
state.mode = initialMode;
try { localStorage.setItem(MODE_KEY, state.mode); } catch (e) {}
document.body.dataset.mode = state.mode;

function pickInitialVariation(mode) {
  const cfg = modeConfig(mode);
  if (state.mode === mode && isValidVariation(mode, window.__INITIAL_VARIATION)) {
    return window.__INITIAL_VARIATION;
  }
  if (state.mode === mode && isValidVariation(mode, initialRoute.variation)) {
    return initialRoute.variation;
  }
  try {
    const v = localStorage.getItem(cfg.storageKey);
    if (isValidVariation(mode, v)) return v;
  } catch (e) {}
  return cfg.defaultVariation;
}

for (const mode of MODE_LIST) {
  const cfg = modeConfig(mode);
  const v = pickInitialVariation(mode);
  state[cfg.stateKey] = v;
  document.body.dataset[cfg.bodyAttr] = v;
}

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
  if (loc.variation && isValidVariation(state.mode, loc.variation)) {
    const cfg = modeConfig(state.mode);
    if (state[cfg.stateKey] !== loc.variation) {
      state[cfg.stateKey] = loc.variation;
      document.body.dataset[cfg.bodyAttr] = loc.variation;
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
