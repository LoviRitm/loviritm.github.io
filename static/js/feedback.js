'use strict';

/* ============================================================
   Блок автора:
   - скрыт при загрузке страницы;
   - медленно появляется при прокрутке вниз;
   - медленно исчезает при прокрутке вверх.
   Без JavaScript блок остаётся видимым.
   ============================================================ */

(() => {
  const card = document.querySelector('[data-reveal]');
  if (!card) return;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  card.classList.add('is-reveal-ready');

  let lastY = window.scrollY;

  function isInView() {
    const rect = card.getBoundingClientRect();
    return rect.top < window.innerHeight - 40 && rect.bottom > 0;
  }

  function onScroll() {
    const y = window.scrollY;
    const delta = y - lastY;
    lastY = y;

    if (Math.abs(delta) < 1) return;

    if (delta > 0) {
      if (isInView()) card.classList.add('is-visible');
    } else {
      card.classList.remove('is-visible');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
})();
