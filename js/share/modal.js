/* Share modal: preview area (PNG first, GIF when ready) + three actions.
   DOM is injected once on first open so no HTML changes per page. */

let _shareModalEl = null;
let _shareModalState = {
  pngBlob: null,
  gifBlob: null,
  gifUrl: null,
  pngUrl: null,
  onClose: null,
};

function ensureShareModal() {
  if (_shareModalEl) return _shareModalEl;

  const back = document.createElement('div');
  back.className = 'modal-back share-modal-back';
  back.id = 'share-modal';
  back.innerHTML = `
    <div class="modal modal-wide share-modal">
      <div class="share-preview">
        <img class="share-preview-img" id="share-preview-img" alt="Result preview">
        <div class="share-preview-building" id="share-preview-building">
          <div class="share-spinner"></div>
          <div class="share-building-text">Building GIF…</div>
        </div>
      </div>
      <div class="share-actions">
        <button class="btn share-icon-btn" id="share-action-share" title="Share GIF" aria-label="Share GIF" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          <span class="share-icon-label">GIF</span>
        </button>
        <button class="btn share-icon-btn secondary" id="share-action-download" title="Download GIF" aria-label="Download GIF" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span class="share-icon-label">GIF</span>
        </button>
        <button class="btn share-icon-btn secondary" id="share-action-copy-png" title="Copy PNG" aria-label="Copy PNG">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span class="share-icon-label">PNG</span>
        </button>
      </div>
      <div class="close-row">
        <button class="btn secondary" id="share-close">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(back);
  _shareModalEl = back;

  back.addEventListener('click', e => {
    if (e.target === back) closeShareModal();
  });
  back.querySelector('#share-close').addEventListener('click', closeShareModal);
  back.querySelector('#share-action-copy-png').addEventListener('click', () => {
    if (_shareModalState.pngBlob) copyBlobToClipboard(_shareModalState.pngBlob, 'image/png');
  });
  back.querySelector('#share-action-download').addEventListener('click', () => {
    if (_shareModalState.gifBlob) downloadBlob(_shareModalState.gifBlob, 'geometric-games.gif');
  });
  back.querySelector('#share-action-share').addEventListener('click', () => {
    if (_shareModalState.gifBlob) nativeShareGif(_shareModalState.gifBlob);
  });

  return back;
}

function openShareModal(pngBlob) {
  const el = ensureShareModal();
  _shareModalState.pngBlob = pngBlob;
  _shareModalState.gifBlob = null;
  if (_shareModalState.gifUrl) { URL.revokeObjectURL(_shareModalState.gifUrl); _shareModalState.gifUrl = null; }
  if (_shareModalState.pngUrl) { URL.revokeObjectURL(_shareModalState.pngUrl); _shareModalState.pngUrl = null; }

  const img = el.querySelector('#share-preview-img');
  if (pngBlob) {
    _shareModalState.pngUrl = URL.createObjectURL(pngBlob);
    img.src = _shareModalState.pngUrl;
  } else {
    img.removeAttribute('src');
  }
  const building = el.querySelector('#share-preview-building');
  building.classList.add('active');

  el.querySelector('#share-action-share').disabled = true;
  el.querySelector('#share-action-download').disabled = true;
  el.querySelector('#share-action-share').style.display = '';
  el.querySelector('#share-action-download').style.display = '';
  el.querySelector('#share-preview-building .share-spinner').style.display = '';

  el.classList.add('open');
  document.body.classList.add('modals-open');
}

function closeShareModal() {
  const el = _shareModalEl;
  if (!el) return;
  el.classList.remove('open');
  document.body.classList.remove('modals-open');
  if (_shareModalState.gifUrl) { URL.revokeObjectURL(_shareModalState.gifUrl); _shareModalState.gifUrl = null; }
  if (_shareModalState.pngUrl) { URL.revokeObjectURL(_shareModalState.pngUrl); _shareModalState.pngUrl = null; }
  _shareModalState.pngBlob = null;
  _shareModalState.gifBlob = null;
  if (_shareModalState.onClose) _shareModalState.onClose();
}

function setShareModalGif(gifBlob) {
  const el = _shareModalEl;
  if (!el) return;
  _shareModalState.gifBlob = gifBlob;
  if (_shareModalState.gifUrl) URL.revokeObjectURL(_shareModalState.gifUrl);
  _shareModalState.gifUrl = URL.createObjectURL(gifBlob);

  const img = el.querySelector('#share-preview-img');
  img.src = _shareModalState.gifUrl;

  const building = el.querySelector('#share-preview-building');
  building.classList.remove('active');

  const canNativeShare = !!(navigator.canShare &&
    navigator.canShare({ files: [new File([gifBlob], 'x.gif', { type: 'image/gif' })] }));
  el.querySelector('#share-action-share').disabled = !canNativeShare;
  el.querySelector('#share-action-download').disabled = false;
}

function setShareModalError(message) {
  const el = _shareModalEl;
  if (!el) return;
  const building = el.querySelector('#share-preview-building');
  building.querySelector('.share-spinner').style.display = 'none';
  building.querySelector('.share-building-text').textContent = message || 'Couldn’t build GIF';
}

// Called in reduced-motion mode: we skip the GIF pipeline entirely so the
// modal collapses into a plain "copy image" affair with PNG preview only.
function setShareModalNoGif() {
  const el = _shareModalEl;
  if (!el) return;
  const building = el.querySelector('#share-preview-building');
  building.classList.remove('active');
  el.querySelector('#share-action-share').style.display = 'none';
  el.querySelector('#share-action-download').style.display = 'none';
}

async function copyBlobToClipboard(blob, mime) {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('clipboard unavailable');
    await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
    if (typeof showToast === 'function') showToast('Copied image to clipboard');
    if (typeof trackWithContext === 'function') trackWithContext('share_copied', { method: 'clipboard' });
  } catch (e) {
    if (typeof showToast === 'function') showToast("Couldn't copy image", true);
    if (typeof trackWithContext === 'function') trackWithContext('share_failed', { reason: 'clipboard' });
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (typeof trackWithContext === 'function') trackWithContext('share_copied', { method: 'download' });
}

async function nativeShareGif(blob) {
  try {
    const file = new File([blob], 'geometric-games.gif', { type: 'image/gif' });
    await navigator.share({ files: [file], title: 'geometric.games', text: 'geometric.games' });
    if (typeof trackWithContext === 'function') trackWithContext('share_copied', { method: 'native' });
  } catch (e) {
    // AbortError = user cancelled, fine. Others → toast.
    if (e && e.name !== 'AbortError') {
      if (typeof showToast === 'function') showToast("Couldn't open share sheet", true);
    }
  }
}
