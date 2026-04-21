/* Top-level share-GIF orchestrator:
     click → open modal with PNG → capture reveal → compose + encode → swap.
   Capture samples live SVG frames; composition stamps brand/label/verdict
   into each frame plus a fade-in QR + URL block held for 2× the reveal so
   viewers have time to read the share link. */

const GIF_PREFERS_REDUCED_MOTION = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let _shareGifInProgress = false;

async function runShareFlow() {
  if (_shareGifInProgress) return;
  _shareGifInProgress = true;

  const btn = document.getElementById('share-btn');
  if (btn) btn.disabled = true;

  let pngBlob = null;
  try {
    pngBlob = await buildSharePng();
  } catch (e) {
    console.warn('share: png build failed', e);
  }
  openShareModal(pngBlob);
  if (typeof trackWithContext === 'function') trackWithContext('share_click');

  if (GIF_PREFERS_REDUCED_MOTION()) {
    setShareModalNoGif();
    _shareGifInProgress = false;
    if (btn) btn.disabled = false;
    return;
  }

  await new Promise(res => setTimeout(res, 50));

  try {
    const gifBlob = await buildGif();
    setShareModalGif(gifBlob);
    if (typeof trackWithContext === 'function') trackWithContext('share_gif_built', { bytes: gifBlob.size });
  } catch (e) {
    console.warn('share: gif build failed', e);
    setShareModalError("Couldn't build GIF — try Copy image");
    if (typeof trackWithContext === 'function') trackWithContext('share_failed', { reason: 'gif_build' });
  } finally {
    stopCaptureMode();
    _shareGifInProgress = false;
    if (btn) btn.disabled = false;
  }
}

async function buildGif() {
  const capturedFrames = await captureRevealFrames();

  // Compose each captured sample into a full-layout frame. Every frame
  // already includes QR + URL (no fade-in) so the share link is visible
  // from the first looped instant.
  const composedPixels = [];
  for (let i = 0; i < capturedFrames.length; i++) {
    const { svg, verdict } = capturedFrames[i];
    const pixels = await buildComposedFrame(svg, verdict);
    composedPixels.push(pixels);
    if (i % 3 === 2) await new Promise(res => setTimeout(res, 0));
  }
  stopCaptureMode();

  const last = capturedFrames[capturedFrames.length - 1];
  const holdPixels = await buildComposedFrame(last.svg, last.verdict);

  // Palette samples the last frame — it has QR/URL plus the final verdict,
  // so every color that will appear in the GIF is represented.
  const palette = buildPalette(holdPixels);
  const lut = buildPaletteLUT(palette);

  const frames = [];
  for (const raw of composedPixels) {
    frames.push({ pixels: quantizePixels(raw, lut), delayMs: REVEAL_FRAME_DELAY_MS });
    await new Promise(res => setTimeout(res, 0));
  }
  const heldIndexed = quantizePixels(holdPixels, lut);
  for (let i = 0; i < HOLD_FRAME_COUNT; i++) {
    frames.push({ pixels: heldIndexed, delayMs: HOLD_FRAME_DELAY_MS });
  }

  const gifBytes = GifEncoder.encodeGif({
    frames,
    palette,
    width: CAPTURE_WIDTH,
    height: CAPTURE_HEIGHT,
  });
  return new Blob([gifBytes], { type: 'image/gif' });
}

(function wireShareGifButton() {
  const btn = document.getElementById('share-btn');
  if (!btn) return;
  btn.addEventListener('click', runShareFlow);
})();
