// Share-to-clipboard: renders the current #board SVG + score + URL footer into
// a 1080x1080 PNG and writes it to the clipboard as a ClipboardItem.

const SHARE_CANVAS_SIZE = 1080;

// CSS properties that actually affect the visible rendering of the SVG board.
// We copy each element's computed value onto the clone as an inline style so
// the serialized SVG is self-contained (no external stylesheet dependency).
const SHARE_SVG_STYLE_PROPS = [
  'display',
  'visibility',
  'opacity',
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-opacity', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
  'filter',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline',
  'letter-spacing',
];

function shareLabel() {
  const v = currentVariation();
  const base = `${modeShareLabel(state.mode)} · ${variationShareLabel(state.mode, v)}`;
  if (state.daily) return `DAILY #${dailyIndex()}  ·  ${base}`;
  return base;
}

function shareCanonicalPath() {
  return variationPath(state.mode, currentVariation());
}

function shareScoreText() {
  const verdict = document.querySelector('#score-line .verdict');
  const stats = document.querySelector('#score-line .score-stats');
  return {
    verdict: verdict ? verdict.textContent.trim() : '',
    stats: stats ? stats.textContent.trim() : '',
  };
}

function inlineSvgStyles(originalRoot, cloneRoot) {
  // Walk original + clone in parallel. querySelectorAll('*') gives a flat,
  // depth-first list in the same order for both trees since the clone is a
  // structural copy.
  const origList = [originalRoot, ...originalRoot.querySelectorAll('*')];
  const cloneList = [cloneRoot, ...cloneRoot.querySelectorAll('*')];
  const toRemove = [];
  for (let i = 0; i < origList.length; i++) {
    const orig = origList[i];
    const cln = cloneList[i];
    if (!cln) break;
    const cs = window.getComputedStyle(orig);
    if (cs.display === 'none' || cs.visibility === 'hidden') {
      toRemove.push(cln);
      continue;
    }
    let decls = '';
    for (const prop of SHARE_SVG_STYLE_PROPS) {
      const val = cs.getPropertyValue(prop);
      if (val && val !== 'initial' && val !== 'normal') {
        decls += `${prop}:${val};`;
      }
    }
    if (decls) cln.setAttribute('style', decls);
  }
  for (const el of toRemove) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
}

function buildBoardSvgBlob() {
  const board = document.getElementById('board');
  if (!board) throw new Error('no board');
  const clone = board.cloneNode(true);

  // Drop transient UI elements that only matter during interaction.
  const preview = clone.querySelector('#cut-preview');
  if (preview) preview.remove();
  clone.querySelectorAll('.sp-hover, .centroid-hover, .pole-hover').forEach(el => el.remove());

  inlineSvgStyles(board, clone);

  // Ensure the SVG has xmlns (cloneNode on elements in an HTML doc doesn't
  // always set it) and explicit dimensions so Image() can decode it.
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const vb = (clone.getAttribute('viewBox') || '0 0 520 560').split(/\s+/).map(Number);
  const vbW = vb[2] || 520;
  const vbH = vb[3] || 560;
  clone.setAttribute('width', vbW);
  clone.setAttribute('height', vbH);

  const svgString = new XMLSerializer().serializeToString(clone);
  return {
    blob: new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }),
    width: vbW,
    height: vbH,
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

async function buildSharePng() {
  const { blob: svgBlob, width: vbW, height: vbH } = buildBoardSvgBlob();
  const svgUrl = URL.createObjectURL(svgBlob);
  let img;
  try {
    img = await loadImage(svgUrl);
  } finally {
    // Safari needs the URL alive until decode completes, but by the time
    // loadImage resolves, decode is done. Revoke on microtask-later to be safe.
    setTimeout(() => URL.revokeObjectURL(svgUrl), 0);
  }

  const size = SHARE_CANVAS_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Background — match the game's inner background.
  const bg = '#2d2631';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Header — GEOMETRIC.GAMES brand, centered.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const brandY = 92;
  ctx.font = '900 50px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const brandLeft = 'GEOMETRIC';
  const brandRight = '.GAMES';
  const leftW = ctx.measureText(brandLeft).width;
  const rightW = ctx.measureText(brandRight).width;
  const totalW = leftW + rightW;
  const leftX = size / 2 - totalW / 2 + leftW / 2;
  const rightX = size / 2 - totalW / 2 + leftW + rightW / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(brandLeft, leftX, brandY);
  ctx.fillStyle = '#c084fc';
  ctx.fillText(brandRight, rightX, brandY);

  // Subtitle — MODE · VARIATION
  ctx.font = '700 24px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace';
  ctx.fillStyle = '#9ca3af';
  ctx.fillText(shareLabel(), size / 2, brandY + 54);

  // Board image — preserve aspect ratio, center in the middle band.
  const boardTop = 200;
  const boardBottom = 820;
  const boardAvailH = boardBottom - boardTop;
  const boardAvailW = size - 120;
  const scale = Math.min(boardAvailW / vbW, boardAvailH / vbH);
  const boardW = vbW * scale;
  const boardH = vbH * scale;
  const boardX = (size - boardW) / 2;
  const boardY = boardTop + (boardAvailH - boardH) / 2;
  ctx.drawImage(img, boardX, boardY, boardW, boardH);

  // Score verdict + stats
  const { verdict, stats } = shareScoreText();
  if (verdict) {
    ctx.font = '900 44px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#c084fc';
    ctx.fillText(verdict, size / 2, 900);
  }
  if (stats) {
    ctx.font = '600 24px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace';
    ctx.fillStyle = '#d1d5db';
    ctx.fillText(stats, size / 2, 946);
  }

  // URL footer
  ctx.font = '600 22px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace';
  ctx.fillStyle = '#9ca3af';
  const urlLine = 'geometric.games' + shareCanonicalPath();
  ctx.fillText(urlLine, size / 2, size - 54);

  return await new Promise((resolve, reject) => {
    canvas.toBlob(b => {
      if (b) resolve(b);
      else reject(new Error('canvas.toBlob failed'));
    }, 'image/png');
  });
}

function showToast(msg, isError) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.remove('show'), 2200);
}

async function copyShareToClipboard() {
  const btn = document.getElementById('share-btn');
  if (btn) btn.disabled = true;
  let png;
  try {
    png = await buildSharePng();
  } catch (e) {
    console.warn('build share png failed:', e);
    showToast("Couldn't build image", true);
    if (btn) btn.disabled = false;
    return;
  }
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('clipboard API unavailable');
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': png }),
    ]);
    showToast('Copied image to clipboard');
  } catch (clipboardErr) {
    console.warn('clipboard failed, falling back:', clipboardErr);
    // Fallback: open the PNG in a new tab. Works on file:// and older browsers.
    try {
      const url = URL.createObjectURL(png);
      const w = window.open(url, '_blank');
      if (!w) {
        showToast('Popup blocked — allow popups to share', true);
      } else {
        showToast('Opened image in new tab');
        setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
      }
    } catch (openErr) {
      showToast("Couldn't share — try again", true);
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

(function wireShareButton() {
  const btn = document.getElementById('share-btn');
  if (!btn) return;
  btn.addEventListener('click', () => { copyShareToClipboard(); });
})();
