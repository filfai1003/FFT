# CLAUDE.md

Full spec: `docs/PROJECT.md`. Design source of truth: `docs/design/` (screens, SCREENS.md, NAVIGATION.md, tokens.json). Read them before working on any screen.

## Stack
Expo + React Native + TypeScript (strict) + Expo Router · Supabase (Postgres, Auth, Storage, RLS) · TanStack Query · offline-first active session · Open Food Facts.

## Non-negotiables
- UI copy in English, always through i18n. Code, tables, variables in English.
- Dark Nothing-inspired look: black + dot grid, Doto for big numbers/titles, Space Mono for short uppercase labels, Space Grotesk for everything else, ONE accent element per screen. No solid white blocks.
- Use tokens from `docs/design/tokens.json`, never hard-coded colors or sizes in components.
- Touch targets ≥ 44, primary actions in a bottom action bar (56 px), safe areas always, text ≥ 11 px, inputs 16 px, control borders ≥ 3:1 contrast (#6E6E6E), text #F2F2F2.
- Every important action can be undone (toast with UNDO). Moving between exercises never loses data. Finish asks for confirmation.
- Respect accessibility settings everywhere (text scale, bold, dot-matrix numbers off, high contrast, reduce motion, haptics, one-hand mode).

## Domain rules
- Rotation: "Up next" = first plan day not done in the current cycle; any day can be trained any time (out of order counts for the cycle).
- Actual max = heaviest completed weight. Estimated 1RM = Epley `w × (1 + reps/30)` on sets with reps ≤ 12.
- Strength score = set-weighted average % change of estimated 1RM over the period (overall, per primary muscle group, per exercise).
- Diet: two modes (count foods / fixed meals) sharing goals and the `daily_nutrition_totals` view. Logged values are copied at insert time.
- Safety: no calorie target < 1500 kcal or deficit > 25%.
- DB: metric units only, `day` = user's local date, client UUIDs + `updated_at` + `deleted_at`, RLS on every table, progress photos in a private bucket with signed URLs.

## Workflow
Small verifiable steps, explain non-obvious choices in two lines, commit at the end of each step, ask before expensive-to-change decisions.

## Commands
(fill in after Phase 0: dev server, tests, lint, Supabase start/reset, migrations)
