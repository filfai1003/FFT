// How long the nightly backups are kept (DECISIONS 60, shortened by DECISIONS 79): every daily
// dump for 30 days, then the first dump of each month for 6 months. Deleted accounts and deleted
// data therefore leave the backups within 6 months at most.

export const DAILY_DAYS = 30;
export const MONTHLY_DAYS = 186;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The account ids in a deletion log file (reapply-deletions.mjs): JSON (rows with user_id, or
 * plain ids) or one id per line. Anything else is ignored.
 */
export function idsOf(text) {
  const trimmed = text.trim();
  const items = trimmed.startsWith('[')
    ? JSON.parse(trimmed).map((r) => (typeof r === 'string' ? r : r?.user_id))
    : trimmed.split(/\s+/);
  return items.filter((x) => typeof x === 'string' && UUID.test(x));
}

/** The dump keys (db/<time>.sql.gz.enc) to delete now. */
export function dumpsToDelete(keys, now = new Date()) {
  const dayMs = 86_400_000;
  const parsed = keys
    .map((k) => {
      const m = k.match(/^db\/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z/);
      return m ? { key: k, at: new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at);
  const firstOfMonth = new Set();
  const seenMonth = new Set();
  for (const p of parsed) {
    const month = p.at.toISOString().slice(0, 7);
    if (!seenMonth.has(month)) {
      seenMonth.add(month);
      firstOfMonth.add(p.key);
    }
  }
  return parsed
    .filter((p) => {
      const age = (now - p.at) / dayMs;
      if (age <= DAILY_DAYS) return false;
      if (firstOfMonth.has(p.key) && age <= MONTHLY_DAYS) return false;
      return true;
    })
    .map((p) => p.key);
}
