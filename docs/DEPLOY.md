# Deploy: server on Railway, Android app (APK)

## What the server holds
Free accounts keep all their data on the phone. The server only needs: Auth (email + password), the
`profiles` row created by the `handle_new_user` trigger, the exercise-image bucket, and two small
functions (`off` = Open Food Facts search proxy, `delete-account`). See `CLAUDE.md` → "Where data lives".

## 1. Server on Railway (project `fft`, production environment)
Railway has no official Supabase service. The template "Supabase (Self-Hosted, Full Stack)" deploys
Postgres 17, GoTrue (auth), PostgREST, Storage, postgres-meta, Studio and Kong behind one public URL.
It does NOT include Edge Functions.

1. Generate `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` (supabase.com/docs/guides/self-hosting/docker#securing-your-services).
2. Deploy the template into the `fft` project with those three values.
3. Apply `supabase/migrations/*` to the Postgres service (`supabase db push --db-url …`), then the
   catalogue seed (`supabase/seed.sql`) and `npm run db:images` for the exercise images.
4. Functions: run `off` and `delete-account` as one small Node service on Railway (they need the
   service-role key, which never goes in the app).
5. Auth: set `GOTRUE_SITE_URL`, keep `GOTRUE_MAILER_AUTOCONFIRM=true` until SMTP is configured.

The app needs two public values: `EXPO_PUBLIC_SUPABASE_URL` (the Kong public URL) and
`EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## 2. Android APK (EAS Build, in the cloud)
Needs a free Expo account. One-time, in a terminal:

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<kong-domain> --environment preview --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --environment preview --visibility plaintext
npx eas-cli build -p android --profile preview
```

The build gives a download link to an installable `.apk` (profile `preview`, in `eas.json`). For the
Play Store use `--profile production` (an `.aab`) and a Google Play developer account (one-off fee).
Package name: `com.filfai1003.fft`.
