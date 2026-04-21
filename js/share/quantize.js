/* Palette + pixel quantization for GIF capture.
   Strategy: histogram-bucket pixels into 16³=4096 bins, pick the 64 heaviest
   bins as palette entries. Builds a 16³ LUT for O(1) pixel → palette-index
   lookup so the hot path (540×540 × N frames) stays cheap. */

const PALETTE_SIZE = 64;

// Extract an RGBA Uint8ClampedArray from a CanvasRenderingContext2D region.
// Caller owns the canvas; we just read pixels.
function readPixels(ctx, w, h) {
  return ctx.getImageData(0, 0, w, h).data;
}

// Build a palette from sampled pixels. Samples 1-in-stride pixels for speed
// on large canvases; quality loss is minimal because the game uses a limited
// color range and the sample is still in the tens of thousands.
function buildPalette(pixels, stride = 4) {
  const bins = new Uint32Array(4096);
  const sumR = new Uint32Array(4096);
  const sumG = new Uint32Array(4096);
  const sumB = new Uint32Array(4096);

  const step = stride * 4;
  for (let i = 0; i < pixels.length; i += step) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const binIdx = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    bins[binIdx]++;
    sumR[binIdx] += r;
    sumG[binIdx] += g;
    sumB[binIdx] += b;
  }

  // Rank bins by popularity, take the top PALETTE_SIZE.
  const order = [];
  for (let i = 0; i < 4096; i++) if (bins[i] > 0) order.push(i);
  order.sort((a, b) => bins[b] - bins[a]);

  const palette = [];
  for (let i = 0; i < Math.min(PALETTE_SIZE, order.length); i++) {
    const bin = order[i];
    const n = bins[bin];
    palette.push([
      Math.round(sumR[bin] / n),
      Math.round(sumG[bin] / n),
      Math.round(sumB[bin] / n),
    ]);
  }
  // Guarantee at least 2 entries so the GIF encoder's min code size is valid.
  while (palette.length < 2) palette.push([0, 0, 0]);
  return palette;
}

// Build a 16×16×16 LUT mapping quantized RGB bin → palette index, by
// searching for the nearest palette entry for each bin center. Runs once per
// capture (4096 × palette.length comparisons).
function buildPaletteLUT(palette) {
  const lut = new Uint8Array(4096);
  for (let r4 = 0; r4 < 16; r4++) {
    for (let g4 = 0; g4 < 16; g4++) {
      for (let b4 = 0; b4 < 16; b4++) {
        const r = (r4 << 4) | 8, g = (g4 << 4) | 8, b = (b4 << 4) | 8; // bin center
        let bestIdx = 0;
        let bestD = Infinity;
        for (let i = 0; i < palette.length; i++) {
          const dr = r - palette[i][0];
          const dg = g - palette[i][1];
          const db = b - palette[i][2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bestD) { bestD = d; bestIdx = i; }
        }
        lut[(r4 << 8) | (g4 << 4) | b4] = bestIdx;
      }
    }
  }
  return lut;
}

// Convert an RGBA pixel buffer to indexed pixels via the prebuilt LUT.
function quantizePixels(pixels, lut) {
  const n = pixels.length >> 2; // RGBA → 1 byte
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const r4 = pixels[i] >> 4;
    const g4 = pixels[i + 1] >> 4;
    const b4 = pixels[i + 2] >> 4;
    out[j] = lut[(r4 << 8) | (g4 << 4) | b4];
  }
  return out;
}
