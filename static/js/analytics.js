'use strict';

/* ============================================================
   Анонимная статистика посещений «Лови Ритм».
   Отправляет один просмотр страницы в Supabase.
   Не блокирует интерфейс и молча игнорирует ошибки.
   ============================================================ */

(() => {
  let sent = false;

  function sendPageView() {
    if (sent) return;
    sent = true;

    if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) return;
    if (location.search.includes('no_analytics=1')) return;

    const online = window.LoviRitmOnline;
    if (!online?.trackPageView) return;

    online.trackPageView({
      path: location.pathname + location.search,
      referrer: document.referrer || '',
      screen: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language || '',
    }).catch(() => {});
  }

  if (document.readyState === 'complete') {
    sendPageView();
  } else {
    window.addEventListener('load', sendPageView, { once: true });
  }
})();
