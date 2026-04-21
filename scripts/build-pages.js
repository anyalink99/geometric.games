#!/usr/bin/env node
/*
 * Generates all canonical HTML pages for geometric.games from one template
 * plus a per-page config + SEO copy block.
 *
 * Output:
 *   index.html                       -> Cut Half (canonical homepage)
 *   cut/ratio/index.html
 *   cut/quad/index.html
 *   cut/tri/index.html
 *   cut/angle/index.html
 *   inscribe/index.html              -> Inscribe Square
 *   inscribe/triangle/index.html
 *   balance/index.html               -> Balance Pole
 *   balance/centroid/index.html
 *   sitemap.xml
 *   js/core/page-meta.js             -> client-side meta map
 *
 * Run:  node scripts/build-pages.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://geometric.games';

// ---------------------------------------------------------------------------
// Page definitions — single source of truth. Each entry describes one output
// HTML file. `outPath` is relative to repo root. `canonicalPath` is the URL
// Google should treat as canonical (leading and trailing slash).
// ---------------------------------------------------------------------------

const GAME_PAGES = [
  {
    outPath: 'index.html',
    canonicalPath: '/',
    mode: 'cut',
    variation: 'half',
    title: 'geometric.games — cut a shape in half',
    description: 'Slice irregular shapes into two equal halves with a single straight line. Endless geometry puzzles in the browser, no install, free.',
  },
  {
    // /cut/ is an alias for /. Same content, canonical points to /,
    // excluded from the sitemap.
    outPath: 'cut/index.html',
    canonicalPath: '/',
    mode: 'cut',
    variation: 'half',
    isAlias: true,
    title: 'geometric.games — cut a shape in half',
    description: 'Slice irregular shapes into two equal halves with a single straight line. Endless geometry puzzles in the browser, no install, free.',
  },
  {
    outPath: 'cut/ratio/index.html',
    canonicalPath: '/cut/ratio/',
    mode: 'cut',
    variation: 'ratio',
    title: 'Target ratio cut — slice a shape to an exact ratio | geometric.games',
    description: 'Each round gives a random target ratio from 5/95 to 50/50. Cut the shape with one line so the smaller piece matches the percentage.',
  },
  {
    outPath: 'cut/quad/index.html',
    canonicalPath: '/cut/quad/',
    mode: 'cut',
    variation: 'quad',
    title: 'Quad cut — split a shape into 4 equal pieces | geometric.games',
    description: 'Place two cuts that cross inside the shape to split it into four equal quarters by area. Based on the Courant–Robbins theorem.',
  },
  {
    outPath: 'cut/tri/index.html',
    canonicalPath: '/cut/tri/',
    mode: 'cut',
    variation: 'tri',
    title: 'Tri cut — divide a shape into 3 equal pieces | geometric.games',
    description: 'Two straight cuts, three equal pieces by area — but the second cut must leave one piece whole. An IVT-driven geometry puzzle.',
  },
  {
    outPath: 'cut/angle/index.html',
    canonicalPath: '/cut/angle/',
    mode: 'cut',
    variation: 'angle',
    title: 'Fixed-angle area bisector — find the 50/50 slide | geometric.games',
    description: 'The cut direction is locked. Slide the line perpendicular to itself to find the unique parallel line that bisects the shape by area.',
  },
  {
    outPath: 'inscribe/index.html',
    canonicalPath: '/inscribe/',
    mode: 'inscribe',
    variation: 'square',
    title: 'Inscribed square puzzle — play the Toeplitz problem | geometric.games',
    description: 'Drop four points on a shape’s outline to form a perfect square. A playable take on the 110-year-old Inscribed Square Problem (Toeplitz, 1911).',
  },
  {
    outPath: 'inscribe/triangle/index.html',
    canonicalPath: '/inscribe/triangle/',
    mode: 'inscribe',
    variation: 'triangle',
    title: 'Largest inscribed equilateral triangle puzzle | geometric.games',
    description: 'Find the largest equilateral triangle with all three vertices on a shape’s outline — scored on both regularity and size.',
  },
  {
    outPath: 'balance/index.html',
    canonicalPath: '/balance/',
    mode: 'balance',
    variation: 'pole',
    title: 'Pole balance puzzle — slide the pivot under a shape | geometric.games',
    description: 'Slide a pole under an irregular shape so it doesn’t tip. Scored by how close the pivot is to the shape’s true centroid.',
  },
  {
    outPath: 'balance/centroid/index.html',
    canonicalPath: '/balance/centroid/',
    mode: 'balance',
    variation: 'centroid',
    title: 'Centroid guess — find the center of mass of a shape | geometric.games',
    description: 'Tap where you think the shape’s centroid is. Holes in the shape shift it — in annuli the center of mass sits outside the shape entirely.',
  },
  {
    outPath: 'balance/perch/index.html',
    canonicalPath: '/balance/perch/',
    mode: 'balance',
    variation: 'perch',
    title: 'Perch balance puzzle — balance a shape on a pyramid tip | geometric.games',
    description: 'Drag and rotate an irregular shape onto the tip of a pyramid so it balances. A playable take on the Intermediate Value Theorem for rotations.',
  },
];

const BLOG_POSTS = [
  {
    slug: 'inscribed-square-problem',
    date: '2026-04-20',
    title: 'The Inscribed Square Problem: 110 years unsolved',
    description: 'Otto Toeplitz asked in 1911 whether every simple closed curve contains four points that form a square. More than a century later, it’s still open for arbitrary curves.',
    playTitle: 'Play: Inscribed Square',
    playPath: '/inscribe/',
    body: postInscribedSquare(),
  },
  {
    slug: 'cutting-polygons-in-half',
    date: '2026-04-20',
    title: 'Cutting shapes in half: why a perfect bisector always exists',
    description: 'The Intermediate Value Theorem guarantees that every bounded planar region has a 50/50 area bisector in every direction. A short tour of why.',
    playTitle: 'Play: Cut in Half',
    playPath: '/',
    body: postCuttingInHalf(),
  },
  {
    slug: 'courant-robbins-four-equal-pieces',
    date: '2026-04-20',
    title: 'Courant–Robbins: any region splits into four equal pieces with two perpendicular cuts',
    description: 'A classic theorem from What Is Mathematics? — any planar region can be divided into four equal quarters by two perpendicular straight lines.',
    playTitle: 'Play: Quad Cut',
    playPath: '/cut/quad/',
    body: postCourantRobbins(),
  },
  {
    slug: 'center-of-mass-with-holes',
    date: '2026-04-20',
    title: 'Where is the center of mass of a shape with a hole?',
    description: 'The centroid of an annulus sits at its empty center — outside the shape itself. A look at the qualitative rules of planar centroids.',
    playTitle: 'Play: Centroid Guess',
    playPath: '/balance/centroid/',
    body: postCentroidHoles(),
  },
  {
    slug: 'inscribed-equilateral-triangle',
    date: '2026-04-20',
    title: 'Inscribed equilateral triangles in any curve (Nielsen–Wright)',
    description: 'Unlike the still-open Toeplitz square, the equilateral-triangle version is fully solved: every Jordan curve contains infinitely many inscribed equilateral triangles.',
    playTitle: 'Play: Inscribed Triangle',
    playPath: '/inscribe/triangle/',
    body: postInscribedTriangle(),
  },
];

// ---------------------------------------------------------------------------
// Shared SEO copy blocks. Each returns HTML for the <section class="seo">
// body on its page. Keep each around 400–600 words. Use subheadings and
// internal links to the other variations — these are the long-tail entry
// points and the crawl graph.
// ---------------------------------------------------------------------------

function postCuttingInHalf() {
  return `
  <h2>Slice any shape into two equal halves</h2>
  <p>
    Draw a single straight line that fully crosses an irregular shape and splits it into two pieces
    of equal area. A fresh shape is generated every round from a seeded random outline — sometimes
    smooth and convex, sometimes jagged with inward notches and holes. Your cut is scored by how far
    the smaller piece is from exactly <b>50%</b>. Drag the endpoints after placing the line to
    fine-tune, then confirm.
  </p>

  <h2>The math: why a perfect half always exists</h2>
  <p>
    By the <b>Intermediate Value Theorem</b>, every bounded region has a 50/50 bisector in
    <i>every</i> direction. Sweep a line of a fixed angle from one side of the shape to the other:
    one extreme has 0% of the area to its left, the other has 100%. The area-to-the-left function is
    continuous, so it must pass through exactly 50% somewhere in between. Change the angle and you
    get a different bisector — so every shape has infinitely many perfect half-cuts, and the
    puzzle is always solvable.
  </p>
  <p>
    The trickier part is doing it by eye. Human intuition gets fooled by long skinny limbs, by holes
    that shift the visual balance, and by shapes that are wider than they are tall. Learning to
    ignore the outline and focus on where the <i>area</i> sits is the whole game.
  </p>

  <h2>Tips for getting perfect cuts</h2>
  <ul>
    <li>Find the longest axis of the shape and cut roughly perpendicular to it — limbs along that axis dominate the area.</li>
    <li>Watch for holes: an empty region effectively subtracts area from one side.</li>
    <li>Use the endpoint drag: start with a rough cut, then slide the endpoints until the two pieces look equal by eye.</li>
    <li>If a piece has a long thin tail, it’s lighter than it looks — a compact lobe outweighs a long one of similar length.</li>
  </ul>

  <h2>Other cut variations</h2>
  <p>
    Once the 50/50 cut feels natural, try the variations. Each tests a different flavour of geometric
    intuition:
  </p>
  <ul>
    <li><a href="/cut/ratio/">Target Ratio</a> — hit an exact non-half ratio like 37/63.</li>
    <li><a href="/cut/quad/">Quad Cut</a> — two crossing cuts, four equal quarters (Courant–Robbins).</li>
    <li><a href="/cut/tri/">Tri Cut</a> — two cuts, three equal pieces.</li>
    <li><a href="/cut/angle/">Constrained Angle</a> — the cut’s angle is fixed, slide it to the sweet spot.</li>
  </ul>
  <p>
    Or switch mode entirely: <a href="/inscribe/">inscribe a square</a> (the unsolved Toeplitz problem)
    or <a href="/balance/">balance the shape on a pole</a>.
  </p>
  `;
}

function postCourantRobbins() {
  return `
  <h2>Split a shape into four equal pieces</h2>
  <p>
    Draw <b>two straight cuts</b> that each fully cross the shape and intersect <i>inside</i> it.
    Together they carve the shape into four pieces, and you’re scored on how close those
    pieces are to one quarter of the total area each. Drag either line’s endpoints to adjust, then
    confirm.
  </p>

  <h2>The math: Courant &amp; Robbins’ four-piece theorem</h2>
  <p>
    A classical result in <i>What Is Mathematics?</i> by Courant and Robbins proves that any planar
    region can be divided into <b>four equal pieces by two perpendicular straight lines</b>. The
    proof is beautiful: for every angle θ, there’s an area-bisector in that direction (from the
    Intermediate Value Theorem). Fix one bisector, then rotate a second bisector perpendicular to it
    by 90° — by continuity, somewhere during the rotation the two bisectors cut the region into
    four pieces that are all equal.
  </p>
  <p>
    The puzzle doesn’t force perpendicularity — any two crossing bisectors work as long as each
    one splits the shape in half on its own <i>and</i> each also splits the other’s two halves
    in half. That’s a tighter constraint than it looks, and it’s what makes this variation feel so
    different from the simple <a href="/">half cut</a>.
  </p>

  <h2>Tips for four equal quarters</h2>
  <ul>
    <li>Place your first line as a rough 50/50 bisector (same intuition as Half Cut).</li>
    <li>Then place a second line perpendicular-ish — perpendicular isn’t required, but it’s often the easiest guess.</li>
    <li>Slide the second line until the two pieces on each side of the first line look equal.</li>
    <li>If a piece looks much bigger than the others, the crossing point is off-center toward that piece — shift both lines away from it.</li>
  </ul>

  <h2>Related</h2>
  <ul>
    <li><a href="/">Half Cut</a> — one line, two equal halves.</li>
    <li><a href="/cut/tri/">Tri Cut</a> — two cuts, three pieces.</li>
    <li><a href="/cut/ratio/">Target Ratio</a> — hit a specific non-half ratio.</li>
    <li><a href="/cut/angle/">Constrained Angle</a> — cut at a locked angle.</li>
  </ul>
  `;
}

function postInscribedSquare() {
  return `
  <h2>Inscribe a square on a shape’s outline</h2>
  <p>
    Place <b>four points</b> on the shape’s outline so they form a square. As you move your
    cursor, the nearest outline point follows it — tap to drop a vertex. After four drops the
    quadrilateral is scored: closer to a perfect square (equal sides, 90° angles) means a higher
    score. You can drag any placed point afterwards to refine.
  </p>

  <h2>The Inscribed Square Problem (Toeplitz, 1911)</h2>
  <p>
    Otto Toeplitz asked a deceptively simple question in 1911: does every simple closed curve in
    the plane contain four points that form a square? More than a century later, the answer is
    <i>probably yes</i> — but it’s still <b>one of the oldest open problems in geometry</b>.
  </p>
  <p>
    The problem is settled for nice classes of curves: polygons, convex curves, smooth curves,
    piecewise-smooth curves, and curves with bounded curvature all provably have an inscribed
    square. Recent work by Greene &amp; Lobb (2020) settled the problem for smooth Jordan curves by
    connecting it to symplectic geometry. But for <i>arbitrary</i> Jordan curves — including
    pathological fractal ones — existence is still unproved.
  </p>
  <p>
    On this page every generated shape is piecewise-smooth — a mix of straight segments, circular
    arcs, and Bezier curves. That’s well within the classes where the problem is proven, so a
    perfect inscribed square always exists on these shapes. Your job is to find one by eye.
  </p>

  <h2>Tips for spotting an inscribed square</h2>
  <ul>
    <li>Start with a diameter: pick two points on roughly opposite sides of the shape — they’re candidates for the square’s diagonal.</li>
    <li>The two other vertices must sit on a line perpendicular to that diagonal, with the same length.</li>
    <li>Convex regions usually have several inscribed squares; concave shapes sometimes have just one obvious one.</li>
    <li>If three vertices already look good but the fourth is hard to place, adjust vertex two — the constraint often means the whole square has to rotate slightly.</li>
  </ul>

  <h2>Related</h2>
  <ul>
    <li><a href="/inscribe/triangle/">Inscribed Equilateral Triangle</a> — the solved sibling of the Toeplitz problem.</li>
    <li><a href="/">Cut</a> — slice shapes by area instead of placing vertices.</li>
    <li><a href="/balance/">Balance</a> — find where the shape’s centroid sits.</li>
  </ul>
  `;
}

function postInscribedTriangle() {
  return `
  <h2>Inscribe the largest equilateral triangle</h2>
  <p>
    Drop <b>three points</b> on the shape’s outline so they form an equilateral triangle — all
    three sides the same length, all three angles 60° — and make it as <b>large</b> as possible.
    The puzzle scores you on both regularity and size relative to the maximum equilateral triangle
    with vertices on the shape’s outline. Same placement mechanics as the <a href="/inscribe/">square variation</a>:
    the nearest boundary point follows your cursor, tap to drop, drag to refine, confirm to score.
  </p>

  <h2>The math: Nielsen–Wright and friends</h2>
  <p>
    Unlike the Inscribed Square Problem, the equilateral-triangle case is <b>fully solved</b>. In
    1990, Mark Nielsen and Stephanie Wright proved that every Jordan curve contains inscribed
    equilateral triangles — in fact, infinitely many of them. Simpler proofs exist for smooth and
    polygonal curves using the same IVT-style continuity tricks that drive the cut-in-half puzzle.
  </p>
  <p>
    The sketch: pick any point <i>A</i> on the curve. For every direction θ you can construct a
    candidate equilateral triangle with <i>A</i> as one vertex and a second vertex lying on the
    curve at distance <i>r(θ)</i> in direction θ. As θ rotates, the third vertex traces a continuous
    curve that must intersect the original outline — and at every intersection, you get an
    inscribed equilateral triangle.
  </p>

  <h2>Tips</h2>
  <ul>
    <li>Start with two points a reasonable distance apart — they define one side of the triangle.</li>
    <li>The third vertex is the apex of an equilateral triangle built on that side. There are two possible apex positions (one on each side). Pick the one that actually lands on the outline.</li>
    <li>Long narrow shapes have smaller inscribed equilateral triangles than you’d expect.</li>
    <li>If one vertex is locked on a sharp corner of the shape, try a second vertex on the opposite long edge — triangles often snap nicely that way.</li>
  </ul>

  <h2>Related</h2>
  <ul>
    <li><a href="/inscribe/">Inscribed Square</a> — the still-open Toeplitz problem.</li>
    <li><a href="/">Cut a shape in half</a> — the IVT-driven classic.</li>
    <li><a href="/balance/">Balance puzzles</a> — centroid and pole physics.</li>
  </ul>
  `;
}

function postCentroidHoles() {
  return `
  <h2>Find the shape’s center of mass</h2>
  <p>
    Tap anywhere on the board to place your guess for the shape’s centroid. Drag to refine, then
    confirm. The puzzle scores you on the distance between your guess and the true centroid — the
    closer, the higher the score. Shapes with holes, concave notches, and long thin limbs are the
    ones where intuition breaks.
  </p>

  <h2>The math: the centroid formula</h2>
  <p>
    For a uniformly dense planar region, the <b>centroid</b> is the area-weighted average of all
    points inside the shape:
  </p>
  <p>$$\\bar{x} = \\frac{1}{A}\\iint_R x\\,dA, \\qquad \\bar{y} = \\frac{1}{A}\\iint_R y\\,dA$$</p>
  <p>
    For a closed polygon with vertices $(x_i, y_i)$ and signed area $A$ there's a tidy closed form:
  </p>
  <p>$$\\bar{x} = \\frac{1}{6A}\\sum_{i=0}^{n-1} (x_i + x_{i+1})(x_i y_{i+1} - x_{i+1} y_i)$$</p>
  <p>
    The curved shapes here are sampled into dense polylines before this math runs, so the same
    formula works in practice. But the qualitative facts are more useful while playing:
  </p>
  <ul>
    <li>The centroid is invariant under translation and rotation.</li>
    <li>It lies strictly inside any <b>convex</b> region.</li>
    <li>For non-convex or holed shapes, the centroid can lie <i>outside</i> the shape entirely.
        The classic example is an annulus: the centroid sits exactly at the empty center.</li>
    <li>Holes subtract mass — effectively they have negative area in the centroid sum.</li>
  </ul>

  <h2>Tips</h2>
  <ul>
    <li>Split the shape mentally into simple sub-regions (rectangles, lobes). Each has its own centroid; the whole-shape centroid is a weighted average of those, weighted by area.</li>
    <li>A compact lobe pulls the centroid more than a long thin limb of the same area — but “more than the limb” doesn’t mean “toward the lobe entirely.”</li>
    <li>Holes push the centroid <i>away</i> from the hole.</li>
    <li>For crescent / C-shapes, the centroid often sits in the empty mouth, not in the solid body.</li>
  </ul>

  <h2>Related</h2>
  <ul>
    <li><a href="/balance/">Pole Balance</a> — the centroid, but you place a 1D pivot.</li>
    <li><a href="/">Cut in half</a> — any line through the centroid is a candidate bisector, but not every bisector passes through the centroid.</li>
    <li><a href="/inscribe/">Inscribed Square</a> — vertex placement, the Toeplitz problem.</li>
  </ul>
  `;
}

// ---------------------------------------------------------------------------
// HTML template. One big template string with ${...} substitutions per page.
// Asset URLs use a per-page relative prefix (${rel}) so the same game runs
// from any directory depth — including direct file:// opens.
// ---------------------------------------------------------------------------

function renderPage(p) {
  const canonicalUrl = SITE + p.canonicalPath;
  const ogImage = SITE + '/og-image.png';

  // Per-page relative prefix so the same HTML works on http://, GitHub Pages,
  // and direct file:// opens. '/cut/quad/' is 2 segments deep -> '../../'.
  const depth = p.canonicalPath.split('/').filter(Boolean).length;
  const rel = '../'.repeat(depth); // '' for '/', '../' for '/inscribe/', etc.

  const isHome = p.canonicalPath === '/';
  const jsonLd = isHome ? homeJsonLd(p) : gameJsonLd(p);

  const initialState = `
  <script>
    window.__INITIAL_MODE = ${JSON.stringify(p.mode)};
    window.__INITIAL_VARIATION = ${JSON.stringify(p.variation)};
    window.__CANONICAL_PATH = ${JSON.stringify(p.canonicalPath)};
    window.__ASSET_BASE = ${JSON.stringify(rel)};
  </script>`.trim();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>${escapeHtml(p.title)}</title>
<meta name="description" content="${escapeAttr(p.description)}">
<meta name="author" content="geometric.games">
<meta name="theme-color" content="#111111">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeAttr(p.title)}">
<meta property="og:description" content="${escapeAttr(p.description)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:site_name" content="geometric.games">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(p.title)}">
<meta name="twitter:description" content="${escapeAttr(p.description)}">
<meta name="twitter:image" content="${ogImage}">
<link rel="canonical" href="${canonicalUrl}">
<link rel="icon" type="image/svg+xml" href="${rel}favicon.svg">
<link rel="icon" type="image/png" sizes="192x192" href="${rel}icon-192.png">
<link rel="icon" type="image/png" sizes="512x512" href="${rel}icon-512.png">
<link rel="apple-touch-icon" href="${rel}apple-touch-icon.png">
<link rel="mask-icon" href="${rel}favicon.svg" color="#c084fc">
<link rel="manifest" href="${rel}manifest.webmanifest">
<script type="application/ld+json">
${jsonLd}
</script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-N9CPH9MB');</script>
<!-- End Google Tag Manager -->
<!-- Google Analytics 4 (direct gtag, independent of GTM) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-B3RQN9K2JL"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-B3RQN9K2JL');
</script>
<!-- End Google Analytics 4 -->
${initialState}
<link rel="stylesheet" href="${rel}css/index.css">
</head>
<body data-mode="${p.mode}" data-cut-variation="${p.mode === 'cut' ? p.variation : 'half'}" data-inscribe-variation="${p.mode === 'inscribe' ? p.variation : 'square'}" data-balance-variation="${p.mode === 'balance' ? p.variation : 'pole'}">
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-N9CPH9MB"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
<div class="app">
  <div class="title">GEOMETRIC<span class="accent">.GAMES</span></div>

  <div class="top-icons">
    <button id="help-btn" title="How to play" aria-label="Help">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>
    </button>
    <button id="stats-btn" title="Stats" aria-label="Stats">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="18" y1="20" x2="18" y2="14"/></svg>
    </button>
  </div>

  <div class="stage">
    <svg id="board" viewBox="-60 -80 520 560" preserveAspectRatio="xMidYMid meet"
         role="img" aria-labelledby="board-title board-desc">
      <title id="board-title">Puzzle board</title>
      <desc id="board-desc">An irregular shape on a grid. Drag or tap to place your answer. The hint below the board describes what to solve.</desc>
      <rect class="hit-pad" id="hit-pad" x="-60" y="-80" width="520" height="560"/>
      <g id="pole-layer"></g>
      <g id="pyramid-layer"></g>
      <g id="shape-layer"></g>
      <g id="cut-layer"></g>
      <g id="cut-lines-layer"></g>
      <g id="cut-points-layer"></g>
      <g id="inscribe-ideal-layer"></g>
      <g id="inscribe-lines-layer"></g>
      <g id="inscribe-points-layer"></g>
      <g id="inscribe-hover-layer"></g>
      <g id="centroid-ideal-layer"></g>
      <g id="centroid-point-layer"></g>
      <g id="balance-hover-layer"></g>
      <g id="handle-layer"></g>
      <g id="label-layer"></g>
      <line id="cut-preview" class="cut-line preview" style="display:none"/>
    </svg>
  </div>

  <div class="score-line" id="score-line">
    <div class="hint" id="hint" role="status" aria-live="polite">Drag a line that fully crosses the shape</div>
  </div>

  <div class="actions">
    <button class="btn secondary" id="gamemode-btn">Change Puzzle</button>
    <button class="btn" id="new-btn" data-action="new">New Shape</button>
    <button id="share-btn" class="share-float" title="Copy result as image" aria-label="Share result" hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="M7 9l5-5 5 5"/><path d="M5 14v4a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-4"/></svg>
    </button>
  </div>

  ${HELP_MODAL}
  ${STATS_MODAL}
  ${PUZZLE_MODAL}
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
</div>

<script src="${rel}js/core/constants.js"></script>
<script src="${rel}js/core/random.js"></script>
<script src="${rel}js/core/seed.js"></script>
<script src="${rel}js/core/page-meta.js"></script>
<script src="${rel}js/core/modes.js"></script>
<script src="${rel}js/core/router.js"></script>
<script src="${rel}js/core/daily-lock.js"></script>
<script src="${rel}js/core/mode-stats.js"></script>
<script src="${rel}js/core/workers.js"></script>
<script src="${rel}js/core/analytics.js"></script>
<script src="${rel}js/core/reset.js"></script>
<script src="${rel}js/geometry/geometry.js"></script>
<script src="${rel}js/geometry/inscribed-square.js"></script>
<script src="${rel}js/geometry/shape-utils.js"></script>
<script src="${rel}js/geometry/shape-edges.js"></script>
<script src="${rel}js/geometry/shape-outer.js"></script>
<script src="${rel}js/geometry/shape-holes.js"></script>
<script src="${rel}js/geometry/shapes.js"></script>
<script src="${rel}js/ui/modals.js"></script>
<script src="${rel}js/ui/render.js"></script>
<script src="${rel}js/ui/keyboard.js"></script>
<script src="${rel}js/modes/cut/geometry.js"></script>
<script src="${rel}js/modes/cut/render.js"></script>
<script src="${rel}js/modes/cut/cut.js"></script>
<script src="${rel}js/modes/cut/onboarding.js"></script>
<script src="${rel}js/modes/cut/input.js"></script>
<script src="${rel}js/modes/cut/stats.js"></script>
<script src="${rel}js/modes/inscribe/inscribe.js"></script>
<script src="${rel}js/modes/inscribe/input.js"></script>
<script src="${rel}js/modes/inscribe/stats.js"></script>
<script src="${rel}js/modes/balance/centroid.js"></script>
<script src="${rel}js/modes/balance/pole.js"></script>
<script src="${rel}js/modes/balance/perch.js"></script>
<script src="${rel}js/modes/balance/balance.js"></script>
<script src="${rel}js/modes/balance/input.js"></script>
<script src="${rel}js/modes/balance/stats.js"></script>
<script src="${rel}js/core/stats.js"></script>
<script src="${rel}js/core/mode-runner.js"></script>
<script src="${rel}js/vendor/qrcode.min.js"></script>
<script src="${rel}js/vendor/gif-encoder.js"></script>
<script src="${rel}js/share/base.js"></script>
<script src="${rel}js/share/quantize.js"></script>
<script src="${rel}js/share/modal.js"></script>
<script src="${rel}js/share/capture.js"></script>
<script src="${rel}js/share/compose.js"></script>
<script src="${rel}js/share/gif.js"></script>
<script src="${rel}js/core/game.js"></script>
<script src="${rel}js/main.js"></script>
</body>
</html>
`;

  // Root-absolute href="/..." stays absolute so SPA pushState navigation
  // doesn't break them (e.g. home -> /cut/quad/ via pushState would otherwise
  // re-resolve a relative href against the new URL). Trade-off: file:// direct
  // opens can't follow these links, which is accepted.
  return html;
}

// ---------------------------------------------------------------------------
// Modal fragments (shared across all pages). Duplicated literally from
// index.html so every page has the same help/stats/gamemode/variations UI.
// ---------------------------------------------------------------------------

const HELP_MODAL = `<div class="modal-back" id="help-modal">
    <div class="modal">
      <h2>HOW TO PLAY</h2>
      <div class="help-cut">
        <div class="help-cut-half">
          <p>Slice the shape into <b>two equal halves</b> with one straight line.</p>
          <ul>
            <li>Drag across — your stroke must fully cross the shape</li>
            <li>Release to place the line; drag the endpoints to fine-tune</li>
            <li>Press <b>Confirm</b> to score the cut</li>
          </ul>
          <p class="math-note"><b>Math:</b> by the Intermediate Value Theorem, every region has a 50/50 bisector in <i>every</i> direction — perfection is always reachable. <a class="math-more" href="/blog/cutting-polygons-in-half/">Read more →</a></p>
        </div>
        <div class="help-cut-ratio">
          <p>Cut in a <b>random target ratio</b> (5/95 … 50/50) shown up top each round.</p>
          <ul>
            <li>Same controls as Half — one line, fully across</li>
            <li>Aim to match the small-piece percentage</li>
          </ul>
          <p class="math-note"><b>Math:</b> for any r ∈ (0, 1) and any direction there's a line producing that exact ratio — IVT applied to the moving half-plane.</p>
        </div>
        <div class="help-cut-quad">
          <p>Two cuts that cross <b>inside</b> the shape — four equal pieces.</p>
          <ul>
            <li>Draw two lines, each fully crossing the shape</li>
            <li>Drag any endpoint to adjust, then <b>Confirm</b></li>
          </ul>
          <p class="math-note"><b>Math:</b> Courant–Robbins theorem — any planar region can be split into 4 equal pieces by <i>two perpendicular</i> lines. Proof rotates two area-bisectors by 90° and uses IVT. <a class="math-more" href="/blog/courant-robbins-four-equal-pieces/">Read more →</a></p>
        </div>
        <div class="help-cut-tri">
          <p>Two cuts, but the second must stay in <b>one half</b> — three equal pieces.</p>
          <ul>
            <li>First line splits the shape; second splits only one of the halves</li>
            <li>If the second line crosses the first inside the shape you get 4 pieces — invalid</li>
          </ul>
          <p class="math-note"><b>Math:</b> apply IVT twice — first find a 1/3–2/3 bisector, then halve the larger piece. Always achievable.</p>
        </div>
        <div class="help-cut-angle">
          <p>The cut's <b>angle is fixed</b>. Slide the line to find the 50/50 spot.</p>
          <ul>
            <li>Drag anywhere — the line translates perpendicular to its direction</li>
            <li>Endpoints snap to the outline automatically</li>
          </ul>
          <p class="math-note"><b>Math:</b> for any direction there is <i>exactly one</i> line of that direction bisecting the area — uniqueness and existence both from IVT.</p>
        </div>
      </div>
      <div class="help-inscribe">
        <div class="help-inscribe-square">
          <p>Place <b>four points</b> on the outline to form a square — the closer to a perfect square, the better.</p>
          <ul>
            <li>The nearest point on the outline follows your cursor</li>
            <li>Tap / click to drop — drag points any time to adjust</li>
            <li>After four points, press <b>Confirm</b> to score</li>
          </ul>
          <p class="math-note"><b>Math:</b> Toeplitz's Inscribed Square Problem (1911) — does every closed curve contain 4 points forming a square? Proven for polygons, smooth curves, and piecewise-smooth curves like the ones here; for arbitrary Jordan curves it's still <i>open</i> after 110+ years. <a class="math-more" href="/blog/inscribed-square-problem/">Read more →</a></p>
        </div>
        <div class="help-inscribe-triangle">
          <p>Find the <b>largest equilateral triangle</b> with all three vertices on the shape’s outline.</p>
          <ul>
            <li>Same controls as Square — tap, drop, and drag to adjust</li>
            <li>Score = regularity (equal sides, 60° angles) × size relative to the maximum inscribed equilateral</li>
            <li>After three points, press <b>Confirm</b> to score</li>
          </ul>
          <p class="math-note"><b>Math:</b> every Jordan curve contains inscribed equilateral triangles — proven by Nielsen &amp; Wright (1990) and others. Unlike Toeplitz's square, the triangle case is fully settled. <a class="math-more" href="/blog/inscribed-equilateral-triangle/">Read more →</a></p>
        </div>
      </div>
      <div class="help-balance">
        <div class="help-balance-centroid">
          <p>Find the <b>center of mass</b> of the shape — tap anywhere to place your guess.</p>
          <ul>
            <li>Shapes with holes shift the center of mass</li>
            <li>Tap anywhere on the board to drop your guess</li>
            <li>Drag the point to fine-tune, then press <b>Confirm</b></li>
          </ul>
          <p class="math-note"><b>Math:</b> the centroid doesn't have to lie <i>inside</i> the shape — for an annulus it sits at the empty center. Non-convex outlines and holes are where intuition breaks. <a class="math-more" href="/blog/center-of-mass-with-holes/">Read more →</a></p>
        </div>
        <div class="help-balance-pole">
          <p>Slide a <b>pole</b> under the shape so it <b>balances</b>.</p>
          <ul>
            <li>Tap anywhere to place the pole's X position</li>
            <li>Drag to fine-tune, then press <b>Confirm</b></li>
          </ul>
          <p class="math-note"><b>Math:</b> only the horizontal offset between the pole and the centroid's X matters for tipping — it's an inverted pendulum whose torque is <i>m·g·Δx</i>.</p>
        </div>
        <div class="help-balance-perch">
          <p>Place the shape on the pyramid <b>tip</b> so it <b>balances</b>.</p>
          <ul>
            <li>Drag the shape to translate, use the purple handle to rotate</li>
            <li>The shape must touch the tip, then press <b>Confirm</b></li>
          </ul>
          <p class="math-note"><b>Math:</b> for any 2D shape there is always an orientation that balances on a single point — the Intermediate Value Theorem applied to the horizontal offset of the bottom point from the centroid as the shape rotates.</p>
        </div>
      </div>
      <div class="close-row"><button class="btn" id="close-help">Got it</button></div>
    </div>
  </div>`;

const STATS_MODAL = `<div class="modal-back" id="stats-modal">
    <div class="modal">
      <h2>STATS</h2>
      <p class="stats-subtitle" id="stats-subtitle">Cut · Half</p>
      <div id="stats-cut-section">
        <p>Cuts made: <b id="s-attempts">0</b></p>
        <p>Best cut: <b id="s-best">—</b></p>
        <p>Average off by: <b id="s-avg">—</b></p>
        <p>Perfect cuts (&lt;0.5%): <b id="s-perfect">0</b></p>
        <p>Daily wins: <b id="s-daily-wins">0</b></p>
      </div>
      <div id="stats-inscribe-section">
        <p>Rounds played: <b id="in-attempts">0</b></p>
        <p>Best score: <b id="in-best">—</b></p>
        <p>Average score: <b id="in-avg">—</b></p>
        <p>Perfect (&ge;95%): <b id="in-perfect">0</b></p>
        <p>Daily wins: <b id="in-daily-wins">0</b></p>
      </div>
      <div id="stats-balance-section">
        <p>Shapes played: <b id="bl-attempts">0</b></p>
        <p>Best off by: <b id="bl-best">—</b></p>
        <p>Average off by: <b id="bl-avg">—</b></p>
        <p>Perfect (&le;5): <b id="bl-perfect">0</b></p>
        <p>Daily wins: <b id="bl-daily-wins">0</b></p>
      </div>
      <div class="close-row">
        <button class="btn secondary" id="reset-stats">Reset</button>
        <button class="btn" id="close-stats">Close</button>
      </div>
    </div>
  </div>`;

const PUZZLE_MODAL = `<div class="modal-back" id="puzzle-modal">
    <div class="modal modal-wide">
      <h2>CHANGE PUZZLE</h2>

      <div class="seed-toggle" role="tablist" aria-label="Seed source">
        <button class="seed-pill" data-seed="endless" role="tab" aria-selected="true">
          <span class="seed-pill-label">Endless</span>
          <span class="seed-pill-sub">random shapes</span>
        </button>
        <button class="seed-pill" data-seed="daily" role="tab" aria-selected="false">
          <span class="seed-pill-label">Daily</span>
          <span class="seed-pill-sub" id="daily-sub">everyone plays the same</span>
        </button>
      </div>

      <div class="mode-tabs" role="tablist" aria-label="Puzzle mode">
        <button class="mode-tab" data-mode="cut" role="tab">Cut</button>
        <button class="mode-tab" data-mode="inscribe" role="tab">Inscribe</button>
        <button class="mode-tab" data-mode="balance" role="tab">Balance</button>
      </div>

      <div class="var-groups">
        <div class="var-group" data-mode="cut">
          <button class="var-card" data-var="half">
            <div class="mode-title">Half</div>
            <div class="mode-desc">Classic 50/50 split by area — one straight line.</div>
          </button>
          <button class="var-card" data-var="ratio">
            <div class="mode-title">Target Ratio</div>
            <div class="mode-desc">Cut in a random ratio between 5/95 and 50/50 — the target changes each shape.</div>
          </button>
          <button class="var-card" data-var="quad">
            <div class="mode-title">Quad Cut</div>
            <div class="mode-desc">Two cuts, four equal pieces. The lines must intersect inside the shape.</div>
          </button>
          <button class="var-card" data-var="tri">
            <div class="mode-title">Tri Cut</div>
            <div class="mode-desc">Two cuts, three equal pieces. The second cut must leave one piece whole.</div>
          </button>
          <button class="var-card" data-var="angle">
            <div class="mode-title">Constrained Angle</div>
            <div class="mode-desc">Line is pre-placed at a fixed angle. Drag it to find the 50/50 sweet spot.</div>
          </button>
        </div>
        <div class="var-group" data-mode="inscribe">
          <button class="var-card" data-var="square">
            <div class="mode-title">Square</div>
            <div class="mode-desc">Four points forming a regular square — the classic inscribed-square challenge.</div>
          </button>
          <button class="var-card" data-var="triangle">
            <div class="mode-title">Largest Equilateral Triangle</div>
            <div class="mode-desc">Find the largest equilateral triangle with all three vertices on the outline.</div>
          </button>
        </div>
        <div class="var-group" data-mode="balance">
          <button class="var-card" data-var="pole">
            <div class="mode-title">Pole Balance</div>
            <div class="mode-desc">Slide a pole under the shape so it doesn't tip.</div>
          </button>
          <button class="var-card" data-var="centroid">
            <div class="mode-title">Centroid</div>
            <div class="mode-desc">Tap the board where you think the center of mass is.</div>
          </button>
          <button class="var-card" data-var="perch">
            <div class="mode-title">Perch Balance</div>
            <div class="mode-desc">Drag and rotate the shape onto a pyramid tip so it balances.</div>
          </button>
        </div>
      </div>

      <div class="close-row"><button class="btn" id="close-puzzle">Close</button></div>
    </div>
  </div>`;

// ---------------------------------------------------------------------------
// JSON-LD helpers
// ---------------------------------------------------------------------------

function homeJsonLd(p) {
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'geometric.games',
    url: SITE + '/',
    description: p.description,
    inLanguage: 'en',
    publisher: {
      '@type': 'Organization',
      name: 'geometric.games',
      logo: { '@type': 'ImageObject', url: SITE + '/favicon.svg' },
    },
  };
  return JSON.stringify(website, null, 2);
}

function gameJsonLd(p) {
  const game = {
    '@context': 'https://schema.org',
    '@type': 'Game',
    name: p.title.split(' — ')[0].split(' | ')[0],
    url: SITE + p.canonicalPath,
    description: p.description,
    genre: 'Puzzle',
    applicationCategory: 'Game',
    gamePlatform: 'Web browser',
    operatingSystem: 'Any',
    inLanguage: 'en',
    isAccessibleForFree: true,
  };
  return JSON.stringify(game, null, 2);
}

function breadcrumbJsonLd(crumbs) {
  const list = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c[0],
      item: SITE + c[1],
    })),
  };
  return JSON.stringify(list, null, 2);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function writeFile(relPath, content) {
  const abs = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  console.log('wrote', relPath);
}

// ---------------------------------------------------------------------------
// Blog templates
// ---------------------------------------------------------------------------

function renderBlogPost(post) {
  // Post lives at /blog/<slug>/index.html (depth 2 from repo root).
  const rel = '../../';
  const canonicalUrl = `${SITE}/blog/${post.slug}/`;
  const ogImage = SITE + '/og-image.png';

  // Rewrite root-absolute href="/foo" in body to per-page relative form.
  const body = post.body.replace(/href="\/([^"]*)"/g, (_m, rest) => {
    if (rest === '') return `href="${rel}"`;
    return `href="${rel}${rest}"`;
  });

  const playHref = post.playPath === '/' ? rel : `${rel}${post.playPath.replace(/^\//, '')}`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    url: canonicalUrl,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: 'en',
    author: { '@type': 'Organization', name: 'geometric.games' },
    publisher: {
      '@type': 'Organization',
      name: 'geometric.games',
      logo: { '@type': 'ImageObject', url: SITE + '/favicon.svg' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
  }, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${escapeHtml(post.title)} | geometric.games blog</title>
<meta name="description" content="${escapeAttr(post.description)}">
<meta name="author" content="geometric.games">
<meta name="theme-color" content="#111111">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeAttr(post.title)}">
<meta property="og:description" content="${escapeAttr(post.description)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:site_name" content="geometric.games">
<meta property="og:image" content="${ogImage}">
<meta property="article:published_time" content="${post.date}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(post.title)}">
<meta name="twitter:description" content="${escapeAttr(post.description)}">
<meta name="twitter:image" content="${ogImage}">
<link rel="canonical" href="${canonicalUrl}">
<link rel="icon" type="image/svg+xml" href="${rel}favicon.svg">
<link rel="icon" type="image/png" sizes="192x192" href="${rel}icon-192.png">
<link rel="icon" type="image/png" sizes="512x512" href="${rel}icon-512.png">
<link rel="apple-touch-icon" href="${rel}apple-touch-icon.png">
<link rel="mask-icon" href="${rel}favicon.svg" color="#c084fc">
<script type="application/ld+json">
${jsonLd}
</script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-N9CPH9MB');</script>
<!-- End Google Tag Manager -->
<link rel="stylesheet" href="${rel}css/index.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" crossorigin="anonymous" onload="renderMathInElement(document.body, {delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}], throwOnError: false});"></script>
</head>
<body class="blog-body">
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-N9CPH9MB"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
<header class="blog-header">
  <a class="blog-logo" href="${rel}">GEOMETRIC<span class="accent">.GAMES</span></a>
  <nav class="blog-topnav"><a href="${rel}blog/">Blog</a></nav>
</header>
<article class="article">
  <div class="article-inner">
    <h1>${escapeHtml(post.title)}</h1>
    <p class="article-meta"><time datetime="${post.date}">${post.date}</time></p>
    <div class="article-body">
      ${body.trim()}
    </div>
    <div class="article-cta">
      <a class="btn" href="${playHref}">${escapeHtml(post.playTitle)} →</a>
    </div>
    <nav class="article-nav">
      <a href="${rel}blog/">← All posts</a>
    </nav>
  </div>
</article>
</body>
</html>
`;
}

function renderBlogIndex() {
  const rel = '../';
  const canonicalUrl = SITE + '/blog/';
  const ogImage = SITE + '/og-image.png';

  const postsHtml = BLOG_POSTS.map(post => `
      <li>
        <a class="blog-list-item" href="${post.slug}/">
          <span class="blog-list-date"><time datetime="${post.date}">${post.date}</time></span>
          <span class="blog-list-title">${escapeHtml(post.title)}</span>
          <span class="blog-list-desc">${escapeHtml(post.description)}</span>
        </a>
      </li>`).join('');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'geometric.games blog',
    url: canonicalUrl,
    description: 'Notes on the geometry behind the geometric.games puzzles: bisectors, inscribed squares, centroids, balance.',
    inLanguage: 'en',
    publisher: {
      '@type': 'Organization',
      name: 'geometric.games',
      logo: { '@type': 'ImageObject', url: SITE + '/favicon.svg' },
    },
  }, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Blog | geometric.games</title>
<meta name="description" content="Notes on the geometry behind geometric.games: bisectors, inscribed squares, centroids, balance.">
<meta name="author" content="geometric.games">
<meta name="theme-color" content="#111111">
<meta property="og:type" content="website">
<meta property="og:title" content="Blog | geometric.games">
<meta property="og:description" content="Notes on the geometry behind geometric.games: bisectors, inscribed squares, centroids, balance.">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:site_name" content="geometric.games">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Blog | geometric.games">
<meta name="twitter:description" content="Notes on the geometry behind geometric.games.">
<meta name="twitter:image" content="${ogImage}">
<link rel="canonical" href="${canonicalUrl}">
<link rel="icon" type="image/svg+xml" href="${rel}favicon.svg">
<link rel="icon" type="image/png" sizes="192x192" href="${rel}icon-192.png">
<link rel="icon" type="image/png" sizes="512x512" href="${rel}icon-512.png">
<link rel="apple-touch-icon" href="${rel}apple-touch-icon.png">
<link rel="mask-icon" href="${rel}favicon.svg" color="#c084fc">
<script type="application/ld+json">
${jsonLd}
</script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-N9CPH9MB');</script>
<!-- End Google Tag Manager -->
<link rel="stylesheet" href="${rel}css/index.css">
</head>
<body class="blog-body">
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-N9CPH9MB"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
<header class="blog-header">
  <a class="blog-logo" href="${rel}">GEOMETRIC<span class="accent">.GAMES</span></a>
</header>
<main class="article">
  <div class="article-inner">
    <h1>Blog</h1>
    <p class="article-meta">Notes on the geometry behind the puzzles — why the math works, where intuition breaks, and what’s still open.</p>
    <ul class="blog-list">${postsHtml}
    </ul>
  </div>
</main>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Generate files
// ---------------------------------------------------------------------------

function buildPages() {
  for (const p of GAME_PAGES) {
    writeFile(p.outPath, renderPage(p));
  }
}

function buildBlog() {
  writeFile('blog/index.html', renderBlogIndex());
  for (const post of BLOG_POSTS) {
    writeFile(`blog/${post.slug}/index.html`, renderBlogPost(post));
  }
}

function sitemapUrls() {
  const gameUrls = GAME_PAGES.filter(p => !p.isAlias).map(p => ({
    loc: SITE + p.canonicalPath,
    priority: p.canonicalPath === '/' ? '1.0' : '0.9',
  }));
  const blogIndex = [{ loc: SITE + '/blog/', priority: '0.8' }];
  const blogPosts = BLOG_POSTS.map(p => ({
    loc: `${SITE}/blog/${p.slug}/`,
    priority: '0.7',
  }));
  return [...gameUrls, ...blogIndex, ...blogPosts];
}

function buildSitemap() {
  const urls = sitemapUrls().map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  writeFile('sitemap.xml', xml);
}

function buildPageMetaJs() {
  // Client-side lookup: given a mode+variation, return title/description/canonical
  // so pushState navigations can update <title> and meta tags on the fly.
  const map = {};
  for (const p of GAME_PAGES) {
    const key = `${p.mode}:${p.variation}`;
    if (map[key]) continue; // first entry wins (index.html beats cut/half)
    map[key] = {
      path: p.canonicalPath,
      title: p.title,
      description: p.description,
    };
  }
  const js = `// Generated by scripts/build-pages.js — do not edit by hand.
const PAGE_META = ${JSON.stringify(map, null, 2)};

function pageMetaFor(mode, variation) {
  return PAGE_META[mode + ':' + variation] || PAGE_META['cut:half'];
}
`;
  writeFile('js/core/page-meta.js', js);
}

buildPages();
buildBlog();
buildSitemap();
buildPageMetaJs();
console.log('\nDone. Run a local server from the repo root to preview.');
