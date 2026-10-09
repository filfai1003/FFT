# Decisions log

Choices made while turning the design into code, mostly where the design or `PROJECT.md` was
ambiguous or inconsistent. The owner delegated these decisions on 2026-10-08. Revisit any of them
before the phase that depends on it.

## Stack and tooling

| Decision | Why |
|---|---|
| Flutter template removed; Expo SDK 57 at the repo root, routes in `src/app` | The Expo template uses `src/app`; alias `@/*` → `src/*`. |
| Zustand for UI/appearance/toast state, TanStack Query for server state | Small, no boilerplate. The active workout session will NOT depend on the Query cache. |
| `i18next` + `expo-localization`, typed keys; ESLint rule `react/jsx-no-literals` forbids literal JSX text | Enforces "no hardcoded strings". Props such as `accessibilityLabel` are not caught by the rule: review by hand. |
| Sheet and Toast written in-house (RN `Modal` / `Animated`) | No heavy dependency; behaviour is simple and fully testable. |
| Supabase CLI as a devDependency (`npx supabase`) | No global install. |
| DB checks run twice: on embedded Postgres in `npm run check` (`db:verify`, fast, no Docker) and as pgTAP on the real stack (`npm run db:test`) | A quick check must not need Docker; the real stack confirms it. |
| Auth session in AsyncStorage for now | Phase 1 decides whether to encrypt it (health data). |
| Open Food Facts rows are written by an Edge Function with the service role (Phase 3); users cannot write global rows | Keeps RLS strict ("everyone writes only their own rows"). |

## Resolved design inconsistencies

1. **Muscles**: the Create exercise chips (chest, back, shoulders, biceps, triceps, legs, glutes, abs) are stored as is; strength groups (Chest, Back, Shoulders, Legs, Arms, Core) are derived: biceps/triceps → arms, abs → core, glutes → legs (`public.strength_group`).
2. **Shared screens** (Exercise detail, Plan detail, Session detail) become root-level routes (`src/app/exercise/[id]`, …) so they can be opened from the session, Today and Progress. The tab bar is shown on them only when entered from a tab.
3. **Back/Minimize** return to wherever the screen was opened from (native stack), not to the fixed target drawn in the mockups.
4. **Resume banner**: a "Session in progress" row is added to Today and Train (not drawn: mockup to be shown before building it).
5. **Fixed-meals mode**: "Log the foods instead" returns to the fixed-meals log (not to the count-foods one). Today's "Meal" shortcut becomes "Mark next meal done" in that mode.
6. **Recipes** is part of the food-search modal flow (no tab bar), not a tab push.
7. **Exercise picker** takes a `returnTo` param so it also serves Empty workout and adding an exercise during a session.
8. **Session actions** not drawn (remove/replace/add exercise, per-set rest): a "⋯" menu next to "Exercise details".
9. **Non-`weight_reps` exercises** (reps, time, distance/time) get row variants in the session screen (Phase 2).
10. **Reorder** ("HOLD TO REORDER") also gets move up/down buttons for accessibility and one-hand mode.
11. **Controls without a screen** (New plan, plan "⋯" menu, notifications bell, calendar, water/weight quick log sheets, See plans, Help & feedback) are designed when their phase arrives and shown before building.
12. **Plan status**: `workout_plans.status` (`draft | active | archived`) replaces the boolean `active`; one active plan per user.
13. **DB additions**: `session_exercises` (order/rest/notes of each exercise in a session), `body_goals` (weight target), `nutrition_goals.water_ml` and `maintenance_kcal` (enables the 25 % deficit rule in SQL), `user_settings.water_glass_ml`, `consents.policy_version`, `workout_sessions.day_name` (snapshot), `foods` source/owner constraint.
14. **Strength score** only includes exercises trained on at least two different days in the period (one day has no "change").
15. **Day / time zone**: `exercise_e1rm_daily` groups by the session start in the profile time zone.
16. **Activity levels** follow the Personal info screen (Mostly sitting / Light / On my feet / Physical job → 1.2 / 1.375 / 1.55 / 1.725).
17. **Suggested target**: maintenance −10 % (lose fat), 0 (maintain), +10 % (build muscle), rounded to 50 kcal and never below the safety floor. This reproduces the mockup (2600 → 2350).
18. **Sex** for the formula is `male | female` only. **Age**: onboarding will block under-18s (decided in Phase 1, not in the DB).
19. **Theme**: dark only for now; the Light/System options stay disabled until the light theme is designed.
20. **Accent colours**: the 6 options of `tokens.json`; text on the accent picks black or light for ≥ 4.5:1 contrast (the white accent needs black text).

## Decided while building Phases 1–5

21. **Auth session** is stored encrypted (AES key in SecureStore, ciphertext in AsyncStorage). Apple / Google sign-in is deferred: email + password only for now.
22. **Shared screens** (exercise detail, session detail) are re-exported inside each tab's folder instead of being root routes, so the tab bar and back stack stay correct.
23. **Notifications**: `src/lib/notifications.ts` is a web no-op, `notifications.native.ts` is the real local-notification code (expo-notifications has no web build).
24. **Edge Functions** (`off`, `delete-account`) need `supabase functions serve` locally (`supabase start -x imgproxy,edge-runtime`).
25. **Demo data**: `supabase/scripts/demo-data.sql` fills 12 weeks of body entries and workouts for the first onboarded user (local only).
26. **Photos**: private bucket + signed URLs; blur-until-tapped and device lock are client settings in `privacy-store`.
27. **Withdrawing health consent** pauses the app behind `ConsentGate` (give consent again, export or delete).
28. **Fixed-meals auto-split** (only the Auto-split button; every value stays editable): same base calories per meal, a main meal gets 1.4x, the meal right before the workout shifts 12% of its calories from fat to carbs, the one right after shifts 8% from fat to protein; the other meals absorb the difference so the day keeps its macro totals. Stored as `fixed_meals.is_main` and `fixed_meal_plans.workout_after_meal_id`.
29. **Recipes removed** from the product (screens, routes, tables `recipes`/`recipe_items`, view `recipe_nutrition`, `food_logs.recipe_id/servings`): migration `20261009100000_remove_recipes.sql`.
30. **Meals stay on target**: editing a meal in the fixed-meals plan re-shares the rest between the other meals (`rebalanceMeals`); one meal can never take more than the whole day. Auto-split works from the macro targets (calories = 4/4/9 of those macros).
31. **Onboarding** lets you set the macro split (independent percentages) and set up your meals, main meals and workout position with the same editor as the plan (`MealPlanEditor`).
32. **First workout plan** becomes active right away; a workout with nothing logged is replaced (with UNDO) when you start another one.

## Still open

- Exercise images: 3 of the 12 PNGs are in (deadlift, bench press, back squat). Missing: incline-db-press, overhead-press, lateral-raise, cable-fly, pushdown, pull-up, barbell-row, lat-pulldown, biceps-curl, romanian-deadlift. Drop them in `assets/exercise-images/<slug>.png`, then `npm run db:seed` and `npm run db:images`.
- Apple / Google sign-in, light theme, "How to perform" section of exercise detail.
- Not verified on a device: camera / photo capture, barcode scanner, biometrics, local notifications.
