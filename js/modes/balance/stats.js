const balanceStats = {};
for (const v of BALANCE_VARIATIONS) {
  balanceStats[v] = { attempts: 0, perfect: 0, sumDist: 0, bestDist: Infinity };
}

function balanceStatsKey(v) { return BALANCE_STATS_PREFIX + v + '.v1'; }

function loadBalanceStats() {
  for (const v of BALANCE_VARIATIONS) {
    try {
      const raw = localStorage.getItem(balanceStatsKey(v));
      if (raw) {
        const s = JSON.parse(raw);
        const bucket = balanceStats[v];
        bucket.attempts = s.attempts || 0;
        bucket.perfect = s.perfect || 0;
        bucket.sumDist = s.sumDist || 0;
        bucket.bestDist = (s.bestDist != null && isFinite(s.bestDist)) ? s.bestDist : Infinity;
      }
    } catch (e) {}
  }
}

function saveBalanceStats(v) {
  const b = balanceStats[v];
  if (!b) return;
  try {
    localStorage.setItem(balanceStatsKey(v), JSON.stringify({
      attempts: b.attempts,
      perfect: b.perfect,
      sumDist: b.sumDist,
      bestDist: b.bestDist === Infinity ? null : b.bestDist,
    }));
  } catch (e) {}
}

function resetBalanceStats(variation) {
  const b = balanceStats[variation];
  if (!b) return;
  b.attempts = 0;
  b.perfect = 0;
  b.sumDist = 0;
  b.bestDist = Infinity;
  saveBalanceStats(variation);
}

function recordBalanceDist(variation, dist) {
  const b = balanceStats[variation];
  if (!b) return;
  b.attempts++;
  b.sumDist += dist;
  if (dist < b.bestDist) b.bestDist = dist;
  const threshold = variation === 'pole' ? BALANCE_PERFECT_THRESHOLD : 5;
  if (dist <= threshold) b.perfect++;
  saveBalanceStats(variation);
}

function renderBalanceStats(els, variation) {
  const b = balanceStats[variation] || { attempts: 0, perfect: 0, sumDist: 0, bestDist: Infinity };
  els.blAttempts.textContent = b.attempts;
  els.blBest.textContent = b.bestDist === Infinity ? '—' : b.bestDist.toFixed(1);
  els.blAvg.textContent = b.attempts ? (b.sumDist / b.attempts).toFixed(1) : '—';
  els.blPerfect.textContent = b.perfect;
}
