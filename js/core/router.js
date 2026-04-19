const MODE_SLUGS = { cut: 'cut', inscribe: 'inscribe', balance: 'balance' };
const SLUG_MODES = { cut: 'cut', inscribe: 'inscribe', balance: 'balance' };
const HASH_RE = /^[a-z0-9]{6,64}$/i;

let BASE_PATH = '';

function parseLocation() {
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);
  let mode = null, hash = null;
  let baseParts = parts.slice();

  if (parts.length >= 1 && SLUG_MODES[parts[parts.length - 1]]) {
    mode = SLUG_MODES[parts[parts.length - 1]];
    baseParts = parts.slice(0, -1);
  } else if (
    parts.length >= 2 &&
    SLUG_MODES[parts[parts.length - 2]] &&
    HASH_RE.test(parts[parts.length - 1])
  ) {
    mode = SLUG_MODES[parts[parts.length - 2]];
    hash = parts[parts.length - 1];
    baseParts = parts.slice(0, -2);
  } else if (parts.length >= 1 && /\.html?$/i.test(parts[parts.length - 1])) {
    baseParts = parts.slice(0, -1);
  }

  const base = baseParts.length ? '/' + baseParts.join('/') : '';
  return { base, mode, hash };
}

function buildRouteUrl(mode, hash) {
  let p = BASE_PATH;
  if (mode) p += '/' + MODE_SLUGS[mode];
  if (hash) p += '/' + hash;
  if (!p) p = '/';
  return p + window.location.search;
}

const MODE_META = {
  cut: {
    title: 'Cut — geometric.games',
    desc: 'Slice polygons in half, to a target ratio, into quads or tris, or along a constrained angle.',
  },
  inscribe: {
    title: 'Inscribe — geometric.games',
    desc: 'Inscribe a square or equilateral triangle into a polygon. Endless geometry puzzles.',
  },
  balance: {
    title: 'Balance — geometric.games',
    desc: 'Balance a polygon on a pole or find its centroid. Physics-driven geometry puzzles.',
  },
};

function updateMeta(mode) {
  const m = MODE_META[mode];
  if (!m) return;
  document.title = m.title;
  let desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', m.desc);
  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', m.title);
  let ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', m.desc);
  let twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute('content', m.title);
  let twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute('content', m.desc);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', 'https://geometric.games/' + mode);
  let ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', 'https://geometric.games/' + mode);
}

function pushRoute(mode, hash) {
  const url = buildRouteUrl(mode, hash);
  const current = window.location.pathname + window.location.search;
  if (url !== current) {
    try { history.pushState({ mode, hash }, '', url); } catch (e) {}
  }
  updateMeta(mode);
}

function replaceRoute(mode, hash) {
  const url = buildRouteUrl(mode, hash);
  try { history.replaceState({ mode, hash }, '', url); } catch (e) {}
  updateMeta(mode);
}
