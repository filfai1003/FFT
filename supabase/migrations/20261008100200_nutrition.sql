-- Nutrition: foods, recipes, food log, fixed meals, goals, water.
--
-- Logged values are COPIED at insert time (food_logs, fixed_meal_checks): editing a food or a
-- plan later never rewrites history.

-- ---------------------------------------------------------------------------
-- foods: global rows (owner_id null: Open Food Facts cache, written by an Edge Function with the
-- service role in Phase 3) + the user's custom foods.
-- ---------------------------------------------------------------------------
create table public.foods (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references auth.users (id) on delete cascade,
  barcode        text,
  name           text not null check (length(trim(name)) > 0),
  brand          text,
  kcal_100g      numeric(7, 2) not null check (kcal_100g >= 0),
  protein_100g   numeric(6, 2) not null default 0 check (protein_100g >= 0),
  carbs_100g     numeric(6, 2) not null default 0 check (carbs_100g >= 0),
  sugars_100g    numeric(6, 2) check (sugars_100g >= 0),
  fat_100g       numeric(6, 2) not null default 0 check (fat_100g >= 0),
  saturates_100g numeric(6, 2) check (saturates_100g >= 0),
  fiber_100g     numeric(6, 2) check (fiber_100g >= 0),
  salt_100g      numeric(6, 3) check (salt_100g >= 0),
  source         text not null default 'custom' check (source in ('off', 'custom')),
  -- Shown as the "Verified" mark in search results.
  verified       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  -- Global rows are only OFF imports; user rows are only custom foods.
  constraint foods_source_matches_owner check (
    (owner_id is null and source = 'off') or (owner_id is not null and source = 'custom')
  )
);

create index foods_barcode_idx on public.foods (barcode);
create index foods_owner_idx on public.foods (owner_id);
create index foods_name_trgm_idx on public.foods using gin (name extensions.gin_trgm_ops);
-- One global row per barcode.
create unique index foods_global_barcode_idx
  on public.foods (barcode) where owner_id is null and barcode is not null;

create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

-- Named portions ("1 slice = 30 g"). Visibility and ownership follow the food.
create table public.food_servings (
  id         uuid primary key default gen_random_uuid(),
  food_id    uuid not null references public.foods (id) on delete cascade,
  label      text not null check (length(trim(label)) > 0),
  grams      numeric(7, 2) not null check (grams > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index food_servings_food_idx on public.food_servings (food_id);

create trigger food_servings_set_updated_at
  before update on public.food_servings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------
create table public.recipes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  servings   numeric(5, 2) not null default 1 check (servings > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index recipes_user_idx on public.recipes (user_id);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  food_id    uuid not null references public.foods (id),
  grams      numeric(8, 2) not null check (grams > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index recipe_items_recipe_idx on public.recipe_items (recipe_id);

create trigger recipe_items_set_updated_at
  before update on public.recipe_items
  for each row execute function public.set_updated_at();

-- Calories and macros per serving, computed from the ingredients.
create view public.recipe_nutrition with (security_invoker = true) as
select
  r.id                                                           as recipe_id,
  r.user_id,
  r.servings,
  round(coalesce(sum(f.kcal_100g * i.grams / 100), 0) / r.servings, 1)    as kcal_per_serving,
  round(coalesce(sum(f.protein_100g * i.grams / 100), 0) / r.servings, 1) as protein_g_per_serving,
  round(coalesce(sum(f.carbs_100g * i.grams / 100), 0) / r.servings, 1)   as carbs_g_per_serving,
  round(coalesce(sum(f.fat_100g * i.grams / 100), 0) / r.servings, 1)     as fat_g_per_serving
from public.recipes r
left join public.recipe_items i on i.recipe_id = r.id and i.deleted_at is null
left join public.foods f on f.id = i.food_id
where r.deleted_at is null
group by r.id, r.user_id, r.servings;

-- ---------------------------------------------------------------------------
-- Food log (count-foods mode)
-- ---------------------------------------------------------------------------
create table public.food_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The user's local date, computed by the client with the profile time zone.
  day            date not null,
  meal           text not null check (meal in ('breakfast', 'lunch', 'snack', 'dinner')),
  -- Kept as references for "log again" / editing; both become null if the source is deleted.
  food_id        uuid references public.foods (id) on delete set null,
  recipe_id      uuid references public.recipes (id) on delete set null,
  -- Copied at insert time, so history never changes.
  name           text not null,
  quantity_label text,
  grams          numeric(8, 2) check (grams > 0),
  servings       numeric(6, 2) check (servings > 0),
  kcal           numeric(7, 1) not null check (kcal >= 0),
  protein_g      numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g        numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g          numeric(6, 1) not null default 0 check (fat_g >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint food_logs_amount_given check (grams is not null or servings is not null)
);

create index food_logs_user_day_idx on public.food_logs (user_id, day);

create trigger food_logs_set_updated_at
  before update on public.food_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Goals (with history: the one with the latest valid_from <= day applies)
-- ---------------------------------------------------------------------------
create table public.nutrition_goals (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  valid_from              date not null,
  -- Safety: never below 1500 kcal (also enforced in the app and for future AI plans).
  kcal                    integer not null check (kcal between 1500 and 10000),
  protein_g               integer not null check (protein_g >= 0),
  carbs_g                 integer not null check (carbs_g >= 0),
  fat_g                   integer not null check (fat_g >= 0),
  -- "Higher target on training days": extra kcal (as carbs) when a session is logged.
  training_day_bonus_kcal integer not null default 0 check (training_day_bonus_kcal >= 0),
  -- Maintenance (TDEE) the target was derived from; lets the DB refuse a deficit over 25%.
  maintenance_kcal        integer check (maintenance_kcal > 0),
  water_ml                integer not null default 2000 check (water_ml between 500 and 10000),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,
  constraint nutrition_goals_max_deficit check (
    maintenance_kcal is null or kcal >= maintenance_kcal * 0.75
  )
);

create index nutrition_goals_user_idx on public.nutrition_goals (user_id, valid_from desc);

create trigger nutrition_goals_set_updated_at
  before update on public.nutrition_goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Fixed meals mode
-- ---------------------------------------------------------------------------
create table public.fixed_meal_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  active     boolean not null default true,
  source     text not null default 'manual' check (source in ('manual', 'ai', 'nutritionist')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index fixed_meal_plans_one_active_idx
  on public.fixed_meal_plans (user_id) where active and deleted_at is null;

create trigger fixed_meal_plans_set_updated_at
  before update on public.fixed_meal_plans
  for each row execute function public.set_updated_at();

create table public.fixed_meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id     uuid not null references public.fixed_meal_plans (id) on delete cascade,
  position    integer not null check (position >= 0),
  name        text not null check (length(trim(name)) > 0),
  kcal        integer not null check (kcal >= 0),
  protein_g   numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g     numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g       numeric(6, 1) not null default 0 check (fat_g >= 0),
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index fixed_meals_plan_idx on public.fixed_meals (plan_id, position);

create trigger fixed_meals_set_updated_at
  before update on public.fixed_meals
  for each row execute function public.set_updated_at();

-- One check per meal per day (done as planned / adjusted amounts / skipped). Values copied.
create table public.fixed_meal_checks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day           date not null,
  fixed_meal_id uuid not null references public.fixed_meals (id),
  status        text not null check (status in ('done', 'adjusted', 'skipped')),
  kcal          integer not null default 0 check (kcal >= 0),
  protein_g     numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g       numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g         numeric(6, 1) not null default 0 check (fat_g >= 0),
  checked_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index fixed_meal_checks_one_per_day_idx
  on public.fixed_meal_checks (user_id, day, fixed_meal_id) where deleted_at is null;
create index fixed_meal_checks_user_day_idx on public.fixed_meal_checks (user_id, day);

create trigger fixed_meal_checks_set_updated_at
  before update on public.fixed_meal_checks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Water
-- ---------------------------------------------------------------------------
create table public.water_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  ml         integer not null check (ml > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index water_logs_user_day_idx on public.water_logs (user_id, day);

create trigger water_logs_set_updated_at
  before update on public.water_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Today, the diary and the charts read ONLY from here: both modes in one view.
-- ---------------------------------------------------------------------------
create view public.daily_nutrition_totals with (security_invoker = true) as
select user_id, day,
       sum(kcal)      as kcal,
       sum(protein_g) as protein_g,
       sum(carbs_g)   as carbs_g,
       sum(fat_g)     as fat_g
from (
  select user_id, day, kcal, protein_g, carbs_g, fat_g
  from public.food_logs
  where deleted_at is null
  union all
  select user_id, day, kcal, protein_g, carbs_g, fat_g
  from public.fixed_meal_checks
  where deleted_at is null and status in ('done', 'adjusted')
) entries
group by user_id, day;
