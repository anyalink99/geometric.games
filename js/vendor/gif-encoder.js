/* Minimal GIF89a encoder with LZW compression.
   Accepts indexed-pixel frames (one byte per pixel) against a fixed palette
   shared by all frames. No quantization here — callers must pre-quantize.
   Output: Uint8Array containing a complete, looping GIF stream. */

(function (global) {
  'use strict';

  function u16le(n) { return [n & 0xff, (n >> 8) & 0xff]; }

  // Stateful bit packer: accumulates LZW codes at variable bit widths,
  // flushes into a byte array. GIF stores codes LSB-first within each byte.
  function BitPacker() {
    this.bytes = [];
    this.cur = 0;
    this.bits = 0;
  }
  BitPacker.prototype.write = function (code, width) {
    this.cur |= (code & ((1 << width) - 1)) << this.bits;
    this.bits += width;
    while (this.bits >= 8) {
      this.bytes.push(this.cur & 0xff);
      this.cur >>>= 8;
      this.bits -= 8;
    }
  };
  BitPacker.prototype.flush = function () {
    if (this.bits > 0) {
      this.bytes.push(this.cur & 0xff);
      this.cur = 0;
      this.bits = 0;
    }
  };

  // Wrap a raw LZW byte stream in GIF sub-blocks (each ≤ 255 bytes, prefixed
  // by its length; final 0-length block terminates the stream).
  function packSubBlocks(bytes) {
    const out = [];
    let i = 0;
    while (i < bytes.length) {
      const chunk = Math.min(255, bytes.length - i);
      out.push(chunk);
      for (let j = 0; j < chunk; j++) out.push(bytes[i + j]);
      i += chunk;
    }
    out.push(0);
    return out;
  }

  // GIF-flavored LZW. Uses a Map keyed on (prefix << 8) | next-pixel — safe
  // because GIF codes never exceed 12 bits so prefix fits in 12 bits and the
  // combined key stays within 32-bit int range.
  function lzwEncode(indexedPixels, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    const packer = new BitPacker();
    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    const dict = new Map();

    packer.write(clearCode, codeSize);

    let prefix = indexedPixels[0];
    for (let i = 1; i < indexedPixels.length; i++) {
      const k = indexedPixels[i];
      const key = (prefix << 8) | k;
      const existing = dict.get(key);
      if (existing !== undefined) {
        prefix = existing;
        continue;
      }
      packer.write(prefix, codeSize);
      if (nextCode < 4096) {
        dict.set(key, nextCode);
        nextCode++;
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        packer.write(clearCode, codeSize);
        dict.clear();
        codeSize = minCodeSize + 1;
        nextCode = endCode + 1;
      }
      prefix = k;
    }
    packer.write(prefix, codeSize);
    packer.write(endCode, codeSize);
    packer.flush();
    return packer.bytes;
  }

  // Framework takes an array of frame descriptors and produces a finished GIF.
  //   frames[i] = { pixels: Uint8Array of w*h palette indices, delayMs: number }
  //   palette   = array of [r,g,b] triples, length 2..256
  //   width, height = pixel dimensions (must match frame pixel arrays)
  function encodeGif(opts) {
    const { frames, palette, width, height, loop = 0 } = opts;
    if (!frames || !frames.length) throw new Error('encodeGif: no frames');
    if (!palette || palette.length < 2) throw new Error('encodeGif: palette too small');
    if (palette.length > 256) throw new Error('encodeGif: palette > 256');

    // Round palette size up to a power of two: the GCT size field in the LSD
    // is 2^(N+1), and actual table bytes always fill the full power-of-two.
    let tableSizeBits = 1;
    while ((1 << tableSizeBits) < palette.length) tableSizeBits++;
    const tableLen = 1 << tableSizeBits;
    const minCodeSize = Math.max(2, tableSizeBits);

    const out = [];
    for (let i = 0; i < 6; i++) out.push('GIF89a'.charCodeAt(i));

    // Logical Screen Descriptor
    out.push(...u16le(width));
    out.push(...u16le(height));
    // Packed: GCT flag (1), color resolution (7), sort (0), GCT size (tableSizeBits-1)
    out.push(0x80 | (0x7 << 4) | (tableSizeBits - 1));
    out.push(0); // background color index
    out.push(0); // pixel aspect ratio

    // Global Color Table, padded to tableLen entries
    for (let i = 0; i < tableLen; i++) {
      const c = i < palette.length ? palette[i] : [0, 0, 0];
      out.push(c[0] & 0xff, c[1] & 0xff, c[2] & 0xff);
    }

    // Netscape 2.0 looping extension: lets any GIF player loop forever.
    out.push(0x21, 0xff, 0x0b);
    for (let i = 0; i < 11; i++) out.push('NETSCAPE2.0'.charCodeAt(i));
    out.push(0x03, 0x01);
    out.push(...u16le(loop)); // 0 = infinite
    out.push(0x00);

    for (let f = 0; f < frames.length; f++) {
      const { pixels, delayMs } = frames[f];
      if (pixels.length !== width * height) {
        throw new Error(`encodeGif: frame ${f} size mismatch`);
      }
      const delayCs = Math.max(1, Math.round(delayMs / 10)); // GIF delay = 1/100s

      // Graphics Control Extension
      out.push(0x21, 0xf9, 0x04);
      // Packed byte: disposal = 1 (do not dispose — each frame fully replaces
      // the last anyway, so this is a safe no-op hint to renderers).
      out.push(0x04);
      out.push(...u16le(delayCs));
      out.push(0); // transparent color index (unused)
      out.push(0); // block terminator

      // Image Descriptor
      out.push(0x2c);
      out.push(...u16le(0)); // left
      out.push(...u16le(0)); // top
      out.push(...u16le(width));
      out.push(...u16le(height));
      out.push(0); // packed: no LCT, not interlaced

      // Image Data
      out.push(minCodeSize);
      const raw = lzwEncode(pixels, minCodeSize);
      const wrapped = packSubBlocks(raw);
      for (let i = 0; i < wrapped.length; i++) out.push(wrapped[i]);
    }

    out.push(0x3b); // Trailer
    return new Uint8Array(out);
  }

  global.GifEncoder = { encodeGif };
})(typeof window !== 'undefined' ? window : this);
