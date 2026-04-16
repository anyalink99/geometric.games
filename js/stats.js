const stats = {
  attempts: 0,
  perfect: 0,
  sumDiff: 0,
  bestDiff: Infinity,
};

const squareStats = {
  attempts: 0,
  perfect: 0,
  sumScore: 0,
  bestScore: -Infinity,
};

const massStats = {
  attempts: 0,
  perfect: 0,
  sumDist: 0,
  bestDist: Infinity,
};

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      stats.attempts = s.attempts || 0;
      stats.perfect = s.perfect || 0;
      stats.sumDiff = s.sumDiff || 0;
      stats.bestDiff = (s.bestDiff != null && isFinite(s.bestDiff)) ? s.bestDiff : Infinity;
    }
  } catch (e) {}
  try {
    const raw = localStorage.getItem(SQUARE_STATS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      squareStats.attempts = s.attempts || 0;
      squareStats.perfect = s.perfect || 0;
      squareStats.sumScore = s.sumScore || 0;
      squareStats.bestScore = (s.bestScore != null && isFinite(s.bestScore)) ? s.bestScore : -Infinity;
    }
  } catch (e) {}
  try {
    const raw = localStorage.getItem(MASS_STATS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      massStats.attempts = s.attempts || 0;
      massStats.perfect = s.perfect || 0;
      massStats.sumDist = s.sumDist || 0;
      massStats.bestDist = (s.bestDist != null && isFinite(s.bestDist)) ? s.bestDist : Infinity;
    }
  } catch (e) {}
}

function saveStats() {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify({
      attempts: stats.attempts,
      perfect: stats.perfect,
      sumDiff: stats.sumDiff,
      bestDiff: stats.bestDiff === Infinity ? null : stats.bestDiff,
    }));
  } catch (e) {}
}

function saveSquareStats() {
  try {
    localStorage.setItem(SQUARE_STATS_KEY, JSON.stringify({
      attempts: squareStats.attempts,
      perfect: squareStats.perfect,
      sumScore: squareStats.sumScore,
      bestScore: squareStats.bestScore === -Infinity ? null : squareStats.bestScore,
    }));
  } catch (e) {}
}

function saveMassStats() {
  try {
    localStorage.setItem(MASS_STATS_KEY, JSON.stringify({
      attempts: massStats.attempts,
      perfect: massStats.perfect,
      sumDist: massStats.sumDist,
      bestDist: massStats.bestDist === Infinity ? null : massStats.bestDist,
    }));
  } catch (e) {}
}

function resetStats(mode) {
  if (mode === 'square') {
    squareStats.attempts = 0;
    squareStats.perfect = 0;
    squareStats.sumScore = 0;
    squareStats.bestScore = -Infinity;
    saveSquareStats();
  } else if (mode === 'mass') {
    massStats.attempts = 0;
    massStats.perfect = 0;
    massStats.sumDist = 0;
    massStats.bestDist = Infinity;
    saveMassStats();
  } else {
    stats.attempts = 0;
    stats.perfect = 0;
    stats.sumDiff = 0;
    stats.bestDiff = Infinity;
    saveStats();
  }
}

function recordDiff(diff) {
  stats.attempts++;
  stats.sumDiff += diff;
  if (diff < stats.bestDiff) stats.bestDiff = diff;
  if (diff < 0.5) stats.perfect++;
  saveStats();
}

function recordSquareScore(score) {
  squareStats.attempts++;
  squareStats.sumScore += score;
  if (score > squareStats.bestScore) squareStats.bestScore = score;
  if (score >= 97) squareStats.perfect++;
  saveSquareStats();
}

function recordMassDist(dist) {
  massStats.attempts++;
  massStats.sumDist += dist;
  if (dist < massStats.bestDist) massStats.bestDist = dist;
  if (dist <= 5) massStats.perfect++;
  saveMassStats();
}

function renderStatsInto(els) {
  els.attempts.textContent = stats.attempts;
  els.best.textContent = stats.bestDiff === Infinity ? '—' : stats.bestDiff.toFixed(2) + '%';
  els.avg.textContent = stats.attempts ? (stats.sumDiff / stats.attempts).toFixed(2) + '%' : '—';
  els.perfect.textContent = stats.perfect;
  els.sqAttempts.textContent = squareStats.attempts;
  els.sqBest.textContent = squareStats.bestScore === -Infinity ? '—' : squareStats.bestScore.toFixed(1) + '%';
  els.sqAvg.textContent = squareStats.attempts ? (squareStats.sumScore / squareStats.attempts).toFixed(1) + '%' : '—';
  els.sqPerfect.textContent = squareStats.perfect;
  els.msAttempts.textContent = massStats.attempts;
  els.msBest.textContent = massStats.bestDist === Infinity ? '—' : massStats.bestDist.toFixed(1);
  els.msAvg.textContent = massStats.attempts ? (massStats.sumDist / massStats.attempts).toFixed(1) : '—';
  els.msPerfect.textContent = massStats.perfect;
}
