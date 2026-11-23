'use strict';

/* ============================================================
   Админка «Лови Ритм».
   Supabase Auth + PostgREST + RLS. Service-role ключ здесь
   не используется и не должен использоваться.
   ============================================================ */

(() => {
  const SUPABASE_URL = 'https://ecjtmzrcxucosbpvocod.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjanRtenJjeHVjb3NicHZvY29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzY0NTAsImV4cCI6MjEwOTkxMjQ1MH0.VVk47DJBk2OAm2kfD-vkguNj72QdA1oxmWhlAovce1Y';
  const SESSION_KEY = 'loviritm.adminSession';

  const $ = (id) => document.getElementById(id);
  const state = {
    session: null,
    dashboard: null,
    rows: [],
    range: 30,
    tab: 'attempts',
    filter: '',
    mode: '',
  };

  const MODE_LABEL = { tap: 'Тапами', voice: 'Голосом' };
  const TABLES = {
    attempts: {
      table: 'test_attempts',
      select: 'id,name,score,dev,taps,mode,player_id,beats,created_at',
    },
    scores: {
      table: 'scores',
      select: 'id,name,score,dev,taps,mode,player_id,beats,created_at',
    },
    visits: {
      table: 'page_views',
      select: 'id,path,referrer,visitor_id,screen,language,created_at',
    },
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function fmtNum(value) {
    return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
  }

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function fmtDay(value) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }

  function shortId(value) {
    const text = String(value || '');
    return text.length > 10 ? `${text.slice(0, 8)}…` : text || '—';
  }

  function modeTag(mode) {
    const voice = mode === 'voice';
    return `<span class="tag${voice ? ' tag--voice' : ''}">${voice ? 'Голосом' : 'Тапами'}</span>`;
  }

  function setMsg(text, isError = false) {
    const node = $('appMsg');
    if (!node) return;
    node.textContent = text || '';
    node.classList.toggle('is-error', Boolean(isError));
  }

  function saveSession() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
    } catch {}
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      state.session = raw ? JSON.parse(raw) : null;
    } catch {
      state.session = null;
    }
  }

  function clearSession() {
    state.session = null;
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  async function authRequest(path, body) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      throw new Error(
        data?.error_description
        || data?.msg
        || data?.message
        || data?.error
        || `HTTP ${res.status}`
      );
    }
    return data;
  }

  function setSession(data) {
    state.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      user: data.user || null,
    };
    saveSession();
  }

  async function refreshSession() {
    if (!state.session?.refresh_token) {
      throw new Error('Сессия истекла. Войдите заново.');
    }
    const data = await authRequest('/auth/v1/token?grant_type=refresh_token', {
      refresh_token: state.session.refresh_token,
    });
    setSession(data);
  }

  async function ensureSession() {
    if (!state.session?.access_token) {
      throw new Error('Нужно войти заново.');
    }
    if (Date.now() > Number(state.session.expires_at || 0) - 60000) {
      await refreshSession();
    }
  }

  async function api(path, { method = 'GET', body = null, auth = true, retry = true } = {}) {
    if (auth) await ensureSession();

    const headers = { apikey: SUPABASE_KEY };
    if (auth) headers.Authorization = `Bearer ${state.session.access_token}`;
    if (body !== null && body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      cache: 'no-store',
      headers,
      body: body === null || body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      if (res.status === 401 && auth && retry && state.session?.refresh_token) {
        await refreshSession();
        return api(path, { method, body, auth, retry: false });
      }
      throw new Error(
        data?.message
        || data?.hint
        || data?.details
        || data?.error_description
        || data?.error
        || `HTTP ${res.status}`
      );
    }
    return data;
  }

  async function rpc(name, body = {}) {
    return api(`/rest/v1/rpc/${name}`, { method: 'POST', body });
  }

  async function signIn(email, password) {
    const data = await authRequest('/auth/v1/token?grant_type=password', { email, password });
    setSession(data);
  }

  async function signOut() {
    try {
      if (state.session?.access_token) {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${state.session.access_token}`,
          },
        });
      }
    } catch {}
    clearSession();
  }

  function showLogin(message = '') {
    $('loginView').hidden = false;
    $('appView').hidden = true;
    $('loginMsg').textContent = message;
    $('loginMsg').classList.toggle('is-error', Boolean(message));
  }

  function showApp() {
    $('loginView').hidden = true;
    $('appView').hidden = false;
    $('adminEmail').textContent = state.session?.user?.email || '';
  }

  async function checkAdmin() {
    const ok = await rpc('is_admin');
    return ok === true;
  }

  function sinceIso() {
    return new Date(Date.now() - state.range * 86400000).toISOString();
  }

  function setBusy(busy) {
    $('refreshBtn').disabled = busy;
    $('refreshBtn').textContent = busy ? 'Загрузка…' : 'Обновить';
  }

  async function loadAll() {
    if (!state.session) return;
    setBusy(true);
    setMsg('Загрузка данных…');
    try {
      const dashboard = await rpc('admin_dashboard', { p_days: state.range });
      state.dashboard = dashboard || {};
      renderCards();
      renderDailyChart();
      renderModes();
      renderTopScores();
      await loadTable();
      setMsg('');
    } catch (err) {
      setMsg(`Не удалось загрузить данные: ${err.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function loadTable() {
    const config = TABLES[state.tab];
    if (!config) return;

    const params = new URLSearchParams({
      select: config.select,
      order: 'created_at.desc',
      limit: '300',
      created_at: `gte.${sinceIso()}`,
    });

    const rows = await api(`/rest/v1/${config.table}?${params.toString()}`);
    state.rows = Array.isArray(rows) ? rows : [];
    renderTable();
  }

  function renderCards() {
    const d = state.dashboard || {};
    const cards = [
      ['Посещения', d.visits, 'просмотров страниц'],
      ['Уникальные', d.visitors, 'посетителей'],
      ['Все тесты', d.tests, 'завершено'],
      ['Рекорды', d.scores, 'сохранено'],
      ['Средний балл', d.avg_score, 'по тестам'],
    ];

    $('cards').innerHTML = cards.map(([label, value, hint]) => `
      <article class="card">
        <p class="card__label">${esc(label)}</p>
        <p class="card__value">${fmtNum(value)}</p>
        <p class="card__hint">${esc(hint)}</p>
      </article>
    `).join('');
  }

  function aggregateDaily(daily) {
    if (daily.length <= 90) {
      return { items: daily, note: 'По дням' };
    }

    const byWeek = daily.length <= 180;
    const groups = new Map();

    for (const item of daily) {
      const date = new Date(`${item.day}T00:00:00`);
      let key;
      let label;

      if (byWeek) {
        const monday = new Date(date);
        const offset = (monday.getDay() + 6) % 7;
        monday.setDate(monday.getDate() - offset);
        key = monday.toISOString().slice(0, 10);
        label = `нед. ${monday.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`;
      } else {
        key = item.day.slice(0, 7);
        label = new Date(date.getFullYear(), date.getMonth(), 1)
          .toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
      }

      if (!groups.has(key)) {
        groups.set(key, { key, label, visits: 0, visitors: 0, tests: 0, scores: 0 });
      }

      const group = groups.get(key);
      group.visits += Number(item.visits) || 0;
      group.visitors += Number(item.visitors) || 0;
      group.tests += Number(item.tests) || 0;
      group.scores += Number(item.scores) || 0;
    }

    return {
      items: Array.from(groups.values()),
      note: byWeek ? 'По неделям' : 'По месяцам',
    };
  }

  function renderDailyChart() {
    const daily = Array.isArray(state.dashboard?.daily) ? state.dashboard.daily : [];
    const node = $('dailyChart');
    const note = $('dailyChartNote');
    if (!daily.length) {
      node.innerHTML = '<p class="empty">Пока нет данных за этот период.</p>';
      if (note) note.textContent = 'По дням';
      return;
    }

    const { items, note: noteText } = aggregateDaily(daily);
    if (note) note.textContent = noteText;

    const max = Math.max(...items.map((item) => Number(item.visits) || 0), 1);
    const bars = items.map((item) => {
      const visits = Number(item.visits) || 0;
      const visitors = Number(item.visitors) || 0;
      const tests = Number(item.tests) || 0;
      const height = Math.max(3, Math.round((visits / max) * 100));
      const label = item.label || fmtDay(item.day);
      return `<div class="chart__bar" style="--height:${height}%" data-tip="${esc(label)}: ${visits} просм. / ${visitors} посет. / ${tests} тестов"></div>`;
    }).join('');

    const first = items[0]?.label || fmtDay(items[0]?.day || '');
    const middle = items[Math.floor(items.length / 2)]?.label || fmtDay(items[Math.floor(items.length / 2)]?.day || '');
    const last = items[items.length - 1]?.label || fmtDay(items[items.length - 1]?.day || '');

    node.innerHTML = `
      <div class="chart__bars">${bars}</div>
      <div class="chart__labels">
        <span>${esc(first)}</span>
        <span>${esc(middle)}</span>
        <span>${esc(last)}</span>
      </div>
    `;
  }

  function renderModes() {
    const modes = Array.isArray(state.dashboard?.modes) ? state.dashboard.modes : [];
    const node = $('modeChart');
    if (!modes.length) {
      node.innerHTML = '<p class="empty">Пока нет завершённых тестов.</p>';
      return;
    }

    const total = modes.reduce((sum, item) => sum + (Number(item.count) || 0), 0) || 1;
    node.innerHTML = modes.map((item) => {
      const count = Number(item.count) || 0;
      const share = Math.round((count / total) * 100);
      return `
        <div class="mode-row">
          <span>${esc(MODE_LABEL[item.mode] || item.mode)}</span>
          <span class="mode-row__bar"><span class="mode-row__fill" style="width:${share}%"></span></span>
          <span class="mode-row__count">${fmtNum(count)}</span>
        </div>
      `;
    }).join('');
  }

  function renderTopScores() {
    const top = Array.isArray(state.dashboard?.top_scores) ? state.dashboard.top_scores : [];
    const node = $('topScores');
    if (!top.length) {
      node.innerHTML = '<p class="empty">Пока нет сохранённых рекордов.</p>';
      return;
    }

    node.innerHTML = top.map((item) => `
      <div class="top-row">
        <span class="top-row__name">${esc(item.name || 'Аноним')}</span>
        <span class="top-row__score">${fmtNum(item.score)}</span>
      </div>
    `).join('');
  }

  function filteredRows() {
    const query = state.filter.trim().toLowerCase();
    return state.rows.filter((row) => {
      if (state.tab !== 'visits' && state.mode && row.mode !== state.mode) return false;
      if (!query) return true;

      const haystack = state.tab === 'visits'
        ? `${row.path || ''} ${row.referrer || ''} ${row.visitor_id || ''}`
        : `${row.name || 'аноним'} ${row.player_id || ''} ${row.mode || ''}`;

      return haystack.toLowerCase().includes(query);
    });
  }

  function renderTable() {
    const rows = filteredRows();
    const head = $('tableHead');
    const body = $('tableBody');

    if (state.tab === 'visits') {
      head.innerHTML = '<tr><th>Дата</th><th>Страница</th><th>Источник</th><th>Посетитель</th><th>Экран</th><th></th></tr>';
      body.innerHTML = rows.map((row) => `
        <tr>
          <td>${esc(fmtDate(row.created_at))}</td>
          <td>${esc(row.path || '/')}</td>
          <td>${esc(row.referrer || '—')}</td>
          <td>${esc(shortId(row.visitor_id))}</td>
          <td>${esc(row.screen || '—')}</td>
          <td><button class="link-btn link-btn--danger" type="button" data-delete="${esc(row.id)}" data-kind="visits">Удалить</button></td>
        </tr>
      `).join('');
    } else {
      head.innerHTML = '<tr><th>Дата</th><th>Имя</th><th class="num">Баллы</th><th>Режим</th><th class="num">Ошибка</th><th class="num">Удары</th><th>Игрок</th><th></th></tr>';
      body.innerHTML = rows.map((row) => `
        <tr>
          <td>${esc(fmtDate(row.created_at))}</td>
          <td>${esc(row.name || 'Аноним')}</td>
          <td class="num">${esc(row.score)}</td>
          <td>${modeTag(row.mode)}</td>
          <td class="num">±${esc(row.dev == null ? '—' : `${Number(row.dev).toFixed(1)} мс`)}</td>
          <td class="num">${esc(row.taps)} / 20</td>
          <td title="${esc(row.player_id || '')}">${esc(shortId(row.player_id))}</td>
          <td>
            <button class="link-btn" type="button" data-detail="${esc(row.id)}" data-kind="${esc(state.tab)}">Детали</button>
            <button class="link-btn link-btn--danger" type="button" data-delete="${esc(row.id)}" data-kind="${esc(state.tab)}">Удалить</button>
          </td>
        </tr>
      `).join('');
    }

    $('emptyMsg').hidden = rows.length > 0;
    $('tableInfo').textContent = `За период: ${state.rows.length} записей, показано: ${rows.length}`;
  }

  function findRow(kind, id) {
    if (kind !== state.tab) return null;
    return state.rows.find((row) => String(row.id) === String(id)) || null;
  }

  function openDetail(kind, id) {
    const row = findRow(kind, id);
    if (!row) return;

    const beats = Array.isArray(row.beats) ? row.beats : [];
    $('detailTitle').textContent = `${row.name || 'Аноним'} — ${row.score} из 1000`;
    $('detailBody').innerHTML = `
      <div class="cards" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:18px">
        <article class="card"><p class="card__label">Режим</p><p class="card__value" style="font-size:20px">${esc(MODE_LABEL[row.mode] || row.mode)}</p></article>
        <article class="card"><p class="card__label">Ошибка</p><p class="card__value" style="font-size:20px">±${esc(row.dev == null ? '—' : `${Number(row.dev).toFixed(1)} мс`)}</p></article>
        <article class="card"><p class="card__label">Удары</p><p class="card__value" style="font-size:20px">${esc(row.taps)} / 20</p></article>
      </div>
      <p class="muted">Дата: ${esc(fmtDate(row.created_at))} · Игрок: ${esc(row.player_id || '—')}</p>
      <h3>Отклонения по ударам</h3>
      <div class="beats">
        ${beats.map((value, index) => `
          <div class="beat"><b>${index + 1}</b>${value == null ? '—' : `${Number(value).toFixed(1)} мс`}</div>
        `).join('')}
      </div>
    `;

    const dialog = $('detailDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  async function deleteRow(kind, id) {
    const config = TABLES[kind];
    if (!config) return;
    if (!window.confirm('Удалить эту запись? Действие необратимо.')) return;

    try {
      await api(`/rest/v1/${config.table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setMsg(`Не удалось удалить: ${err.message}`, true);
    }
  }

  function exportCsv() {
    const rows = filteredRows();
    if (!rows.length) return;

    const isVisits = state.tab === 'visits';
    const header = isVisits
      ? ['Дата', 'Страница', 'Источник', 'Посетитель', 'Экран', 'Язык']
      : ['Дата', 'Имя', 'Баллы', 'Режим', 'Ошибка', 'Удары', 'Игрок', 'Отклонения'];

    const lines = [header];
    for (const row of rows) {
      if (isVisits) {
        lines.push([
          fmtDate(row.created_at), row.path || '/', row.referrer || '',
          row.visitor_id || '', row.screen || '', row.language || '',
        ]);
      } else {
        lines.push([
          fmtDate(row.created_at), row.name || 'Аноним', row.score,
          MODE_LABEL[row.mode] || row.mode, row.dev, row.taps,
          row.player_id || '', Array.isArray(row.beats) ? row.beats.join(';') : '',
        ]);
      }
    }

    const csv = lines.map((line) => line.map((value) => {
      const text = String(value ?? '').replace(/"/g, '""');
      return `"${text}"`;
    }).join(';')).join('\r\n');

    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `loviritm-${state.tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    $('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('loginForm').querySelector('button[type="submit"]');
      button.disabled = true;
      $('loginMsg').textContent = 'Вход…';
      $('loginMsg').classList.remove('is-error');

      try {
        await signIn($('email').value.trim(), $('password').value);
        const admin = await checkAdmin();
        if (!admin) {
          await signOut();
          showLogin('Пользователь вошёл, но не добавлен в admins. Выполните SQL из supabase/admin_schema.sql.');
          return;
        }
        showApp();
        await loadAll();
      } catch (err) {
        const text = err.message === 'Invalid login credentials'
          ? 'Неверный email или пароль.'
          : err.message === 'Email not confirmed'
            ? 'Email не подтверждён. Подтвердите пользователя в Supabase.'
            : err.message;
        $('loginMsg').textContent = text;
        $('loginMsg').classList.add('is-error');
      } finally {
        button.disabled = false;
      }
    });

    $('logoutBtn').addEventListener('click', async () => {
      await signOut();
      showLogin('');
    });

    $('refreshBtn').addEventListener('click', loadAll);

    $('rangeSelect').addEventListener('change', () => {
      state.range = Number($('rangeSelect').value) || 30;
      loadAll();
    });

    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', async () => {
        document.querySelectorAll('.tab').forEach((item) => {
          item.classList.toggle('is-active', item === button);
          item.setAttribute('aria-selected', String(item === button));
        });
        state.tab = button.dataset.tab || 'attempts';
        state.rows = [];
        const visits = state.tab === 'visits';
        $('modeFilter').disabled = visits;
        $('modeFilter').closest('.field').hidden = visits;
        renderTable();
        try {
          await loadTable();
        } catch (err) {
          setMsg(`Не удалось загрузить таблицу: ${err.message}`, true);
        }
      });
    });

    $('searchInput').addEventListener('input', () => {
      state.filter = $('searchInput').value;
      renderTable();
    });

    $('modeFilter').addEventListener('change', () => {
      state.mode = $('modeFilter').value;
      renderTable();
    });

    $('exportBtn').addEventListener('click', exportCsv);

    $('tableBody').addEventListener('click', (event) => {
      const detail = event.target.closest('[data-detail]');
      if (detail) {
        openDetail(detail.dataset.kind, detail.dataset.detail);
        return;
      }

      const remove = event.target.closest('[data-delete]');
      if (remove) {
        deleteRow(remove.dataset.kind, remove.dataset.delete);
      }
    });

    $('detailClose').addEventListener('click', () => $('detailDialog').close());
    $('detailDialog').addEventListener('click', (event) => {
      if (event.target === $('detailDialog')) $('detailDialog').close();
    });
  }

  async function init() {
    bindEvents();
    loadSession();

    if (!state.session) {
      showLogin('');
      return;
    }

    try {
      showApp();
      const admin = await checkAdmin();
      if (!admin) {
        await signOut();
        showLogin('Нет прав администратора. Добавьте пользователя в таблицу admins.');
        return;
      }
      await loadAll();
    } catch (err) {
      await signOut();
      showLogin(`Не удалось проверить доступ: ${err.message}`);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
