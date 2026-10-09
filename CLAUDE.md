# CLAUDE.md

Full spec: `docs/PROJECT.md`. Design source of truth: `docs/design/` (screens, SCREENS.md, NAVIGATION.md, tokens.json). Read them before working on any screen. Choices made where the design was ambiguous: `docs/DECISIONS.md`.

## Stack
Expo SDK 57 + React Native + TypeScript (strict) + Expo Router (routes in `src/app`, alias `@/*` → `src/*`) · Supabase (Postgres, Auth, Storage, RLS) · TanStack Query (server state) · Zustand (UI state) · i18next · offline-first active session · Open Food Facts.

## Commands
- `npm start` / `npx expo start --web` — dev server (web preview at http://localhost:8081, catalogue at `/dev/components`)
- `npm run check` — lint + typecheck + Jest + DB verification (run before every commit)
- `npm run lint | typecheck | test | format`
- `npm run db:verify` — migrations + seed + RLS/domain rules on embedded Postgres (no Docker)
- `npm run db:start | db:stop | db:reset | db:test | db:types | db:images` — real Supabase stack (needs Docker; `db:types` rewrites `src/types/database.ts`)
- `npm run db:seed` — regenerates `supabase/seed.sql` from `supabase/scripts/generate-seed.js`
- `.env.local` from `.env.example` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`)

## Structure
```
src/app/            routing only (thin screens). (tabs)/ = Today, train, diet, progress, profile (each tab folder has its own _layout Stack). dev/ = dev-only pages
src/components/ui/  design system (Screen, Card, Button, IconButton, Chip, Segmented, Toggle, Input, Stepper, DotBar, DotColumnChart, TabBar, BottomActionBar, Sheet, ToastHost, ExerciseImage, Icon, Text)
src/design/         tokens.ts (mirror of tokens.json, tested), theme, appearance-store (a11y settings), fonts, text-style
src/domain/         pure logic with tests: strength (Epley), nutrition (Mifflin, safety), rotation, units, dots, numbers
src/features/       per-area queries and screens
src/lib/            supabase client, query client, toast store, haptics
src/i18n/           en.json + typed keys
supabase/           migrations/, seed.sql, tests/database (pgTAP, real stack), verify/ (embedded Postgres), scripts/
```

## Where data lives
Free accounts and the account-less mode keep ALL user data on the device: `getSupabase()` returns `src/lib/local-db`, a stand-in for the Supabase client (same table/column names, same query-builder calls; one database per user id). The server (`getAuthClient()`) holds only the account and the Edge Functions. Never read or write user data through `getAuthClient()`. When a feature needs a new query shape (operator, embedded relation, view, rpc), add it in `local-db` (`query.ts`, `schema.ts` relations/columns/uniques, `views.ts`) and a test in `local-db.test.ts`; new tables/columns need the same entry in `schema.ts`; the exercise catalogue is regenerated with `npm run db:seed`. Premium (later) is decided in `src/lib/plan.ts`.

## Non-negotiables
- UI copy in English, always through i18n (`t('…')`). Code, tables, variables in English. ESLint forbids literal JSX text.
- Dark Nothing-inspired look: black + dot grid, Doto for big numbers/titles (uppercase), Space Mono for short uppercase labels, Space Grotesk for everything else, ONE accent element per screen. No solid white blocks (selection = white border).
- Colours/sizes come from `src/design/tokens.ts` / `useTheme()`, never hard-coded in components. Text on the accent uses `colors.onAccent`.
- Use `<Text variant=… numeric>` (never raw RN Text): it applies text scale, bold, dot-matrix-off and the 11 px minimum.
- Touch targets ≥ 44 (primary buttons 56, list rows ≥ 52), primary action in `BottomActionBar`, safe areas via `Screen`, text ≥ 11 px, inputs 16 px, control borders ≥ 3:1 (#6E6E6E), text #F2F2F2.
- Icon-only controls need `accessibilityLabel`. Never use colour alone for state.
- Every important action can be undone (toast with UNDO, 5 s: `useToastStore().show`). Moving between exercises never loses data. Finish asks for confirmation.
- Respect accessibility settings everywhere (text scale, bold, dot-matrix numbers off, high contrast, reduce motion, haptics, one-hand mode).

## Domain rules
- Rotation: "Up next" = first plan day not done in the current cycle; any day can be trained any time (out of order counts for the cycle). See `src/domain/rotation.ts`.
- Actual max = heaviest completed weight. Estimated 1RM = Epley `w × (1 + reps/30)` on sets with reps ≤ 12 (1 rep = the weight). TS in `domain/strength.ts`, SQL in `epley_1rm` — keep in sync.
- Strength score = set-weighted average % change of estimated 1RM over the period (overall, per group, per exercise), only exercises done on ≥ 2 days.
- Diet: two modes (count foods / fixed meals) sharing goals and the `daily_nutrition_totals` view. Logged values are copied at insert time.
- Safety: no calorie target < 1500 kcal or deficit > 25% (TS `domain/nutrition.ts` + DB check constraints).
- DB: metric units only, `day` = user's local date, client UUIDs + `created_at/updated_at/deleted_at`, RLS on every table (a test fails otherwise), progress photos in a private bucket with signed URLs, catalogue rows (`owner_id` null) are read-only for users.

## Gotchas learned
- Expo Router: a tab folder needs its own `_layout.tsx` (otherwise the route is `train/index`, not `train`). Restart Metro after adding folders if tabs are missing.
- `@testing-library/react-native` v14: `render`, `fireEvent` are async (`await`); use `renderUI` from `@/test/render` (adds SafeAreaProvider). `aria-hidden` elements need `{ includeHiddenElements: true }`.
- The React Compiler lint forbids reading refs / calling setState in effects during render: use `useState(() => …)` and derive state.
- On web, native-only a11y props (`accessibilityElementsHidden`, `importantForAccessibility`) log errors: use `aria-hidden`; set `aria-selected` explicitly.
- Prettier ignores `docs/` and `CLAUDE.md` on purpose (the design HTML must stay untouched).
- Bash tool: avoid heredocs containing quotes/backticks; use the Write tool for file contents.

## Workflow
Small verifiable steps, explain non-obvious choices in two lines, commit at the end of each step (only if `npm run check` passes), ask before expensive-to-change decisions (sync, navigation, auth, data structure).

## Status
Hosted backend: Railway (docs/DEPLOY.md), app builds with EAS. Phases 0–5 built (foundations, auth/onboarding, training, diet, Today/Progress, Profile/privacy). Open items: `docs/DECISIONS.md` → Still open. Docker Desktop must be running for `npm run db:*` (except `db:verify`). Local backend: `npm run db:start`, then `npx supabase functions serve` for the Edge Functions; demo history via `supabase/scripts/demo-data.sql`.
