# Admin panel

Online: `https://admin-production-187b.up.railway.app` (Railway service `admin`, redeploys on every push
that touches `admin/`). The password is in `.secrets/admin.txt` (git-ignored) and in the Railway
variables of the service (`ADMIN_PASSWORD`).

## What it does
- **Data**: every table of `public`, `auth` and `storage`: search, sort, pages, row detail.
- **SQL**: write a query and run it (Ctrl+Enter). History of the last 20 queries.
- **Users**: all accounts, with the VIP switch.
- **Backup**: downloads a compressed SQL copy of everything (`public`, `auth`, `storage`) made with `pg_dump`
  and the read-only role; and **Reset the database** (see below).
- **Audit**: every change made in sudo mode (who entered sudo, each SQL kept, each row edited or deleted,
  each VIP granted or removed).

## Read only, and sudo mode
- By default the panel is **read only**: queries run with the database role `admin_ro`, which cannot write.
  This is not a check on the SQL text: the role has no right to write, so no query can change anything.
- **Sudo mode** (button at the top, asks the password again) lasts 10 minutes. The page turns red. In sudo mode:
  double-click a cell to edit it, delete rows, add rows, make accounts VIP, run SQL that changes data.
  SQL runs and **rolls back** unless you press "Run and keep changes".

## Backup and reset
- **Download backup** gives `fft-backup-<date>.sql.gz`: schema and data of `public`, `auth` and `storage`. It holds private
  data (password hashes included): keep it safe. Restore on an empty database: `gunzip -c file.sql.gz | psql <url>`.
- **Reset the database** (sudo mode + the password again + typing `RESET`) deletes every account and, through the
  cascades, everything that belongs to it (profiles, VIP, server-side data). The tables and the catalogue
  (exercises, foods) stay. It is logged in the audit. Download a backup first: it cannot be undone.

## VIP
Table `vip_users` (one row per VIP account). The app reads its own row and shows "VIP" instead of "FREE"
in Profile. Premium features do not exist yet, so for now VIP only shows as that badge; when premium
features come, they check VIP (`src/features/profile/vip.ts`). A user cannot make themselves VIP: the table
has no write policy, only the panel (database owner) writes it.

## Security
- Password login (24+ random characters), 5 wrong passwords lock the address for 15 minutes, session 8 hours,
  cookie `HttpOnly` + `SameSite=Strict` + `Secure`. Writes need the `X-Admin` header (no other site can add it).
- Postgres stays private; the panel reaches it over Railway's private network.
- Check the rules after a change: `ADMIN_URL=… ADMIN_PASSWORD=… node admin/smoke.mjs` (27 checks, including
  "read only cannot write even with COMMIT tricks").
- To change the password: edit `ADMIN_PASSWORD` in the Railway variables of `admin` (and `.secrets/admin.txt`).
