class ModeInterface {
  constructor(impl) {
    const required = [
      'reset', 'onShapeReady', 'confirm',
      'snapshot', 'restoreSnapshot', 'hasPendingConfirm',
    ];
    for (const m of required) {
      if (typeof impl[m] !== 'function') {
        throw new Error('ModeInterface missing method: ' + m);
      }
    }
    Object.assign(this, impl);
  }
}

const modeRunner = {
  cut: new ModeInterface({
    reset() { cutReset(); },
    onShapeReady() {
      cutOnNewShape();
      dom.hitPad.style.cursor = '';
    },
    confirm(opts) { finalizeCut(opts); },
    snapshot() { return cutSnapshot(); },
    restoreSnapshot(snap) { cutRestoreSnapshot(snap); },
    hasPendingConfirm() {
      if (cutState.confirmed) return false;
      const placed = cutState.cuts.length;
      if (cutVariation() === 'angle') return placed >= 1;
      return placed >= cutRequiredCount();
    },
  }),
  inscribe: new ModeInterface({
    reset() { inscribeReset(); },
    onShapeReady() {
      precomputeIdeal(state.shape.outer);
      renderInscribeAll();
    },
    confirm(opts) { confirmInscribe(opts); },
    snapshot() { return inscribeSnapshot(); },
    restoreSnapshot(snap) { inscribeRestoreSnapshot(snap); },
    hasPendingConfirm() {
      return !inscribeState.confirmed &&
             inscribeState.points.length === inscribeN();
    },
  }),
  balance: new ModeInterface({
    reset() { balanceReset(); },
    onShapeReady() {
      const v = balanceVariation();
      if (v === 'pole') onPoleShapeReady();
      else if (v === 'perch') onPerchShapeReady();
      updateBalanceHint();
      dom.hitPad.style.cursor = v === 'perch' ? '' : 'crosshair';
    },
    confirm(opts) { confirmBalance(opts); },
    snapshot() {
      const v = balanceVariation();
      if (v === 'pole') return poleSnapshot();
      if (v === 'perch') return perchSnapshot();
      return centroidSnapshot();
    },
    restoreSnapshot(snap) {
      const v = balanceVariation();
      if (v === 'pole') poleRestoreSnapshot(snap);
      else if (v === 'perch') perchRestoreSnapshot(snap);
      else centroidRestoreSnapshot(snap);
    },
    hasPendingConfirm() {
      const v = balanceVariation();
      if (v === 'pole') return !poleState.confirmed && poleState.pole != null;
      if (v === 'perch') return !perchState.confirmed && perchState.touched;
      return !centroidState.confirmed && centroidState.guess != null;
    },
  }),
};
