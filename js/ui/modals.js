function openModal(id) {
  const m = document.getElementById(id);
  m.classList.remove('closing');
  m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (!m.classList.contains('open')) return;
  m.classList.add('closing');
  setTimeout(() => {
    m.classList.remove('open');
    m.classList.remove('closing');
  }, 220);
}

function bindModalDismissers() {
  document.querySelectorAll('.modal-back').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });
}
