'use strict';

/* ============================================================
   Блок автора и форма обратной связи.
   - плавное появление блока при прокрутке;
   - модальное окно с Яндекс Формой;
   - запасная ссылка, если iframe не загрузился.
   ============================================================ */

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const modal = $('#feedbackModal');
  const frame = $('#feedbackFrame');
  const fallback = $('#feedbackFallback');
  const openers = $$('[data-feedback-open]');

  let lastFocus = null;
  let previousOverflow = '';
  let loadedUrl = '';

  function formUrl() {
    const meta = $('meta[name="feedback-form-url"]');
    return (meta?.content || '').trim();
  }

  function setExpanded(value) {
    openers.forEach((button) => {
      button.setAttribute('aria-expanded', value ? 'true' : 'false');
    });
  }

  function lockScroll() {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  function unlockScroll() {
    document.body.style.overflow = previousOverflow;
  }

  function openFeedback(trigger) {
    if (!modal) return;

    const url = formUrl();
    if (!url) {
      console.warn('Не задан адрес формы: meta[name="feedback-form-url"].');
      return;
    }

    lastFocus = trigger || document.activeElement;

    if (frame && loadedUrl !== url) {
      frame.src = url;
      loadedUrl = url;
    }

    if (fallback) fallback.href = url;

    modal.hidden = false;
    setExpanded(true);
    lockScroll();
    $('.modal__close', modal)?.focus();
  }

  function closeFeedback() {
    if (!modal || modal.hidden) return;

    modal.hidden = true;
    setExpanded(false);
    unlockScroll();

    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    }
    lastFocus = null;
  }

  openers.forEach((button) => {
    button.setAttribute('aria-controls', 'feedbackModal');
    button.setAttribute('aria-expanded', 'false');
  });

  document.addEventListener('click', (ev) => {
    const opener = ev.target.closest('[data-feedback-open]');
    if (opener) {
      ev.preventDefault();
      openFeedback(opener);
      return;
    }

    if (ev.target.closest('[data-feedback-close]')) {
      closeFeedback();
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modal && !modal.hidden) {
      closeFeedback();
    }
  });

  /* Плавное появление блока автора при докрутке до низа страницы.
     Если IntersectionObserver недоступен или анимации отключены,
     блок остаётся видимым сразу. */
  const reveal = $('[data-reveal]');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (reveal && !reduceMotion && 'IntersectionObserver' in window) {
    reveal.classList.add('is-reveal-ready');

    const observer = new IntersectionObserver((entries, current) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal.classList.add('is-visible');
        current.disconnect();
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    observer.observe(reveal);
  }
})();
