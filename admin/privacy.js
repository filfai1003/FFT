// What the data browser hides until it is revealed on purpose (DECISIONS 74): secrets everywhere
// (password hashes, tokens, codes) and the content of people's own data (health, diet, training,
// notes, photos). Keys, owners and times stay visible, so the admin can still find a row, count,
// and link it to an account. Revealing a row needs editing unlocked and is written to the log.

/** Secrets in any schema: never needed to look at, shown only when revealed. */
const SECRET = /password|token|secret|_hash$|^code_challenge$|^auth_code$|otp|nonce/i;

/** Columns that only identify a row or say when it changed: visible in every table. */
const META = /^(id|user_id|owner_id|created_at|updated_at|deleted_at|server_at)$|_id$/;

/**
 * public tables that hold the account's own content (whatever the user entered or measured).
 * Tables about the account itself (plans, credit, tokens, sync settings) are not here: their
 * columns are what the panel is for. A table added later that has a user_id column and is not
 * in ACCOUNT_TABLES is treated as content too.
 */
const ACCOUNT_TABLES = new Set([
  'user_plans',
  'vip_users',
  'ai_credit',
  'ai_usage',
  'api_tokens',
  'account_sync',
  'app_settings',
  'admin_audit',
  'app_errors',
  'oauth_clients',
  'oauth_codes',
  'relay_devices',
  'password_reset_requests',
]);

/**
 * How a table is masked: { hidden: Set of columns hidden in every row, ownerRows: true when the
 * other columns are hidden only in rows that belong to someone (owner_id set: own foods and
 * exercises; the catalogue rows, owner_id null, stay readable) }.
 */
export function maskOf(schema, table, columns) {
  const names = columns.map((c) => (typeof c === 'string' ? c : c.name));
  const secrets = names.filter((c) => SECRET.test(c));
  const isContent =
    schema === 'public' &&
    !ACCOUNT_TABLES.has(table) &&
    (table === 'profiles' || names.includes('user_id') || names.includes('owner_id'));
  if (!isContent) return { always: new Set(secrets), owned: new Set() };
  const content = names.filter((c) => !META.test(c) && !SECRET.test(c));
  // Catalogue tables (owner_id, no user_id): content hidden only in the rows someone owns.
  if (names.includes('owner_id') && !names.includes('user_id'))
    return { always: new Set(secrets), owned: new Set(content) };
  return { always: new Set([...secrets, ...content]), owned: new Set() };
}

/** The columns hidden in one row (as an object), given the table's mask. */
export function hiddenIn(mask, row) {
  const owned = row.owner_id != null ? [...mask.owned] : [];
  return [...mask.always, ...owned].filter((c) => c in row);
}

/** Rows of a query ({ columns, rows: [[…]] }) with hidden values set to null, and which they were. */
export function maskRows(mask, columns, rows) {
  const masked = [];
  const out = rows.map((values) => {
    const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
    const hidden = hiddenIn(mask, row).filter((c) => row[c] !== null);
    masked.push(hidden);
    return columns.map((c, i) => (hidden.includes(c) ? null : values[i]));
  });
  return { rows: out, masked };
}

/** The columns the search may look in when nothing is revealed (hidden ones never). */
export const searchableColumns = (mask, columns) =>
  columns.filter((c) => !mask.always.has(c) && !mask.owned.has(c));
