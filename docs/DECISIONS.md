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
33. **Offline mode** ("Use without an account" on the sign-in and setup screens): no account, no sync; everything is saved on the device. `getSupabase()` returns a local client (`src/lib/local-db`) with the same API as supabase-js (query builder, nested selects, the 3 views, `last_sets`, storage, `delete-account`), backed by an in-memory copy of the tables saved to IndexedDB (web) or files (iOS/Android). Same schema rules as the SQL (checks, unique indexes). Leaving offline mode keeps the data for next time; Delete account wipes it. Open Food Facts search is online-only. No migration between modes.
34. **Free accounts keep no data online**: the server only stores the account (email + password; the empty profile row created at sign-up). All user data — plans, workouts, food, body, photos, settings, consents — is saved in the on-device database (`src/lib/local-db`), one database per account id, so accounts on one device never mix. `getSupabase()` = data (local unless `isPremium()`), `getAuthClient()` = server (auth, Edge Functions). Premium accounts keep their data online instead (see 38). Open Food Facts search still goes through the `off` function (needs account + internet); found products are copied to the device. Delete account removes the server account and this device's data. Logging in on another device finds no data (no sync, no backup).

35. **AI plans & import** (Profile → AI plans & import): one JSON exchange format (`domain/plan-import.ts`: `workout_plan` and/or `diet_plan`). Manual mode copies a prompt (goal and body basics, never the name; the format; the exercise list) for any AI chat and imports the pasted answer after a preview. The chat uses the user's own API key (Anthropic, or any OpenAI-compatible server), called straight from the device; the key is stored with the auth-session storage (encrypted on phones). The AI sees the current plans and diet and returns whole plans; the user reviews them before anything is saved. Changing an existing plan (same id) archives a copy first ("… (before AI)"). Safety rules still apply to imported diets (≥ 1500 kcal, ≤ 25% deficit); meals are rescaled to the daily target. Exercises not in the library are created only when the AI gives muscle and equipment, otherwise skipped.
36. **AI assistant with tools** (Profile → AI plans & import → chat; needs the user's own API key). The chat is an agent loop (`src/features/ai/agent/`): the model can call tools, the app runs them and gives back the results until the model answers in text (max 10 steps). Works with Anthropic (tool use) and any OpenAI-compatible server (function calling). Reading tools (`get_overview`, `get_day`, `get_history`, `get_body`, `get_workouts`, `get_workout_plans`, `get_diet`, `search_foods`, `list_exercises`) run at once; every changing tool (`log_body`, `create_food`, `update_food`, `delete_food`, `log_food`, `remove_food_log`, `log_water`, `set_meal_status`, `set_nutrition_goal`, `propose_plans`) first shows what it will do and runs only after Approve; most can then be undone (card button and 5 s toast). Tools reuse the app's own mutations, so the rules stay the same (calorie floor and deficit limit, macros must add up, logged values copied). Conversations (several) are saved on the device, per account, and removed with the account. Manual mode (no key) stays one question and one answer: the prompt carries a snapshot of the user's data (today, last 14 days, weight, workouts, plans, diet, own foods) and the answer may contain `actions` (the same changing tools, except plans which have their own keys) that are previewed and applied with one button. The data an assistant reads goes to the provider with the user's key; the name is never sent.
37. **Redesign (2026-10)** after the "FFT redesign" canvas: light-first look (warm off-white, white cards, Figtree, sentence case, fills for progress) replacing the dark dot-matrix style; dark stays available. Two settings: app theme and workout theme (light / dark / phone), both light by default; stored in user_settings (`theme`, `workout_theme`; rows saved before this start on light). Navigation: four tabs (Home, Diet, Train, Progress) and a central "+" that opens the Add sheet (food, scan, water, weight and body, workout, photo, recent foods, coach); Profile opens from the avatar on Home, the coach from the button next to it. Home keeps the customisable widgets (calories with a 270° arc and macro bars first, workout, water as a filling glass, a new weight widget, creatine, calendar); the AI bar is off by default. The workout screen has one big "Done set N" button between previous/next, and the rest timer is a ring. The animated/dot-grid backgrounds and the dot-matrix setting are gone.
38. **Premium = data online + the web app.** Premium today means VIP (set from the admin panel); paid plans come later and will only change `is_premium()` on the server. Free accounts still keep everything on the phone and the server refuses their data (restrictive row level security: inserts and updates need `is_premium()`; reading and deleting stay allowed so data can be taken back). At every start the app asks the server (`src/features/premium/use-plan-gate.ts`): when premium starts, the phone's rows and photos are uploaded (same ids; photos moved to `<user id>/`), then the phone copy is erased; when premium ends, everything is downloaded to the phone, then the server copy is erased (`clear_my_online_data()` and the photo files). If a move fails nothing is lost and it is retried at the next start (going up, the user can keep working on the phone meanwhile). A second phone that goes online keeps the plan, meal plan and workout already active online (its own become inactive). Premium phones read and write the server directly (no offline copy; the workout in progress was already kept on the phone until it is sent). The web app (`web/`, https://app-fft.up.railway.app) needs an account: premium accounts get the full app on their online data; other accounts only see the Premium page (and can sign out); there is no account-less mode on the web. Catalogue exercises have the same ids on the server and on the phone (derived from the slug; `seed.sql` is applied by the server at every start).

## Still open

- Exercise images: 3 of the 12 PNGs are in (deadlift, bench press, back squat). Missing: incline-db-press, overhead-press, lateral-raise, cable-fly, pushdown, pull-up, barbell-row, lat-pulldown, biceps-curl, romanian-deadlift. Drop them in `assets/exercise-images/<slug>.png`, then `npm run db:seed` and `npm run db:images`.
- Apple / Google sign-in, light theme, "How to perform" section of exercise detail.
- Verified on a device: local notifications, camera / photo capture, biometrics, barcode scanner. The scanner works, but no products are linked to scanned barcodes yet.
