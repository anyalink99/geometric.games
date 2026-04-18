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

function pushRoute(mode, hash) {
  const url = buildRouteUrl(mode, hash);
  const current = window.location.pathname + window.location.search;
  if (url !== current) {
    try { history.pushState({ mode, hash }, '', url); } catch (e) {}
  }
}

function replaceRoute(mode, hash) {
  const url = buildRouteUrl(mode, hash);
  try { history.replaceState({ mode, hash }, '', url); } catch (e) {}
}
