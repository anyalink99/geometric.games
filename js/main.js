const statsEls = {
  attempts: document.getElementById('s-attempts'),
  best: document.getElementById('s-best'),
  avg: document.getElementById('s-avg'),
  perfect: document.getElementById('s-perfect'),
  dailyWins: document.getElementById('s-daily-wins'),
  inAttempts: document.getElementById('in-attempts'),
  inBest: document.getElementById('in-best'),
  inAvg: document.getElementById('in-avg'),
  inPerfect: document.getElementById('in-perfect'),
  inDailyWins: document.getElementById('in-daily-wins'),
  blAttempts: document.getElementById('bl-attempts'),
  blBest: document.getElementById('bl-best'),
  blAvg: document.getElementById('bl-avg'),
  blPerfect: document.getElementById('bl-perfect'),
  blDailyWins: document.getElementById('bl-daily-wins'),
};

document.getElementById('new-btn').addEventListener('click', () => {
  const action = dom.newBtn.dataset.action;
  if (action === 'confirm') modeRunner[state.mode].confirm();
  else if (action !== 'locked') newShape();
});

setInterval(() => {
  if (isCurrentDailyLocked()) updateActionButton();
}, 30000);

document.getElementById('help-btn').addEventListener('click', () => {
  openModal('help-modal');
  trackWithContext('help_opened');
});
document.getElementById('close-help').addEventListener('click', () => closeModal('help-modal'));
document.getElementById('close-stats').addEventListener('click', () => closeModal('stats-modal'));

const statsSubtitle = document.getElementById('stats-subtitle');

function updateStatsSubtitle() {
  const cfg = modeConfig(state.mode);
  if (!statsSubtitle || !cfg) return;
  statsSubtitle.textContent = cfg.label + ' · ' + variationLabel(state.mode, currentVariation());
}

function openStatsModal() {
  for (const m of MODE_LIST) {
    const sec = document.getElementById(MODE_REGISTRY[m].statsSectionId);
    if (sec) sec.style.display = state.mode === m ? '' : 'none';
  }
  updateStatsSubtitle();
  renderStatsInto(statsEls, state.mode, currentVariation());
  openModal('stats-modal');
  trackWithContext('stats_opened');
}

document.getElementById('reset-stats').addEventListener('click', () => {
  if (confirm('Reset stats?')) {
    resetStats(state.mode, currentVariation());
    renderStatsInto(statsEls, state.mode, currentVariation());
  }
});
document.getElementById('stats-btn').addEventListener('click', openStatsModal);

bindModalDismissers();
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });

// Android long-press fires contextmenu with a haptic pulse even when pointerdown
// is preventDefault'd. Killing it on the board keeps point-drag silent on mobile.
const stageEl = document.querySelector('.stage');
if (stageEl) {
  stageEl.addEventListener('contextmenu', e => e.preventDefault());
  stageEl.addEventListener('selectstart', e => e.preventDefault());
}

initCutInput();
initInscribeInput();
initBalanceInput();

loadStats();

const initialRoute = parseLocation();

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
    newShape(loc.daily ? undefined : loc.hash, 'skip');
  } else if (!loc.hash && !loc.daily) {
    newShape(undefined, 'replace');
  } else {
    newShape(state.hash, 'skip');
  }
});
