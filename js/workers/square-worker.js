importScripts('../geometry/geometry.js', '../geometry/inscribed-square.js');

onmessage = (e) => {
  const { outer, gen, N } = e.data;
  const n = N || 4;
  let corners;
  if (n === 4) {
    corners = findInscribedSquare(outer, {
      N: 34,
      coarseIters: 35,
      topK: 130,
      refineIters: 500,
    });
  } else {
    corners = findInscribedRegularNgon(outer, n, {
      Nsamp: 22,
      coarseIters: 22,
      topK: 50,
      refineIters: 240,
    });
  }
  postMessage({ gen, corners });
};
