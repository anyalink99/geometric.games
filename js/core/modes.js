// Single-source registry for the three game modes and their variations.
// Anything that needs per-mode metadata (variation list, default, storage
// key, body-dataset attr, human label, share-image label) reads it here.
// Adding a new mode or variation only requires touching this file plus the
// mode-specific stats/input/render code.

const MODE_LIST = ['cut', 'inscribe', 'balance'];

const MODE_REGISTRY = {
  cut: {
    stateKey: 'cutVariation',
    bodyAttr: 'cutVariation',
    storageKey: CUT_VARIATION_KEY,
    variations: CUT_VARIATIONS,
    defaultVariation: 'half',
    label: 'Cut',
    shareLabel: 'CUT',
    variationLabels: {
      half: 'Half',
      ratio: 'Target Ratio',
      quad: 'Quad Cut',
      tri: 'Tri Cut',
      angle: 'Constrained Angle',
    },
    variationShareLabels: {
      half: 'HALF',
      ratio: 'TARGET RATIO',
      quad: 'QUAD',
      tri: 'TRI',
      angle: 'CONSTRAINED ANGLE',
    },
  },
  inscribe: {
    stateKey: 'inscribeVariation',
    bodyAttr: 'inscribeVariation',
    storageKey: INSCRIBE_VARIATION_KEY,
    variations: INSCRIBE_VARIATIONS,
    defaultVariation: 'square',
    label: 'Inscribe',
    shareLabel: 'INSCRIBE',
    variationLabels: {
      square: 'Square',
      triangle: 'Equilateral Triangle',
    },
    variationShareLabels: {
      square: 'SQUARE',
      triangle: 'TRIANGLE',
    },
  },
  balance: {
    stateKey: 'balanceVariation',
    bodyAttr: 'balanceVariation',
    storageKey: BALANCE_VARIATION_KEY,
    variations: BALANCE_VARIATIONS,
    defaultVariation: 'pole',
    label: 'Balance',
    shareLabel: 'BALANCE',
    variationLabels: {
      pole: 'Pole Balance',
      centroid: 'Centroid',
    },
    variationShareLabels: {
      pole: 'POLE',
      centroid: 'CENTROID',
    },
  },
};

function modeConfig(mode) {
  return MODE_REGISTRY[mode] || null;
}

function isValidMode(mode) {
  return !!MODE_REGISTRY[mode];
}

function isValidVariation(mode, variation) {
  const cfg = MODE_REGISTRY[mode];
  return !!cfg && cfg.variations.includes(variation);
}

function variationLabel(mode, variation) {
  const cfg = MODE_REGISTRY[mode];
  return (cfg && cfg.variationLabels[variation]) || variation;
}

function variationShareLabel(mode, variation) {
  const cfg = MODE_REGISTRY[mode];
  return (cfg && cfg.variationShareLabels[variation]) || (variation || '').toUpperCase();
}

function modeShareLabel(mode) {
  const cfg = MODE_REGISTRY[mode];
  return (cfg && cfg.shareLabel) || '';
}
