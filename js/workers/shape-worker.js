importScripts(
  '../core/constants.js',
  '../core/random.js',
  '../core/seed.js',
  '../geometry/geometry.js',
  '../geometry/shape-utils.js',
  '../geometry/shape-edges.js',
  '../geometry/shape-outer.js',
  '../geometry/shape-holes.js',
  '../geometry/shapes.js',
  '../geometry/shape-picker.js',
);

onmessage = (e) => {
  const d = e.data;
  if (!d || d.type !== 'gen') return;
  let shape;
  try {
    shape = withSeed(seedFromString(d.hash), () => pickShapeFor(d.mode));
  } catch (err) {
    postMessage({ type: 'gen', reqId: d.reqId, error: String(err && err.message || err) });
    return;
  }
  if (!shape) {
    postMessage({ type: 'gen', reqId: d.reqId, error: 'no shape' });
    return;
  }
  postMessage({ type: 'gen', reqId: d.reqId, hash: d.hash, shape });
};
