'use strict';

/* ============================================================
   Блок автора:
   - лежит ниже первого экрана, при загрузке не виден;
   - при прокрутке вниз проявляется;
   - при прокрутке вверх снова скрывается.
   Без JavaScript и при отключённой анимации блок остаётся
   видимым обычным контентом.
   ============================================================ */

(() => {
  const card = document.querySelector('[data-reveal]');
  if (!card) return;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !('IntersectionObserver' in window)) return;

  card.classList.add('is-reveal-ready');

  /* Нижняя граница области чуть поднята: у самой линии сгиба карточка
     не должна считаться видимой, иначе она остаётся проявленной
     после возврата наверх. */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
        card.classList.add('is-visible');
      } else if (!entry.isIntersecting) {
        card.classList.remove('is-visible');
      }
    });
  }, { rootMargin: '0px 0px -80px 0px', threshold: [0, 0.2, 0.5, 1] });

  observer.observe(card);
})();
