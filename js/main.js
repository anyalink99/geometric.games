const statsEls = {
  attempts: document.getElementById('s-attempts'),
  best: document.getElementById('s-best'),
  avg: document.getElementById('s-avg'),
  perfect: document.getElementById('s-perfect'),
  sqAttempts: document.getElementById('sq-attempts'),
  sqBest: document.getElementById('sq-best'),
  sqAvg: document.getElementById('sq-avg'),
  sqPerfect: document.getElementById('sq-perfect'),
  msAttempts: document.getElementById('ms-attempts'),
  msBest: document.getElementById('ms-best'),
  msAvg: document.getElementById('ms-avg'),
  msPerfect: document.getElementById('ms-perfect'),
};

document.getElementById('new-btn').addEventListener('click', () => {
  const action = dom.newBtn.dataset.action;
  if (action === 'confirm') {
    if (state.mode === 'square') confirmSquare();
    else if (state.mode === 'mass') confirmMass();
    else if (state.mode === 'cut') finalizeCut();
  } else {
    newShape();
  }
});
document.getElementById('gamemode-btn').addEventListener('click', () => openModal('gamemode-modal'));
document.getElementById('help-btn').addEventListener('click', () => openModal('help-modal'));
document.getElementById('close-help').addEventListener('click', () => closeModal('help-modal'));
document.getElementById('close-gamemode').addEventListener('click', () => closeModal('gamemode-modal'));
document.getElementById('close-stats').addEventListener('click', () => closeModal('stats-modal'));
document.getElementById('close-variations').addEventListener('click', () => closeModal('variations-modal'));

const variationsBtn = document.getElementById('variations-btn');
function refreshVariationsBtn() {
  variationsBtn.style.display = state.mode === 'cut' ? '' : 'none';
}
variationsBtn.addEventListener('click', () => {
  refreshVarCards();
  closeModal('gamemode-modal');
  openModal('variations-modal');
});
document.querySelectorAll('.var-card').forEach(card => {
  card.addEventListener('click', () => {
    const v = card.dataset.var;
    closeModal('variations-modal');
    setCutVariation(v);
  });
});
function refreshVarCards() {
  document.querySelectorAll('.var-card').forEach(c => {
    c.classList.toggle('active', c.dataset.var === state.cutVariation);
  });
}
const statsCutSection = document.getElementById('stats-cut-section');
const statsSquareSection = document.getElementById('stats-square-section');
const statsMassSection = document.getElementById('stats-mass-section');

function openStatsModal() {
  statsCutSection.style.display = state.mode === 'cut' ? '' : 'none';
  statsSquareSection.style.display = state.mode === 'square' ? '' : 'none';
  statsMassSection.style.display = state.mode === 'mass' ? '' : 'none';
  renderStatsInto(statsEls);
  openModal('stats-modal');
}

document.getElementById('reset-stats').addEventListener('click', () => {
  if (confirm('Reset stats?')) {
    resetStats(state.mode);
    renderStatsInto(statsEls);
  }
});
document.getElementById('stats-btn').addEventListener('click', openStatsModal);

document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    const m = card.dataset.mode;
    closeModal('gamemode-modal');
    setMode(m);
  });
});

function refreshModeCards() {
  document.querySelectorAll('.mode-card').forEach(c => {
    c.classList.toggle('active', c.dataset.mode === state.mode);
  });
  refreshVariationsBtn();
}
document.getElementById('gamemode-btn').addEventListener('click', refreshModeCards);

bindModalDismissers();
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });

initCutInput();
initSquareInput();
initMassInput();

loadStats();

const initialRoute = parseLocation();
BASE_PATH = initialRoute.base;

let initialMode = initialRoute.mode;
if (!initialMode) {
  try { initialMode = localStorage.getItem(MODE_KEY); } catch (e) {}
  if (!initialMode || !['cut', 'square', 'mass'].includes(initialMode)) initialMode = 'cut';
}
state.mode = initialMode;
try { localStorage.setItem(MODE_KEY, state.mode); } catch (e) {}
document.body.dataset.mode = state.mode;

let initialVar = 'half';
try {
  const v = localStorage.getItem(CUT_VARIATION_KEY);
  if (v && CUT_VARIATIONS.includes(v)) initialVar = v;
} catch (e) {}
state.cutVariation = initialVar;
document.body.dataset.cutVariation = initialVar;

refreshModeCards();
newShape(initialRoute.hash || undefined, 'replace');

window.addEventListener('popstate', () => {
  const loc = parseLocation();
  if (!loc.mode) return;
  if (loc.mode !== state.mode) {
    state.mode = loc.mode;
    document.body.dataset.mode = state.mode;
    try { localStorage.setItem(MODE_KEY, state.mode); } catch (e) {}
    refreshModeCards();
  }
  if (loc.hash && loc.hash !== state.hash) {
    newShape(loc.hash, 'skip');
  } else if (!loc.hash) {
    newShape(undefined, 'replace');
  }
});
