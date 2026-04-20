// Pushes to GTM's dataLayer AND forwards to gtag so GA4 picks events up
// without any GTM-side trigger/tag config. Safe if either is missing.
function trackEvent(name, props) {
  try {
    window.dataLayer = window.dataLayer || [];
    const payload = { event: name };
    if (props) Object.assign(payload, props);
    window.dataLayer.push(payload);
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, props || {});
    }
  } catch (e) {}
}

function currentContext() {
  try {
    return {
      mode: state.mode,
      variation: currentVariation(),
      daily: !!state.daily,
    };
  } catch (e) {
    return {};
  }
}

function trackWithContext(name, extra) {
  const ctx = currentContext();
  if (extra) Object.assign(ctx, extra);
  trackEvent(name, ctx);
}
