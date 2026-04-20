// Thin wrapper over GTM's dataLayer. Safe on pages without GTM loaded.
function trackEvent(name, props) {
  try {
    window.dataLayer = window.dataLayer || [];
    const payload = { event: name };
    if (props) Object.assign(payload, props);
    window.dataLayer.push(payload);
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
