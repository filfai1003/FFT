# Project: training and diet app (freemium SaaS)

Complete reference document. All the product, design and data decisions made during the design phase. The approved design is in `docs/design/` and takes precedence over any personal interpretation.

---

## 1. Product

An app to manage **training, diet and progress**, with a **freemium** model.

- **Free (built now, must be complete):** workout plans and sessions, diet in two modes, progress (strength, weight, body fat, measurements, photos), profile and settings.
- **Premium (NOT now, but the architecture must allow for it):** widgets, integrations (Apple Health, Health Connect, Garmin, Strava), AI-generated plans, a marketplace of verified trainers and nutritionists (sharing of plans, diet, data, photo check-ins, chat).

Constraints to keep in mind:
- In Italy personal trainers cannot prescribe diets: the future marketplace needs distinct roles (trainer / nutritionist) with credential verification.
- Weight, diet and photos are **health data (GDPR art. 9)**: explicit and revocable consent, encryption, full export and deletion.
- Diet safety limits: no target below 1500 kcal and no deficit above 25% (this also applies to future AI plans).

**Interface language: English.** All text goes through an i18n system (no hardcoded strings) so other languages can be added. Code, tables and variables in English.

---

## 2. Stack

- **App:** Expo (React Native) + strict TypeScript + Expo Router. iOS and Android first, web from the same codebase.
- **Backend:** Supabase (Postgres, Auth, Storage, Row Level Security). Versioned SQL migrations in `supabase/migrations`, local development with the Supabase CLI.
- **Client data:** TanStack Query with optimistic updates. **The workout session works offline**: local save on every change and sync when the network returns. For Phase 1 a persistent local queue is enough; propose if and when to move to a local-first solution (PowerSync, expo-sqlite + sync).
- **Foods:** Open Food Facts as the external source. What is not in our DB is searched there and saved in `foods` with `source = 'off'`; later searches stay internal.
- **Fonts:** Doto, Space Grotesk, Space Mono (Google Fonts, OFL licence). Use the `@expo-google-fonts/*` packages if they exist for all three, otherwise include the TTFs in the repo.
- **Quality:** ESLint + Prettier; tests for the domain logic (calories and macros, energy needs, maxes, strength score, plan rotation, unit conversions).

If a choice looks wrong to you, tell me and explain why **before** changing it.

---

## 3. Design: where to look

- `docs/design/screens/*.dc.html`: **one file per screen**, 390×844 phone. It is HTML with inline styles: colours, sizes, texts and structure are **the source of truth**. The `<sc-for>`, `<sc-if>` tags and `{{placeholders}}` are templates: the sample data lives in the `renderVals()` function of the script at the bottom of the file. `<dc-import name="ExerciseIcon">` is the exercise image component (`ExerciseIcon.dc.html`). **Do not copy the HTML**: rebuild it in React Native using the tokens.
- `docs/design/SCREENS.md`: index of the screens with the English name, the proposed Expo Router route and the presentation type (tab, push, modal, sheet).
- `docs/design/NAVIGATION.md`: navigation graph (which control leads to which screen).
- `docs/design/tokens.json`: colours, fonts, type scale, radii, spacing, touch sizes, safe areas and base components.
- `docs/design/screenshots/` (if present): PNGs exported from the canvas for a quick visual reference.
- The three maps (`*Map.dc.html`) are reference diagrams, not screens.

### Visual language (Nothing-inspired)
Monochrome, pure black with a barely visible dot grid, dot-matrix type for numbers and titles, **a single accent** (red #D71921 by default, user-selectable). The distinctive component is the **dot bar**, used for calories, macros, water, rest and session progress, plus the dot column charts. **No solid white blocks**: selection is shown with a white border.

### Ergonomics and accessibility rules (mandatory)
1. **Touch targets ≥ 44×44** on every control (Apple 44 pt, Android 48 dp; WCAG 2.2 minimum 24 px). Primary buttons 56 high, list rows ≥ 52.
2. **Safe areas** always respected (`react-native-safe-area-context`). No fake status bar.
3. **Thumb zone:** the main action of forms and editors is a large button pinned to the bottom with a precise label ("Save day", "Save check-in"…). "Cancel"/close sit at the top left. Risky actions (e.g. the session's "Finish") deliberately stay at the top; destructive ones are at the bottom of the page, never pinned and always with confirmation.
4. **Contrast:** text ≥ 4.5:1; control borders and states ≥ 3:1 (control border #6E6E6E). Main text #F2F2F2 on black.
5. **Typography:** minimum 11 px; input fields at 16 px; uppercase only for short labels; support for the system text size (Dynamic Type / font scale) without breaking layouts.
6. **Navigation bar and action bars fixed at the bottom**: content scrolls underneath.
7. **Error prevention:** every important action can be undone (toast with UNDO for ~5 s: set ticked, meal ticked, item deleted). Moving between exercises never loses data. "Finish" asks for confirmation.
8. **Accessibility settings respected throughout the app** (see §5.5): larger and bold text, numbers without dot matrix, high contrast, reduced motion, haptics, one-hand mode, spoken countdown.
9. Every icon-only control has a screen reader label. Never use colour alone to convey a state.

---

## 4. Navigation

Bottom bar with 5 tabs: **Today · Train · Diet · Progress · Profile** (uppercase Space Mono labels; the active tab is white with an accent dot underneath).

- The bar is visible on browsing pages and hidden on editing or in-progress ones (editor, picker, active session, summary, check-in, scanner).
- The active session can be minimised (down arrow): it keeps running in the background and is resumed from Today or Train.
- Full graph in `docs/design/NAVIGATION.md`.

---

## 5. Features and rules

### 5.1 Today (`Main`)
Remaining calories (dot bar) and macros; today's workout with "Start" and "Train a different day"; quick actions for meals, weight and water.

### 5.2 Train
**Screens:** My plans, Plan detail, Day editor, Pick exercises, Create exercise, Exercise library, Exercise detail, Active session, Finish confirmation, Session summary, History, Session detail.

**Plan rotation and out-of-order workouts**
- A plan has N ordered days. A **cycle** is complete when every day has been done once.
- The suggested day ("Up next") is **the first day, in plan order, not yet done in the current cycle**.
- The user can start **any day at any time** (play button on every day, "Train a different day") or an **Empty workout**. A day done out of order counts as done in the cycle and is marked "Out of order" in the history. Example: cycle Pull, Push, Legs, Upper; Pull and then Legs are done, so "Up next" stays Push.
- When all days are done, the next cycle starts.

**Active session:** loads prefilled from the previous session; the rest timer starts when a set is ticked; Previous/Next always at the bottom; continuous local saving; resume after a crash or closing the app.

**Maxes (per exercise)**
- **Actual max:** the heaviest weight ever logged in a completed set, regardless of reps.
- **Estimated 1RM:** Epley formula, `weight × (1 + reps / 30)`, computed for every completed set with reps ≤ 12 (above that it is unreliable, so it is ignored); the highest value is kept. With reps = 1 it is the weight itself.
- The exercise detail shows both; the chart switches between them. The summary's records distinguish "NEW MAX" from "NEW EST. 1RM".

**Exercise images:** every exercise has an (square) image field. The images of the main exercises are provided by the project owner (list and file names in `ExerciseIcons.dc.html`, 512×512 PNG with a dark or transparent background). Without an image the dashed placeholder tile is shown. Exercises created by the user can also have an image.

### 5.3 Diet
**Two modes**, chosen in onboarding and changeable from "Goals & mode":
1. **Count foods** (`FoodLog`): log per meal; search, barcode, servings, recipes, custom foods.
2. **Fixed meals** (`FoodLogFixed`): preset meals with kcal/macros and a description; each day you tick the meal you ate. Tapping the meal opens **Adjust a meal**: eaten as planned / different amount (actual values) / log the foods for that meal / skipped. It applies to that day only.

The two modes share goals, totals, charts and Today.

**Screens:** Food log ×2, Food search (Results / Recent / Mine / Recipes), Barcode scanner, Food detail, Create food, Recipes, Recipe editor, Goals & mode, Fixed meals editor, Adjust a meal.

**Rules:**
- Every logged entry **copies** the nutritional values at insertion time.
- Recipes compute kcal and macros per serving from their ingredients.
- Energy needs are computed with Mifflin-St Jeor × activity factor; the user can change them within the safety limits; option "Higher target on training days" (+ carbohydrates when a session is logged).
- "Auto-split" distributes the target across the fixed meals.

### 5.4 Progress
**Screens:** Progress (overview with period 4 WK / 12 WK / 1 YR / ALL), Strength, Muscle group detail, Body weight, Body fat & measurements, Photos, Compare photos, Check-in.

- **Strength score (overall):** average of the % change in Estimated 1RM of every exercise trained in the period (latest value versus the first of the period), **weighted by the number of sets** of that exercise.
- **Per muscle group:** same formula over the exercises whose *primary muscle* belongs to that group (17 muscles, DECISIONS 125). Groups: Chest, Back, Shoulders, Legs, Arms, Core.
- **Per exercise:** change in Estimated 1RM (before → now).
- **Weight:** chart of weekly averages, 7-day moving average, goal with a dot bar.
- **Body fat:** percentage, lean and fat mass computed from the weight, saved measurement method (scale, calipers, tape estimate). Measurements: waist, hips, chest, arm, thigh.
- **Photos:** front / side / back poses per check-in; side-by-side or slider comparison; private (private bucket with signed URLs), blurred until tapped and lockable with Face ID or a passcode. The camera shows the outline of the previous photo.
- **Check-in:** weight, body fat, measurements, 3 photos and notes; everything optional.

### 5.5 Profile
**Screens:** Profile, Personal info, Settings, Accessibility, Privacy & data. "Diet goals & mode" reuses the screen from the Diet section.

- **Personal info:** name, date of birth, height, sex (for the formula), daily activity, experience, where you train. If they change, new targets are **proposed** but not applied without confirmation.
- **Settings:** units (kg/lb, cm/ft·in, kcal/kJ, week start), accent colour (6 options), theme (Dark; Light and System planned but the light theme is not designed yet), language, notifications (end of rest, workout reminder, weekly check-in, meals).
- **Accessibility:** text size, bold text, dot-matrix numbers on/off, high contrast, reduced motion, haptics, one-hand mode in the gym, spoken rest countdown.
- **Privacy & data:** full export (ZIP: JSON + CSV + photos) and workouts-only CSV; photo blur and lock; anonymous statistics (off by default); sharing with a coach (premium, off); withdrawal of consent to health data; account deletion (everything removed within 30 days, with strong confirmation).

### 5.6 Onboarding (not designed yet)
Sign-up (email, Apple, Google), goal, body data, activity and experience, energy needs calculation, choice of diet mode (for fixed meals, setting up the meals with a proposed split), explicit consent to health data. **Propose the screens yourself following the same design system and show them before implementing.**

### 5.7 Premium (showcase only for now)
"Premium" card in the profile and disabled premium rows. No feature is locked in the free version.

---

## 6. Database (Postgres / Supabase)

### User and settings
- `profiles` (id = auth user id, name, birth_date, sex, height_cm, activity_level, experience, training_location, timezone, diet_mode `'tracking'|'fixed_meals'`, created_at)
- `user_settings` (user_id, weight_unit, length_unit, energy_unit, week_start, accent, theme, language, text_scale, bold_text, dot_numbers, high_contrast, reduce_motion, haptics, one_hand_mode, spoken_countdown, notifications jsonb)
- `consents` (id, user_id, type `'health_data'|'analytics'`, granted_at, withdrawn_at)

### Training
- `exercises` (id, owner_id null = catalogue, name, primary_muscle (one of 17), secondary_muscles text[] (½ set), indirect_muscles text[] (¼ set; DECISIONS 125), equipment, log_type `'weight_reps'|'reps'|'time'|'distance_time'`, image_path)
- `workout_plans` (id, user_id, name, goal, active, source `'manual'|'ai'|'trainer'`)
- `plan_days` (id, plan_id, position, name)
- `plan_exercises` (id, plan_day_id, exercise_id, position, target_sets, target_reps text, rest_s, notes)
- `workout_sessions` (id, user_id, plan_id null, plan_day_id null, cycle_number null, out_of_order bool, started_at, ended_at, feeling 1–5, notes, status `'active'|'done'|'discarded'`)
- `session_sets` (id, session_id, exercise_id, set_index, weight_kg, reps, duration_s, distance_m, completed_at)
- Views: `exercise_records` (actual max, best Epley per exercise), `strength_by_period` (overall and per-group score).

### Nutrition
- `foods` (id, owner_id null = global, barcode, name, brand, kcal_100g, protein_100g, carbs_100g, sugars_100g, fat_100g, saturates_100g, fiber_100g, salt_100g, source `'off'|'custom'`, verified)
- `food_servings` (id, food_id, label, grams)
- `food_logs` (id, user_id, day, meal, food_id null, recipe_id null, grams | servings, kcal, protein_g, carbs_g, fat_g **copied**)
- `recipes` (id, user_id, name, servings) + `recipe_items` (recipe_id, food_id, grams)
- `nutrition_goals` (id, user_id, valid_from, kcal, protein_g, carbs_g, fat_g, training_day_bonus_kcal)
- `fixed_meal_plans` (id, user_id, name, active, source) + `fixed_meals` (id, plan_id, position, name, kcal, protein_g, carbs_g, fat_g, description)
- `fixed_meal_checks` (id, user_id, day, fixed_meal_id, status `'done'|'adjusted'|'skipped'`, kcal, protein_g, carbs_g, fat_g **copied**, checked_at)
- `water_logs` (id, user_id, day, ml)
- View `daily_nutrition_totals` = `food_logs` + `fixed_meal_checks` (done/adjusted) per day: Today, the log and the charts read only from here.

### Progress
- `body_metrics` (id, user_id, day, weight_kg, body_fat_pct, bf_method, waist_cm, hips_cm, chest_cm, arm_cm, thigh_cm, notes)
- `progress_photos` (id, user_id, day, pose `'front'|'side'|'back'`, storage_path)

### Rules for all tables
1. Catalogue and personal data in the same table (`owner_id` null = public). RLS: everyone reads the public rows and their own, and writes only their own.
2. Units are always metric in the DB; conversions happen only in the interface.
3. `day` is the user's local date, computed with their time zone at insertion time.
4. Goals with history (`valid_from`).
5. Records and scores are computed with views, not stored.
6. Ready for offline sync: client-generated UUIDs, `created_at`, `updated_at`, `deleted_at` everywhere.
7. `source` field on plans (manual/ai/trainer). `coach_clients` and `messages` can be added later without touching the existing tables.
8. Photos and images in Storage buckets: progress photos in a **private bucket** with signed URLs; catalogue exercise images in a public bucket.
9. Indexes on frequent queries: `food_logs(user_id, day)`, `session_sets(session_id)`, `session_sets(exercise_id)`, `foods(barcode)`, text search on `foods.name` and `exercises.name`.

---

## 7. Development plan

- **Phase 0 – Foundations:** repo, Expo + TS + Expo Router, lint, local Supabase, full migration with RLS, exercise seed (≥ 60 with muscles and equipment), **design system in code** (tokens from `tokens.json`, fonts, components: Screen with safe area and dot background, Card, Button, IconButton, Chip, Segmented, Toggle, Input, Stepper, DotBar, DotColumnChart, TabBar, BottomActionBar, Sheet, Toast with Undo, ExerciseImage) and a component catalogue page to check them.
- **Phase 1 – Account and onboarding:** auth, onboarding proposal and implementation, energy needs calculation, consent.
- **Phase 2 – Training:** library, plans, editor, **offline active session**, cycle rotation, summary, history, maxes.
- **Phase 3 – Diet:** fixed meals first (simpler), then food counting, Open Food Facts and barcode, custom foods, recipes, goals.
- **Phase 4 – Today and Progress:** home, strength (overall, per group, per exercise), weight, body fat and measurements, photos and comparison, check-in.
- **Phase 5 – Profile and compliance:** settings, accessibility, export, consents, account deletion.
- **Later:** light theme, premium (subscriptions, widgets, integrations, AI), marketplace.

---

## 8. How to work

1. **Do not write code right away.** Read this document and `docs/design/` (at least SCREENS.md, NAVIGATION.md, tokens.json and a handful of screens), then reply with:
   - doubts or points to change;
   - the folder structure;
   - the detailed plan for **Phase 0** in small, verifiable steps.
2. Wait for my confirmation. Then proceed one step at a time: at the end of each step tell me what you did, how to verify it, and make a commit.
3. Keep `CLAUDE.md` up to date with the essential rules (stack, commands, conventions, tokens, DB rules, ergonomics rules).
4. For decisions that are expensive to change (sync, navigation, auth, data structure), ask me first.
5. When you implement a screen, open its `.dc.html` file and respect texts, hierarchy, sizes and states. If something in the design is inconsistent or impossible, tell me instead of improvising.
6. No premium, AI or trainers now, but no choices that make them difficult.
7. When you make a non-obvious technical choice, explain it in two lines.
