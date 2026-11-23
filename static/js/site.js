'use strict';

/* ============================================================
   Общие скрипты:
   - локальное хранилище рекордов ( ScoreStore ),
   - статистика и таблица рекордов,
   - карточка игрока,
   - график по ударам,
   - регистрация Service Worker для офлайн-работы.
   ============================================================ */

(() => {

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

const LS_KEY = 'loviritm.scores';
// Для тестирования храним весь рейтинг, а не только первые 20.
// 5000 — практический запас под лимит localStorage.
const MAX_STORED = 5000;
const TOP_N = 20;

/* В Android-приложении Capacitor отдаёт файлы с https://localhost
   (без порта). Там сервера нет — работаем только с localStorage. */
const IS_APP = location.hostname === 'localhost' && !location.port;

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocal(items) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {}
}

function sortItems(items) {
  items.sort((a, b) => {
    const byScore = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (byScore !== 0) return byScore;
    return (Number(a.ts) || 0) - (Number(b.ts) || 0);
  });
  return items;
}

/* ---------------- хранилище рекордов ----------------
   Сначала пытаемся достучаться до сервера (если сайт
   запущен локально через app.py). Если сервера нет —
   берём стартовые результаты из /scores.json и добавляем
   к ним локальные. В Android-приложении сервера нет,
   поэтому рейтинг всегда локальный. */

const STATIC_SCORES = '/scores.json';

async function readStaticScores() {
  if (IS_APP) return [];
  try {
    const res = await fetch(STATIC_SCORES, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return Array.isArray(data.scores) ? data.scores : [];
  } catch {
    return [];
  }
}

function mergeScores(staticItems, localItems) {
  const seen = new Set();
  const merged = [];
  for (const item of [...staticItems, ...localItems]) {
    const key = `${item.ts || ''}|${item.name || ''}|${item.score || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return sortItems(merged);
}

function normalizeOnline(row) {
  const created = row?.created_at ? new Date(row.created_at) : null;
  const valid = created && !Number.isNaN(created.getTime());
  return {
    id: row?.id || '',
    name: row?.name || 'Аноним',
    score: Number(row?.score) || 0,
    dev: row?.dev == null ? null : Number(row.dev),
    taps: row?.taps == null ? null : Number(row.taps),
    mode: row?.mode || 'tap',
    beats: Array.isArray(row?.beats) ? row.beats : [],
    ts: valid ? created.getTime() / 1000 : null,
    when: valid ? created.toLocaleDateString('ru-RU') : '',
    online: true,
  };
}

function saveLocal(entry) {
  const items = sortItems(readLocal());
  items.push(entry);
  sortItems(items);
  const trimmed = items.slice(0, MAX_STORED);
  writeLocal(trimmed);
  return { ok: true, entry, scores: trimmed.slice(0, TOP_N) };
}

const ScoreStore = {
  // limit = 0 — вернуть весь рейтинг.
  async list(limit = 0) {
    const online = window.LoviRitmOnline;
    if (online) {
      try {
        const rows = await online.getLeaderboard(limit > 0 ? limit : 200);
        const scores = rows.map(normalizeOnline);
        return { scores, total: scores.length, online: true };
      } catch (err) {
        console.warn('Онлайн-рейтинг недоступен:', err);
      }
    }

    const query = limit > 0 ? `?limit=${encodeURIComponent(limit)}` : '';
    if (!IS_APP) {
      try {
        const res = await fetch(`/api/scores${query}`, { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          return { ...data, online: false };
        }
      } catch {}
    }
    const items = mergeScores(await readStaticScores(), readLocal());
    const scores = limit > 0 ? items.slice(0, limit) : items;
    return { scores, total: items.length, online: false };
  },

  async stats() {
    const online = window.LoviRitmOnline;
    if (online?.getStats) {
      try {
        return await online.getStats();
      } catch (err) {
        console.warn('Статистика онлайн-рейтинга недоступна:', err);
      }
    }

    if (!IS_APP) {
      try {
        const res = await fetch('/api/stats', { headers: { Accept: 'application/json' } });
        if (res.ok) return await res.json();
      } catch {}
    }
    const items = mergeScores(await readStaticScores(), readLocal());
    if (!items.length) return { count: 0, best: 0, average: 0 };
    const scores = items.map((it) => Number(it.score) || 0);
    return {
      count: items.length,
      best: Math.round(Math.max(...scores)),
      average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    };
  },

  async save(entry) {
    let result = null;

    if (!IS_APP) {
      try {
        const res = await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.ok !== false) result = data;
        }
      } catch {}
    }

    if (!result) result = saveLocal(entry);

    const online = window.LoviRitmOnline;
    if (online) {
      try {
        await online.submitScore(entry);
        result.online = true;
      } catch (err) {
        result.online = false;
        result.onlineError = String(err?.message || err);
        console.warn('Не удалось отправить результат онлайн:', err);
      }
    } else {
      result.online = false;
    }

    return result;
  },
};

window.ScoreStore = ScoreStore;

let items = [];

/* ---------------- таблица рекордов ---------------- */

async function loadRecordsPage() {
  const body = $('#recordsBody');
  if (!body) return;

  try {
    const data = await ScoreStore.list();
    items = Array.isArray(data.scores) ? data.scores : [];

    const source = $('#recordsSource');
    if (source) {
      const localOnly = data.online === false;
      source.hidden = !localOnly;
      source.textContent = localOnly
        ? 'Онлайн-рейтинг сейчас недоступен — показаны записи, сохранённые на этом устройстве.'
        : '';
    }

    if (!items.length) {
      body.innerHTML = `
        <tr><td colspan="4">
          Пока пусто. <a href="/">Пройдите тест</a> и займите первое место.
        </td></tr>`;
      return;
    }

    body.innerHTML = items.map((item, i) => `
      <tr>
        <td><span class="rank-badge${i < 3 ? ' rank-badge--top' : ''}">${i + 1}</span></td>
        <td class="rating-name">${escapeHtml(item.name || 'Аноним')}</td>
        <td class="num rating-result"><b>${Math.round(Number(item.score) || 0)}</b><span class="rating-result__max"> / 1000</span></td>
        <td class="rating-date">${escapeHtml(recordDate(item))}</td>
      </tr>`).join('');
  } catch {
    const source = $('#recordsSource');
    if (source) {
      source.hidden = false;
      source.textContent = 'Онлайн-рейтинг сейчас недоступен. Попробуйте обновить страницу позже.';
    }
    body.innerHTML = `
      <tr><td colspan="4">Не удалось загрузить таблицу. Проверьте подключение к интернету.</td></tr>`;
  }
}

function recordDate(item) {
  if (item.when) return item.when;
  if (item.ts) {
    const date = new Date(Number(item.ts) * 1000);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('ru-RU');
    }
  }
  return '—';
}

/* ---------------- график по ударам (общий) ---------------- */

const MAX_PER_BEAT = 50;
const TOLERANCE_MS = 100;
const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function scoreOf(dev) {
  if (dev == null) return 0;
  return Math.round(Math.max(0, 1 - Math.abs(dev) / TOLERANCE_MS) * MAX_PER_BEAT);
}

function colorOf(score) {
  if (score >= 35) return '#4ade80';
  if (score >= 15) return '#fbbf24';
  return '#fb7185';
}

function rowsFromBeats(beats) {
  return beats.map((value, i) => {
    const dev = typeof value === 'number' && Number.isFinite(value) ? value : null;
    return { i, dev, score: scoreOf(dev), missed: dev == null, noPrev: false };
  });
}

function renderChartInto(el, rows) {
  const W = 760;
  const H = 340;
  const padL = 58;
  const padR = 22;
  const padT = 42;
  const padB = 42;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const MAXDEV = 100;

  const x = (i) => padL + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
  const y = (dev) => padT + ((clampNum(dev, -MAXDEV, MAXDEV) + MAXDEV) / (2 * MAXDEV)) * innerH;

  const parts = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Отклонения по ударам">`];

  for (const d of [-100, -50, 0, 50, 100]) {
    const gy = y(d);
    const zero = d === 0;
    parts.push(
      `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}"
        stroke="${zero ? 'rgba(196,181,253,0.55)' : 'rgba(255,255,255,0.07)'}"
        stroke-width="1" ${zero ? 'stroke-dasharray="5 6"' : ''}/>`,
      `<text x="${padL - 12}" y="${gy + 4}" text-anchor="end" font-size="11"
        fill="${zero ? '#c4b5fd' : '#7f8a9d'}">${d > 0 ? '+' + d : d}</text>`
    );
  }

  parts.push(
    `<text x="${padL - 12}" y="${padT - 18}" text-anchor="end" font-size="12" fill="#7f8a9d">раньше</text>`,
    `<text x="${padL - 12}" y="${H - padB + 26}" text-anchor="end" font-size="12" fill="#7f8a9d">позже</text>`
  );

  rows.forEach((row, i) => {
    const n = i + 1;
    if (n === 1 || n % 5 === 0) {
      parts.push(
        `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#7f8a9d">${n}</text>`
      );
    }
  });

  let segment = [];
  const flush = () => {
    if (segment.length > 1) {
      parts.push(
        `<polyline points="${segment.join(' ')}" fill="none" stroke="#8b5cf6" stroke-width="2.5"
          stroke-linejoin="round" stroke-linecap="round"
          style="filter:drop-shadow(0 0 6px rgba(139,92,246,0.55))"/>`
      );
    }
    segment = [];
  };

  rows.forEach((row, i) => {
    if (row.dev == null) {
      flush();
      return;
    }
    segment.push(`${x(i).toFixed(1)},${y(row.dev).toFixed(1)}`);
  });
  flush();

  rows.forEach((row, i) => {
    const n = i + 1;
    const cx = x(i);
    parts.push('<g>');

    if (row.dev == null) {
      const label = row.noPrev ? 'нет предыдущего тапа' : 'пропуск';
      parts.push(
        `<title>Удар ${n}: ${label}</title>`,
        `<circle cx="${cx}" cy="${y(0)}" r="4.5" fill="none" stroke="#3a4356" stroke-width="1.6"/>`
      );
      parts.push('</g>');
      return;
    }

    const color = colorOf(row.score);
    parts.push(
      `<title>Удар ${n}: ${row.dev > 0 ? '+' : ''}${row.dev.toFixed(0)} мс · ${row.score} баллов</title>`,
      `<circle cx="${cx}" cy="${y(row.dev)}" r="5.5" fill="${color}" stroke="#0b0d12" stroke-width="1.5"
        style="filter:drop-shadow(0 0 5px ${color})"/>`
    );
    parts.push('</g>');
  });

  parts.push('</svg>');
  el.innerHTML = parts.join('');
}

window.RhythmChart = {
  render: renderChartInto,
  rowsFromBeats,
  scoreOf,
};

/* ---------------- Service Worker (офлайн) ---------------- */

if ('serviceWorker' in navigator && !IS_APP) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.update())
      .catch(() => {});
  });
}

/* ---------------- старт ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  loadRecordsPage();
});

})();
