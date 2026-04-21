function balanceVariation() {
  return state.balanceVariation || 'pole';
}

registerModeAPI('balance', {
  pickShape() { return generateBalanceShape(); },
  nudge(dx, dy) {
    const v = balanceVariation();
    if (v === 'pole') {
      if (poleState.confirmed || poleState.pole == null) return;
      const next = Math.max(poleState.xMin, Math.min(poleState.xMax, poleState.pole + dx));
      poleState.pole = next;
      drawPole(next);
      updatePoleHint();
      updateActionButton();
    } else if (v === 'perch') {
      if (perchState.confirmed) return;
      const prevTx = perchState.tx, prevTy = perchState.ty;
      perchState.tx += dx;
      perchState.ty += dy;
      if (!perchResolve() || !perchHandleFits()) {
        perchState.tx = prevTx;
        perchState.ty = prevTy;
      } else {
        perchState.touched = true;
      }
      updateShapeTransform();
      updateHandlePos();
      updateActionButton();
    } else {
      if (centroidState.confirmed || !centroidState.guess) return;
      const g = centroidState.guess;
      centroidState.guess = clampToBoard({ x: g.x + dx, y: g.y + dy });
      drawCentroidGuess(centroidState.guess);
      updateCentroidHint();
      updateActionButton();
    }
  },
});

function balanceReset() {
  centroidReset();
  poleReset();
  perchReset();
}

function updateBalanceHint() {
  const v = balanceVariation();
  if (v === 'pole') updatePoleHint();
  else if (v === 'perch') updatePerchHint();
  else updateCentroidHint();
}

function confirmBalance(opts) {
  const v = balanceVariation();
  if (v === 'pole') confirmPole(opts);
  else if (v === 'perch') confirmPerch(opts);
  else confirmCentroid(opts);
}
