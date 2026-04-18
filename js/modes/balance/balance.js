function balanceReset() {
  centroidReset();
  poleReset();
}

function updateBalanceHint() {
  if (balanceVariation() === 'pole') updatePoleHint();
  else updateCentroidHint();
}

function confirmBalance() {
  if (balanceVariation() === 'pole') confirmPole();
  else confirmCentroid();
}
