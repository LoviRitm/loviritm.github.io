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
  const TIMEOUT_MS = 7000;

  function fallbackPlayerId() {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function playerId() {
    try {
      let id = localStorage.getItem(PLAYER_KEY);
      if (!id || id.length < 8) {
        id = window.crypto?.randomUUID?.() || fallbackPlayerId();
        localStorage.setItem(PLAYER_KEY, id);
      }
      return id;
    } catch {
      return fallbackPlayerId();
    }
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
    const beats = Array.isArray(entry.beats)
      ? entry.beats.slice(0, 20).map((value) => {
          if (value == null) return null;
          const n = Number(value);
          return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
        })
      : [];

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
    submitScore,
    getLeaderboard,
    getStats,
  };
})();
