# Deploy: server on Railway, Android app (EAS)

## What the server holds
Free accounts keep all their data on the phone. The server only holds: Auth (email + password), the
empty `profiles` row created by the `handle_new_user` trigger, the exercise-image bucket, and two
small functions (`off` = Open Food Facts search, `delete-account`). See `CLAUDE.md` → "Where data lives".
Premium accounts (VIP from the admin panel, for now) keep their data here too: the tables and the
private photo buckets; the database refuses data writes from other accounts (DECISIONS 38).

## Server (Railway project `fft`, environment `production`)
Services, all on Railway's private network, one public URL (Kong):

| Service    | Image / source                     | Notes                                           |
|------------|------------------------------------|-------------------------------------------------|
| `Postgres` | supabase/postgres:17.6.1.136       | volume `/var/lib/postgresql`                    |
| `auth`     | supabase/gotrue:v2.189.0           | email + password, `GOTRUE_MAILER_AUTOCONFIRM=true` (no SMTP yet) |
| `rest`     | postgrest/postgrest:v14.12         |                                                 |
| `storage`  | supabase/storage-api:v1.60.4       | volume `/var/lib/storage`                       |
| `backend`  | kong/kong:3.9.1                    | public domain; routes `/auth/v1`, `/rest/v1`, `/storage/v1`, `/functions/v1`; `KONG_NGINX_WORKER_PROCESSES=1`, `KONG_MEM_CACHE_SIZE=16m` (with the default `auto` nginx starts one worker per host core, ~48 on Railway: 5.4 GB of RAM) |
| `api`      | this repo (`server/Dockerfile`)    | functions `off`, `delete-account`, `ai` (needs `OPENROUTER_API_KEY`; optional `AI_MODEL`, `EUR_PER_USD`); **redeploys on every push to `main`** that touches `server/`, `supabase/migrations/` or `supabase/functions/` |
| `web`      | this repo (`web/Dockerfile`)       | the web app (premium accounts), public domain `web-fft`; build variables `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| `site`     | this repo (`site/Dockerfile`)      | install page, public domain `fft`                 |
| `admin`    | this repo (`admin/`)               | admin panel, public domain `admin-fft`            |

Public URL: `https://your-backend.example.com` (the `backend` service domain, Kong).

`api` is the automatic part: at every start it applies the `supabase/migrations/*.sql` not applied yet
(tracked in `public.app_migrations`), then `supabase/seed.sql` (the exercise catalogue, an idempotent
upsert with the same ids as the app), and serves `off` and `delete-account` (the Deno files in
`supabase/functions/`, run on Node by `server/index.js`). So a new migration or a function change
reaches the server just by pushing to `main` (`supabase/seed.sql` is in the watch patterns of `api` too).

Secrets (`JWT_SECRET`, the anon and service-role keys, the database password) live only in Railway
variables and in `.secrets/` (git-ignored). The anon key is public by design and is in the EAS env.

Not applied: the data of earlier local accounts (nothing to migrate: free accounts keep data on the phone).

## Android app (EAS, project `@filfai/fft`)
- Build an installable APK: `npx eas-cli build -p android --profile preview` (download link at the end).
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are EAS environment variables
  (`preview` and `production`), baked into the build.
- Automatic (`.github/workflows/app-deploy.yml`, on every push to `main` that touches the app): if the native
  part changed (new native package, Expo SDK, native config) it builds a new APK; otherwise it publishes an
  over-the-air update (EAS Update, branch `preview`) that installed apps get the next time they open.
  The decision uses the project fingerprint (`runtimeVersion` policy in `app.json`): an update only reaches
  builds with the same fingerprint. Needs the GitHub secret `EXPO_TOKEN` (expo.dev → Account settings →
  Access tokens). The new APK is on expo.dev → the project → Builds.
- Play Store: `--profile production` (an `.aab`) and a Google Play developer account.
Package name: `com.filfai1003.fft`.

## Access rules (who can reach what)
- Only Kong has a public address. Postgres, auth, rest, storage and api have none (private network
  only) and Postgres has no TCP proxy, so the database cannot be reached from the internet.
- Every call to `/auth`, `/rest` and `/functions` needs the app's `apikey` (the anon key). The anon key
  is public by design (it is inside the APK): the real protection is the user's signed token (JWT)
  plus row level security on every table (a test fails if a table has none). A user only sees their
  own rows; the anon key alone sees nothing.
- The service-role key never leaves Railway (`api`, `backend`, `storage`) and `.secrets/`.
- Rate limits per IP (per minute): auth 60, functions 60, rest and storage 600; request bodies on
  auth/rest/functions are capped at 1 MB. Passwords need 8+ characters, refresh tokens rotate.
- REST exposes the `public` schema only.
- Check it after a change: `SUPABASE_URL=… SUPABASE_ANON_KEY=… bash supabase/scripts/smoke-hosted.sh`.
- Not covered: someone can still extract the anon key from the APK and sign up for accounts (that
  is all it allows: they only ever see their own data). Stronger app-only checks (Play Integrity)
  and email verification (needs an SMTP service) are possible later.

## What happens on a push to `main`
- `server/`, `supabase/migrations/`, `supabase/functions/`: Railway rebuilds `api`, which applies new migrations.
- Anything in the app: `app-deploy.yml` runs lint, typecheck and tests, then either builds a new APK (native
  change) or publishes an over-the-air update (everything else).

## Install page and APK download
- Page: `site/` (static, nginx), Railway service `site`, redeploys on every push that touches `site/`.
  Same look as the app (light, Figtree, follows the phone's dark mode): the download button, the
  install steps, screenshots (`site/screens/`, taken from the web preview at 390×844) and a few exercise
  pictures (`site/exercises/`).
- The APK is a public file in the storage bucket `downloads` (`fft.apk`, 300 MB limit), next to
  `config.js` (version, size, build). nginx (`site/nginx.conf`) serves both from the page's own
  address (`/fft.apk`, `/config.js`), reading the backend address from the service variable
  `BACKEND_URL` on the `site` service, so no hosted address is stored in the repository. Publish a
  new APK with `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node supabase/scripts/publish-apk.mjs <apk>`
  (nothing to commit; the `Publish APK` workflow does it automatically).
- Local APK without the Expo queue: build the image once (`docker build -t fft-android tools/android-build`),
  then `docker run` it with `tools/android-build/build.sh` (see the script header); the APK lands in `build/`.
- `app.config.js` turns on over-the-air updates (`runtimeVersion` fingerprint, `updates.url`) only when
  `EAS_BUILD`, `CI` or `FFT_UPDATES` is set, so the local web dev server is not affected.
