/* Frame capture pipeline for share-GIF.
   Each output frame mirrors the static PNG layout (brand header, mode label,
   board, verdict/stats, QR + URL). Board is a rasterized clone of the live
   SVG sampled at animation time t, cropped to the same tight viewBox PNG
   share uses so framing matches 1-to-1. */

const CAPTURE_WIDTH = 540;
const CAPTURE_HEIGHT = 540;
const CAPTURE_DURATION_MS = 1600;
const CAPTURE_FRAME_COUNT = 22;
const HOLD_FRAME_COUNT = 22;
const REVEAL_FRAME_DELAY_MS = CAPTURE_DURATION_MS / CAPTURE_FRAME_COUNT;
const HOLD_FRAME_DELAY_MS = 70;

// Apply a pre-computed tight viewBox to every captured snapshot so all frames
// are framed identically (matching the PNG share's crop). Without this the
// raw board viewBox of "-60 -80 520 560" leaves a lot of empty margin.
function serializeBoardSnapshot(srcSvg, viewBox) {
  const clone = srcSvg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('overflow', 'visible');
  inlineSvgStyles(srcSvg, clone);
  const preview = clone.querySelector('#cut-preview');
  if (preview) preview.remove();
  const hitPad = clone.querySelector('#hit-pad');
  if (hitPad) hitPad.remove();
  clone.querySelectorAll('.sp-hover, .centroid-hover, .pole-hover').forEach(el => el.remove());
  if (viewBox) {
    clone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    clone.setAttribute('width', viewBox.w);
    clone.setAttribute('height', viewBox.h);
  }
  const wrap = document.createElement('div');
  wrap.appendChild(clone);
  return wrap.innerHTML;
}

function resetForCapture() {
  state.locked = false;
  state._capturing = true;
  document.body.classList.add('gif-capturing');
  try {
    resetAllModes();
    renderShape(state.shape);
    modeRunner[state.mode].onShapeReady();
  } finally {
    state._capturing = false;
  }
}

function readVerdictState() {
  const verdictEl = document.querySelector('#score-line .verdict');
  const statsEl = document.querySelector('#score-line .score-stats');
  return {
    verdictText: verdictEl ? verdictEl.textContent.trim() : '',
    verdictOpacity: verdictEl ? parseFloat(getComputedStyle(verdictEl).opacity) || 0 : 0,
    verdictClass: verdictEl ? (verdictEl.className || '') : '',
    statsText: statsEl ? statsEl.textContent.trim() : '',
    statsOpacity: statsEl ? parseFloat(getComputedStyle(statsEl).opacity) || 0 : 0,
  };
}

async function captureRevealFrames() {
  const board = document.getElementById('board');
  if (!board) throw new Error('capture: #board not found');

  // Compute the tight viewBox NOW, using the current confirmed DOM — pieces
  // are at their max extent (Cut) or steady (inscribe/balance), so this
  // bbox holds across every upcoming replay frame.
  const viewBox = (typeof computeBoardViewBox === 'function') ? computeBoardViewBox(board) : null;

  const snap = modeRunner[state.mode].snapshot();
  resetForCapture();

  modeRunner[state.mode].restoreSnapshot(snap);
  modeRunner[state.mode].confirm({ replay: true });

  const out = [];
  const t0 = performance.now();
  for (let i = 0; i < CAPTURE_FRAME_COUNT; i++) {
    const target = t0 + (i + 1) * REVEAL_FRAME_DELAY_MS;
    const wait = Math.max(0, target - performance.now());
    await new Promise(res => setTimeout(res, wait));
    out.push({
      svg: serializeBoardSnapshot(board, viewBox),
      verdict: readVerdictState(),
    });
  }
  return out;
}

function stopCaptureMode() {
  document.body.classList.remove('gif-capturing');
}
