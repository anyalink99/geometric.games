function svgPoint(evt) {
  const pt = dom.svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = dom.svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const r = pt.matrixTransform(ctm.inverse());
  return { x: r.x, y: r.y };
}

function strokeCrossesShape(a, b, polygon) {
  if (Math.hypot(b.x - a.x, b.y - a.y) < MOVE_THRESHOLD) return false;
  if (segIntersectCount(a, b, polygon) < 2) return false;
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return false;
  return true;
}

function initInput(ctx) {
  const { hitPad, cutPreview } = dom;
  let activePointerId = null;
  let p0 = null, p1 = null, moved = false;

  function setPreview() {
    cutPreview.setAttribute('x1', p0.x);
    cutPreview.setAttribute('y1', p0.y);
    cutPreview.setAttribute('x2', p1.x);
    cutPreview.setAttribute('y2', p1.y);
    cutPreview.classList.toggle('valid', strokeCrossesShape(p0, p1, ctx.getOuter()));
  }

  function resetPreview() {
    cutPreview.style.display = 'none';
    cutPreview.classList.remove('valid');
  }

  hitPad.addEventListener('pointerdown', e => {
    if (ctx.isLocked()) return;
    if (activePointerId !== null) return;
    e.preventDefault();
    activePointerId = e.pointerId;
    hitPad.setPointerCapture(e.pointerId);
    p0 = svgPoint(e);
    p1 = { ...p0 };
    moved = false;
    resetPreview();
  });

  hitPad.addEventListener('pointermove', e => {
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();
    p1 = svgPoint(e);
    if (!moved) {
      if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < MOVE_THRESHOLD) return;
      moved = true;
      cutPreview.style.display = '';
    }
    setPreview();
  });

  function endStroke(e, cancelled) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    if (hitPad.hasPointerCapture && hitPad.hasPointerCapture(e.pointerId)) {
      hitPad.releasePointerCapture(e.pointerId);
    }
    resetPreview();
    if (cancelled || !moved) return;
    p1 = svgPoint(e);
    if (!strokeCrossesShape(p0, p1, ctx.getOuter())) {
      flashHint('Stroke must fully cross the shape');
      return;
    }
    ctx.onCut(p0, p1);
  }

  hitPad.addEventListener('pointerup',     e => endStroke(e, false));
  hitPad.addEventListener('pointercancel', e => endStroke(e, true));

  return {
    reset() {
      activePointerId = null;
      resetPreview();
    },
  };
}
