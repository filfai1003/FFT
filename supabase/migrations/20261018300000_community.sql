-- Community (DECISIONS 90): opt-in leaderboards, public profiles and friends.
-- * community_members: who joined, the name shown (the profile name), a random public id (never
--   the account id), a private invite code for friends, the level and earned badge ids.
-- * community_scores: one number per member, period (this week / this month), metric and subject
--   (strength: overall, a muscle group or an exercise). Relative scores only: workouts done, % of
--   days on the diet target, % of planned workouts done, % change of the estimated 1RM.
-- * friendships: a request from user_id to friend_id, pending or accepted.
-- Never shared: weight, measurements, photos, food or workout logs. The app computes the scores
-- on the device and sends them (community_submit): the server cannot compute them itself for an
-- account without a copy, with an encrypted copy or with some categories kept off the server.
-- The server checks every number (ranges, the days passed, jumps, rate) and refuses the whole
-- submission when one is impossible.
-- Every table is reachable only through the functions below (RLS: own rows only, no direct
-- writes). Leaving deletes the member, its scores and friendships in one transaction; deleting the
-- account cascades.

create table public.community_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  public_id    uuid not null unique default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  invite_code  text not null unique check (invite_code ~ '^[A-Za-z0-9-]{6,64}$'),
  level        integer not null default 1 check (level between 1 and 200),
  badges       text[] not null default '{}' check (cardinality(badges) <= 64),
  submitted_at timestamptz,
  joined_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table public.community_scores (
  user_id      uuid not null references auth.users (id) on delete cascade,
  period       text not null check (period in ('week', 'month')),
  period_start date not null,
  metric       text not null check (metric in ('workouts', 'diet', 'training', 'strength')),
  subject      text not null default ''
    check (subject ~ '^(|group:[a-z]{2,20}|exercise:[0-9a-f-]{36})$'),
  value        numeric(7, 1) not null,
  -- The value as it stood at the end of the previous day ("Up 3 places since yesterday").
  prev_value   numeric(7, 1),
  value_day    date not null default current_date,
  computed_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, period, period_start, metric, subject),
  check (metric = 'strength' or subject = '')
);
create index community_scores_board_idx
  on public.community_scores (period, period_start, metric, subject, value desc);
create index community_scores_age_idx on public.community_scores (period_start);

create table public.friendships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  friend_id  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (user_id <> friend_id)
);
create unique index friendships_pair_idx
  on public.friendships (least(user_id, friend_id), greatest(user_id, friend_id));
create index friendships_friend_idx on public.friendships (friend_id);

alter table public.community_members enable row level security;
create policy community_members_select_own on public.community_members
  for select to authenticated using (user_id = (select auth.uid()));
alter table public.community_scores enable row level security;
create policy community_scores_select_own on public.community_scores
  for select to authenticated using (user_id = (select auth.uid()));
alter table public.friendships enable row level security;
create policy friendships_select_own on public.friendships
  for select to authenticated
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));
-- No insert / update / delete policies: only the functions below write.

-- --- helpers -----------------------------------------------------------------------------------

/** First day of the week (Monday) or month containing a day. */
create or replace function public.community_period_start(p_period text, p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case when p_period = 'week' then date_trunc('week', p_day)::date
              else date_trunc('month', p_day)::date end;
$$;

/** The caller, who must be signed in and a member. */
create or replace function public.community_caller()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.community_members m where m.user_id = uid) then
    raise exception 'not a community member' using errcode = '42501';
  end if;
  return uid;
end;
$$;
revoke all on function public.community_caller() from public;
revoke execute on function public.community_caller() from anon, authenticated;

/** A random invite code: 8 letters and digits without look-alikes (0/O, 1/I/L). */
create or replace function public.community_new_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.community_members m where m.invite_code = code);
  end loop;
  return code;
end;
$$;
revoke all on function public.community_new_code() from public;
revoke execute on function public.community_new_code() from anon, authenticated;

create or replace function public.community_clean_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  n text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 40);
begin
  if length(n) < 1 then
    raise exception 'a name is needed' using errcode = '22023';
  end if;
  return n;
end;
$$;

-- --- joining, the name, leaving ----------------------------------------------------------------

/** Joins with the profile name (changing it later changes it here too: community_set_name). */
create or replace function public.community_join(p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.community_members (user_id, display_name, invite_code)
  values (uid, public.community_clean_name(p_name), public.community_new_code())
  on conflict (user_id) do update
    set display_name = excluded.display_name, updated_at = now();
  return public.community_me();
end;
$$;
revoke all on function public.community_join(text) from public;
grant execute on function public.community_join(text) to authenticated;
revoke execute on function public.community_join(text) from anon;

create or replace function public.community_set_name(p_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.community_members
  set display_name = public.community_clean_name(p_name), updated_at = now()
  where user_id = public.community_caller();
end;
$$;
revoke all on function public.community_set_name(text) from public;
grant execute on function public.community_set_name(text) to authenticated;
revoke execute on function public.community_set_name(text) from anon;

/** The caller's membership (null when not a member): name, public id, invite code, level, badges. */
create or replace function public.community_me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'public_id', m.public_id, 'name', m.display_name, 'invite_code', m.invite_code,
    'level', m.level, 'badges', to_jsonb(m.badges), 'joined_at', m.joined_at,
    'submitted_at', m.submitted_at)
  from public.community_members m where m.user_id = (select auth.uid());
$$;
revoke all on function public.community_me() from public;
grant execute on function public.community_me() to authenticated;
revoke execute on function public.community_me() from anon;

/** Leaves: the member row, every score and every friendship go, in this one transaction. */
create or replace function public.community_leave()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.friendships f where f.user_id = uid or f.friend_id = uid;
  delete from public.community_scores s where s.user_id = uid;
  delete from public.community_members m where m.user_id = uid;
end;
$$;
revoke all on function public.community_leave() from public;
grant execute on function public.community_leave() to authenticated;
revoke execute on function public.community_leave() from anon;

/** Everything the community holds about the caller (the data export, DECISIONS 83). */
create or replace function public.community_export()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'member', public.community_me(),
    'scores', (
      select coalesce(jsonb_agg(to_jsonb(s) - 'user_id' order by s.period_start, s.metric), '[]')
      from public.community_scores s where s.user_id = (select auth.uid())),
    'friends', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', m.display_name, 'status', f.status,
        'asked_by_you', f.user_id = (select auth.uid()), 'since', f.created_at)), '[]')
      from public.friendships f
      join public.community_members m
        on m.user_id = case when f.user_id = (select auth.uid()) then f.friend_id else f.user_id end
      where f.user_id = (select auth.uid()) or f.friend_id = (select auth.uid())));
$$;
revoke all on function public.community_export() from public;
grant execute on function public.community_export() to authenticated;
revoke execute on function public.community_export() from anon;

-- --- submitting scores -------------------------------------------------------------------------

/**
 * The app's numbers for the current week and month, with the level and badges:
 * p_scores = [{period, period_start, metric, subject, value}], at most 80.
 * Checks (one impossible number refuses everything, SQLSTATE 22023):
 * - period_start is the current week / month (a day of slack for time zones);
 * - workouts: whole number, at most 2 a day passed in the period;
 * - diet, training: 0–100 (%); strength: −50…+50 (%), and at most 15 points away from the
 *   previous value of the same period per day since it was sent (at least 15);
 * - level 1–200, at most 10 levels above the last one sent; badge ids [a-z0-9_], at most 64.
 * At most one submission a minute (54000). Also deletes this account's scores of periods that
 * ended more than 70 days ago, and anyone's pending friend requests older than 30 days.
 */
create or replace function public.community_submit(p_level integer, p_badges text[], p_scores jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  me public.community_members;
  s record;
  elapsed integer;
  old public.community_scores;
  days_since numeric;
begin
  select * into me from public.community_members m where m.user_id = uid for update;
  if me.submitted_at is not null and me.submitted_at > now() - interval '1 minute' then
    raise exception 'scores sent less than a minute ago' using errcode = '54000';
  end if;
  if p_level is null or p_level < 1 or p_level > 200
     or (me.submitted_at is not null and p_level > me.level + 10) then
    raise exception 'impossible level' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_badges, '{}')) > 64
     or exists (select 1 from unnest(coalesce(p_badges, '{}')) b where b !~ '^[a-z0-9_]{1,40}$') then
    raise exception 'impossible badges' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_scores, '[]')) <> 'array' or jsonb_array_length(coalesce(p_scores, '[]')) > 80 then
    raise exception 'at most 80 scores at a time' using errcode = '22023';
  end if;

  for s in
    select * from jsonb_to_recordset(coalesce(p_scores, '[]'))
      as x(period text, period_start date, metric text, subject text, value numeric)
  loop
    if s.period not in ('week', 'month') or s.value is null
       or s.period_start not in (
         public.community_period_start(s.period, current_date - 1),
         public.community_period_start(s.period, current_date),
         public.community_period_start(s.period, current_date + 1)) then
      raise exception 'not the current period' using errcode = '22023';
    end if;
    elapsed := greatest(1, least(current_date + 1, (
      case when s.period = 'week' then s.period_start + 7 else (s.period_start + interval '1 month')::date end
    ) - 1) - s.period_start + 1);
    if s.metric = 'workouts' then
      if s.value <> trunc(s.value) or s.value < 0 or s.value > 2 * elapsed then
        raise exception 'impossible number of workouts' using errcode = '22023';
      end if;
    elsif s.metric in ('diet', 'training') then
      if s.value < 0 or s.value > 100 then
        raise exception 'impossible percentage' using errcode = '22023';
      end if;
    elsif s.metric = 'strength' then
      if s.value < -50 or s.value > 50 then
        raise exception 'impossible strength change' using errcode = '22023';
      end if;
      select * into old from public.community_scores c
      where c.user_id = uid and c.period = s.period and c.period_start = s.period_start
        and c.metric = 'strength' and c.subject = coalesce(s.subject, '');
      if found then
        days_since := extract(epoch from (now() - old.computed_at)) / 86400;
        if abs(s.value - old.value) > greatest(15, 15 * days_since) then
          raise exception 'strength changed too fast' using errcode = '22023';
        end if;
      end if;
    else
      raise exception 'unknown metric' using errcode = '22023';
    end if;

    insert into public.community_scores as c
      (user_id, period, period_start, metric, subject, value, prev_value, value_day, computed_at)
    values (uid, s.period, s.period_start, s.metric, coalesce(s.subject, ''), round(s.value, 1),
            null, current_date, now())
    on conflict (user_id, period, period_start, metric, subject) do update
      set prev_value = case when c.value_day < current_date then c.value else c.prev_value end,
          value = excluded.value,
          value_day = current_date,
          computed_at = now(),
          updated_at = now();
  end loop;

  update public.community_members
  set level = p_level, badges = coalesce(p_badges, '{}'), submitted_at = now(), updated_at = now()
  where user_id = uid;

  delete from public.community_scores c where c.user_id = uid and c.period_start < current_date - 70;
  delete from public.friendships f where f.status = 'pending' and f.created_at < now() - interval '30 days';
end;
$$;
revoke all on function public.community_submit(integer, text[], jsonb) from public;
grant execute on function public.community_submit(integer, text[], jsonb) to authenticated;
revoke execute on function public.community_submit(integer, text[], jsonb) from anon;

-- --- reading -----------------------------------------------------------------------------------

/**
 * A leaderboard: everyone with a score for this period, metric and subject, best first. Returns
 * the total, the top p_limit and the caller's own row, each with the place now and at the end of
 * yesterday. Only names, levels, the public id and the score: never anything else.
 */
create or replace function public.community_leaderboard(
  p_period text, p_period_start date, p_metric text, p_subject text default '', p_limit integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
begin
  return (
    with board as (
      select s.user_id, s.value,
             case when s.value_day = current_date then coalesce(s.prev_value, s.value) else s.value end as was
      from public.community_scores s
      join public.community_members m on m.user_id = s.user_id
      where s.period = p_period and s.period_start = p_period_start
        and s.metric = p_metric and s.subject = coalesce(p_subject, '')),
    ranked as (
      select b.*, rank() over (order by b.value desc) as place,
             rank() over (order by b.was desc) as place_before
      from board b)
    select jsonb_build_object(
      'total', (select count(*) from ranked),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'public_id', m.public_id, 'name', m.display_name, 'level', m.level,
          'value', r.value, 'place', r.place, 'place_before', r.place_before,
          'is_me', r.user_id = uid) order by r.place, m.display_name)
        from ranked r join public.community_members m on m.user_id = r.user_id
        where r.place <= least(greatest(coalesce(p_limit, 8), 1), 50) or r.user_id = uid), '[]'))
  );
end;
$$;
revoke all on function public.community_leaderboard(text, date, text, text, integer) from public;
grant execute on function public.community_leaderboard(text, date, text, text, integer) to authenticated;
revoke execute on function public.community_leaderboard(text, date, text, text, integer) from anon;

/** A member's public page: name, level, badges, since when, this month's overall scores. */
create or replace function public.community_profile(p_public_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  target public.community_members;
  month_start date := public.community_period_start('month', current_date);
  week_start date := public.community_period_start('week', current_date);
begin
  if p_public_id is null then
    select * into target from public.community_members m where m.user_id = uid;
  else
    select * into target from public.community_members m where m.public_id = p_public_id;
  end if;
  if not found then
    raise exception 'no such member' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'public_id', target.public_id, 'name', target.display_name, 'level', target.level,
    'badges', to_jsonb(target.badges), 'joined_at', target.joined_at,
    'is_me', target.user_id = uid,
    'friend', (
      select case when f.status = 'accepted' then 'friends'
                  when f.user_id = uid then 'asked' else 'asked_you' end
      from public.friendships f
      where (f.user_id = uid and f.friend_id = target.user_id)
         or (f.friend_id = uid and f.user_id = target.user_id)),
    'scores', (
      -- top_pct: the share of members at this place or better (top 12% = among the best 12%).
      select coalesce(jsonb_agg(jsonb_build_object(
        'period', s.period, 'metric', s.metric, 'value', s.value,
        'place', c.better + 1, 'total', c.total,
        'top_pct', ceil(100.0 * (c.better + 1) / greatest(1, c.total)))), '[]')
      from public.community_scores s
      cross join lateral (
        select count(*) filter (where o.value > s.value) as better, count(*) as total
        from public.community_scores o
        where o.period = s.period and o.period_start = s.period_start and o.metric = s.metric
          and o.subject = '') c
      where s.user_id = target.user_id and s.subject = ''
        and ((s.period = 'month' and s.period_start = month_start)
          or (s.period = 'week' and s.period_start = week_start))));
end;
$$;
revoke all on function public.community_profile(uuid) from public;
grant execute on function public.community_profile(uuid) to authenticated;
revoke execute on function public.community_profile(uuid) from anon;

/**
 * Friends and requests: accepted friends (with a score when one is asked for), requests the
 * caller received and sent.
 */
create or replace function public.community_friends(
  p_period text default null, p_period_start date default null, p_metric text default null,
  p_subject text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'public_id', m.public_id, 'name', m.display_name, 'level', m.level,
      'status', case when f.status = 'accepted' then 'friends'
                     when f.user_id = uid then 'asked' else 'asked_you' end,
      'value', (
        select s.value from public.community_scores s
        where s.user_id = m.user_id and s.period = p_period and s.period_start = p_period_start
          and s.metric = p_metric and s.subject = coalesce(p_subject, '')))
      order by f.status, m.display_name)
    from public.friendships f
    join public.community_members m
      on m.user_id = case when f.user_id = uid then f.friend_id else f.user_id end
    where f.user_id = uid or f.friend_id = uid), '[]');
end;
$$;
revoke all on function public.community_friends(text, date, text, text) from public;
grant execute on function public.community_friends(text, date, text, text) to authenticated;
revoke execute on function public.community_friends(text, date, text, text) from anon;

-- --- friends -----------------------------------------------------------------------------------

/** Asks someone to be friends, by invite code or public id; accepts if they asked first. */
create or replace function public.community_add_friend(p_code text default null, p_public_id uuid default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  other uuid;
  existing public.friendships;
begin
  if p_code is not null then
    select m.user_id into other from public.community_members m
    where m.invite_code = upper(trim(p_code));
  else
    select m.user_id into other from public.community_members m where m.public_id = p_public_id;
  end if;
  if other is null then
    raise exception 'no member with this code' using errcode = 'P0002';
  end if;
  if other = uid then
    raise exception 'this is your own code' using errcode = '22023';
  end if;
  select * into existing from public.friendships f
  where (f.user_id = uid and f.friend_id = other) or (f.user_id = other and f.friend_id = uid);
  if found then
    if existing.status = 'pending' and existing.friend_id = uid then
      update public.friendships set status = 'accepted', updated_at = now() where id = existing.id;
      return 'friends';
    end if;
    return case when existing.status = 'accepted' then 'friends' else 'asked' end;
  end if;
  if (select count(*) from public.friendships f where f.user_id = uid and f.status = 'pending') >= 50 then
    raise exception 'too many requests waiting' using errcode = '54000';
  end if;
  if (select count(*) from public.friendships f where (f.user_id = uid or f.friend_id = uid)
        and f.status = 'accepted') >= 500 then
    raise exception 'at most 500 friends' using errcode = '54000';
  end if;
  insert into public.friendships (user_id, friend_id) values (uid, other);
  return 'asked';
end;
$$;
revoke all on function public.community_add_friend(text, uuid) from public;
grant execute on function public.community_add_friend(text, uuid) to authenticated;
revoke execute on function public.community_add_friend(text, uuid) from anon;

/** Accepts or declines a request someone sent to the caller. */
create or replace function public.community_answer_friend(p_public_id uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  other uuid := (select m.user_id from public.community_members m where m.public_id = p_public_id);
begin
  if p_accept then
    update public.friendships set status = 'accepted', updated_at = now()
    where user_id = other and friend_id = uid and status = 'pending';
  else
    delete from public.friendships
    where user_id = other and friend_id = uid and status = 'pending';
  end if;
end;
$$;
revoke all on function public.community_answer_friend(uuid, boolean) from public;
grant execute on function public.community_answer_friend(uuid, boolean) to authenticated;
revoke execute on function public.community_answer_friend(uuid, boolean) from anon;

/** Ends a friendship or withdraws a request, either side. */
create or replace function public.community_remove_friend(p_public_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  other uuid := (select m.user_id from public.community_members m where m.public_id = p_public_id);
begin
  delete from public.friendships
  where (user_id = uid and friend_id = other) or (user_id = other and friend_id = uid);
end;
$$;
revoke all on function public.community_remove_friend(uuid) from public;
grant execute on function public.community_remove_friend(uuid) to authenticated;
revoke execute on function public.community_remove_friend(uuid) from anon;
