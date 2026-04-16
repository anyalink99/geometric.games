importScripts('../geometry/geometry.js', '../geometry/inscribed-square.js');

onmessage = (e) => {
  const { outer, gen } = e.data;
  const corners = findInscribedSquare(outer, {
    N: 34,
    coarseIters: 35,
    topK: 130,
    refineIters: 500,
  });
  postMessage({ gen, corners });
};
