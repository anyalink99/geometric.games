// Single source of truth for per-mode shape selection. Loaded in the main
// thread AND in shape-worker — both must consume the same Math.random() draws
// for a given seed, otherwise daily-hash determinism breaks and Endless
// prefetch returns shapes that don't match what the main thread would pick.
function pickShapeFor(mode) {
  if (mode === 'cut') {
    if (Math.random() < 0.15) return generateBalanceShape();
    return generateShape();
  }
  if (mode === 'inscribe') {
    if (Math.random() < 0.25) {
      const bal = generateInscribeBalanceShape();
      if (bal) return bal;
    }
    return generateShape({ noHoles: true, noSymmetry: true });
  }
  if (mode === 'balance') return generateBalanceShape();
  return generateShape();
}
