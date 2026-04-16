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
  } else {
    newShape();
  }
});
document.getElementById('gamemode-btn').addEventListener('click', () => openModal('gamemode-modal'));
document.getElementById('help-btn').addEventListener('click', () => openModal('help-modal'));
document.getElementById('close-help').addEventListener('click', () => closeModal('help-modal'));
document.getElementById('close-gamemode').addEventListener('click', () => closeModal('gamemode-modal'));
document.getElementById('close-stats').addEventListener('click', () => closeModal('stats-modal'));
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
}
document.getElementById('gamemode-btn').addEventListener('click', refreshModeCards);

bindModalDismissers();
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });

initCutInput();
initSquareInput();
initMassInput();

loadStats();

let savedMode = 'cut';
try { savedMode = localStorage.getItem(MODE_KEY) || 'cut'; } catch (e) {}
state.mode = ['cut', 'square', 'mass'].includes(savedMode) ? savedMode : 'cut';
document.body.dataset.mode = state.mode;
refreshModeCards();
newShape();
