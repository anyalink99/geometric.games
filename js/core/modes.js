const MODE_LIST = ['cut', 'inscribe', 'balance'];

const MODE_REGISTRY = {
  cut: {
    stateKey: 'cutVariation',
    bodyAttr: 'cutVariation',
    storageKey: CUT_VARIATION_KEY,
    variations: CUT_VARIATIONS,
    defaultVariation: 'half',
    rootPath: '/',
    subBase: '/cut',
    label: 'Cut',
    shareLabel: 'CUT',
    statsSectionId: 'stats-cut-section',
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
    api: {},
  },
  inscribe: {
    stateKey: 'inscribeVariation',
    bodyAttr: 'inscribeVariation',
    storageKey: INSCRIBE_VARIATION_KEY,
    variations: INSCRIBE_VARIATIONS,
    defaultVariation: 'square',
    rootPath: '/inscribe/',
    subBase: '/inscribe',
    label: 'Inscribe',
    shareLabel: 'INSCRIBE',
    statsSectionId: 'stats-inscribe-section',
    variationLabels: {
      square: 'Square',
      triangle: 'Equilateral Triangle',
    },
    variationShareLabels: {
      square: 'SQUARE',
      triangle: 'TRIANGLE',
    },
    api: {},
  },
  balance: {
    stateKey: 'balanceVariation',
    bodyAttr: 'balanceVariation',
    storageKey: BALANCE_VARIATION_KEY,
    variations: BALANCE_VARIATIONS,
    defaultVariation: 'pole',
    rootPath: '/balance/',
    subBase: '/balance',
    label: 'Balance',
    shareLabel: 'BALANCE',
    statsSectionId: 'stats-balance-section',
    variationLabels: {
      pole: 'Pole Balance',
      centroid: 'Centroid',
      perch: 'Perch Balance',
    },
    variationShareLabels: {
      pole: 'POLE',
      centroid: 'CENTROID',
      perch: 'PERCH',
    },
    api: {},
  },
};

function registerModeAPI(mode, api) {
  const cfg = MODE_REGISTRY[mode];
  if (!cfg) return;
  cfg.api = Object.assign(cfg.api || {}, api);
}

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
