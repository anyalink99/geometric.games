/* Drop-to-load custom image support.
   Drag any PNG/SVG/WebP/GIF/BMP onto the board, and the alpha channel is
   traced into an outer polygon + holes that replaces the seeded random
   shape. The raster image is then painted inside the shape via SVG clipPath
   so puzzles play out with the user's artwork visible.

   Self-contained: only interacts with the rest of the app by:
     - setting state.hash/state.shape/state.shapeImage
     - monkey-patching renderShape, makePiece, confirmPerch (wrapping originals,
       not replacing) so that on drop-* puzzles an <image> element is painted
       inside any rendered shape / cut piece / balance-perch baked fill.

   Drop hashes (`drop-xxxxxx`) only exist in the dropping session; a recipient
   who opens the share URL sees a site-favicon rehydration instead. */
(function () {
  const TRACE_SIZE = 256;
  const ALPHA_MIN = 48;
  const RDP_EPS = 1.1;
  const MIN_HOLE_PIXELS = 24;
  const ACCEPTED = /^image\/(svg\+xml|png|webp|gif|bmp)$/i;

  function traceContour(mask, W, H, sx, sy) {
    const dxs = [1, 1, 0, -1, -1, -1, 0, 1];
    const dys = [0, 1, 1, 1, 0, -1, -1, -1];
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
    const pts = [{ x: sx, y: sy }];
    let cx = sx, cy = sy;
    let dir = 6;
    const limit = W * H * 4;
    for (let it = 0; it < limit; it++) {
      let found = false;
      for (let k = 0; k < 8; k++) {
        const nd = (dir + k) & 7;
        const nx = cx + dxs[nd], ny = cy + dys[nd];
        if (inside(nx, ny)) {
          cx = nx; cy = ny;
          pts.push({ x: cx, y: cy });
          dir = (nd + 6) & 7;
          found = true;
          break;
        }
      }
      if (!found) break;
      if (cx === sx && cy === sy && pts.length > 2) break;
    }
    return pts;
  }

  function rdpSimplify(pts, eps) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    const keep = new Uint8Array(n);
    keep[0] = 1; keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let maxD = 0, idx = -1;
      const pa = pts[a], pb = pts[b];
      for (let i = a + 1; i < b; i++) {
        const d = distPointToSegment(pts[i], pa, pb);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > eps && idx > 0) {
        keep[idx] = 1;
        stack.push([a, idx]); stack.push([idx, b]);
      }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }

  function findHoles(mask, W, H) {
    const total = W * H;
    const visited = new Uint8Array(total);
    const stack = [];
    const seed = (i) => { if (!mask[i] && !visited[i]) { visited[i] = 1; stack.push(i); } };
    for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
    while (stack.length) {
      const p = stack.pop();
      const y = (p / W) | 0, x = p - y * W;
      if (x > 0) { const n = p - 1; if (!mask[n] && !visited[n]) { visited[n] = 1; stack.push(n); } }
      if (x < W - 1) { const n = p + 1; if (!mask[n] && !visited[n]) { visited[n] = 1; stack.push(n); } }
      if (y > 0) { const n = p - W; if (!mask[n] && !visited[n]) { visited[n] = 1; stack.push(n); } }
      if (y < H - 1) { const n = p + W; if (!mask[n] && !visited[n]) { visited[n] = 1; stack.push(n); } }
    }
    const holeMask = new Uint8Array(total);
    for (let i = 0; i < total; i++) if (!mask[i] && !visited[i]) holeMask[i] = 1;

    const label = new Int32Array(total);
    const holes = [];
    let next = 1;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        if (!holeMask[idx] || label[idx]) continue;
        label[idx] = next;
        const queue = [idx];
        let head = 0, sx = x, sy = y, count = 0;
        while (head < queue.length) {
          const q = queue[head++]; count++;
          const qy = (q / W) | 0, qx = q - qy * W;
          if (qy < sy || (qy === sy && qx < sx)) { sx = qx; sy = qy; }
          const neigh = [q - 1, q + 1, q - W, q + W];
          for (const n of neigh) {
            if (n < 0 || n >= total) continue;
            if (holeMask[n] && !label[n]) { label[n] = next; queue.push(n); }
          }
        }
        next++;
        if (count < MIN_HOLE_PIXELS) continue;
        const ring = traceContour(holeMask, W, H, sx, sy);
        if (ring && ring.length >= 6) holes.push(ring);
      }
    }
    return holes;
  }

  function buildShapeFromImage(img) {
    const s = TRACE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext('2d');
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    const scale = Math.min((s - 8) / iw, (s - 8) / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (s - dw) / 2, (s - dh) / 2, dw, dh);
    let data;
    try { data = ctx.getImageData(0, 0, s, s).data; } catch (e) { return null; }

    const mask = new Uint8Array(s * s);
    let count = 0;
    for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
      if (data[j + 3] > ALPHA_MIN) { mask[i] = 1; count++; }
    }
    if (count < 40) return null;

    let sx = -1, sy = -1;
    for (let y = 0; y < s && sy < 0; y++) {
      for (let x = 0; x < s; x++) if (mask[y * s + x]) { sx = x; sy = y; break; }
    }
    if (sx < 0) return null;
    const outerRaw = traceContour(mask, s, s, sx, sy);
    if (!outerRaw || outerRaw.length < 6) return null;
    const outer = rdpSimplify(outerRaw, RDP_EPS);
    if (outer.length < 3 || polygonArea(outer) < 20) return null;

    const holesRaw = findHoles(mask, s, s);
    const holes = [];
    for (const h of holesRaw) {
      const simp = rdpSimplify(h, RDP_EPS);
      if (simp.length >= 3 && polygonArea(simp) > 8) holes.push(simp);
    }

    const shape = { outer, holes };
    const centered = centerShapeObject(shape);
    const normalized = normalizeShapeArea(centered, true);
    if (!normalized) return null;

    // Recover the composite similarity transform from two matching outline
    // points (raw canvas coords → board coords). Transform is uniform scale +
    // translate (no rotation), so two points are sufficient.
    const a0 = outer[0], a1 = outer[Math.floor(outer.length / 2)];
    const b0 = normalized.outer[0], b1 = normalized.outer[Math.floor(outer.length / 2)];
    const rawLen = Math.hypot(a1.x - a0.x, a1.y - a0.y);
    const boardLen = Math.hypot(b1.x - b0.x, b1.y - b0.y);
    if (rawLen < 1e-6 || boardLen < 1e-6) return null;
    const sc = boardLen / rawLen;
    const tx = b0.x - a0.x * sc;
    const ty = b0.y - a0.y * sc;

    const ox = (s - dw) / 2, oy = (s - dh) / 2;
    const placement = {
      x: tx + ox * sc,
      y: ty + oy * sc,
      width: dw * sc,
      height: dh * sc,
    };

    return { shape: normalized, placement };
  }

  function applyCustomShape(shape, placement, href) {
    state.hash = 'drop-' + Math.random().toString(36).slice(2, 10);
    state.shape = shape;
    state.shapeImage = placement && href ? { placement, href } : null;
    state.locked = false;
    resetAllModes();
    renderShape(state.shape);
    modeRunner[state.mode].onShapeReady();
    dom.newBtn.classList.remove('pulse');
    updateActionButton();
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }

  async function handleFile(file) {
    if (!file || !ACCEPTED.test(file.type || '')) return;
    if (state.daily) return;
    try {
      const url = await readAsDataURL(file);
      const img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const built = buildShapeFromImage(img);
      if (built) applyCustomShape(built.shape, built.placement, url);
    } catch (e) { /* swallow */ }
  }

  let clipIdCounter = 0;

  function paintImageInto(group, info) {
    const fillPaths = group.querySelectorAll('.shape-fill');
    for (const fillPath of fillPaths) {
      const clipId = 'drop-clip-' + (++clipIdCounter);
      const clip = document.createElementNS(SVG_NS, 'clipPath');
      clip.setAttribute('id', clipId);
      clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
      const clipShape = document.createElementNS(SVG_NS, 'path');
      clipShape.setAttribute('d', fillPath.getAttribute('d'));
      clipShape.setAttribute('clip-rule', 'evenodd');
      clip.appendChild(clipShape);
      group.insertBefore(clip, group.firstChild);

      const imgEl = document.createElementNS(SVG_NS, 'image');
      imgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', info.href);
      imgEl.setAttribute('href', info.href);
      imgEl.setAttribute('x', info.placement.x);
      imgEl.setAttribute('y', info.placement.y);
      imgEl.setAttribute('width', info.placement.width);
      imgEl.setAttribute('height', info.placement.height);
      imgEl.setAttribute('preserveAspectRatio', 'none');
      imgEl.setAttribute('clip-path', 'url(#' + clipId + ')');
      imgEl.style.pointerEvents = 'none';
      fillPath.parentNode.insertBefore(imgEl, fillPath.nextSibling);

      fillPath.style.fillOpacity = '0';
    }
  }

  function isDropped() {
    return typeof state.hash === 'string' && state.hash.indexOf('drop-') === 0;
  }

  const _origRenderShape = window.renderShape;
  window.renderShape = function (shape) {
    _origRenderShape(shape);
    if (!isDropped()) { state.shapeImage = null; return; }
    const info = state.shapeImage;
    if (!info) return;
    const group = dom.shapeLayer.querySelector('.shape-group');
    if (group) paintImageInto(group, info);
  };

  const _origMakePiece = window.makePiece;
  if (typeof _origMakePiece === 'function') {
    window.makePiece = function (piece) {
      const g = _origMakePiece(piece);
      if (isDropped() && state.shapeImage) paintImageInto(g, state.shapeImage);
      return g;
    };
  }

  // Perch bakes the live transform into fill.d on confirm, then animates the
  // inner group with physics. The image + its clipPath were set up in pre-bake
  // coords — without the same bake, they drift off the outline mid-flight.
  const _origConfirmPerch = window.confirmPerch;
  if (typeof _origConfirmPerch === 'function') {
    window.confirmPerch = function () {
      const active = isDropped() && state.shapeImage
        && state.mode === 'balance' && currentVariation() === 'perch';
      let preTransform = null;
      if (active && typeof perchContentG === 'function') {
        const inner = perchContentG();
        if (inner) preTransform = inner.getAttribute('transform');
      }
      const r = _origConfirmPerch.apply(this, arguments);
      if (active && preTransform && typeof perchState !== 'undefined' && perchState.confirmed) {
        const inner = perchContentG();
        if (inner) {
          const imgEl = inner.querySelector('image');
          if (imgEl) imgEl.setAttribute('transform', preTransform);
        }
      }
      return r;
    };
  }

  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault();
    }
  });
  window.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (!dt || !dt.files || !dt.files.length) return;
    e.preventDefault();
    handleFile(dt.files[0]);
  });

  // A drop-* hash can only reach another visitor through the share image's URL,
  // since dropped shapes live only in the session that produced them. Replace
  // the seeded random shape with the site favicon so the page isn't visually
  // broken for the recipient.
  (async function rehydrateDropHash() {
    if (state.daily || !isDropped()) return;
    try {
      const resp = await fetch('favicon.svg');
      if (!resp.ok) return;
      const blob = await resp.blob();
      const url = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(blob);
      });
      const img = new Image();
      img.decoding = 'async';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const built = buildShapeFromImage(img);
      if (!built) return;
      state.shape = built.shape;
      state.shapeImage = { placement: built.placement, href: url };
      state.locked = false;
      resetAllModes();
      renderShape(state.shape);
      modeRunner[state.mode].onShapeReady();
      dom.newBtn.classList.remove('pulse');
      updateActionButton();
    } catch (e) { /* fall back to the random shape already on screen */ }
  })();
})();
