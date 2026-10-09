# Deploy: server on Railway, Android app (EAS)

## What the server holds
Free accounts keep all their data on the phone. The server only holds: Auth (email + password), the
empty `profiles` row created by the `handle_new_user` trigger, the exercise-image bucket, and two
small functions (`off` = Open Food Facts search, `delete-account`). See `CLAUDE.md` → "Where data lives".

## Server (Railway project `fft`, environment `production`)
Services, all on Railway's private network, one public URL (Kong):

| Service    | Image / source                     | Notes                                           |
|------------|------------------------------------|-------------------------------------------------|
| `Postgres` | supabase/postgres:17.6.1.136       | volume `/var/lib/postgresql`                    |
| `auth`     | supabase/gotrue:v2.189.0           | email + password, `GOTRUE_MAILER_AUTOCONFIRM=true` (no SMTP yet) |
| `rest`     | postgrest/postgrest:v14.12         |                                                 |
| `storage`  | supabase/storage-api:v1.60.4       | volume `/var/lib/storage`                       |
| `kong`     | kong/kong:3.9.1                    | public domain; routes `/auth/v1`, `/rest/v1`, `/storage/v1`, `/functions/v1` |
| `api`      | this repo (`server/Dockerfile`)    | **redeploys on every push to `main`** that touches `server/`, `supabase/migrations/` or `supabase/functions/` |

Public URL: `https://kong-production-d2ca.up.railway.app`.

`api` is the automatic part: at every start it applies the `supabase/migrations/*.sql` not applied yet
(tracked in `public.app_migrations`) and serves `off` and `delete-account` (the Deno files in
`supabase/functions/`, run on Node by `server/index.js`). So a new migration or a function change
reaches the server just by pushing to `main`.

Secrets (`JWT_SECRET`, the anon and service-role keys, the database password) live only in Railway
variables and in `.secrets/` (git-ignored). The anon key is public by design and is in the EAS env.

Not applied: the data of earlier local accounts (nothing to migrate: free accounts keep data on the phone).

## Android app (EAS, project `@filfai/fft`)
- Build an installable APK: `npx eas-cli build -p android --profile preview` (download link at the end).
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are EAS environment variables
  (`preview` and `production`), baked into the build.
- Updates without reinstalling: `.github/workflows/app-update.yml` publishes an over-the-air update
  (EAS Update, channel `preview`) on every push to `main` that changes the app. It needs the GitHub
  secret `EXPO_TOKEN` (expo.dev → Account settings → Access tokens). Native changes (new native
  package, SDK upgrade) need a new APK; the app version in `app.json` is the update compatibility key.
- Play Store: `--profile production` (an `.aab`) and a Google Play developer account.
Package name: `com.filfai1003.fft`.

## Access rules (who can reach what)
- Only Kong has a public address. Postgres, auth, rest, storage and api have none (private network
  only) and Postgres has no TCP proxy, so the database cannot be reached from the internet.
- Every call to `/auth`, `/rest` and `/functions` needs the app's `apikey` (the anon key). The anon key
  is public by design (it is inside the APK): the real protection is the user's signed token (JWT)
  plus row level security on every table (a test fails if a table has none). A user only sees their
  own rows; the anon key alone sees nothing.
- The service-role key never leaves Railway (`api`, `kong`, `storage`) and `.secrets/`.
- Rate limits per IP (per minute): auth 60, functions 60, rest and storage 600; request bodies on
  auth/rest/functions are capped at 1 MB. Passwords need 8+ characters, refresh tokens rotate.
- REST exposes the `public` schema only.
- Check it after a change: `SUPABASE_URL=… SUPABASE_ANON_KEY=… bash supabase/scripts/smoke-hosted.sh`.
- Not covered: someone can still extract the anon key from the APK and sign up for accounts (that
  is all it allows: they only ever see their own data). Stronger app-only checks (Play Integrity)
  and email verification (needs an SMTP service) are possible later.

## What happens on a push to `main`
| Changed files                                         | Result                                                        |
|-------------------------------------------------------|---------------------------------------------------------------|
| `server/`, `supabase/migrations/`, `supabase/functions/` | Railway rebuilds and restarts `api`, applying new migrations |
| `src/`, `assets/` (and the files below)               | `app-update.yml`: lint + typecheck + tests, then an over-the-air update to installed apps |
| `package.json`, `package-lock.json`, `app.json`, `eas.json` | `app-build.yml`: a new APK on EAS Build (also runnable by hand) |

A new APK is only needed when the native part changes; every other change reaches the installed app
as an update the next time it is opened. Both workflows need the `EXPO_TOKEN` repository secret.
