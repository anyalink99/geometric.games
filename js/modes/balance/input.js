function initBalanceInput() {
  const hit = dom.hitPad;

  hit.addEventListener('pointerdown', e => {
    if (state.mode !== 'balance') return;
    if (balanceVariation() === 'pole') { handlePolePointerDown(e); return; }
    if (centroidState.confirmed) return;
    if (centroidState.activePointerId !== null) return;
    e.preventDefault();
    centroidState.pointerType = e.pointerType;
    const p = clampToBoard(svgPoint(e));
    const grabR = e.pointerType !== 'mouse' ? POINT_GRAB_R * 3 : POINT_GRAB_R;
    if (!isNearGuess(p, grabR)) {
      centroidState.guess = p;
      drawCentroidGuess(p);
      updateBalanceHint();
      updateActionButton();
    }
    centroidState.dragging = true;
    centroidState.activePointerId = e.pointerId;
    hit.setPointerCapture(e.pointerId);
    centroidState.hover = null;
    dom.balanceHover.innerHTML = '';
    updateCentroidCursor(true);
  });

  hit.addEventListener('pointermove', e => {
    if (state.mode !== 'balance') return;
    if (balanceVariation() === 'pole') { handlePolePointerMove(e); return; }
    if (centroidState.confirmed) return;
    e.preventDefault();
    centroidState.pointerType = e.pointerType;
    const p = clampToBoard(svgPoint(e));
    if (centroidState.dragging && e.pointerId === centroidState.activePointerId) {
      centroidState.guess = p;
      drawCentroidGuess(p);
    } else if (e.pointerType === 'mouse') {
      centroidState.hover = p;
      drawCentroidHover(p);
    }
  });

  function endCentroidDrag(e) {
    if (state.mode !== 'balance') return;
    if (balanceVariation() === 'pole') { handlePolePointerUp(e); return; }
    if (e.pointerId !== centroidState.activePointerId) return;
    if (hit.hasPointerCapture && hit.hasPointerCapture(e.pointerId)) {
      hit.releasePointerCapture(e.pointerId);
    }
    centroidState.activePointerId = null;
    centroidState.dragging = false;
    updateCentroidCursor(false);
  }
  hit.addEventListener('pointerup', endCentroidDrag);
  hit.addEventListener('pointercancel', endCentroidDrag);

  hit.addEventListener('pointerleave', e => {
    if (state.mode !== 'balance') return;
    if (balanceVariation() === 'pole') {
      if (poleState.confirmed) return;
      if (e.pointerType !== 'mouse') return;
      drawPoleHover(null);
      return;
    }
    if (centroidState.confirmed) return;
    if (e.pointerType !== 'mouse') return;
    centroidState.hover = null;
    drawCentroidHover(null);
  });

  function handlePolePointerDown(e) {
    if (poleState.confirmed) return;
    if (poleState.activePointerId !== null) return;
    e.preventDefault();
    const p = svgPoint(e);
    const x = clampPoleX(p.x);
    const grabR = e.pointerType !== 'mouse' ? POINT_GRAB_R * 3 : POINT_GRAB_R;
    if (!isNearPole(x, grabR)) {
      poleState.pole = x;
      drawPole(x);
      updatePoleHint();
      updateActionButton();
    }
    poleState.dragging = true;
    poleState.activePointerId = e.pointerId;
    hit.setPointerCapture(e.pointerId);
    dom.balanceHover.innerHTML = '';
    updatePoleCursor(true);
  }

  function handlePolePointerMove(e) {
    if (poleState.confirmed) return;
    e.preventDefault();
    const p = svgPoint(e);
    const x = clampPoleX(p.x);
    if (poleState.dragging && e.pointerId === poleState.activePointerId) {
      poleState.pole = x;
      drawPole(x);
    } else if (e.pointerType === 'mouse') {
      drawPoleHover(x);
    }
  }

  function handlePolePointerUp(e) {
    if (e.pointerId !== poleState.activePointerId) return;
    if (hit.hasPointerCapture && hit.hasPointerCapture(e.pointerId)) {
      hit.releasePointerCapture(e.pointerId);
    }
    poleState.activePointerId = null;
    poleState.dragging = false;
    updatePoleCursor(false);
  }
}
