// Regression test for share-image clipping bugs.
//
// - Perch: shape placed on the pyramid tip and rotated to various angles; after
//   confirm, rasterize the share SVG and ensure no painted pixels touch its edges.
// - Cut: perform a confirming cut and verify the fanned-apart pieces are fully
//   visible in the shared image (transform + filter spread must be respected).
//
// Usage: node tools/test-share-clip.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
};

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let url = decodeURIComponent(req.url.split('?')[0]);
      if (url.endsWith('/')) url += 'index.html';
      const filePath = path.join(ROOT, url);
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

// Render the current board via buildBoardSvgBlob and count painted pixels
// touching each edge of the resulting SVG viewport.
async function inspectShareImage(page) {
  return page.evaluate(async () => {
    const { blob, width, height } = buildBoardSvgBlob();
    const url = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load')); i.src = url;
    });
    const w = Math.ceil(width), h = Math.ceil(height);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const data = ctx.getImageData(0, 0, w, h).data;
    const hit = (x, y) => data[(y * w + x) * 4 + 3] > 8;
    let L = 0, R = 0, T = 0, B = 0;
    for (let y = 0; y < h; y++) { if (hit(0, y)) L++; if (hit(w - 1, y)) R++; }
    for (let x = 0; x < w; x++) { if (hit(x, 0)) T++; if (hit(x, h - 1)) B++; }
    const dumpPng = await new Promise(res => canvas.toBlob(b => {
      const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b);
    }, 'image/png'));
    return { width, height, edges: { L, R, T, B }, dumpPng };
  });
}

async function perchCase(page, theta, label) {
  const r = await page.evaluate(async (thetaArg) => {
    perchReset();
    drawPyramid();
    perchState.pivot = shapeCentroid(state.shape);
    perchState.tx = TIP_PT.x - perchState.pivot.x;
    perchState.ty = TIP_PT.y - perchState.pivot.y;
    perchState.theta = thetaArg;
    perchState.touched = true;
    const inner = document.querySelector('#shape-layer > g > g');
    if (inner) {
      const c = perchState.pivot;
      inner.setAttribute('transform',
        `translate(${perchState.tx} ${perchState.ty}) rotate(${perchState.theta * 180 / Math.PI} ${c.x} ${c.y})`);
    }
    confirmPerch();
  }, theta);
  const res = await inspectShareImage(page);
  res.label = label; res.theta = theta;
  return res;
}

async function cutCase(page, label) {
  await page.evaluate(async () => {
    // Drop a single cut line fully across the shape horizontally, then finalize.
    const outer = state.shape.outer;
    let minX = Infinity, maxX = -Infinity, yMid = 0;
    for (const p of outer) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; yMid += p.y; }
    yMid /= outer.length;
    cutState.cuts = [{ a: { x: minX - 40, y: yMid }, b: { x: maxX + 40, y: yMid } }];
    renderCutSegments();
    finalizeCut();
    // Wait for fan-apart CSS transition to settle before snapshotting.
    await new Promise(r => setTimeout(r, 500));
  });
  const res = await inspectShareImage(page);
  res.label = label;
  return res;
}

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  page.on('console', m => { console.log(`[page-${m.type()}]`, m.text()); });

  const cases = [];

  // Perch puzzle reported by user.
  await page.goto(`http://127.0.0.1:${PORT}/balance/perch/?s=c6fe97a04eb4de4fc947d1ac`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() =>
    typeof state !== 'undefined' && state.shape && typeof confirmPerch === 'function' &&
    (document.querySelector('#shape-layer')?.children.length || 0) > 0);
  for (const [th, label] of [[0, 'perch-0'], [Math.PI / 6, 'perch-30'], [-Math.PI / 5, 'perch--36'], [Math.PI / 3, 'perch-60'], [Math.PI / 2, 'perch-90'], [Math.PI, 'perch-180']]) {
    cases.push(await perchCase(page, th, label));
  }

  // Cut puzzle — horizontal cut across a half-puzzle.
  await page.goto(`http://127.0.0.1:${PORT}/cut/ratio/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() =>
    typeof state !== 'undefined' && state.shape && typeof finalizeCut === 'function' &&
    (document.querySelector('#shape-layer')?.children.length || 0) > 0);
  cases.push(await cutCase(page, 'cut-ratio-horizontal'));

  await browser.close();
  server.close();

  let failed = 0;
  for (const r of cases) {
    const sum = r.edges.L + r.edges.R + r.edges.T + r.edges.B;
    const ok = sum === 0;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${r.label} — edges L=${r.edges.L} R=${r.edges.R} T=${r.edges.T} B=${r.edges.B}  ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
    if (!ok) {
      failed++;
      const m = r.dumpPng && r.dumpPng.match(/^data:image\/png;base64,(.+)$/);
      if (m) {
        const p = path.join(__dirname, `_dump_${r.label.replace(/[^a-z0-9]+/ig, '_')}.png`);
        fs.writeFileSync(p, Buffer.from(m[1], 'base64'));
        console.log(`    [dumped] ${p}`);
      }
    }
  }
  if (failed) {
    console.error(`\nFAIL: ${failed}/${cases.length} cases have edge clipping.`);
    process.exit(1);
  }
  console.log('\nAll cases pass.');
}

run().catch(e => { console.error(e); process.exit(1); });
