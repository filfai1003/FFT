// FFT admin panel (browser side). Everything that comes from the database is shown with textContent,
// never as HTML.
const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat())
    if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
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
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

const fmtCell = (v) =>
  v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v);

// ---------------------------------------------------------------- sign in and sudo mode
let sudoUntil = 0;
const inSudo = () => sudoUntil > Date.now();

function showLogin() {
  $('app').hidden = true;
  $('login').hidden = false;
  $('loginPassword').value = '';
  $('loginPassword').focus();
}

function showApp() {
  $('login').hidden = true;
  $('app').hidden = false;
  loadTables();
}

function renderMode() {
  const on = inSudo();
  document.body.classList.toggle('sudo', on);
  $('banner').hidden = !on;
  $('modePill').textContent = on ? 'SUDO' : 'READ ONLY';
  $('modePill').classList.toggle('sudo', on);
  $('sudoButton').textContent = on ? 'Leave sudo mode' : 'Enter sudo mode';
  $('runSql').textContent = on ? 'Run (cannot change)' : 'Run (read only)';
  $('runRollback').hidden = !on;
  $('runCommit').hidden = !on;
  $('addRow').hidden = !on || !current;
  $('resetButton').textContent = on
    ? 'Reset the database…'
    : 'Reset the database… (needs sudo mode)';
  if (on) {
    const s = Math.max(0, Math.round((sudoUntil - Date.now()) / 1000));
    $('sudoLeft').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left`;
  }
}

function setSudo(ms) {
  sudoUntil = ms > 0 ? Date.now() + ms : 0;
  renderMode();
  if (current) renderTableGrid();
  if (activeTab === 'users') loadUsers();
}

setInterval(() => {
  if (sudoUntil && !inSudo()) setSudo(0);
  else if (inSudo()) renderMode();
}, 1000);

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    await api('/api/login', { password: $('loginPassword').value });
    showApp();
  } catch (err) {
    $('loginError').textContent = err.message;
  }
});

$('logout').addEventListener('click', async () => {
  await api('/api/logout', {}).catch(() => undefined);
  sudoUntil = 0;
  renderMode();
  showLogin();
});

$('sudoButton').addEventListener('click', async () => {
  if (inSudo()) {
    await api('/api/sudo/exit', {});
    setSudo(0);
  } else openSudo();
});

function openSudo() {
  $('sudoError').textContent = '';
  $('sudoPassword').value = '';
  $('sudoDialog').showModal();
  $('sudoPassword').focus();
}
$('sudoCancel').addEventListener('click', () => $('sudoDialog').close());
$('sudoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/api/sudo', { password: $('sudoPassword').value });
    $('sudoDialog').close();
    setSudo(r.sudoLeftMs);
  } catch (err) {
    $('sudoError').textContent = err.message;
  }
});

// ---------------------------------------------------------------- tabs
let activeTab = 'data';
$('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]')?.dataset.tab;
  if (!tab) return;
  activeTab = tab;
  for (const b of document.querySelectorAll('.tab'))
    b.classList.toggle('active', b.dataset.tab === tab);
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `tab-${tab}`;
  if (tab === 'users') loadUsers();
  if (tab === 'audit') loadAudit();
});

// ---------------------------------------------------------------- grids
/** A table of values. `opts.onSort(column)`, `opts.onRow(row)`, `opts.cell(td, column, row, value)`, `opts.actions(row)`. */
function renderGrid(container, columns, rows, opts = {}) {
  container.replaceChildren();
  if (rows.length === 0) {
    container.append(h('div', { class: 'empty' }, 'No rows.'));
    return;
  }
  const head = h(
    'tr',
    {},
    columns.map((c) => {
      const mark = opts.sort?.column === c ? (opts.sort.dir === 'desc' ? ' ▼' : ' ▲') : '';
      return h('th', { onclick: opts.onSort ? () => opts.onSort(c) : null, title: c }, c + mark);
    }),
    opts.actions ? h('th', {}, '') : null,
  );
  const body = rows.map((row) =>
    h(
      'tr',
      {},
      row.map((v, i) => {
        const td = h('td', { class: v === null ? 'null' : '', title: fmtCell(v) }, fmtCell(v));
        td.addEventListener('click', () => opts.onRow?.(row));
        opts.cell?.(td, columns[i], row, v);
        return td;
      }),
      opts.actions ? h('td', { class: 'actions' }, opts.actions(row)) : null,
    ),
  );
  container.append(h('table', {}, h('thead', {}, head), h('tbody', {}, body)));
}

// ---------------------------------------------------------------- data tab
let tables = [];
let current = null; // { schema, name }
let page = { offset: 0, limit: 50, sort: null, dir: 'asc', q: '' };
let loaded = null; // last answer of /api/table

async function loadTables() {
  tables = (await api('/api/tables')).tables;
  renderTableList();
}

function renderTableList() {
  const filter = $('tableFilter').value.trim().toLowerCase();
  const list = $('tableList');
  list.replaceChildren();
  let schema = '';
  for (const t of tables.filter((x) => `${x.schema}.${x.name}`.includes(filter))) {
    if (t.schema !== schema) {
      schema = t.schema;
      list.append(h('div', { class: 'schema' }, schema));
    }
    list.append(
      h(
        'button',
        {
          class: `table-item${current && current.schema === t.schema && current.name === t.name ? ' active' : ''}`,
          onclick: () => openTable(t.schema, t.name),
        },
        h('span', {}, t.name + (t.kind === 'v' || t.kind === 'm' ? ' (view)' : '')),
        h('small', {}, `~${t.estimate}`),
      ),
    );
  }
}
$('tableFilter').addEventListener('input', renderTableList);

function openTable(schema, name) {
  current = { schema, name };
  page = { ...page, offset: 0, sort: null, dir: 'asc', q: '' };
  $('rowSearch').value = '';
  renderTableList();
  loadRows();
}

async function loadRows() {
  if (!current) return;
  const params = new URLSearchParams({
    schema: current.schema,
    name: current.name,
    limit: String(page.limit),
    offset: String(page.offset),
    q: page.q,
  });
  if (page.sort) {
    params.set('sort', page.sort);
    params.set('dir', page.dir);
  }
  try {
    loaded = await api(`/api/table?${params}`);
    renderTableGrid();
  } catch (e) {
    $('dataGrid').replaceChildren(h('div', { class: 'empty error' }, e.message));
  }
}

function pkOf(row) {
  const idx = loaded.columns.map((c) => c);
  return Object.fromEntries(loaded.table.pk.map((c) => [c, row[idx.indexOf(c)]]));
}

function renderTableGrid() {
  renderMode();
  if (!loaded || !current) return;
  const { table, columns, rows, total, ms } = loaded;
  $('tableTitle').textContent = `${table.schema}.${table.name}`;
  $('tableMeta').textContent =
    `${total} rows · ${ms} ms${table.pk.length ? '' : ' · no primary key (edit with SQL)'}`;
  const editable = inSudo() && table.kind === 'r' && table.pk.length > 0;
  renderGrid($('dataGrid'), columns, rows, {
    sort: page.sort ? { column: page.sort, dir: page.dir } : null,
    onSort: (c) => {
      page.dir = page.sort === c && page.dir === 'asc' ? 'desc' : 'asc';
      page.sort = c;
      page.offset = 0;
      loadRows();
    },
    onRow: (row) => showDetail(row),
    cell: (td, column, row) => {
      if (!editable || table.pk.includes(column)) return;
      td.classList.add('editable');
      td.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        editCell(td, column, row);
      });
    },
    actions: editable
      ? (row) =>
          h(
            'button',
            { class: 'btn ghost', title: 'Delete row', onclick: () => deleteRow(row) },
            'Delete',
          )
      : null,
  });
  const from = total === 0 ? 0 : page.offset + 1;
  $('pageInfo').textContent = `${from}–${Math.min(total, page.offset + rows.length)} of ${total}`;
  $('prevPage').disabled = page.offset === 0;
  $('nextPage').disabled = page.offset + page.limit >= total;
}

function editCell(td, column, row) {
  const idx = loaded.columns.indexOf(column);
  const input = h('input', {
    value: row[idx] === null ? '' : fmtCell(row[idx]),
    placeholder: 'type null for NULL',
    style: 'width:100%;padding:4px 8px',
  });
  td.replaceChildren(input);
  input.focus();
  input.select();
  const cancel = () => renderTableGrid();
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') return cancel();
    if (e.key !== 'Enter') return;
    const value = input.value === 'null' ? null : input.value;
    try {
      await api('/api/row/update', { ...current, pk: pkOf(row), set: { [column]: value } });
      await loadRows();
    } catch (err) {
      alert(err.message);
      cancel();
    }
  });
  input.addEventListener('blur', cancel);
}

async function deleteRow(row) {
  if (!confirm(`Delete this row for good?\n\n${JSON.stringify(pkOf(row))}`)) return;
  try {
    await api('/api/row/delete', { ...current, pk: pkOf(row) });
    await loadRows();
  } catch (err) {
    alert(err.message);
  }
}

function showDetail(row) {
  $('detailTitle').textContent = `${current.schema}.${current.name}`;
  $('detailBody').replaceChildren(
    h(
      'dl',
      { class: 'kv' },
      loaded.columns.flatMap((c, i) => [h('dt', {}, c), h('dd', {}, fmtCell(row[i]))]),
    ),
  );
  $('detailDialog').showModal();
}
$('detailClose').addEventListener('click', () => $('detailDialog').close());

$('addRow').addEventListener('click', () => {
  if (!current || !loaded) return;
  $('formTitle').textContent = `New row in ${current.schema}.${current.name}`;
  $('formError').textContent = '';
  $('formFields').replaceChildren(
    ...loaded.table.columns.map((c) =>
      h(
        'label',
        {},
        h('span', { class: 'label' }, `${c.name} · ${c.type}${c.nullable ? '' : ' · required'}`),
        h('input', { 'data-col': c.name, placeholder: 'empty = default · null = NULL' }),
      ),
    ),
  );
  $('formDialog').showModal();
});
$('formCancel').addEventListener('click', () => $('formDialog').close());
$('formForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = {};
  for (const input of $('formFields').querySelectorAll('input')) {
    if (input.value === '') continue;
    values[input.dataset.col] = input.value === 'null' ? null : input.value;
  }
  try {
    await api('/api/row/insert', { ...current, values });
    $('formDialog').close();
    await loadRows();
  } catch (err) {
    $('formError').textContent = err.message;
  }
});

let searchTimer;
$('rowSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.q = $('rowSearch').value;
    page.offset = 0;
    loadRows();
  }, 300);
});
$('rowLimit').addEventListener('change', () => {
  page.limit = Number($('rowLimit').value);
  page.offset = 0;
  loadRows();
});
$('prevPage').addEventListener('click', () => {
  page.offset = Math.max(0, page.offset - page.limit);
  loadRows();
});
$('nextPage').addEventListener('click', () => {
  page.offset += page.limit;
  loadRows();
});

// ---------------------------------------------------------------- SQL tab
const HISTORY_KEY = 'fft-admin-sql-history';
const history = () => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
};

function renderHistory() {
  const select = $('sqlHistory');
  select.replaceChildren(h('option', { value: '' }, 'History'));
  history().forEach((q, i) =>
    select.append(h('option', { value: String(i) }, q.replace(/\s+/g, ' ').slice(0, 80))),
  );
}
$('sqlHistory').addEventListener('change', () => {
  const q = history()[Number($('sqlHistory').value)];
  if (q) $('sqlText').value = q;
  $('sqlHistory').value = '';
});

async function runSql(commit) {
  const sql = $('sqlText').value;
  if (!sql.trim()) return;
  if (commit && !confirm('Run this and KEEP the changes in the real database?')) return;
  $('sqlStatus').textContent = 'Running…';
  try {
    const r = await api('/api/sql', { sql, commit });
    const note = r.committed ? 'changes kept' : inSudo() ? 'rolled back' : '';
    $('sqlStatus').textContent =
      `${r.command ?? ''} · ${r.rowCount} rows${r.truncated ? ' (first 1000 shown)' : ''} · ${r.ms} ms${note ? ' · ' + note : ''}`;
    renderGrid($('sqlGrid'), r.columns, r.rows);
    if (r.columns.length === 0)
      $('sqlGrid').replaceChildren(
        h('div', { class: 'empty' }, `${r.command ?? 'Done'}: ${r.rowCount} rows affected.`),
      );
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([sql, ...history().filter((q) => q !== sql)].slice(0, 20)),
    );
    renderHistory();
  } catch (e) {
    $('sqlStatus').textContent = '';
    $('sqlGrid').replaceChildren(h('div', { class: 'empty error' }, e.message));
  }
}
$('runSql').addEventListener('click', () => runSql(false));
$('runRollback').addEventListener('click', () => runSql(false));
$('runCommit').addEventListener('click', () => runSql(true));
$('sqlText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runSql(false);
  }
});

// ---------------------------------------------------------------- users tab
let userTimer;
$('userSearch').addEventListener('input', () => {
  clearTimeout(userTimer);
  userTimer = setTimeout(loadUsers, 300);
});

async function loadUsers() {
  const r = await api(`/api/users?q=${encodeURIComponent($('userSearch').value)}`).catch((e) => {
    $('userGrid').replaceChildren(h('div', { class: 'empty error' }, e.message));
    return null;
  });
  if (!r) return;
  $('userCount').textContent = `${r.rows.length} accounts`;
  const [id, email, created, last, plan, note, credit] = [0, 1, 2, 3, 4, 5, 6];
  const body = r.rows.map((row) => {
    // free / supporter / premium: changes go through sudo mode (DECISIONS 42).
    const select = h(
      'select',
      {
        'aria-label': `Plan of ${row[email]}`,
        title: inSudo() ? 'Change the plan' : 'Enter sudo mode to change this',
        onchange: (e) => setPlan(row[id], row[email], e.target.value, e.target, row[plan]),
      },
      ['free', 'supporter', 'premium'].map((p) =>
        h('option', { value: p, ...(p === row[plan] ? { selected: '' } : {}) }, p),
      ),
    );
    return h(
      'tr',
      {},
      h('td', {}, row[email] ?? '(no email)'),
      h('td', {}, row[created] ? new Date(row[created]).toLocaleString() : ''),
      h('td', {}, row[last] ? new Date(row[last]).toLocaleString() : 'never'),
      h('td', {}, select),
      h('td', {}, row[credit] != null ? `${row[credit]} €` : ''),
      h('td', {}, row[note] ?? ''),
    );
  });
  $('userGrid').replaceChildren(
    r.rows.length
      ? h(
          'table',
          {},
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              ['Email', 'Created', 'Last sign-in', 'Plan', 'AI credit', 'Note'].map((c) =>
                h('th', {}, c),
              ),
            ),
          ),
          h('tbody', {}, body),
        )
      : h('div', { class: 'empty' }, 'No accounts.'),
  );
}

async function setPlan(userId, email, plan, select, previous) {
  const undo = () => (select.value = previous);
  if (!inSudo()) {
    undo();
    return openSudo();
  }
  let note = null;
  if (plan !== 'free') {
    note = prompt(`Give ${email} the ${plan} plan. A note for yourself (optional):`, '');
    if (note === null) return undo();
  } else if (
    !confirm(`Move ${email} back to the free plan? Their online data comes back to their phone.`)
  )
    return undo();
  try {
    await api('/api/plan', { userId, plan, note });
    await loadUsers();
  } catch (e) {
    undo();
    alert(e.message);
  }
}

// ---------------------------------------------------------------- audit tab
async function loadAudit() {
  try {
    const r = await api('/api/audit');
    renderGrid($('auditGrid'), r.columns, r.rows);
  } catch (e) {
    $('auditGrid').replaceChildren(h('div', { class: 'empty error' }, e.message));
  }
}
$('refreshAudit').addEventListener('click', loadAudit);

// ---------------------------------------------------------------- backup tab
$('resetButton').addEventListener('click', () => {
  if (!inSudo()) return openSudo();
  $('resetError').textContent = '';
  $('resetWord').value = '';
  $('resetPassword').value = '';
  $('resetDialog').showModal();
});
$('resetCancel').addEventListener('click', () => $('resetDialog').close());
$('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/api/reset', {
      confirm: $('resetWord').value,
      password: $('resetPassword').value,
    });
    $('resetDialog').close();
    alert(`Done: ${r.accounts} accounts deleted.`);
    if (current) loadRows();
  } catch (err) {
    $('resetError').textContent = err.message;
  }
});

// ---------------------------------------------------------------- start
renderHistory();
const s = await api('/api/session').catch(() => ({ signedIn: false }));
if (s.signedIn) {
  sudoUntil = s.sudoLeftMs > 0 ? Date.now() + s.sudoLeftMs : 0;
  showApp();
  renderMode();
} else showLogin();
