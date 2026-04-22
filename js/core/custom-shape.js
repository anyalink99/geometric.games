/* Custom-shape URL codec.
   Encodes a player-authored shape (anchors + per-anchor bezier tangents +
   per-edge kind/param + primitive holes + k-fold symmetry) into a compact
   base64url token with the `c-` prefix, so share URLs stay self-contained:
     /cut/?s=c-AQEDQEC/QIC+/EA...
   No backend, no storage — the entire design travels in the URL.

   Binary layout:
     [0]   discriminator = 1 (rejects garbage / future-incompatible tokens)
     [1]   kFold (1..8)
     [2]   anchor count N (3..100)
     [3..] N × anchor record (6 bytes each: qx, qy, qh1x, qh1y, qh2x, qh2y)
     [.]   N × kind       (1 byte per edge)
     [.]   N × param      (1 byte per edge, 0..255 → 0..1)
     [.]   hole count H (0..6)
     [.]   H × hole record:
             [type]
             POLYGON (0): [M uint8] + M × (qx, qy)
             CIRCLE  (1): [qx, qy, qr]
             LENS    (2): [qx, qy, qlen, qang, qbulge]
   Coord quantization: 0..255 byte → 0..400 px board coordinate.
   Tangent quantization: 0..255 byte → ±TANGENT_MAX px (centred on 128). */

const CUSTOM_SHAPE_PREFIX = 'c-';
const CUSTOM_SHAPE_DISCRIMINATOR = 1;

const CUSTOM_BOARD_EXTENT = 400;
const CUSTOM_COORD_MAX = 255;
const CUSTOM_TANGENT_MAX = 160;
const CUSTOM_MAX_ANCHORS = 100;
const CUSTOM_MAX_POLY_POINTS = 100;
const CUSTOM_MAX_HOLES = 6;
const CUSTOM_MAX_KFOLD = 8;

const CUSTOM_HOLE_TYPE = { POLYGON: 0, CIRCLE: 1, LENS: 2 };

function isCustomShapeHash(h) {
  return typeof h === 'string' && h.indexOf(CUSTOM_SHAPE_PREFIX) === 0;
}

function _qCoord(v) {
  const q = Math.round(v / CUSTOM_BOARD_EXTENT * CUSTOM_COORD_MAX);
  return Math.max(0, Math.min(CUSTOM_COORD_MAX, q));
}
function _dqCoord(q) { return q * CUSTOM_BOARD_EXTENT / CUSTOM_COORD_MAX; }

function _qTangent(v) {
  const n = Math.round((v / CUSTOM_TANGENT_MAX) * 127 + 128);
  return Math.max(0, Math.min(255, n));
}
function _dqTangent(q) { return ((q - 128) / 127) * CUSTOM_TANGENT_MAX; }

function _qUnit(v) { return Math.round(Math.max(0, Math.min(1, v)) * 255); }
function _dqUnit(q) { return q / 255; }

function _qAngle(a) {
  let n = a / (Math.PI * 2);
  n = n - Math.floor(n);
  return Math.round(n * 255) & 0xff;
}
function _dqAngle(q) { return (q / 255) * Math.PI * 2; }

function _qLen(v) { return _qCoord(v); }
function _dqLen(q) { return _dqCoord(q); }

function _bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function _base64UrlToBytes(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';
  else if (pad === 1) throw new Error('bad base64url length');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeCustomShape(design) {
  if (!design || !Array.isArray(design.anchors) || design.anchors.length < 3) {
    throw new Error('need at least 3 anchors');
  }
  if (design.anchors.length > CUSTOM_MAX_ANCHORS) {
    throw new Error('too many anchors (max ' + CUSTOM_MAX_ANCHORS + ')');
  }
  const edges = design.edges || [];
  if (edges.length !== design.anchors.length) {
    throw new Error('edges must match anchors length');
  }
  const kFold = Math.max(1, Math.min(CUSTOM_MAX_KFOLD, (design.kFold | 0) || 1));
  const holes = Array.isArray(design.holes) ? design.holes : [];
  if (holes.length > CUSTOM_MAX_HOLES) {
    throw new Error('too many holes (max ' + CUSTOM_MAX_HOLES + ')');
  }

  let size = 3 + design.anchors.length * 6 + design.anchors.length * 2 + 1;
  for (const h of holes) {
    size += 1;
    if (h.type === 'polygon') {
      if (h.pts.length < 3 || h.pts.length > CUSTOM_MAX_POLY_POINTS) {
        throw new Error('polygon hole must have 3..' + CUSTOM_MAX_POLY_POINTS + ' points');
      }
      size += 1 + h.pts.length * 2;
    } else if (h.type === 'circle') size += 3;
    else if (h.type === 'lens') size += 5;
    else throw new Error('unknown hole type: ' + h.type);
  }

  const bytes = new Uint8Array(size);
  let p = 0;
  bytes[p++] = CUSTOM_SHAPE_DISCRIMINATOR;
  bytes[p++] = kFold;
  bytes[p++] = design.anchors.length;
  for (const a of design.anchors) {
    bytes[p++] = _qCoord(a.x);
    bytes[p++] = _qCoord(a.y);
    bytes[p++] = _qTangent(a.h1x || 0);
    bytes[p++] = _qTangent(a.h1y || 0);
    bytes[p++] = _qTangent(a.h2x || 0);
    bytes[p++] = _qTangent(a.h2y || 0);
  }
  for (const e of edges) bytes[p++] = (e.kind | 0) & 0xff;
  for (const e of edges) bytes[p++] = _qUnit(e.param || 0);
  bytes[p++] = holes.length;
  for (const h of holes) {
    if (h.type === 'polygon') {
      bytes[p++] = CUSTOM_HOLE_TYPE.POLYGON;
      bytes[p++] = h.pts.length;
      for (const pt of h.pts) {
        bytes[p++] = _qCoord(pt.x);
        bytes[p++] = _qCoord(pt.y);
      }
    } else if (h.type === 'circle') {
      bytes[p++] = CUSTOM_HOLE_TYPE.CIRCLE;
      bytes[p++] = _qCoord(h.cx);
      bytes[p++] = _qCoord(h.cy);
      bytes[p++] = _qLen(h.r);
    } else if (h.type === 'lens') {
      bytes[p++] = CUSTOM_HOLE_TYPE.LENS;
      bytes[p++] = _qCoord(h.cx);
      bytes[p++] = _qCoord(h.cy);
      bytes[p++] = _qLen(h.len);
      bytes[p++] = _qAngle(h.angle);
      bytes[p++] = _qLen(h.bulge);
    }
  }
  return CUSTOM_SHAPE_PREFIX + _bytesToBase64Url(bytes);
}

function _decodeBytes(bytes) {
  if (bytes.length < 4) return null;
  if (bytes[0] !== CUSTOM_SHAPE_DISCRIMINATOR) return null;
  const kFold = bytes[1];
  if (kFold < 1 || kFold > CUSTOM_MAX_KFOLD) return null;
  const anchorN = bytes[2];
  if (anchorN < 3 || anchorN > CUSTOM_MAX_ANCHORS) return null;

  let p = 3;
  if (p + anchorN * 6 > bytes.length) return null;
  const anchors = [];
  for (let i = 0; i < anchorN; i++) {
    anchors.push({
      x:   _dqCoord(bytes[p++]),
      y:   _dqCoord(bytes[p++]),
      h1x: _dqTangent(bytes[p++]),
      h1y: _dqTangent(bytes[p++]),
      h2x: _dqTangent(bytes[p++]),
      h2y: _dqTangent(bytes[p++]),
    });
  }
  if (p + anchorN * 2 > bytes.length) return null;
  const edges = [];
  for (let i = 0; i < anchorN; i++) edges.push({ kind: bytes[p++] | 0, param: 0 });
  for (let i = 0; i < anchorN; i++) edges[i].param = _dqUnit(bytes[p++]);

  if (p >= bytes.length) return null;
  const holeN = bytes[p++];
  if (holeN > CUSTOM_MAX_HOLES) return null;
  const holes = [];
  for (let h = 0; h < holeN; h++) {
    if (p >= bytes.length) return null;
    const type = bytes[p++];
    if (type === CUSTOM_HOLE_TYPE.POLYGON) {
      if (p >= bytes.length) return null;
      const m = bytes[p++];
      if (m < 3 || m > CUSTOM_MAX_POLY_POINTS) return null;
      if (p + m * 2 > bytes.length) return null;
      const pts = [];
      for (let i = 0; i < m; i++) pts.push({ x: _dqCoord(bytes[p++]), y: _dqCoord(bytes[p++]) });
      holes.push({ type: 'polygon', pts });
    } else if (type === CUSTOM_HOLE_TYPE.CIRCLE) {
      if (p + 3 > bytes.length) return null;
      holes.push({
        type: 'circle',
        cx: _dqCoord(bytes[p++]),
        cy: _dqCoord(bytes[p++]),
        r:  _dqLen(bytes[p++]),
      });
    } else if (type === CUSTOM_HOLE_TYPE.LENS) {
      if (p + 5 > bytes.length) return null;
      holes.push({
        type: 'lens',
        cx: _dqCoord(bytes[p++]),
        cy: _dqCoord(bytes[p++]),
        len: _dqLen(bytes[p++]),
        angle: _dqAngle(bytes[p++]),
        bulge: _dqLen(bytes[p++]),
      });
    } else return null;
  }
  if (p !== bytes.length) return null;
  return { kFold, anchors, edges, holes };
}

// Build a flat { outer, holes } polygon from a design. Circle holes that
// straddle the outer boundary auto-carve into the outer (matching the
// generator's bite behaviour). Lens and polygon holes must stay inside —
// callers validate this separately.
function designToShape(design) {
  if (!design || !Array.isArray(design.anchors)) return null;
  const kFold = design.kFold || 1;
  const expanded = expandKFold(design.anchors, design.edges, kFold);
  let outer = buildPolyFromAnchors(expanded.anchors, expanded.edges);
  const holes = [];
  for (const h of (design.holes || [])) {
    if (h.type === 'circle') {
      const result = biteCircleIntoOuter(outer, h.cx, h.cy, h.r);
      outer = result.outer;
      if (!result.consumed) holes.push(buildCircleHole(h.cx, h.cy, h.r));
    } else if (h.type === 'lens') {
      holes.push(buildLensHole(h.cx, h.cy, h.len, h.angle, h.bulge));
    } else if (h.type === 'polygon') {
      holes.push(h.pts.slice());
    }
  }
  return { outer, holes };
}

function decodeCustomShape(hash) {
  const design = decodeCustomShapeDesign(hash);
  return design ? designToShape(design) : null;
}

function decodeCustomShapeDesign(hash) {
  if (!isCustomShapeHash(hash)) return null;
  let bytes;
  try { bytes = _base64UrlToBytes(hash.slice(CUSTOM_SHAPE_PREFIX.length)); }
  catch (_) { return null; }
  return _decodeBytes(bytes);
}
