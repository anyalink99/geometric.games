const inscribeStats = {};
for (const v of INSCRIBE_VARIATIONS) {
  inscribeStats[v] = { attempts: 0, perfect: 0, sumScore: 0, bestScore: -Infinity };
}

function inscribeStatsKey(v) { return INSCRIBE_STATS_PREFIX + v + '.v1'; }

function loadInscribeStats() {
  for (const v of INSCRIBE_VARIATIONS) {
    try {
      const raw = localStorage.getItem(inscribeStatsKey(v));
      if (raw) {
        const s = JSON.parse(raw);
        const bucket = inscribeStats[v];
        bucket.attempts = s.attempts || 0;
        bucket.perfect = s.perfect || 0;
        bucket.sumScore = s.sumScore || 0;
        bucket.bestScore = (s.bestScore != null && isFinite(s.bestScore)) ? s.bestScore : -Infinity;
      }
    } catch (e) {}
  }
}

function saveInscribeStats(v) {
  const b = inscribeStats[v];
  if (!b) return;
  try {
    localStorage.setItem(inscribeStatsKey(v), JSON.stringify({
      attempts: b.attempts,
      perfect: b.perfect,
      sumScore: b.sumScore,
      bestScore: b.bestScore === -Infinity ? null : b.bestScore,
    }));
  } catch (e) {}
}

function resetInscribeStats(variation) {
  const b = inscribeStats[variation];
  if (!b) return;
  b.attempts = 0;
  b.perfect = 0;
  b.sumScore = 0;
  b.bestScore = -Infinity;
  saveInscribeStats(variation);
}

function recordInscribeScore(variation, score) {
  const b = inscribeStats[variation];
  if (!b) return;
  b.attempts++;
  b.sumScore += score;
  if (score > b.bestScore) b.bestScore = score;
  if (score > 96) b.perfect++;
  saveInscribeStats(variation);
}

function renderInscribeStats(els, variation) {
  const b = inscribeStats[variation] || { attempts: 0, perfect: 0, sumScore: 0, bestScore: -Infinity };
  els.inAttempts.textContent = b.attempts;
  els.inBest.textContent = b.bestScore === -Infinity ? '—' : b.bestScore.toFixed(1) + '%';
  els.inAvg.textContent = b.attempts ? (b.sumScore / b.attempts).toFixed(1) + '%' : '—';
  els.inPerfect.textContent = b.perfect;
}
