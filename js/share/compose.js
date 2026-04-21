/* Composes a full share-GIF frame on canvas: brand header, mode label, board
   (rasterized SVG snapshot), verdict/stats, QR + URL. Layout is the static
   PNG's 1080×1080 scaled to 540×540 — all offsets/fonts multiplied by 0.5
   so GIF framing matches the shared PNG 1-to-1. QR + URL are drawn on every
   frame (no fade-in) so the share link is visible even on preview loops. */

const COMPOSE_BG = '#2d2631';
const _COMPOSE_SCALE = CAPTURE_WIDTH / 1080;

const LAYOUT = {
  brandY:      92   * _COMPOSE_SCALE,
  labelY:      146  * _COMPOSE_SCALE,
  boardTop:    180  * _COMPOSE_SCALE,
  boardBottom: 860  * _COMPOSE_SCALE,
  boardPadX:   40   * _COMPOSE_SCALE,
  verdictY:    905  * _COMPOSE_SCALE,
  statsY:      950  * _COMPOSE_SCALE,
  playPromptY: 994  * _COMPOSE_SCALE,
  urlY:        1030 * _COMPOSE_SCALE,
  brandFont:    50  * _COMPOSE_SCALE,
  labelFont:    24  * _COMPOSE_SCALE,
  verdictFont:  44  * _COMPOSE_SCALE,
  statsFont:    24  * _COMPOSE_SCALE,
  playFont:     26  * _COMPOSE_SCALE,
  urlFont:      20  * _COMPOSE_SCALE,
};

let _composeCanvas = null;
let _composeCtx = null;
let _boardCanvas = null;
let _boardCtx = null;

function ensureComposeCanvas() {
  if (!_composeCanvas) {
    _composeCanvas = document.createElement('canvas');
    _composeCanvas.width = CAPTURE_WIDTH;
    _composeCanvas.height = CAPTURE_HEIGHT;
    _composeCtx = _composeCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!_boardCanvas) {
    _boardCanvas = document.createElement('canvas');
    _boardCtx = _boardCanvas.getContext('2d');
  }
  return { canvas: _composeCanvas, ctx: _composeCtx };
}

// Blob-URL SVGs that contain nested <image href="data:..."> (drop-to-load
// custom shapes) taint the canvas in Chrome/Safari because the inner data
// URL is treated as cross-origin relative to the blob origin. Switch to a
// data-URL outer SVG in that case: both outer + inner are data URLs with
// null origin, and the canvas stays origin-clean so getImageData works.
function _composeNeedsDataUrl() {
  return typeof state !== 'undefined' && !!state.shapeImage;
}

function _svgStringToUrl(svgStr) {
  if (_composeNeedsDataUrl()) {
    return {
      url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr),
      revoke: null,
    };
  }
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

async function rasterizeSvgToCanvas(svgStr, maxW, maxH) {
  const { url, revoke } = _svgStringToUrl(svgStr);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('svg image decode failed'));
      img.src = url;
    });
    const iw = img.naturalWidth || img.width || maxW;
    const ih = img.naturalHeight || img.height || maxH;
    const sc = Math.min(maxW / iw, maxH / ih);
    const w = Math.round(iw * sc);
    const h = Math.round(ih * sc);
    _boardCanvas.width = w;
    _boardCanvas.height = h;
    _boardCtx.clearRect(0, 0, w, h);
    _boardCtx.drawImage(img, 0, 0, w, h);
    return { canvas: _boardCanvas, w, h };
  } finally {
    if (revoke) revoke();
  }
}

function drawBrandHeader(ctx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `900 ${LAYOUT.brandFont}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const left = 'GEOMETRIC';
  const right = '.GAMES';
  const leftW = ctx.measureText(left).width;
  const rightW = ctx.measureText(right).width;
  const totalW = leftW + rightW;
  const leftX = CAPTURE_WIDTH / 2 - totalW / 2 + leftW / 2;
  const rightX = CAPTURE_WIDTH / 2 - totalW / 2 + leftW + rightW / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(left, leftX, LAYOUT.brandY);
  ctx.fillStyle = '#c084fc';
  ctx.fillText(right, rightX, LAYOUT.brandY);

  ctx.font = `700 ${LAYOUT.labelFont}px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace`;
  ctx.fillStyle = '#9ca3af';
  const label = (typeof shareLabel === 'function') ? shareLabel() : 'geometric.games';
  ctx.fillText(label, CAPTURE_WIDTH / 2, LAYOUT.labelY);
}

function drawVerdict(ctx, state) {
  if (!state || !state.verdictText) return;
  const op = Math.max(0, Math.min(1, state.verdictOpacity));
  if (op <= 0) return;
  ctx.save();
  ctx.globalAlpha = op;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${LAYOUT.verdictFont}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = verdictColor(state.verdictClass);
  ctx.fillText(state.verdictText, CAPTURE_WIDTH / 2, LAYOUT.verdictY);

  if (state.statsText) {
    const sop = Math.max(0, Math.min(1, state.statsOpacity));
    ctx.globalAlpha = op * sop;
    ctx.font = `600 ${LAYOUT.statsFont}px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace`;
    ctx.fillStyle = '#d1d5db';
    ctx.fillText(state.statsText, CAPTURE_WIDTH / 2, LAYOUT.statsY);
  }
  ctx.restore();
}

function verdictColor(cls) {
  if (!cls) return '#c084fc';
  if (cls.includes('perfect')) return '#4ade80';
  if (cls.includes('great'))   return '#c084fc';
  if (cls.includes('good'))    return '#f472b6';
  if (cls.includes('fair'))    return '#fbbf24';
  return '#c084fc';
}

function drawUrlFooter(ctx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${LAYOUT.playFont}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = '#e5e7eb';
  ctx.fillText('Play this puzzle →', CAPTURE_WIDTH / 2, LAYOUT.playPromptY);

  ctx.font = `600 ${LAYOUT.urlFont}px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace`;
  ctx.fillStyle = '#9ca3af';
  const url = (typeof shareDisplayUrl === 'function') ? shareDisplayUrl() : 'geometric.games';
  ctx.fillText(url, CAPTURE_WIDTH / 2, LAYOUT.urlY);
}

async function buildComposedFrame(svgStr, verdictState) {
  const { ctx } = ensureComposeCanvas();

  ctx.fillStyle = COMPOSE_BG;
  ctx.fillRect(0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);

  drawBrandHeader(ctx);

  if (svgStr) {
    const availW = CAPTURE_WIDTH - LAYOUT.boardPadX * 2;
    const availH = LAYOUT.boardBottom - LAYOUT.boardTop;
    const { canvas: bc, w, h } = await rasterizeSvgToCanvas(svgStr, availW, availH);
    const bx = Math.round((CAPTURE_WIDTH - w) / 2);
    const by = Math.round(LAYOUT.boardTop + (availH - h) / 2);
    ctx.drawImage(bc, bx, by);
  }

  drawVerdict(ctx, verdictState);
  drawUrlFooter(ctx);

  return ctx.getImageData(0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT).data;
}
