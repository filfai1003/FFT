-- Community profile customisation for Supporter and Premium (DECISIONS 119).
-- * community_members gets a personal colour, a frame style, a title (curated list, no free text:
--   nothing to moderate), a showcase badge (one of the member's earned badges) and a profile photo
--   (path in the new public-read bucket `community-avatars`, "<public_id>/<random>.jpg").
-- * Setting any of them needs plan_of(caller) in ('supporter', 'premium') (42501); clearing them
--   (all null, or removing the photo) is always allowed. Values outside the lists are 22023.
-- * Others see them only while the member is Supporter or Premium: hidden at read time
--   (community_look), never deleted, so they come back when the plan does.
-- * community_me / community_leaderboard / community_friends / community_profile return the look
--   (same signatures: old apps keep working and ignore the new key); community_export shows the
--   member's own values through community_me.
-- * Photos: the bucket checks the size (256 KB) and the type (JPEG / WebP) on upload; only the
--   member writes and deletes its own folder (by public_id, never the account id, since the
--   bucket is public). A replaced or removed photo, leaving the community, deleting the account and
--   an admin removal queue the old file in files_to_delete (removed by the api service through the
--   storage API, as for purged rows: DECISIONS 98); the app also removes it at once when it can.

-- --- columns ------------------------------------------------------------------------------------

alter table public.community_members
  add column profile_colour text
    check (profile_colour in ('ember', 'amber', 'lime', 'forest', 'ocean', 'indigo', 'violet', 'rose')),
  add column frame text check (frame in ('solid', 'double', 'dashed', 'dotted')),
  add column title text check (title in (
    'beginner', 'comeback', 'habit', 'powerlifter', 'bodybuilder', 'weightlifter', 'strongman',
    'runner', 'cyclist', 'swimmer', 'climber', 'calisthenics', 'crossfit', 'yoga', 'hiker',
    'home_gym', 'coach', 'athlete')),
  add column showcase_badge text check (showcase_badge ~ '^[a-z0-9_]{1,40}$'),
  add column photo_path text check (photo_path ~ '^[0-9a-f-]{36}/[a-z0-9-]{8,64}\.(jpg|webp)$'),
  add constraint community_members_photo_own
    check (photo_path is null or split_part(photo_path, '/', 1) = public_id::text);

-- --- the bucket ---------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-avatars', 'community-avatars', true, 262144, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/**
 * Is this file in the caller's own avatar folder ("<the caller's public_id>/<name>.jpg|webp")?
 * With p_write: also Supporter or Premium (uploading needs the plan, removing never does).
 */
create or replace function public.community_avatar_ok(p_name text, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_name ~ '^[0-9a-f-]{36}/[a-z0-9-]{8,64}\.(jpg|webp)$', false)
    and exists (
      select 1 from public.community_members m
      where m.user_id = (select auth.uid()) and m.public_id::text = split_part(p_name, '/', 1))
    and (not p_write or public.plan_of((select auth.uid())) in ('supporter', 'premium'));
$$;
revoke all on function public.community_avatar_ok(text, boolean) from public;
grant execute on function public.community_avatar_ok(text, boolean) to authenticated;
revoke execute on function public.community_avatar_ok(text, boolean) from anon;

-- Reading goes through the public URL (public bucket); listing is the owner's only.
create policy community_avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'community-avatars' and public.community_avatar_ok(name, false));
create policy community_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'community-avatars' and public.community_avatar_ok(name, true));
create policy community_avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'community-avatars' and public.community_avatar_ok(name, true))
  with check (bucket_id = 'community-avatars' and public.community_avatar_ok(name, true));
create policy community_avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'community-avatars' and public.community_avatar_ok(name, false));

-- --- files of old photos ------------------------------------------------------------------------

alter table public.files_to_delete drop constraint files_to_delete_bucket_check;
alter table public.files_to_delete add constraint files_to_delete_bucket_check
  check (bucket in ('progress-photos', 'user-exercise-images', 'vault-files', 'community-avatars'));

/** A photo replaced or removed, a member leaving or deleted: its file is queued for removal. */
create or replace function public.community_queue_old_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.photo_path is not null
     and (tg_op = 'DELETE' or old.photo_path is distinct from new.photo_path) then
    insert into public.files_to_delete (bucket, path) values ('community-avatars', old.photo_path)
    on conflict (bucket, path) do nothing;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.community_queue_old_photo() from public;
revoke execute on function public.community_queue_old_photo() from anon, authenticated;

create trigger community_members_queue_photo
  after update of photo_path or delete on public.community_members
  for each row execute function public.community_queue_old_photo();

-- --- what others see ----------------------------------------------------------------------------

/**
 * A member's look as others see it: colour, frame, title, showcase badge (only while still among
 * its earned badges) and photo path; null when nothing is set or the member is no longer
 * Supporter / Premium (hidden, not deleted).
 */
create or replace function public.community_look(m public.community_members)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.plan_of(m.user_id) in ('supporter', 'premium') then
    nullif(jsonb_strip_nulls(jsonb_build_object(
      'colour', m.profile_colour, 'frame', m.frame, 'title', m.title,
      'badge', case when m.showcase_badge = any (m.badges) then m.showcase_badge end,
      'photo', m.photo_path)), '{}'::jsonb)
  end;
$$;
revoke all on function public.community_look(public.community_members) from public;
revoke execute on function public.community_look(public.community_members) from anon, authenticated;

-- --- setting it ---------------------------------------------------------------------------------

/**
 * Sets the caller's colour, frame, title and showcase badge (null = none). Anything set needs
 * Supporter or Premium (42501); all null (back to the defaults) is always allowed. Values outside
 * the lists, or a badge the member has not earned (sent with its scores), are refused (22023).
 */
create or replace function public.community_set_cosmetics(
  p_colour text default null, p_frame text default null, p_title text default null,
  p_badge text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  me public.community_members;
begin
  if coalesce(p_colour, p_frame, p_title, p_badge) is not null
     and public.plan_of(uid) not in ('supporter', 'premium') then
    raise exception 'profile colours, frames, titles and badges need Supporter or Premium'
      using errcode = '42501';
  end if;
  if p_colour is not null
     and p_colour not in ('ember', 'amber', 'lime', 'forest', 'ocean', 'indigo', 'violet', 'rose') then
    raise exception 'not a profile colour' using errcode = '22023';
  end if;
  if p_frame is not null and p_frame not in ('solid', 'double', 'dashed', 'dotted') then
    raise exception 'not a frame' using errcode = '22023';
  end if;
  if p_title is not null and p_title not in (
    'beginner', 'comeback', 'habit', 'powerlifter', 'bodybuilder', 'weightlifter', 'strongman',
    'runner', 'cyclist', 'swimmer', 'climber', 'calisthenics', 'crossfit', 'yoga', 'hiker',
    'home_gym', 'coach', 'athlete') then
    raise exception 'not a title' using errcode = '22023';
  end if;
  select * into me from public.community_members m where m.user_id = uid;
  if p_badge is not null and not (p_badge = any (me.badges)) then
    raise exception 'not an earned badge' using errcode = '22023';
  end if;
  update public.community_members
  set profile_colour = p_colour, frame = p_frame, title = p_title, showcase_badge = p_badge,
      updated_at = now()
  where user_id = uid;
  return public.community_me();
end;
$$;
revoke all on function public.community_set_cosmetics(text, text, text, text) from public;
grant execute on function public.community_set_cosmetics(text, text, text, text) to authenticated;
revoke execute on function public.community_set_cosmetics(text, text, text, text) from anon;

/**
 * Sets the caller's photo to a file it uploaded ("<public_id>/<name>.jpg|webp" in
 * community-avatars; it must exist), or removes it (null, always allowed). Setting needs Supporter
 * or Premium (42501). The previous file is queued for removal (trigger); setting a queued file
 * again (undo) takes it off the queue.
 */
create or replace function public.community_set_photo(p_path text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  pid text := (select m.public_id::text from public.community_members m where m.user_id = uid);
begin
  if p_path is not null then
    if public.plan_of(uid) not in ('supporter', 'premium') then
      raise exception 'a profile photo needs Supporter or Premium' using errcode = '42501';
    end if;
    if p_path !~ '^[0-9a-f-]{36}/[a-z0-9-]{8,64}\.(jpg|webp)$' or split_part(p_path, '/', 1) <> pid then
      raise exception 'not a photo of yours' using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o where o.bucket_id = 'community-avatars' and o.name = p_path) then
      raise exception 'the photo was not uploaded' using errcode = '22023';
    end if;
    -- Undo of a removal (the app's toast): the file is in use again, so off the removal queue.
    delete from public.files_to_delete f where f.bucket = 'community-avatars' and f.path = p_path;
  end if;
  update public.community_members set photo_path = p_path, updated_at = now() where user_id = uid;
  return public.community_me();
end;
$$;
revoke all on function public.community_set_photo(text) from public;
grant execute on function public.community_set_photo(text) to authenticated;
revoke execute on function public.community_set_photo(text) from anon;

-- --- reading, now with the look -----------------------------------------------------------------

/** The caller's membership: its own values (even when hidden from others) and the look shown. */
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
    'submitted_at', m.submitted_at, 'country', m.country, 'age_group', m.age_group,
    'weight_class', m.weight_class, 'profile_colour', m.profile_colour, 'frame', m.frame,
    'title', m.title, 'showcase_badge', m.showcase_badge, 'photo_path', m.photo_path,
    'look', public.community_look(m))
  from public.community_members m where m.user_id = (select auth.uid());
$$;
revoke all on function public.community_me() from public;
grant execute on function public.community_me() to authenticated;
revoke execute on function public.community_me() from anon;

/** Same as in 20261020120000_community_audiences.sql, each row with the member's look. */
create or replace function public.community_leaderboard(
  p_period text, p_period_start date, p_metric text, p_subject text default '',
  p_limit integer default 8, p_audience text default 'everyone')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  aud text := coalesce(p_audience, 'everyone');
  me public.community_members;
begin
  if aud not in ('everyone', 'friends', 'country', 'class') then
    raise exception 'unknown audience' using errcode = '22023';
  end if;
  if aud <> 'everyone' and public.plan_of(uid) not in ('supporter', 'premium') then
    raise exception 'comparing with friends, country or class needs Supporter or Premium'
      using errcode = '42501';
  end if;
  select * into me from public.community_members m where m.user_id = uid;
  if aud = 'country' and me.country is null then
    return jsonb_build_object('audience', aud, 'total', 0, 'rows', '[]'::jsonb,
                              'reason', 'no_country');
  end if;
  if aud = 'class' and (me.age_group is null or me.weight_class is null) then
    return jsonb_build_object('audience', aud, 'total', 0, 'rows', '[]'::jsonb,
                              'reason', 'no_class');
  end if;
  return (
    with members as (
      select m.user_id from public.community_members m
      where aud = 'everyone'
         or (aud = 'friends' and (m.user_id = uid or exists (
              select 1 from public.friendships f
              where f.status = 'accepted'
                and ((f.user_id = uid and f.friend_id = m.user_id)
                  or (f.friend_id = uid and f.user_id = m.user_id)))))
         or (aud = 'country' and m.country = me.country)
         or (aud = 'class' and m.age_group = me.age_group and m.weight_class = me.weight_class)),
    board as (
      select s.user_id, s.value,
             case when s.value_day = current_date then coalesce(s.prev_value, s.value) else s.value end as was
      from public.community_scores s
      join members a on a.user_id = s.user_id
      where s.period = p_period and s.period_start = p_period_start
        and s.metric = p_metric and s.subject = coalesce(p_subject, '')),
    ranked as (
      select b.*, rank() over (order by b.value desc) as place,
             rank() over (order by b.was desc) as place_before
      from board b)
    select jsonb_build_object(
      'audience', aud,
      'country', case when aud = 'country' then me.country end,
      'age_group', case when aud = 'class' then me.age_group end,
      'weight_class', case when aud = 'class' then me.weight_class end,
      'total', (select count(*) from ranked),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'public_id', m.public_id, 'name', m.display_name, 'level', m.level,
          'value', r.value, 'place', r.place, 'place_before', r.place_before,
          'is_me', r.user_id = uid, 'look', public.community_look(m))
          order by r.place, m.display_name)
        from ranked r join public.community_members m on m.user_id = r.user_id
        where r.place <= least(greatest(coalesce(p_limit, 8), 1), 50) or r.user_id = uid), '[]'))
  );
end;
$$;
revoke all on function public.community_leaderboard(text, date, text, text, integer, text) from public;
grant execute on function public.community_leaderboard(text, date, text, text, integer, text) to authenticated;
revoke execute on function public.community_leaderboard(text, date, text, text, integer, text) from anon;

/** Same as in 20261018300000_community.sql, with the member's look. */
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
    'look', public.community_look(target),
    'friend', (
      select case when f.status = 'accepted' then 'friends'
                  when f.user_id = uid then 'asked' else 'asked_you' end
      from public.friendships f
      where (f.user_id = uid and f.friend_id = target.user_id)
         or (f.friend_id = uid and f.user_id = target.user_id)),
    'scores', (
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

/** Same as in 20261018300000_community.sql, each friend with its look. */
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
      'look', public.community_look(m),
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
