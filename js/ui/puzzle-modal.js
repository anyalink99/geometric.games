/* Puzzle-picker modal: mode tabs + variation cards + Endless/Daily toggle.
   Opening the modal only previews — state changes only when the user picks a
   variation card (which commits mode + variation together). The Endless/Daily
   pills are live and regenerate immediately.

   Self-attaching: wires its own button handlers at load, so main.js doesn't
   need to know the modal exists beyond the single gamemode-btn entry point. */
(function () {
  let puzzleModalTab = null;

  function refreshPuzzleModal() {
    document.querySelectorAll('#puzzle-modal .mode-tab').forEach(t => {
      const on = t.dataset.mode === puzzleModalTab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('#puzzle-modal .var-group').forEach(g => {
      g.classList.toggle('active', g.dataset.mode === puzzleModalTab);
    });
    document.querySelectorAll('#puzzle-modal .var-card').forEach(c => {
      const groupMode = c.closest('.var-group').dataset.mode;
      const isCurrentMode = groupMode === state.mode;
      const currentVar = currentVariation();
      c.classList.toggle('active', isCurrentMode && c.dataset.var === currentVar);
    });
    document.querySelectorAll('#puzzle-modal .seed-pill').forEach(p => {
      const isDaily = p.dataset.seed === 'daily';
      const on = isDaily === !!state.daily;
      p.classList.toggle('active', on);
      p.setAttribute('aria-selected', String(on));
    });
    const sub = document.getElementById('daily-sub');
    if (sub) sub.textContent = '#' + dailyIndex() + ' · everyone plays the same';
  }

  function openPuzzleModal() {
    puzzleModalTab = state.mode;
    refreshPuzzleModal();
    openModal('puzzle-modal');
    // Hide scrollbar for the first two frames so flex settling can't flash one.
    const container = document.querySelector('#puzzle-modal .var-groups');
    if (container) {
      container.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!container._heightAnim) container.style.overflow = '';
        });
      });
    }
  }

  function switchPuzzleTab(newMode) {
    if (puzzleModalTab === newMode) return;
    const container = document.querySelector('#puzzle-modal .var-groups');
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!container || reduceMotion || typeof container.animate !== 'function') {
      puzzleModalTab = newMode;
      refreshPuzzleModal();
      return;
    }

    if (container._heightAnim) {
      container._heightAnim.cancel();
      container._heightAnim = null;
      container.style.overflow = '';
    }

    const startH = container.offsetHeight;
    puzzleModalTab = newMode;
    refreshPuzzleModal();
    const endH = container.offsetHeight;
    if (startH === endH) return;

    // Clip overflow during the height morph so transient content doesn't flash a scrollbar.
    container.style.overflow = 'hidden';
    const anim = container.animate(
      [{ height: startH + 'px' }, { height: endH + 'px' }],
      { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
    );
    container._heightAnim = anim;
    anim.finished.finally(() => {
      if (container._heightAnim === anim) {
        container.style.overflow = '';
        container._heightAnim = null;
      }
    });
  }

  document.getElementById('gamemode-btn').addEventListener('click', () => {
    openPuzzleModal();
    trackWithContext('puzzle_modal_opened');
  });
  document.getElementById('close-puzzle').addEventListener('click', () => closeModal('puzzle-modal'));

  document.querySelectorAll('#puzzle-modal .mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchPuzzleTab(tab.dataset.mode);
    });
  });

  document.querySelectorAll('#puzzle-modal .var-card').forEach(card => {
    card.addEventListener('click', () => {
      const v = card.dataset.var;
      const groupMode = card.closest('.var-group').dataset.mode;
      closeModal('puzzle-modal');
      applyPuzzleChoice(groupMode, v);
    });
  });

  document.querySelectorAll('#puzzle-modal .seed-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      setDailyMode(pill.dataset.seed === 'daily');
      refreshPuzzleModal();
    });
  });
})();
