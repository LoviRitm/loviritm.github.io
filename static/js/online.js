'use strict';

/* ============================================================
   Онлайн-рейтинг «Лови Ритм».
   Публичный ключ Supabase можно хранить в браузере: доступ к
   таблице закрыт, а запись и чтение идут только через RPC.
   ============================================================ */

(() => {
  const SUPABASE_URL = 'https://ecjtmzrcxucosbpvocod.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjanRtenJjeHVjb3NicHZvY29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzY0NTAsImV4cCI6MjEwOTkxMjQ1MH0.VVk47DJBk2OAm2kfD-vkguNj72QdA1oxmWhlAovce1Y';
  const PLAYER_KEY = 'loviritm.playerId';
  const VISITOR_KEY = 'loviritm.visitorId';
  const TIMEOUT_MS = 7000;

  function fallbackId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function storedId(key, prefix) {
    try {
      let id = localStorage.getItem(key);
      if (!id || id.length < 8) {
        id = window.crypto?.randomUUID?.() || fallbackId(prefix);
        localStorage.setItem(key, id);
      }
      return id;
    } catch {
      return fallbackId(prefix);
    }
  }

  function playerId() {
    return storedId(PLAYER_KEY, 'p');
  }

  function visitorId() {
    return storedId(VISITOR_KEY, 'v');
  }

  function normalizeBeats(values) {
    return Array.isArray(values)
      ? values.slice(0, 20).map((value) => {
          if (value == null) return null;
          const n = Number(value);
          return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
        })
      : [];
  }

  async function request(path, { method = 'GET', body, timeout = TIMEOUT_MS } = {}) {
    if (navigator.onLine === false) {
      throw new Error('offline');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${SUPABASE_URL}${path}`, {
        method,
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: body == null ? undefined : JSON.stringify(body),
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!res.ok) {
        const message = data?.message || data?.error_description || data?.error || `HTTP ${res.status}`;
        throw new Error(message);
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function submitScore(entry) {
    const beats = normalizeBeats(entry.beats);

    if (beats.length !== 20) {
      throw new Error('invalid beats');
    }

    const name = Array.from(String(entry.name || 'Аноним').trim() || 'Аноним')
      .slice(0, 24)
      .join('');

    const rows = await request('/rest/v1/rpc/submit_score', {
      method: 'POST',
      body: {
        p_name: name,
        p_score: Math.max(0, Math.min(1000, Math.round(Number(entry.score) || 0))),
        p_dev: Math.max(0, Math.min(60000, Number(entry.dev) || 0)),
        p_taps: Math.max(0, Math.min(20, Math.round(Number(entry.taps) || 0))),
        p_mode: entry.mode === 'voice' ? 'voice' : 'tap',
        p_beats: beats,
        p_player_id: playerId(),
      },
    });

    return { ok: true, rows };
  }

  async function trackAttempt(entry) {
    const beats = normalizeBeats(entry.beats);
    if (beats.length !== 20) {
      throw new Error('invalid beats');
    }

    const name = entry.name == null
      ? null
      : Array.from(String(entry.name).trim()).slice(0, 24).join('') || null;

    return request('/rest/v1/rpc/submit_test_attempt', {
      method: 'POST',
      body: {
        p_name: name,
        p_score: Math.max(0, Math.min(1000, Math.round(Number(entry.score) || 0))),
        p_dev: Math.max(0, Math.min(60000, Number(entry.dev) || 0)),
        p_taps: Math.max(0, Math.min(20, Math.round(Number(entry.taps) || 0))),
        p_mode: entry.mode === 'voice' ? 'voice' : 'tap',
        p_beats: beats,
        p_player_id: playerId(),
      },
    });
  }

  async function trackPageView(page) {
    return request('/rest/v1/rpc/track_page_view', {
      method: 'POST',
      body: {
        p_path: String(page.path || '/').slice(0, 300),
        p_referrer: String(page.referrer || '').slice(0, 500),
        p_visitor_id: visitorId(),
        p_screen: String(page.screen || '').slice(0, 20),
        p_language: String(page.language || '').slice(0, 20),
      },
    });
  }

  async function getLeaderboard(limit = 200) {
    const data = await request('/rest/v1/rpc/get_leaderboard', {
      method: 'POST',
      body: { p_limit: Math.max(1, Math.min(200, Math.round(Number(limit) || 200))) },
    });
    return Array.isArray(data) ? data : [];
  }

  async function getStats() {
    const data = await request('/rest/v1/rpc/get_leaderboard_stats', {
      method: 'POST',
      body: {},
    });
    const row = Array.isArray(data) ? data[0] : data;
    return {
      count: Math.max(0, Math.round(Number(row?.total) || 0)),
      best: Math.max(0, Math.round(Number(row?.best) || 0)),
      average: Math.max(0, Math.round(Number(row?.average) || 0)),
    };
  }

  window.LoviRitmOnline = {
    playerId,
    visitorId,
    submitScore,
    trackAttempt,
    trackPageView,
    getLeaderboard,
    getStats,
  };
})();
