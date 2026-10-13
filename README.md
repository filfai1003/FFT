# FFT

A freemium mobile app for training, diet and progress tracking: log workouts offline, plan meals, and see your strength and body trends over time.

Spec in `docs/PROJECT.md`, design in `docs/design/`, working rules in `CLAUDE.md`.

## Highlights

- **Stack:** Expo SDK 57, React Native, TypeScript (strict), Expo Router, TanStack Query, Zustand, i18next, Supabase (Postgres, Auth, Storage, Edge Functions).
- **Local-first architecture:** user data stays on the device. `src/lib/local-db` mirrors the Supabase client API (same tables, columns and query-builder calls), so the same feature code runs against the device or the server.
- **Offline workout sessions:** an active session never depends on the network and moving between exercises never loses data.
- **Row Level Security on every table**, with a test that fails if a table is missing a policy.
- **Health safety rules in two places:** no calorie target below 1500 kcal and no deficit above 25%, enforced in TypeScript and again as database constraints.
- **Pure, tested domain logic:** strength (Epley 1RM), nutrition (Mifflin-St Jeor), program rotation, units and more live in `src/domain` with no framework dependencies.
- **One command to trust a change:** `npm run check` runs ESLint, `tsc`, 200+ Jest tests and a database verification (migrations, seed, RLS and domain rules) on embedded Postgres, no Docker needed.
- **CI/CD:** GitHub Actions run the checks, then EAS ships a new build or an over-the-air update depending on whether native code changed.
- **Accessibility:** text scale, bold text, high contrast, reduced motion, haptics, one-hand mode, 44 px touch targets and labelled controls.
- **Privacy by design:** weight, diet and photos are health data (GDPR art. 9), so consent is explicit and revocable, and users can export or fully delete their data.

## Structure

```
src/app/            routing only (Expo Router, thin screens)
src/components/ui/  design system (Screen, Card, Button, Sheet, charts, ...)
src/design/         tokens, theme, accessibility settings
src/domain/         pure logic with tests (strength, nutrition, rotation, units)
src/features/       per-area queries and screens (train, diet, progress, ...)
src/lib/            Supabase client, local database, query client, helpers
src/i18n/           translations with typed keys
supabase/           migrations, seed, database tests, verification scripts
server/             hosted backend service (migrations + Edge Functions)
docs/               spec, design, decisions, deployment notes
```

## Run it locally

```bash
npm install
npm run check          # lint, typecheck, tests, database verification
npx expo start --web   # then open http://localhost:8081/dev/components
```

Local backend (needs Docker): `npm run db:start`, then copy the URL and anon key from `npx supabase status` into `.env` (see `.env.example`).

## How I built it

I designed this app and built it with an AI pair programmer (Claude Code), which is why most commits are co-authored.
The workflow is mine, and it repeats for every feature:

1. **Analysis and data model.** I analyse the feature, design the database and normalise it, then review and correct the schema with Claude.
2. **Kick-off prompt.** I write a precise prompt with the spec, the constraints and the rules in `CLAUDE.md`.
3. **Read and correct.** I read every change, fix what is wrong, and nothing is committed unless `npm run check` passes.
4. **Plan the next step.** I define the structure of the next step, then start again from step 2.

The product spec (`docs/PROJECT.md`), the design (`docs/design/`), the architecture decisions (`docs/DECISIONS.md`) and the engineering rules (`CLAUDE.md`) are where I steer the work.

---

© Filippo Faiella. All rights reserved.
