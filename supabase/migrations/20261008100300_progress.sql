-- Progress: body metrics, body goals, photos.

create table public.body_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  weight_kg   numeric(5, 2) check (weight_kg between 20 and 500),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 2 and 70),
  -- How body fat was measured: smart scale, calipers, or tape-measure estimate.
  bf_method   text check (bf_method in ('scale', 'calipers', 'tape', 'other')),
  waist_cm    numeric(5, 1) check (waist_cm > 0),
  hips_cm     numeric(5, 1) check (hips_cm > 0),
  chest_cm    numeric(5, 1) check (chest_cm > 0),
  arm_cm      numeric(5, 1) check (arm_cm > 0),
  thigh_cm    numeric(5, 1) check (thigh_cm > 0),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index body_metrics_user_day_idx on public.body_metrics (user_id, day desc);

create trigger body_metrics_set_updated_at
  before update on public.body_metrics
  for each row execute function public.set_updated_at();

-- Weight / body fat targets (Body weight screen shows progress to the goal as a dot bar).
create table public.body_goals (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  valid_from            date not null,
  start_weight_kg       numeric(5, 2) check (start_weight_kg between 20 and 500),
  target_weight_kg      numeric(5, 2) check (target_weight_kg between 20 and 500),
  target_body_fat_pct   numeric(4, 1) check (target_body_fat_pct between 2 and 70),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create index body_goals_user_idx on public.body_goals (user_id, valid_from desc);

create trigger body_goals_set_updated_at
  before update on public.body_goals
  for each row execute function public.set_updated_at();

-- Private photos. storage_path is "<user_id>/<file>" in the private `progress-photos` bucket and
-- is only ever shown through signed URLs.
create table public.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day          date not null,
  pose         text not null check (pose in ('front', 'side', 'back')),
  storage_path text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint progress_photos_own_folder check (storage_path like user_id::text || '/%')
);

create index progress_photos_user_day_idx on public.progress_photos (user_id, day desc);

create trigger progress_photos_set_updated_at
  before update on public.progress_photos
  for each row execute function public.set_updated_at();
