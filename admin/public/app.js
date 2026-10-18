// FFT admin panel (browser side). Made for anyone, not only people who know databases: plain
// names, ready-made questions, and editing locked until it is unlocked on purpose. Everything that
// comes from the database is shown as text (textContent), never as HTML.
const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity))
    if (kid != null && kid !== false)
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin': '1' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login' && path !== '/api/sudo') showLogin();
  if (!res.ok) throw new Error(data.error ?? `Something went wrong (${res.status})`);
  return data;
}

/** {columns, rows: [[…]]} from the server -> [{column: value}]. */
const asObjects = (r) =>
  r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));

// ---------------------------------------------------------------- formatting
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const dateTime = (v) =>
  new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = (v) =>
  new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  });
function ago(v) {
  if (!v) return 'never';
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) {
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  return dateOnly(v);
}
const num = (v) => Number(v ?? 0).toLocaleString();

/** id -> email of the accounts, to show people instead of codes (loaded once, when needed). */
const peopleById = new Map();
async function loadPeople() {
  if (peopleById.size) return;
  const r = await api('/api/users').catch(() => null);
  if (r) for (const row of asObjects(r)) peopleById.set(row.id, row.email);
}
const PERSON_COLUMNS = new Set(['user_id', 'owner_id', 'id_user']);
function personLink(id) {
  const email = peopleById.get(id);
  if (!email) return null;
  return h(
    'button',
    {
      class: 'link',
      type: 'button',
      title: id,
      onclick: (e) => {
        e.stopPropagation();
        go('person', id);
      },
    },
    email,
  );
}
const euro = (v) => `${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} €`;

/** A value as people read it: dates as dates, yes/no, short ids, "—" for nothing. */
function pretty(v, column = '') {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  if (UUID.test(s)) return `${s.slice(0, 8)}…`;
  if (ISO_TIME.test(s) && !Number.isNaN(Date.parse(s))) return dateTime(s);
  if (ISO_DAY.test(s) || column === 'day') return dateOnly(s);
  return s;
}

const WORDS = {
  id: 'ID',
  user_id: 'Person',
  owner_id: 'Owner',
  created_at: 'Created',
  updated_at: 'Changed',
  deleted_at: 'Deleted',
  kcal: 'Calories',
  kcal_100g: 'Calories per 100 g',
  protein_g: 'Protein (g)',
  carbs_g: 'Carbs (g)',
  fat_g: 'Fat (g)',
  weight_kg: 'Weight (kg)',
  reps: 'Reps',
  ml: 'Water (ml)',
  email: 'Email',
  last_sign_in_at: 'Last sign-in',
  cost_micros: 'Cost (millionths of €)',
};
/** snake_case column -> a label ("weight_kg" -> "Weight (kg)"). */
function label(column) {
  if (WORDS[column]) return WORDS[column];
  const unit = column.match(/_(kg|g|ml|cm|s|m|pct|eur)$/);
  const base = unit ? column.slice(0, -unit[0].length) : column;
  const words = base.replace(/_id$/, '').replace(/_at$/, '').split('_').join(' ');
  const text = words.charAt(0).toUpperCase() + words.slice(1);
  const units = { kg: 'kg', g: 'g', ml: 'ml', cm: 'cm', s: 'seconds', m: 'm', pct: '%', eur: '€' };
  return unit ? `${text} (${units[unit[1]]})` : text;
}

// ---------------------------------------------------------------- toast and dialogs
let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 4000);
}

/** Opens the general dialog with `content`; resolves with what `close(value)` was given. */
function openDialog(build, { wide = false } = {}) {
  return new Promise((resolve) => {
    const dialog = $('dialog');
    dialog.classList.toggle('wide', wide);
    const close = (value) => {
      dialog.close();
      resolve(value);
    };
    dialog.onclose = () => resolve(undefined);
    $('dialogBody').replaceChildren(...[build(close)].flat());
    dialog.showModal();
  });
}

/** Are you sure? -> true / false. */
function confirmDialog(title, text, { confirm = 'Confirm', danger = false } = {}) {
  return openDialog((close) => [
    h('h2', {}, title),
    h('p', { class: 'muted' }, text),
    h(
      'div',
      { class: 'row end' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => close(false) }, 'Cancel'),
      h(
        'button',
        {
          class: danger ? 'btn danger' : 'btn primary',
          type: 'button',
          onclick: () => close(true),
        },
        confirm,
      ),
    ),
  ]).then(Boolean);
}

function errorBox(e) {
  return h('div', { class: 'card' }, h('p', { class: 'error' }, e.message ?? String(e)));
}

// ---------------------------------------------------------------- sign in and editing lock
let sudoUntil = 0;
const editing = () => sudoUntil > Date.now();
let unlockResolve = null;

function showLogin() {
  $('app').hidden = true;
  $('login').hidden = false;
  $('loginPassword').value = '';
  $('loginCode').value = '';
  $('loginPassword').focus();
}

function showApp() {
  $('login').hidden = true;
  $('app').hidden = false;
  renderNav();
  route();
  void refreshBadges();
}

function renderLock() {
  const on = editing();
  $('lockState').textContent = on ? '' : 'Viewing only';
  $('lockButton').textContent = on ? 'Lock editing' : 'Unlock editing';
  $('editingBanner').hidden = !on;
  if (on) {
    const s = Math.max(0, Math.round((sudoUntil - Date.now()) / 1000));
    $('editingBanner').textContent =
      `Editing is unlocked for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} more. ` +
      'Changes are real and written in the change log.';
  }
}

function setEditing(ms) {
  const was = editing();
  sudoUntil = ms > 0 ? Date.now() + ms : 0;
  renderLock();
  if (was !== editing()) route();
}

setInterval(() => {
  if (sudoUntil && !editing()) setEditing(0);
  else if (editing()) renderLock();
}, 1000);

/** Resolves true once editing is unlocked (asking the password if needed), false if cancelled. */
function needEditing() {
  if (editing()) return Promise.resolve(true);
  return new Promise((resolve) => {
    unlockResolve = resolve;
    $('unlockError').textContent = '';
    $('unlockPassword').value = '';
    $('unlockDialog').showModal();
    $('unlockPassword').focus();
  });
}
$('unlockDialog').addEventListener('close', () => {
  unlockResolve?.(editing());
  unlockResolve = null;
});
$('unlockDialog')
  .querySelector('[data-close]')
  .addEventListener('click', () => $('unlockDialog').close());
$('unlockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/api/sudo', { password: $('unlockPassword').value });
    setEditing(r.sudoLeftMs);
    $('unlockDialog').close();
  } catch (err) {
    $('unlockError').textContent = err.message;
  }
});
$('lockButton').addEventListener('click', async () => {
  if (editing()) {
    await api('/api/sudo/exit', {});
    setEditing(0);
    toast('Editing locked');
  } else void needEditing();
});

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    await api('/api/login', {
      password: $('loginPassword').value,
      code: $('loginCode').value,
    });
    showApp();
  } catch (err) {
    $('loginError').textContent = err.message;
  }
});
$('logout').addEventListener('click', async () => {
  await api('/api/logout', {}).catch(() => undefined);
  sudoUntil = 0;
  showLogin();
});

// ---------------------------------------------------------------- navigation
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  people:
    'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  alert:
    'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  table: 'M3 5h18v14H3zM3 10h18M9 10v9',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
};
const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
};

const PAGES = [
  { id: 'overview', group: null, icon: 'home', label: 'Overview', render: overviewPage },
  { id: 'people', group: null, icon: 'people', label: 'People', render: peoplePage },
  {
    id: 'requests',
    group: null,
    icon: 'key',
    label: 'Password requests',
    badge: 'resets',
    render: requestsPage,
  },
  {
    id: 'problems',
    group: null,
    icon: 'alert',
    label: 'Problems',
    badge: 'errors',
    render: problemsPage,
  },
  { id: 'ai', group: null, icon: 'sparkle', label: 'AI coach', render: aiPage },
  { id: 'data', group: 'Advanced', icon: 'table', label: 'All data', render: dataPage },
  { id: 'ask', group: 'Advanced', icon: 'search', label: 'Ask the database', render: askPage },
  { id: 'log', group: 'Advanced', icon: 'list', label: 'Change log', render: logPage },
  {
    id: 'backup',
    group: 'Advanced',
    icon: 'archive',
    label: 'Backup and reset',
    render: backupPage,
  },
];
const badges = { resets: 0, errors: 0 };

function renderNav() {
  const current = location.hash.slice(1).split('/')[0] || 'overview';
  const items = [];
  let group = null;
  for (const p of PAGES) {
    if (p.group !== group) {
      group = p.group;
      if (group) items.push(h('div', { class: 'nav-group' }, group));
    }
    const count = p.badge ? badges[p.badge] : 0;
    items.push(
      h(
        'button',
        {
          class: `nav-item${current === p.id || (current === 'person' && p.id === 'people') ? ' active' : ''}`,
          type: 'button',
          'aria-current': current === p.id ? 'page' : null,
          onclick: () => go(p.id),
        },
        icon(p.icon),
        p.label,
        count ? h('span', { class: 'badge', 'aria-label': `${count} open` }, String(count)) : null,
      ),
    );
  }
  $('nav').replaceChildren(...items);
}

function go(...parts) {
  const hash = `#${parts.map(encodeURIComponent).join('/')}`;
  if (location.hash === hash) route();
  else location.hash = hash;
}
window.addEventListener('hashchange', () => route());

/** Sets the title, the kicker and the short explanation of a page. */
function header(title, intro = '', kicker = '') {
  $('pageTitle').textContent = title;
  $('pageIntro').textContent = intro;
  $('pageKicker').textContent = kicker;
  document.title = `${title} · FFT admin`;
}

async function route() {
  const [id, ...args] = location.hash.slice(1).split('/').map(decodeURIComponent);
  const page =
    id === 'person' ? { render: personPage } : (PAGES.find((p) => p.id === id) ?? PAGES[0]);
  renderNav();
  renderLock();
  const box = $('page');
  box.replaceChildren(h('div', { class: 'empty' }, 'Loading…'));
  try {
    const content = await page.render(...args);
    box.replaceChildren(...[content].flat().filter(Boolean));
  } catch (e) {
    box.replaceChildren(errorBox(e));
  }
}

async function refreshBadges() {
  const [resets, errors] = await Promise.all([
    api('/api/password-resets').catch(() => null),
    api('/api/errors?days=1').catch(() => null),
  ]);
  badges.resets = resets ? resets.rows.filter((r) => r[4] === null).length : 0;
  badges.errors = errors ? errors.rows.length : 0;
  renderNav();
}
setInterval(() => {
  if (!$('app').hidden) void refreshBadges();
}, 60_000);

// ---------------------------------------------------------------- a table of rows
/**
 * rows: [{…}]; columns: [{key, label?, render?(row) -> node|string, wrap?}] (default: every key).
 * onRow(row) makes rows clickable.
 */
function table(rows, { columns, onRow, empty = 'Nothing here yet.', sort, onSort } = {}) {
  if (!rows.length) return h('div', { class: 'empty' }, empty);
  const cols = columns ?? Object.keys(rows[0]).map((key) => ({ key }));
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      {},
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          cols.map((c) => {
            const mark = sort?.column === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
            return h(
              'th',
              {
                class: onSort ? 'sortable' : '',
                onclick: onSort ? () => onSort(c.key) : null,
                title: c.key,
              },
              (c.label ?? label(c.key)) + mark,
            );
          }),
        ),
      ),
      h(
        'tbody',
        {},
        rows.map((row) =>
          h(
            'tr',
            {
              class: onRow ? 'clickable' : '',
              tabindex: onRow ? '0' : null,
              onclick: onRow ? () => onRow(row) : null,
              onkeydown: onRow ? (e) => e.key === 'Enter' && onRow(row) : null,
            },
            cols.map((c) => {
              const v = c.render
                ? c.render(row)
                : (PERSON_COLUMNS.has(c.key) && personLink(row[c.key])) ||
                  pretty(row[c.key], c.key);
              const none = !c.render && (row[c.key] === null || row[c.key] === undefined);
              return h(
                'td',
                {
                  class: [none ? 'none' : '', c.wrap ? 'wrap' : '', c.actions ? 'actions' : '']
                    .filter(Boolean)
                    .join(' '),
                  title: typeof v === 'string' && !c.render ? String(row[c.key] ?? '') : null,
                },
                v,
              );
            }),
          ),
        ),
      ),
    ),
  );
}

const stat = (value, labelText, { onclick, attention } = {}) =>
  h(
    onclick ? 'button' : 'div',
    {
      class: `stat${onclick ? ' clickable' : ''}${attention ? ' attention' : ''}`,
      type: onclick ? 'button' : null,
      onclick,
    },
    h('span', { class: 'value' }, value),
    h('span', { class: 'label' }, labelText),
  );

// ---------------------------------------------------------------- overview
async function overviewPage() {
  header('Overview', 'How the app is doing at a glance. Click a number to see more.');
  const o = await api('/api/overview');
  const signups = o.signups ?? [];
  const max = Math.max(1, ...signups.map((d) => Number(d.n)));
  return [
    h(
      'div',
      { class: 'stats' },
      stat(num(o.accounts), 'Accounts', { onclick: () => go('people') }),
      stat(num(o.new_7d), 'New this week', { onclick: () => go('people') }),
      stat(num(o.active_7d), 'Signed in this week'),
      stat(num(o.premium), 'On Premium', { onclick: () => go('ask', 'premium') }),
      stat(num(o.open_resets), 'Password requests waiting', {
        onclick: () => go('requests'),
        attention: Number(o.open_resets) > 0,
      }),
      stat(num(o.problems_24h), 'App problems today', {
        onclick: () => go('problems'),
        attention: Number(o.problems_24h) > 0,
      }),
    ),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'New accounts, last 14 days'),
        h(
          'div',
          {
            class: 'bars',
            role: 'img',
            'aria-label': `New accounts per day: ${signups.map((d) => d.n).join(', ')}`,
          },
          signups.map((d) =>
            h(
              'div',
              { class: 'bar', title: `${dateOnly(d.day)}: ${d.n}` },
              h('span', {}, Number(d.n) ? String(d.n) : ''),
              h('div', {
                class: `fill${Number(d.n) ? '' : ' zero'}`,
                style: `height:${Math.round((Number(d.n) / max) * 90) + 3}px`,
              }),
              h('span', {}, new Date(`${d.day}T12:00:00`).getDate()),
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'This week in the app'),
        h(
          'dl',
          { class: 'kv' },
          h('dt', {}, 'Workouts finished'),
          h('dd', {}, num(o.workouts_7d)),
          h('dt', {}, 'Foods logged'),
          h('dd', {}, num(o.food_7d)),
          h('dt', {}, 'AI coach cost (30 days)'),
          h('dd', {}, euro(o.ai_cost_30d)),
          h('dt', {}, 'AI apps and tokens connected'),
          h('dd', {}, num(o.ai_connections)),
          h('dt', {}, 'Database size'),
          h('dd', {}, o.db_size),
          h('dt', {}, 'Last backup'),
          h(
            'dd',
            { title: o.last_backup ?? '' },
            o.last_backup_at ? ago(o.last_backup_at) : 'None yet',
          ),
        ),
      ),
    ),
  ];
}

// ---------------------------------------------------------------- people
let peopleQuery = '';
async function peoplePage() {
  header(
    'People',
    'Everyone with an account. Click a person to see their plan, activity and options.',
  );
  const list = h('div', { class: 'card flat' }, h('div', { class: 'empty' }, 'Loading…'));
  const load = async () => {
    const r = await api(`/api/users?q=${encodeURIComponent(peopleQuery)}`);
    const rows = asObjects(r);
    count.textContent = `${rows.length} ${rows.length === 1 ? 'account' : 'accounts'}`;
    list.replaceChildren(
      table(rows, {
        empty: peopleQuery ? 'No account matches.' : 'No accounts yet.',
        onRow: (row) => go('person', row.id),
        columns: [
          { key: 'email', label: 'Email' },
          {
            key: 'plan',
            label: 'Plan',
            render: (row) =>
              h(
                'span',
                { class: `chip${row.plan === 'premium' ? ' premium' : ''}` },
                row.plan === 'premium' ? 'Premium' : 'Free',
              ),
          },
          { key: 'created_at', label: 'Joined', render: (row) => dateOnly(row.created_at) },
          { key: 'last_sign_in_at', label: 'Last seen', render: (row) => ago(row.last_sign_in_at) },
          { key: 'note', label: 'Note' },
        ],
      }),
    );
  };
  const count = h('span', { class: 'muted' });
  let timer;
  const search = h('input', {
    type: 'search',
    placeholder: 'Search by email',
    'aria-label': 'Search by email',
    value: peopleQuery,
    oninput: (e) => {
      peopleQuery = e.target.value.trim();
      clearTimeout(timer);
      timer = setTimeout(
        () => void load().catch((err) => list.replaceChildren(errorBox(err))),
        300,
      );
    },
  });
  await load();
  return [h('div', { class: 'row' }, search, count), list];
}

async function personPage(id) {
  const p = await api(`/api/user?id=${encodeURIComponent(id)}`);
  header(p.name || p.email, '', 'People');
  const connections = p.connections ?? [];
  const changePlan = async () => {
    if (!(await needEditing())) return;
    const next = p.plan === 'premium' ? 'free' : 'premium';
    const result = await openDialog((close) => {
      const note = h('input', {
        placeholder: 'For example: friend, beta tester',
        value: p.note ?? '',
      });
      return [
        h('h2', {}, next === 'premium' ? 'Give Premium' : 'Move back to Free'),
        h(
          'p',
          { class: 'muted' },
          next === 'premium'
            ? `${p.email} gets the AI coach included in the app, with 10 € of AI a month.`
            : `${p.email} keeps all their data; only the AI coach included in the app stops.`,
        ),
        next === 'premium'
          ? h('label', { class: 'field' }, h('span', {}, 'A note for yourself (optional)'), note)
          : null,
        h(
          'div',
          { class: 'row end' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h(
            'button',
            {
              class: 'btn primary',
              type: 'button',
              onclick: () => close({ note: note.value.trim() || null }),
            },
            next === 'premium' ? 'Give Premium' : 'Move to Free',
          ),
        ),
      ];
    });
    if (!result) return;
    await api('/api/plan', { userId: p.id, plan: next, note: result.note });
    toast(next === 'premium' ? `${p.email} is now on Premium` : `${p.email} is now on Free`);
    route();
  };
  const resetPassword = async () => {
    if (!(await needEditing())) return;
    const ok = await confirmDialog(
      'Give a temporary password?',
      `${p.email} will sign in with a new password you send them, then change it in the app (Profile > Password). Their current password stops working.`,
      { confirm: 'Make a temporary password', danger: true },
    );
    if (!ok) return;
    const r = await api('/api/user/temp-password', { userId: p.id });
    await showTempPassword(r.email, r.password);
  };
  return [
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        { class: 'btn ghost small', type: 'button', onclick: () => go('people') },
        '← All people',
      ),
    ),
    // An end-to-end encrypted copy (DECISIONS 64): the server cannot read it, only count it.
    p.encrypted
      ? h(
          'div',
          { class: 'stats' },
          stat(num(p.encrypted_items), 'Encrypted items'),
          stat('E2E', 'End-to-end encrypted: content not readable here'),
        )
      : h(
          'div',
          { class: 'stats' },
          stat(num(p.workouts), 'Workouts finished'),
          stat(num(p.food_logs), 'Foods logged'),
          stat(num(p.body_entries), 'Body check-ins'),
          stat(num(p.plans), 'Workout plans'),
        ),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Account'),
        h(
          'dl',
          { class: 'kv' },
          h('dt', {}, 'Email'),
          h('dd', {}, p.email ?? '—'),
          h('dt', {}, 'Name'),
          h('dd', {}, p.name ?? '—'),
          h('dt', {}, 'Plan'),
          h(
            'dd',
            {},
            h(
              'span',
              { class: `chip${p.plan === 'premium' ? ' premium' : ''}` },
              p.plan === 'premium' ? 'Premium' : 'Free',
            ),
          ),
          p.note ? [h('dt', {}, 'Note'), h('dd', {}, p.note)] : null,
          h('dt', {}, 'Copy on the server'),
          h(
            'dd',
            {},
            p.server_copy == null
              ? 'Not chosen yet'
              : !p.server_copy
                ? 'Off (data only on the phone)'
                : `${p.encrypted ? 'End-to-end encrypted' : 'Readable'} · ${(p.categories ?? []).join(', ') || 'profile and settings only'}`,
          ),
          h('dt', {}, 'Joined'),
          h('dd', {}, dateTime(p.created_at)),
          h('dt', {}, 'Finished sign-up'),
          h('dd', {}, p.onboarded_at ? dateOnly(p.onboarded_at) : 'Not yet'),
          h('dt', {}, 'Last seen'),
          h('dd', {}, ago(p.last_sign_in_at)),
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => void changePlan().catch((e) => toast(e.message)),
            },
            p.plan === 'premium' ? 'Move to Free' : 'Give Premium',
          ),
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => void resetPassword().catch((e) => toast(e.message)),
            },
            'Temporary password',
          ),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Activity'),
        h(
          'dl',
          { class: 'kv' },
          h('dt', {}, 'Last workout'),
          h('dd', {}, p.last_workout ? ago(p.last_workout) : 'None yet'),
          h('dt', {}, 'Last food logged'),
          h('dd', {}, p.last_food_day ? dateOnly(p.last_food_day) : 'None yet'),
          h('dt', {}, 'AI credit left'),
          h('dd', {}, p.ai_credit_eur != null ? euro(p.ai_credit_eur) : '—'),
          h('dt', {}, 'AI coach cost (30 days)'),
          h('dd', {}, euro(p.ai_cost_30d)),
        ),
        h('h3', {}, 'Connected AI apps and tokens'),
        connections.length
          ? h(
              'ul',
              {},
              connections.map((c) =>
                h(
                  'li',
                  {},
                  `${c.name} · ${c.app ? 'AI app' : 'personal token'} · used ${ago(c.last_used_at)}`,
                ),
              ),
            )
          : h('p', { class: 'muted' }, 'None.'),
      ),
    ),
    h(
      'p',
      { class: 'help' },
      'Only counts are shown here: what people eat, weigh or write stays private unless you open the raw data under Advanced.',
    ),
  ];
}

/** The temporary password, shown once, with a ready email. */
function showTempPassword(email, password) {
  const subject = 'FFT: your temporary password';
  const text =
    `Hi,\n\nyou asked to reset your FFT password. Sign in with this temporary password:\n\n` +
    `${password}\n\nThen change it right away in the app: Profile > Password.\n\n` +
    `If you did not ask for this, reply to this email.\n`;
  const mail = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  return openDialog((close) => [
    h('h2', {}, `Temporary password for ${email}`),
    h('p', { class: 'secret' }, password),
    h('p', { class: 'muted' }, 'It is shown only now. Send it to them, then close this window.'),
    h(
      'div',
      { class: 'row end' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Close'),
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () =>
            navigator.clipboard?.writeText(text).then(
              () => toast('Email text copied'),
              () => undefined,
            ),
        },
        'Copy the email text',
      ),
      h('a', { class: 'btn primary', href: mail }, 'Write the email'),
    ),
  ]);
}

// ---------------------------------------------------------------- password requests
async function requestsPage() {
  header(
    'Password requests',
    'People who tapped "Forgot password?" in the app. Give them a temporary password and email it; they change it in the app afterwards.',
  );
  const rows = asObjects(await api('/api/password-resets'));
  const open = rows.filter((r) => !r.handled_at);
  const done = rows.filter((r) => r.handled_at);
  badges.resets = open.length;
  renderNav();
  const answer = async (r) => {
    if (!(await needEditing())) return;
    const ok = await confirmDialog(
      'Give a temporary password?',
      `${r.email} will sign in with a new password you send them. Their current password stops working.`,
      { confirm: 'Make a temporary password', danger: true },
    );
    if (!ok) return;
    const res = await api('/api/password-reset', { id: r.id });
    await showTempPassword(res.email, res.password);
    route();
  };
  const dismiss = async (r) => {
    if (!(await needEditing())) return;
    await api('/api/password-reset/dismiss', { id: r.id });
    toast('Request dismissed');
    route();
  };
  return [
    h(
      'section',
      { class: 'card flat' },
      h(
        'div',
        { class: 'card-head', style: 'padding:16px 16px 0' },
        h('h3', {}, `Waiting (${open.length})`),
      ),
      table(open, {
        empty: 'No one is waiting. All good.',
        columns: [
          { key: 'email', label: 'Email' },
          { key: 'created_at', label: 'Asked', render: (r) => ago(r.created_at) },
          { key: 'note', label: 'Their note', wrap: true },
          {
            key: 'has_account',
            label: 'Has an account',
            render: (r) => (r.has_account ? 'Yes' : 'No — nothing to reset'),
          },
          {
            key: 'actions',
            label: '',
            actions: true,
            render: (r) => [
              r.has_account
                ? h(
                    'button',
                    {
                      class: 'btn primary small',
                      type: 'button',
                      onclick: () => void answer(r).catch((e) => toast(e.message)),
                    },
                    'Temporary password',
                  )
                : null,
              ' ',
              h(
                'button',
                {
                  class: 'btn ghost small',
                  type: 'button',
                  onclick: () => void dismiss(r).catch((e) => toast(e.message)),
                },
                'Dismiss',
              ),
            ],
          },
        ],
      }),
    ),
    done.length
      ? h(
          'section',
          { class: 'card flat' },
          h(
            'div',
            { class: 'card-head', style: 'padding:16px 16px 0' },
            h('h3', {}, 'Done in the last 7 days'),
          ),
          table(done, {
            columns: [
              { key: 'email', label: 'Email' },
              { key: 'created_at', label: 'Asked', render: (r) => dateTime(r.created_at) },
              { key: 'handled_at', label: 'Handled', render: (r) => dateTime(r.handled_at) },
            ],
          }),
        )
      : null,
  ];
}

// ---------------------------------------------------------------- problems
const KINDS = {
  crash: 'App crashed',
  unhandled: 'Unexpected error',
  render: 'A screen failed to show',
  query: 'Data failed to load',
  mutation: 'A change failed to save',
  sync: 'Sync problem',
  widget: 'Home screen widget',
  backup: 'Nightly backup',
  handled: 'Reported by the app',
};
let problemDays = '7';
async function problemsPage() {
  header(
    'Problems',
    'Errors the app sent by itself, grouped: the same problem on many phones is one row. Mark one as fixed once a new version solves it; if it comes back it shows up as new.',
  );
  const rows = asObjects(await api(`/api/errors?days=${problemDays}`));
  const days = h(
    'select',
    {
      'aria-label': 'Period',
      onchange: (e) => {
        problemDays = e.target.value;
        route();
      },
    },
    [
      ['1', 'Today'],
      ['7', 'Last 7 days'],
      ['30', 'Last 30 days'],
      ['60', 'Last 60 days'],
    ].map(([v, t]) => h('option', { value: v, selected: v === problemDays }, t)),
  );
  const open = (r) =>
    openDialog(
      (close) => [
        h('h2', {}, KINDS[r.kind] ?? r.kind),
        h('p', {}, r.message),
        h(
          'p',
          { class: 'muted' },
          `${r.times} times on ${r.accounts} ${Number(r.accounts) === 1 ? 'account' : 'accounts'} · first ${dateTime(r.first_seen)} · last ${dateTime(r.last_seen)}`,
        ),
        h(
          'p',
          { class: 'muted' },
          `Phones: ${r.platforms ?? 'unknown'} · versions: ${r.versions ?? 'unknown'}`,
        ),
        r.context
          ? h(
              'details',
              { class: 'advanced' },
              h('summary', {}, 'Where it happened'),
              h('pre', {}, JSON.stringify(r.context, null, 2)),
            )
          : null,
        h(
          'details',
          { class: 'advanced' },
          h('summary', {}, 'Technical details (for the developer)'),
          h('pre', {}, r.stack ?? '(none)'),
        ),
        h(
          'div',
          { class: 'row end' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Close'),
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: async () => {
                if (!(await needEditing())) return;
                await api('/api/errors/clear', { fingerprint: r.fingerprint });
                close();
                toast('Marked as fixed');
                void refreshBadges();
                route();
              },
            },
            'Mark as fixed',
          ),
        ),
      ],
      { wide: true },
    );
  return [
    h(
      'div',
      { class: 'row' },
      days,
      h('span', { class: 'muted' }, `${rows.length} ${rows.length === 1 ? 'problem' : 'problems'}`),
    ),
    h(
      'section',
      { class: 'card flat' },
      table(rows, {
        empty: 'No problems in this period. Nice.',
        onRow: open,
        columns: [
          { key: 'kind', label: 'What', render: (r) => KINDS[r.kind] ?? r.kind },
          { key: 'message', label: 'Message' },
          { key: 'times', label: 'Times' },
          { key: 'accounts', label: 'Accounts' },
          { key: 'last_seen', label: 'Last seen', render: (r) => ago(r.last_seen) },
        ],
      }),
    ),
  ];
}

// ---------------------------------------------------------------- AI coach
async function aiPage() {
  header(
    'AI coach',
    'The model behind the AI coach included with Premium, and what it cost. A change applies to the next message, with no new version of the app.',
  );
  const r = await api('/api/ai');
  const usage = asObjects(r.usage);
  const input = h('input', {
    list: 'aiModels',
    placeholder: r.defaultModel ?? 'provider/model',
    value: r.model ?? '',
    'aria-label': 'Model',
    style: 'min-width:min(360px,100%)',
  });
  const save = async () => {
    if (!(await needEditing())) return;
    const model = input.value.trim();
    const ok = await confirmDialog(
      model ? `Use ${model}?` : 'Go back to the default model?',
      'Every AI coach message from now on uses it. If the name is wrong the coach stops answering, so double-check it on openrouter.ai/models.',
      { confirm: 'Use it' },
    );
    if (!ok) return;
    await api('/api/ai-model', { model });
    toast('AI model changed');
    route();
  };
  return [
    h(
      'section',
      { class: 'card' },
      h('h3', {}, 'Model in use'),
      h(
        'p',
        {},
        h('strong', {}, r.model ?? `${r.defaultModel} (default)`),
        r.updatedAt ? h('span', { class: 'muted' }, ` · since ${dateTime(r.updatedAt)}`) : null,
      ),
      h(
        'div',
        { class: 'row' },
        input,
        h(
          'datalist',
          { id: 'aiModels' },
          [
            'deepseek/deepseek-v4.1-flash',
            'anthropic/claude-sonnet-4.5',
            'openai/gpt-5-mini',
            'google/gemini-2.5-flash',
            'deepseek/deepseek-v4.1-flash',
          ].map((m) => h('option', { value: m })),
        ),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => void save().catch((e) => toast(e.message)),
          },
          'Save',
        ),
      ),
      h(
        'p',
        { class: 'help' },
        'Model names are on openrouter.ai/models (like deepseek/deepseek-v4.1-flash). Leave it empty for the default.',
      ),
    ),
    h(
      'section',
      { class: 'card flat' },
      h('div', { class: 'card-head', style: 'padding:16px 16px 0' }, h('h3', {}, 'Last 30 days')),
      table(usage, { empty: 'No AI coach requests yet.' }),
    ),
  ];
}

// ---------------------------------------------------------------- all data (table browser)
/** Plain names for the tables: [group, name, what it holds]. */
const TABLE_INFO = {
  profiles: [
    'People',
    'Profiles',
    'Name, birth date, height, goal and the choices made at sign-up.',
  ],
  user_plans: ['People', 'Plans', 'Who has Premium (free accounts have no row).'],
  vip_users: ['People', 'Old VIP list', 'Replaced by Plans, kept for history.'],
  user_settings: [
    'People',
    'App settings',
    'Units, theme, accessibility and notifications of each person.',
  ],
  consents: ['People', 'Consents', 'Health data and statistics consents, with the policy version.'],
  exercises: ['Training', 'Exercises', 'The catalogue (no owner) and the exercises people made.'],
  workout_plans: ['Training', 'Workout plans', "Each person's plans (active, draft, archived)."],
  plan_days: ['Training', 'Plan days', 'The days of each plan (Push, Pull…).'],
  plan_exercises: [
    'Training',
    'Plan exercises',
    'Exercises of each plan day: sets, reps, rest, supersets, drop sets.',
  ],
  workout_sessions: ['Training', 'Workouts', 'Each workout: when, which plan day, how it felt.'],
  session_exercises: ['Training', 'Workout exercises', 'The exercises done in each workout.'],
  session_sets: [
    'Training',
    'Sets',
    'Every set: weight, reps, time. Drop index above 0 = a drop of a drop set.',
  ],
  exercise_records: [
    'Training',
    'Records (view)',
    'Best weight and estimated max per person and exercise.',
  ],
  exercise_e1rm_daily: [
    'Training',
    'Daily strength (view)',
    'Best estimated max and volume per day.',
  ],
  foods: ['Diet', 'Foods', 'The food catalogue and foods people created, per 100 g.'],
  food_servings: ['Diet', 'Food portions', 'Named portions of foods (1 slice = 30 g).'],
  food_logs: ['Diet', 'Food diary', 'Every food logged: day, meal, amount, calories and macros.'],
  daily_nutrition_totals: [
    'Diet',
    'Daily totals (view)',
    'Calories and macros eaten per person and day.',
  ],
  nutrition_goals: ['Diet', 'Nutrition goals', 'Calorie and macro targets.'],
  fixed_meal_plans: ['Diet', 'Meal plans', 'Fixed-meal plans.'],
  fixed_meals: ['Diet', 'Planned meals', 'The meals of each meal plan.'],
  fixed_meal_checks: [
    'Diet',
    'Meals ticked off',
    'Planned meals marked done, adjusted or skipped.',
  ],
  water_logs: ['Diet', 'Water', 'Water drunk per day.'],
  recipes: ['Diet', 'Recipes', 'Recipes people saved.'],
  recipe_items: ['Diet', 'Recipe ingredients', 'Ingredients of each recipe.'],
  recipe_nutrition: ['Diet', 'Recipe nutrition (view)', 'Calories and macros of each recipe.'],
  body_metrics: ['Body', 'Body check-ins', 'Weight, body fat and measurements by day.'],
  body_goals: ['Body', 'Body goals', 'Target weight and measurements.'],
  progress_photos: ['Body', 'Progress photos', 'Photo records (the pictures are private files).'],
  supplements: ['Supplements', 'Supplements', "Each person's supplement list."],
  supplement_logs: [
    'Supplements',
    'Supplements taken',
    'Which supplements were taken on which day.',
  ],
  ai_credit: ['AI', 'AI credit', 'Monthly AI coach credit of Premium accounts.'],
  ai_usage: ['AI', 'AI requests', 'Each AI coach request: model, tokens and cost.'],
  api_tokens: [
    'AI',
    'API and MCP connections',
    'Personal tokens and connected AI apps (only a fingerprint of the token is kept).',
  ],
  oauth_clients: ['AI', 'Registered AI apps', 'Apps that can sign in with FFT (Claude, ChatGPT…).'],
  oauth_codes: ['AI', 'Sign-in codes', 'Short-lived codes of the AI app sign-in.'],
  app_settings: ['App', 'App settings (global)', 'Settings for everyone, like the AI coach model.'],
  app_errors: ['App', 'Problem reports', 'Errors sent by the app (see Problems).'],
  password_reset_requests: [
    'App',
    'Password requests',
    'Forgot-password requests (see Password requests).',
  ],
  admin_audit: ['App', 'Change log', 'Every change made with editing unlocked.'],
  sync_tombstones: ['App', 'Sync deletions', 'Deletions waiting to reach other devices.'],
  account_sync: [
    'App',
    'Copy on the server',
    'Whether each account keeps a copy of its data on the server (no row: not chosen yet), which categories it keeps there (body, diet, training, photos) and whether it is end-to-end encrypted.',
  ],
  vault_keys: [
    'App',
    'Encryption keys (wrapped)',
    'End-to-end encrypted accounts: their key, locked with their passphrase and recovery key. Opens nothing without them.',
  ],
  relay_devices: [
    'App',
    'Paired phones',
    'Accounts without a copy on the server: phones that sync through the encrypted relay.',
  ],
  relay_messages: [
    'App',
    'Relay messages',
    'Encrypted messages between paired phones, deleted once delivered (30 days at most).',
  ],
  vault_rows: [
    'App',
    'Encrypted items',
    'End-to-end encrypted accounts: one sealed item per row (table, id and time in clear, the content unreadable).',
  ],
};
const GROUP_ORDER = ['People', 'Training', 'Diet', 'Body', 'Supplements', 'AI', 'App'];

let tables = [];
let current = null; // { schema, name }
let pageState = { offset: 0, limit: 50, sort: null, dir: 'asc', q: '' };
let showSystem = false;

const infoOf = (t) => (t.schema === 'public' ? TABLE_INFO[t.name] : null);

async function dataPage(schema, name) {
  header(
    'All data',
    'Every table of the database, with plain names. Pick one on the left. Click a row to see it whole' +
      (editing() ? ' and change it.' : '; unlock editing to change it.'),
    'Advanced',
  );
  if (!tables.length) tables = (await api('/api/tables')).tables;
  await loadPeople();
  if (schema && name) current = { schema, name };
  const listBox = h('nav', { class: 'card table-list', 'aria-label': 'Tables' });
  const content = h('div', { class: 'page' });

  const renderList = () => {
    const items = [];
    const known = tables.filter((t) => infoOf(t));
    for (const g of GROUP_ORDER) {
      const inGroup = known.filter((t) => infoOf(t)[0] === g);
      if (!inGroup.length) continue;
      items.push(h('div', { class: 'group' }, g));
      for (const t of inGroup) items.push(tableButton(t, infoOf(t)[1], `~${num(t.estimate)} rows`));
    }
    const others = tables.filter((t) => !infoOf(t));
    items.push(
      h(
        'button',
        {
          class: 'table-item',
          type: 'button',
          onclick: () => ((showSystem = !showSystem), renderList()),
        },
        h(
          'small',
          {},
          showSystem ? '▾ Hide technical tables' : `▸ Technical tables (${others.length})`,
        ),
      ),
    );
    if (showSystem)
      for (const t of others)
        items.push(tableButton(t, `${t.schema}.${t.name}`, `~${num(t.estimate)} rows`));
    listBox.replaceChildren(...items);
  };
  const tableButton = (t, title, sub) =>
    h(
      'button',
      {
        class: `table-item${current && current.schema === t.schema && current.name === t.name ? ' active' : ''}`,
        type: 'button',
        onclick: () => {
          pageState = { ...pageState, offset: 0, sort: null, dir: 'asc', q: '' };
          go('data', t.schema, t.name);
        },
      },
      h('strong', {}, title),
      h('small', {}, sub),
    );

  renderList();
  if (current) await renderTable(content);
  else content.append(h('div', { class: 'card empty' }, 'Pick a table on the left.'));
  return h('div', { class: 'browser' }, listBox, content);
}

async function renderTable(box) {
  const params = new URLSearchParams({
    schema: current.schema,
    name: current.name,
    limit: String(pageState.limit),
    offset: String(pageState.offset),
    q: pageState.q,
  });
  if (pageState.sort) {
    params.set('sort', pageState.sort);
    params.set('dir', pageState.dir);
  }
  const loaded = await api(`/api/table?${params}`);
  const t = loaded.table;
  const info = infoOf(t);
  // Hidden values come as null with their column names in `masked` (DECISIONS 74).
  const rows = asObjects(loaded);
  const maskedOf = new Map(rows.map((r, i) => [r, loaded.masked?.[i] ?? []]));
  const anyMasked = [...maskedOf.values()].some((m) => m.length > 0);
  const canEdit = editing() && t.kind === 'r' && t.pk.length > 0;
  let timer;
  const search = h('input', {
    type: 'search',
    placeholder: 'Search in this table',
    'aria-label': 'Search in this table',
    value: pageState.q,
    oninput: (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        pageState = { ...pageState, q: e.target.value, offset: 0 };
        void renderTable(box);
      }, 350);
    },
  });
  const from = loaded.total === 0 ? 0 : pageState.offset + 1;
  box.replaceChildren(
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'card-head' },
        h(
          'div',
          {},
          h('h2', {}, info ? info[1] : `${t.schema}.${t.name}`),
          h('p', { class: 'muted' }, info ? info[2] : 'A technical table.'),
        ),
        canEdit
          ? h(
              'button',
              { class: 'btn', type: 'button', onclick: () => void addRow(t, box) },
              'Add a row',
            )
          : null,
      ),
      h(
        'div',
        { class: 'row' },
        search,
        h('span', { class: 'muted' }, `${num(loaded.total)} rows`),
      ),
      t.kind === 'r' && t.pk.length === 0
        ? h(
            'p',
            { class: 'help' },
            'This table has no key, so its rows can only be changed with SQL.',
          )
        : null,
      anyMasked
        ? h(
            'p',
            { class: 'help' },
            "People's own content and secrets (password hashes, tokens) are hidden. Open a row and reveal it to see them: it needs editing unlocked and is written in the log.",
          )
        : null,
    ),
    h(
      'section',
      { class: 'card flat' },
      table(rows, {
        empty: pageState.q ? 'No row matches.' : 'This table is empty.',
        sort: pageState.sort ? { column: pageState.sort, dir: pageState.dir } : null,
        onSort: (c) => {
          pageState = {
            ...pageState,
            dir: pageState.sort === c && pageState.dir === 'asc' ? 'desc' : 'asc',
            sort: c,
            offset: 0,
          };
          void renderTable(box);
        },
        onRow: (row) => void rowDialog(t, row, canEdit, box, maskedOf.get(row) ?? []),
        columns: loaded.columns.map((key) =>
          anyMasked
            ? {
                key,
                render: (row) =>
                  maskedOf.get(row)?.includes(key)
                    ? h('span', { class: 'muted' }, 'hidden')
                    : (PERSON_COLUMNS.has(key) && personLink(row[key])) ||
                      (row[key] === null || row[key] === undefined ? '—' : pretty(row[key], key)),
              }
            : { key },
        ),
      }),
      h(
        'div',
        { class: 'pager' },
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            disabled: pageState.offset === 0,
            onclick: () => (
              (pageState.offset = Math.max(0, pageState.offset - pageState.limit)),
              void renderTable(box)
            ),
          },
          '← Previous',
        ),
        h(
          'span',
          { class: 'muted' },
          `${num(from)}–${num(Math.min(loaded.total, pageState.offset + rows.length))} of ${num(loaded.total)}`,
        ),
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            disabled: pageState.offset + pageState.limit >= loaded.total,
            onclick: () => ((pageState.offset += pageState.limit), void renderTable(box)),
          },
          'Next →',
        ),
      ),
    ),
  );
}

const editable = (v) =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** One row whole; with editing unlocked its fields can be changed, or the row deleted. */
async function rowDialog(t, row, canEdit, box, masked = []) {
  const pk = Object.fromEntries(t.pk.map((c) => [c, row[c]]));
  /** The whole row, hidden values included (editing unlocked; the server logs it). */
  const reveal = async () => {
    const r = await api('/api/row/reveal', { schema: t.schema, table: t.name, pk });
    return r.row;
  };
  if (masked.length && t.pk.length) {
    // Editing a row needs its real values: with editing unlocked, it is revealed (and logged).
    if (canEdit) {
      try {
        row = await reveal();
        masked = [];
      } catch (e) {
        return toast(e.message);
      }
    }
  }
  const fields = Object.keys(row);
  const inputs = {};
  const result = await openDialog(
    (close) => [
      h('h2', {}, infoOf(t)?.[1] ?? t.name),
      canEdit
        ? h(
            'p',
            { class: 'help' },
            'Change a field and save. Leave a field empty to clear it. The key fields cannot be changed.',
          )
        : h(
            'p',
            { class: 'help' },
            masked.length
              ? 'Some values are hidden. Reveal them only when you need to: it needs editing unlocked and is written in the log.'
              : 'Unlock editing to change this row.',
          ),
      h(
        'dl',
        { class: 'kv' },
        fields.flatMap((f) => {
          const locked = !canEdit || t.pk.includes(f);
          if (masked.includes(f))
            return [h('dt', { title: f }, label(f)), h('dd', { class: 'muted' }, 'hidden')];
          if (locked)
            return [
              h('dt', { title: f }, label(f)),
              h('dd', {}, h('span', { title: editable(row[f]) }, editable(row[f]) || '—')),
            ];
          inputs[f] = h('input', {
            value: editable(row[f]),
            'aria-label': label(f),
            style: 'width:100%',
          });
          return [h('dt', { title: f }, label(f)), h('dd', {}, inputs[f])];
        }),
      ),
      h(
        'div',
        { class: 'row end' },
        canEdit
          ? h(
              'button',
              { class: 'btn danger', type: 'button', onclick: () => close('delete') },
              'Delete this row',
            )
          : null,
        masked.length && t.pk.length
          ? h(
              'button',
              { class: 'btn', type: 'button', onclick: () => close('reveal') },
              'Reveal hidden values…',
            )
          : null,
        h('span', { class: 'spacer' }),
        h(
          'button',
          { class: 'btn ghost', type: 'button', onclick: () => close() },
          canEdit ? 'Cancel' : 'Close',
        ),
        canEdit
          ? h(
              'button',
              { class: 'btn primary', type: 'button', onclick: () => close('save') },
              'Save changes',
            )
          : null,
      ),
    ],
    { wide: true },
  );
  try {
    if (result === 'reveal') {
      if (!(await needEditing())) return;
      // Opened again whole (editing is now unlocked, so its fields can be changed too).
      return void (await rowDialog(t, await reveal(), t.kind === 'r', box, []));
    }
    if (result === 'save') {
      const set = {};
      for (const [f, input] of Object.entries(inputs))
        if (input.value !== editable(row[f])) set[f] = input.value === '' ? null : input.value;
      if (!Object.keys(set).length) return toast('Nothing changed');
      await api('/api/row/update', { schema: t.schema, table: t.name, pk, set });
      toast('Saved');
      await renderTable(box);
    } else if (result === 'delete') {
      const ok = await confirmDialog(
        'Delete this row for good?',
        'It cannot be undone. The app may stop showing what depended on it.',
        { confirm: 'Delete', danger: true },
      );
      if (!ok) return;
      await api('/api/row/delete', { schema: t.schema, table: t.name, pk });
      toast('Deleted');
      await renderTable(box);
    }
  } catch (e) {
    toast(e.message);
  }
}

async function addRow(t, box) {
  const inputs = {};
  const values = await openDialog(
    (close) => [
      h('h2', {}, `New row in ${infoOf(t)?.[1] ?? t.name}`),
      h('p', { class: 'help' }, 'Fill in what you need; empty fields get their default value.'),
      h(
        'div',
        { class: 'page' },
        t.columns.map((c) => {
          inputs[c.name] = h('input', {
            placeholder: c.nullable ? 'optional' : 'required unless it has a default',
          });
          return h(
            'label',
            { class: 'field' },
            h('span', {}, `${label(c.name)} · ${c.type}`),
            inputs[c.name],
          );
        }),
      ),
      h(
        'div',
        { class: 'row end' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Cancel'),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () =>
              close(
                Object.fromEntries(
                  Object.entries(inputs)
                    .filter(([, i]) => i.value !== '')
                    .map(([k, i]) => [k, i.value]),
                ),
              ),
          },
          'Add the row',
        ),
      ),
    ],
    { wide: true },
  );
  if (!values) return;
  try {
    await api('/api/row/insert', { schema: t.schema, table: t.name, values });
    toast('Row added');
    await renderTable(box);
  } catch (e) {
    toast(e.message);
  }
}

// ---------------------------------------------------------------- ask the database
/** Ready-made questions: one click, no SQL needed. They only read. */
const QUESTIONS = [
  {
    id: 'signups',
    title: 'New accounts per day',
    about: 'Last 30 days',
    sql: `select created_at::date as day, count(*) as new_accounts
from auth.users
where created_at > now() - interval '30 days'
group by 1 order by 1 desc`,
  },
  {
    id: 'active',
    title: 'Most active people',
    about: 'Workouts finished in the last 30 days',
    sql: `select u.email, count(*) as workouts
from public.workout_sessions w join auth.users u on u.id = w.user_id
where w.status = 'done' and w.deleted_at is null and w.started_at > now() - interval '30 days'
group by u.email order by workouts desc limit 20`,
  },
  {
    id: 'foods',
    title: 'Most logged foods',
    about: 'Last 30 days, with average calories',
    sql: `select name as food, count(*) as times_logged, round(avg(kcal)) as average_kcal
from public.food_logs
where deleted_at is null and created_at > now() - interval '30 days'
group by name order by times_logged desc limit 25`,
  },
  {
    id: 'exercises',
    title: 'Most trained exercises',
    about: 'Last 30 days',
    sql: `select e.name as exercise, count(distinct s.session_id) as workouts, count(*) as sets
from public.session_sets s
join public.exercises e on e.id = s.exercise_id
join public.workout_sessions w on w.id = s.session_id
where w.status = 'done' and s.completed_at is not null and s.deleted_at is null
  and w.started_at > now() - interval '30 days'
group by e.name order by workouts desc limit 25`,
  },
  {
    id: 'weekdays',
    title: 'Workouts per weekday',
    about: 'Last 90 days',
    sql: `select trim(to_char(started_at, 'Day')) as weekday, count(*) as workouts
from public.workout_sessions
where status = 'done' and deleted_at is null and started_at > now() - interval '90 days'
group by 1, extract(isodow from started_at) order by extract(isodow from started_at)`,
  },
  {
    id: 'calories',
    title: 'Average calories logged',
    about: 'Per person and day, last 14 days',
    sql: `select day, round(avg(kcal)) as average_kcal_per_person, count(*) as people
from (select user_id, day, sum(kcal) as kcal from public.food_logs
      where deleted_at is null and day > current_date - 14 group by user_id, day) d
group by day order by day desc`,
  },
  {
    id: 'ai-cost',
    title: 'AI coach cost per person',
    about: 'Last 30 days',
    sql: `select u.email, count(*) as requests, round(sum(a.cost_micros) / 1000000.0, 2) as cost_eur
from public.ai_usage a join auth.users u on u.id = a.user_id
where a.created_at > now() - interval '30 days'
group by u.email order by cost_eur desc`,
  },
  {
    id: 'premium',
    title: 'Premium accounts',
    about: 'Who has Premium and why',
    sql: `select u.email, p.note, p.created_at as since
from public.user_plans p join auth.users u on u.id = p.user_id
where p.deleted_at is null and p.plan = 'premium'
order by p.created_at desc`,
  },
  {
    id: 'unfinished',
    title: 'Sign-ups not finished',
    about: 'Accounts that never completed the first steps',
    sql: `select u.email, u.created_at as signed_up, u.last_sign_in_at as last_seen
from auth.users u left join public.profiles p on p.id = u.id
where p.onboarding_completed_at is null
order by u.created_at desc`,
  },
  {
    id: 'connections',
    title: 'Connected AI apps',
    about: 'Claude, ChatGPT and personal tokens',
    sql: `select u.email, t.name, case when t.client_id is null then 'personal token' else 'AI app' end as kind, t.last_used_at
from public.api_tokens t join auth.users u on u.id = t.user_id
where t.deleted_at is null
order by t.last_used_at desc nulls last`,
  },
];

const HISTORY_KEY = 'fft-admin-sql-history';
const sqlHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
};

async function askPage(questionId) {
  await loadPeople();
  header(
    'Ask the database',
    'Pick a ready-made question to see the answer, or write your own under "Write SQL". SQL can read everything, so it needs editing unlocked, and every run is written in the log.',
    'Advanced',
  );
  const results = h('div', { class: 'page' });
  const editor = h('textarea', {
    class: 'code',
    spellcheck: 'false',
    'aria-label': 'SQL',
    placeholder: 'select * from public.profiles limit 20;',
  });
  const status = h('span', { class: 'muted' });
  const cards = QUESTIONS.map((q) =>
    h(
      'button',
      {
        class: `question${q.id === questionId ? ' active' : ''}`,
        type: 'button',
        onclick: () => go('ask', q.id),
      },
      h('strong', {}, q.title),
      h('span', {}, q.about),
    ),
  );

  const run = async (sql, commit, title) => {
    if (!sql.trim()) return;
    if (!(await needEditing())) return;
    if (
      commit &&
      !(await confirmDialog(
        'Keep these changes?',
        'This runs your SQL on the real database and keeps what it changes. It cannot be undone.',
        { confirm: 'Run and keep', danger: true },
      ))
    )
      return;
    status.textContent = 'Running…';
    try {
      const r = await api('/api/sql', { sql, commit });
      const note = r.committed
        ? ' · changes kept'
        : editing() && !title
          ? ' · tried, nothing kept'
          : '';
      status.textContent = `${num(r.rowCount)} ${r.rowCount === 1 ? 'row' : 'rows'}${r.truncated ? ' (first 1,000 shown)' : ''} · ${r.ms} ms${note}`;
      results.replaceChildren(
        h(
          'section',
          { class: 'card flat' },
          title
            ? h('div', { class: 'card-head', style: 'padding:16px 16px 0' }, h('h3', {}, title))
            : null,
          r.columns.length
            ? table(asObjects(r), { empty: 'No rows: nothing matches.' })
            : h('div', { class: 'empty' }, `Done: ${num(r.rowCount)} rows affected.`),
        ),
      );
      if (!title) {
        localStorage.setItem(
          HISTORY_KEY,
          JSON.stringify([sql, ...sqlHistory().filter((q) => q !== sql)].slice(0, 20)),
        );
      }
    } catch (e) {
      status.textContent = '';
      results.replaceChildren(errorBox(e));
    }
  };

  const history = h(
    'select',
    {
      'aria-label': 'Earlier SQL',
      onchange: (e) => {
        const q = sqlHistory()[Number(e.target.value)];
        if (q) editor.value = q;
        e.target.value = '';
      },
    },
    h('option', { value: '' }, 'Earlier SQL…'),
    sqlHistory().map((q, i) =>
      h('option', { value: String(i) }, q.replace(/\s+/g, ' ').slice(0, 80)),
    ),
  );
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void run(editor.value, false);
    }
  });

  const chosen = QUESTIONS.find((q) => q.id === questionId);
  const advanced = h(
    'details',
    { class: 'card advanced', open: !chosen && sqlHistory().length > 0 ? true : null },
    h('summary', {}, 'Write SQL'),
    h(
      'p',
      { class: 'help' },
      editing()
        ? 'Editing is unlocked: "Try it" runs and then undoes everything, "Run and keep" changes the real data. Both are written in the log.'
        : 'SQL needs editing unlocked (you will be asked). Ctrl+Enter runs it.',
    ),
    editor,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        { class: 'btn primary', type: 'button', onclick: () => void run(editor.value, false) },
        editing() ? 'Try it' : 'Run',
      ),
      editing()
        ? h(
            'button',
            { class: 'btn danger', type: 'button', onclick: () => void run(editor.value, true) },
            'Run and keep',
          )
        : null,
      chosen
        ? h(
            'button',
            { class: 'btn ghost', type: 'button', onclick: () => (editor.value = chosen.sql) },
            'Show the SQL of this question',
          )
        : null,
      h('span', { class: 'spacer' }),
      history,
    ),
  );
  // A ready-made question runs right away only with editing unlocked; otherwise on a click.
  if (chosen && editing()) await run(chosen.sql, false, chosen.title);
  else if (chosen)
    results.replaceChildren(
      h(
        'section',
        { class: 'card' },
        h('p', { class: 'muted' }, 'Questions run SQL, so they need editing unlocked.'),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => void run(chosen.sql, false, chosen.title),
          },
          'Unlock and answer',
        ),
      ),
    );
  return [
    h('div', { class: 'questions' }, cards),
    h('div', { class: 'row' }, status),
    results,
    advanced,
  ];
}

// ---------------------------------------------------------------- change log
const ACTIONS = {
  'sudo.enter': 'Unlocked editing',
  'plan.set': 'Changed a plan',
  'password.temporary': 'Gave a temporary password',
  'password.dismiss': 'Dismissed a password request',
  'errors.clear': 'Marked a problem as fixed',
  'ai.model': 'Changed the AI coach model',
  sql: 'Ran SQL that changed data',
  'row.update': 'Changed a row',
  'row.insert': 'Added a row',
  'row.delete': 'Deleted a row',
  'backup.download': 'Downloaded a backup',
  'db.reset': 'Reset the database',
  'row.reveal': 'Revealed hidden values',
  'read.sql': 'Ran SQL (nothing kept)',
};
/** "read.table" -> "Looked at: table" (every look at the data is logged, DECISIONS 74). */
const actionName = (a) =>
  ACTIONS[a] ?? (a.startsWith('read.') ? `Looked at: ${a.slice(5).replace(/[-/]/g, ' ')}` : a);
function describe(action, d) {
  if (!d || typeof d !== 'object') return '';
  if (action === 'read.sql')
    return String(d.sql ?? '')
      .replace(/\s+/g, ' ')
      .slice(0, 120);
  if (action === 'row.reveal')
    return `${infoOf({ schema: d.schema, name: d.table })?.[1] ?? d.table} · ${(d.columns ?? []).join(', ')}`;
  if (action === 'read.table')
    return `${d.schema ?? ''}.${d.name ?? ''}${d.q ? ` · "${d.q}"` : ''}`;
  if (action === 'read.user') return d.id ? `${String(d.id).slice(0, 8)}…` : '';
  if (action === 'plan.set')
    return `${d.plan === 'premium' ? 'Premium' : 'Free'}${d.userId ? ` · ${d.userId.slice(0, 8)}…` : ''}`;
  if (action === 'password.temporary')
    return d.email ?? (d.userId ? `${d.userId.slice(0, 8)}…` : '');
  if (action === 'ai.model') return d.model || 'back to the default';
  if (action === 'sql')
    return String(d.sql ?? '')
      .replace(/\s+/g, ' ')
      .slice(0, 120);
  if (action.startsWith('row.'))
    return `${infoOf({ schema: d.schema, name: d.table })?.[1] ?? d.table}`;
  if (action === 'sudo.enter') return d.ip ? `from ${d.ip}` : '';
  return '';
}
async function logPage(kind) {
  const views = kind === 'views';
  header(
    'Change log',
    views
      ? 'Every look at the data (pages opened, SQL run, hidden values revealed), newest first. Nothing here can be edited or removed.'
      : 'Everything changed with editing unlocked, newest first. Nothing here can be edited or removed.',
    'Advanced',
  );
  const rows = asObjects(await api(`/api/audit${views ? '?views=1' : ''}`));
  const tabs = h(
    'div',
    { class: 'row' },
    h(
      'button',
      { class: `btn small${views ? ' ghost' : ''}`, type: 'button', onclick: () => go('log') },
      'Changes',
    ),
    h(
      'button',
      {
        class: `btn small${views ? '' : ' ghost'}`,
        type: 'button',
        onclick: () => go('log', 'views'),
      },
      'Views',
    ),
  );
  return [
    tabs,
    h(
      'section',
      { class: 'card flat' },
      logTable(rows, views ? 'No views yet.' : 'No changes yet.'),
    ),
  ];
}
function logTable(rows, empty) {
  return table(rows, {
    empty,
    onRow: (r) =>
      openDialog((close) => [
        h('h2', {}, actionName(r.action)),
        h('p', { class: 'muted' }, dateTime(r.created_at)),
        h('pre', {}, JSON.stringify(r.detail, null, 2)),
        h(
          'div',
          { class: 'row end' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close'),
        ),
      ]),
    columns: [
      { key: 'created_at', label: 'When', render: (r) => dateTime(r.created_at) },
      { key: 'action', label: 'What', render: (r) => actionName(r.action) },
      { key: 'detail', label: 'Details', render: (r) => describe(r.action, r.detail) },
    ],
  });
}

// ---------------------------------------------------------------- backup and reset
async function backupPage() {
  header('Backup and reset', 'Where the copies of the data are, or start over.', 'Advanced');
  const reset = async () => {
    if (!(await needEditing())) return;
    const word = h('input', { autocomplete: 'off', 'aria-label': 'Type RESET' });
    const password = h('input', {
      type: 'password',
      autocomplete: 'current-password',
      'aria-label': 'Admin password',
    });
    const error = h('p', { class: 'error', role: 'alert' });
    await openDialog((close) => [
      h('h2', {}, 'Reset the database'),
      h(
        'p',
        {},
        'This deletes every account and everything that belongs to it. It cannot be undone. Check first that last night’s encrypted backup ran (Overview > Last backup).',
      ),
      h('label', { class: 'field' }, h('span', {}, 'Type RESET'), word),
      h('label', { class: 'field' }, h('span', {}, 'Admin password again'), password),
      error,
      h(
        'div',
        { class: 'row end' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Cancel'),
        h(
          'button',
          {
            class: 'btn danger',
            type: 'button',
            onclick: async () => {
              try {
                const r = await api('/api/reset', {
                  confirm: word.value,
                  password: password.value,
                });
                close();
                toast(`Done: ${r.accounts} accounts deleted`);
              } catch (e) {
                error.textContent = e.message;
              }
            },
          },
          'Delete everything',
        ),
      ),
    ]);
  };
  return [
    h(
      'section',
      { class: 'card' },
      h('h3', {}, 'Backup'),
      h(
        'p',
        { class: 'muted' },
        'The panel no longer downloads copies of the data: a plain file on a laptop escapes encryption, retention and account deletion. The copies are the nightly backups, encrypted with BACKUP_KEY in the EU bucket, kept 30 days (monthly ones longer). To restore one, follow docs/DEPLOY.md (Backups).',
      ),
    ),
    h(
      'section',
      { class: 'card danger-zone' },
      h('h3', {}, 'Reset the database'),
      h(
        'p',
        { class: 'muted' },
        'Deletes every account and everything that belongs to it. The tables and the catalogue (exercises, foods) stay. Only for starting over: it cannot be undone.',
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { class: 'btn danger', type: 'button', onclick: () => void reset() },
          'Reset the database…',
        ),
      ),
    ),
  ];
}

// ---------------------------------------------------------------- start
const s = await api('/api/session').catch(() => ({ signedIn: false }));
if (s.signedIn) {
  sudoUntil = s.sudoLeftMs > 0 ? Date.now() + s.sudoLeftMs : 0;
  showApp();
} else showLogin();
