const HASH_RE = /^[a-z0-9]{6,64}$/i;

function parseLocation() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const sp = new URLSearchParams(window.location.search);

  let mode = null, variation = null;
  if (parts.length >= 1 && isValidMode(parts[0])) {
    mode = parts[0];
    if (parts.length >= 2 && isValidVariation(mode, parts[1])) {
      variation = parts[1];
    }
  }

  const daily = sp.get('daily') === '1';

  let hash = null;
  if (!daily) {
    const s = sp.get('s');
    if (s && HASH_RE.test(s)) hash = s;
  }

  return { mode, variation, hash, daily };
}

function variationPath(mode, variation) {
  const cfg = modeConfig(mode);
  if (!cfg) return '/';
  if (variation === cfg.defaultVariation) return cfg.rootPath;
  return cfg.subBase + '/' + variation + '/';
}

function buildRouteUrl(mode, variation, hash, daily) {
  const p = variationPath(mode, variation);
  if (daily) return p + '?daily=1';
  if (hash) return p + '?s=' + hash;
  return p;
}

function setMetaAttr(selector, attr, value) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

function updateMeta(mode, variation) {
  const meta = (typeof pageMetaFor === 'function') ? pageMetaFor(mode, variation) : null;
  if (!meta) return;
  document.title = meta.title;
  const canonical = 'https://geometric.games' + meta.path;
  setMetaAttr('meta[name="description"]', 'content', meta.description);
  setMetaAttr('meta[property="og:title"]', 'content', meta.title);
  setMetaAttr('meta[property="og:description"]', 'content', meta.description);
  setMetaAttr('meta[name="twitter:title"]', 'content', meta.title);
  setMetaAttr('meta[name="twitter:description"]', 'content', meta.description);
  setMetaAttr('link[rel="canonical"]', 'href', canonical);
  setMetaAttr('meta[property="og:url"]', 'content', canonical);
}

function canPushState() {
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

// Bake relative icon/manifest hrefs to absolute paths before any pushState can
// move the URL. Otherwise Chrome re-resolves them against the new pathname and
// 404s on e.g. /balance/perch/favicon.svg. Skipped on file:// where absolute
// paths don't resolve anyway.
(function lockAssetLinksOnce() {
  if (!canPushState()) return;
  const sel = 'link[rel~="icon"], link[rel="mask-icon"], link[rel="apple-touch-icon"], link[rel="manifest"]';
  document.querySelectorAll(sel).forEach(el => {
    const href = el.getAttribute('href');
    if (!href || /^(?:[a-z]+:)?\/\//i.test(href) || href.startsWith('/')) return;
    try { el.setAttribute('href', new URL(href, document.baseURI).pathname); } catch (_) {}
  });
})();

function pushRoute(mode, variation, hash, daily) {
  if (canPushState()) {
    const url = buildRouteUrl(mode, variation, hash, daily);
    const current = window.location.pathname + window.location.search;
    if (url !== current) {
      try { history.pushState({ mode, variation, hash, daily: !!daily }, '', url); } catch (e) {}
    }
  }
  updateMeta(mode, variation);
}

function replaceRoute(mode, variation, hash, daily) {
  if (canPushState()) {
    const url = buildRouteUrl(mode, variation, hash, daily);
    try { history.replaceState({ mode, variation, hash, daily: !!daily }, '', url); } catch (e) {}
  }
  updateMeta(mode, variation);
}
