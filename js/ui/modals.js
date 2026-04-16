function syncBackdrop() {
  const anyActive = !!document.querySelector('.modal-back.open:not(.closing)');
  document.body.classList.toggle('modals-open', anyActive);
}

function openModal(id) {
  const m = document.getElementById(id);
  m.classList.remove('closing');
  m.classList.add('open');
  syncBackdrop();
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (!m.classList.contains('open')) return;
  m.classList.add('closing');
  syncBackdrop();
  setTimeout(() => {
    m.classList.remove('open');
    m.classList.remove('closing');
    syncBackdrop();
  }, 220);
}

function bindModalDismissers() {
  document.querySelectorAll('.modal-back').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });
}
