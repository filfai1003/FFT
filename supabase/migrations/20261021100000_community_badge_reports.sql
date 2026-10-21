-- Supporter badge and reports of community profile photos (DECISIONS 120).
-- * The look others see (community_look) now says `supporter: true` for Supporter and Premium
--   members (plan_of evaluated here, at read time: never sent by the app). One badge for both
--   plans: Premium includes Supporter, and others are not told who pays for the AI coach.
-- * Any member can report another member's photo (community_report_photo), with an optional
--   reason. One report per reporter per photo (a new photo starts fresh), at most 10 a day per
--   reporter, never your own. Reporters stay anonymous: the table has RLS and no policy, only the
--   functions below and the admin panel read it.
-- * 3 open reports from 3 members on the same photo put it under review: hidden from everyone
--   else (they see the initial), its file kept for the admin (not queued for removal, and the
--   member cannot delete it from storage), and the member cannot set or upload a photo until an
--   admin decides (removing the photo is still allowed).
-- * The admin decides (community_photo_decide): "appropriate" closes the reports (the photo shows
--   again); "inappropriate" deletes the photo (files_to_delete), closes the reports and adds a
--   strike. 3 strikes take away the right to set a photo (photo_banned), until an admin gives it
--   back (community_photo_restore).
-- * Leaving the community and deleting the account delete the reports made by and about the
--   member (cascade through community_members). Closed reports go 90 days after the decision;
--   open reports on a photo no longer in use (and not under review) go after 30 days.

-- --- strikes on the member row ------------------------------------------------------------------

alter table public.community_members
  add column photo_strikes integer not null default 0 check (photo_strikes between 0 and 1000),
  add column photo_banned boolean not null default false;

-- --- reports ------------------------------------------------------------------------------------

create table public.community_photo_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.community_members (user_id) on delete cascade,
  member_id   uuid not null references public.community_members (user_id) on delete cascade,
  photo_path  text not null check (photo_path ~ '^[0-9a-f-]{36}/[a-z0-9-]{8,64}\.(jpg|webp)$'),
  reason      text check (reason in ('nudity', 'violence', 'hateful', 'spam', 'other')),
  resolved_at timestamptz,
  resolution  text check (resolution in ('appropriate', 'inappropriate', 'removed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (reporter_id <> member_id),
  check ((resolved_at is null) = (resolution is null)),
  -- One report per reporter per photo, kept after the decision (the same people cannot hide an
  -- approved photo again and again).
  unique (reporter_id, photo_path)
);
create index community_photo_reports_open_idx
  on public.community_photo_reports (photo_path) where resolved_at is null;
create index community_photo_reports_member_idx on public.community_photo_reports (member_id);
create index community_photo_reports_rate_idx
  on public.community_photo_reports (reporter_id, created_at);

alter table public.community_photo_reports enable row level security;
-- No policy at all: nobody reads or writes reports directly (reporters stay anonymous).
revoke all on public.community_photo_reports from anon, authenticated;

-- --- under review -------------------------------------------------------------------------------

/** Is this photo under review: open reports from at least 3 members? */
create or replace function public.community_photo_held(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_path is not null and (
    select count(*) from public.community_photo_reports r
    where r.photo_path = p_path and r.resolved_at is null) >= 3;
$$;
revoke all on function public.community_photo_held(text) from public;
revoke execute on function public.community_photo_held(text) from anon, authenticated;

/** Is any photo of this member under review (then it cannot set or upload another)? */
create or replace function public.community_photo_review(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_photo_reports r
    where r.member_id = p_member and r.resolved_at is null
    group by r.photo_path having count(*) >= 3);
$$;
revoke all on function public.community_photo_review(uuid) from public;
revoke execute on function public.community_photo_review(uuid) from anon, authenticated;

-- --- what others see ----------------------------------------------------------------------------

/**
 * A member's look as others see it (20261020140000_community_cosmetics.sql), now with
 * `supporter: true` for Supporter and Premium; the photo is left out while under review, except
 * for the member itself. Null for other plans (hidden, not deleted).
 */
create or replace function public.community_look(m public.community_members)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.plan_of(m.user_id) in ('supporter', 'premium') then
    jsonb_strip_nulls(jsonb_build_object(
      'supporter', true,
      'colour', m.profile_colour, 'frame', m.frame, 'title', m.title,
      'badge', case when m.showcase_badge = any (m.badges) then m.showcase_badge end,
      'photo', case when m.user_id = (select auth.uid())
                      or not public.community_photo_held(m.photo_path) then m.photo_path end))
  end;
$$;
revoke all on function public.community_look(public.community_members) from public;
revoke execute on function public.community_look(public.community_members) from anon, authenticated;

-- --- storage: no upload while banned or under review, no deleting a photo under review ----------

/** As in 20261020140000_community_cosmetics.sql; writing also needs no ban and no review. */
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
      where m.user_id = (select auth.uid()) and m.public_id::text = split_part(p_name, '/', 1)
        and (not p_write or not m.photo_banned))
    and (not p_write or (
      public.plan_of((select auth.uid())) in ('supporter', 'premium')
      and not public.community_photo_review((select auth.uid()))));
$$;

/** The member may delete its own file, except a photo under review (kept for the admin). */
create or replace function public.community_avatar_delete_ok(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.community_avatar_ok(p_name, false) and not public.community_photo_held(p_name);
$$;
revoke all on function public.community_avatar_delete_ok(text) from public;
grant execute on function public.community_avatar_delete_ok(text) to authenticated;
revoke execute on function public.community_avatar_delete_ok(text) from anon;

drop policy community_avatars_delete_own on storage.objects;
create policy community_avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'community-avatars' and public.community_avatar_delete_ok(name));

/** As before, but a photo under review keeps its file (the admin still has to see it). */
create or replace function public.community_queue_old_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.photo_path is not null
     and (tg_op = 'DELETE' or old.photo_path is distinct from new.photo_path)
     -- Leaving and account deletion always remove it (its reports go with the member row).
     and (tg_op = 'DELETE' or not public.community_photo_held(old.photo_path)) then
    insert into public.files_to_delete (bucket, path) values ('community-avatars', old.photo_path)
    on conflict (bucket, path) do nothing;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- --- setting a photo ----------------------------------------------------------------------------

/**
 * As in 20261020140000_community_cosmetics.sql. Setting a photo is also refused (42501) after 3
 * strikes (hint `photo_banned`) and while a photo of the member is under review (hint
 * `photo_review`); removing it (null) is always allowed.
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
  me public.community_members;
begin
  select * into me from public.community_members m where m.user_id = uid;
  if p_path is not null then
    if public.plan_of(uid) not in ('supporter', 'premium') then
      raise exception 'a profile photo needs Supporter or Premium' using errcode = '42501';
    end if;
    if me.photo_banned then
      raise exception 'You can no longer add a profile photo'
        using errcode = '42501', hint = 'photo_banned';
    end if;
    if p_path is distinct from me.photo_path and public.community_photo_review(uid) then
      raise exception 'Your photo is being reviewed' using errcode = '42501', hint = 'photo_review';
    end if;
    if p_path !~ '^[0-9a-f-]{36}/[a-z0-9-]{8,64}\.(jpg|webp)$'
       or split_part(p_path, '/', 1) <> me.public_id::text then
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

-- --- reporting ----------------------------------------------------------------------------------

/**
 * Reports a member's profile photo (p_public_id) with an optional reason. p_photo: the photo the
 * reporter saw; when the member has changed it since, nothing is reported. Returns
 * {status: 'reported' | 'already' | 'no_photo'}. Your own photo is 22023, an unknown member
 * P0002, more than 10 reports in a day 54000.
 */
create or replace function public.community_report_photo(
  p_public_id uuid, p_reason text default null, p_photo text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  target public.community_members;
begin
  if p_reason is not null and p_reason not in ('nudity', 'violence', 'hateful', 'spam', 'other') then
    raise exception 'not a reason' using errcode = '22023';
  end if;
  select * into target from public.community_members m where m.public_id = p_public_id;
  if not found then
    raise exception 'no such member' using errcode = 'P0002';
  end if;
  if target.user_id = uid then
    raise exception 'you cannot report your own photo' using errcode = '22023';
  end if;

  -- Retention: closed reports 90 days after the decision; open ones on a photo no longer in use
  -- (and not under review) after 30 days.
  delete from public.community_photo_reports r
  where r.resolved_at < now() - interval '90 days'
     or (r.resolved_at is null and r.created_at < now() - interval '30 days'
         and not public.community_photo_held(r.photo_path)
         and not exists (select 1 from public.community_members m
                         where m.user_id = r.member_id and m.photo_path = r.photo_path));

  -- Only a photo others can see now (the plan, and the one the reporter saw).
  if target.photo_path is null or public.plan_of(target.user_id) not in ('supporter', 'premium')
     or (p_photo is not null and p_photo is distinct from target.photo_path) then
    return jsonb_build_object('status', 'no_photo');
  end if;
  if exists (select 1 from public.community_photo_reports r
             where r.reporter_id = uid and r.photo_path = target.photo_path) then
    return jsonb_build_object('status', 'already');
  end if;
  if (select count(*) from public.community_photo_reports r
      where r.reporter_id = uid and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'at most 10 reports a day' using errcode = '54000';
  end if;
  insert into public.community_photo_reports (reporter_id, member_id, photo_path, reason)
  values (uid, target.user_id, target.photo_path, p_reason)
  on conflict (reporter_id, photo_path) do nothing;
  return jsonb_build_object('status', 'reported');
end;
$$;
revoke all on function public.community_report_photo(uuid, text, text) from public;
grant execute on function public.community_report_photo(uuid, text, text) to authenticated;
revoke execute on function public.community_report_photo(uuid, text, text) from anon;

-- --- the admin's decisions (admin/server.js, editing unlocked, audited there) -------------------

/**
 * Decides on a reported photo: 'appropriate' closes its open reports (visible again; a file no
 * longer in use is queued for removal), 'inappropriate' removes it (photo_path cleared, file
 * queued), closes the reports and adds a strike; 3 strikes = no more photos. Returns
 * {strikes, banned, closed}. No open report on that photo is P0002.
 */
create or replace function public.community_photo_decide(
  p_member uuid, p_path text, p_verdict text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  closed integer;
  m public.community_members;
begin
  if p_verdict not in ('appropriate', 'inappropriate') then
    raise exception 'not a verdict' using errcode = '22023';
  end if;
  update public.community_photo_reports r
  set resolved_at = now(), resolution = p_verdict, updated_at = now()
  where r.member_id = p_member and r.photo_path = p_path and r.resolved_at is null;
  get diagnostics closed = row_count;
  if closed = 0 then
    raise exception 'no open report on this photo' using errcode = 'P0002';
  end if;
  if p_verdict = 'inappropriate' then
    update public.community_members
    set photo_path = case when photo_path = p_path then null else photo_path end,
        photo_strikes = photo_strikes + 1,
        photo_banned = photo_banned or photo_strikes + 1 >= 3,
        updated_at = now()
    where user_id = p_member;
    insert into public.files_to_delete (bucket, path) values ('community-avatars', p_path)
    on conflict (bucket, path) do nothing;
  elsif not exists (select 1 from public.community_members x
                    where x.user_id = p_member and x.photo_path = p_path) then
    -- Approved but the member had removed it meanwhile: the kept file can go now.
    insert into public.files_to_delete (bucket, path) values ('community-avatars', p_path)
    on conflict (bucket, path) do nothing;
  end if;
  select * into m from public.community_members x where x.user_id = p_member;
  return jsonb_build_object('strikes', m.photo_strikes, 'banned', m.photo_banned, 'closed', closed);
end;
$$;
revoke all on function public.community_photo_decide(uuid, text, text) from public;
revoke execute on function public.community_photo_decide(uuid, text, text) from anon, authenticated;

/** Gives a member back the right to set a photo (strikes back to 0). P0002 if not a member. */
create or replace function public.community_photo_restore(p_member uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.community_members
  set photo_banned = false, photo_strikes = 0, updated_at = now()
  where user_id = p_member;
  if not found then
    raise exception 'not a community member' using errcode = 'P0002';
  end if;
  return jsonb_build_object('strikes', 0, 'banned', false);
end;
$$;
revoke all on function public.community_photo_restore(uuid) from public;
revoke execute on function public.community_photo_restore(uuid) from anon, authenticated;

-- The admin panel's role gets them now (it also re-grants every function at each start).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'admin_panel') then
    grant execute on function public.community_photo_decide(uuid, text, text) to admin_panel;
    grant execute on function public.community_photo_restore(uuid) to admin_panel;
    grant select, insert, update, delete on public.community_photo_reports to admin_panel;
  end if;
end $$;

-- --- the member's own state ---------------------------------------------------------------------

/** As in 20261020140000_community_cosmetics.sql, with the photo review and strike state. */
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
    'photo_review', public.community_photo_review(m.user_id),
    'photo_strikes', m.photo_strikes, 'photo_banned', m.photo_banned,
    'look', public.community_look(m))
  from public.community_members m where m.user_id = (select auth.uid());
$$;
revoke all on function public.community_me() from public;
grant execute on function public.community_me() to authenticated;
revoke execute on function public.community_me() from anon;

/**
 * As in 20261018300000_community.sql, plus the photo reports: the ones the caller made (reason and
 * day, not whom) and the ones about its photos (reason, day and decision, never who reported).
 */
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
      where f.user_id = (select auth.uid()) or f.friend_id = (select auth.uid())),
    'photo_reports_made', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reason', r.reason, 'day', r.created_at::date) order by r.created_at), '[]')
      from public.community_photo_reports r where r.reporter_id = (select auth.uid())),
    'photo_reports_about_you', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'photo', r.photo_path, 'reason', r.reason, 'day', r.created_at::date,
        'decision', r.resolution) order by r.created_at), '[]')
      from public.community_photo_reports r where r.member_id = (select auth.uid())));
$$;
revoke all on function public.community_export() from public;
grant execute on function public.community_export() to authenticated;
revoke execute on function public.community_export() from anon;
