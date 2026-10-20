-- Community audiences (DECISIONS 117): the leaderboard "Compare with" filter works for Supporter
-- and Premium accounts. Everyone stays free; Friends, Country and Age and weight class need
-- plan_of(caller) in ('supporter', 'premium').
-- * user_plans accepts 'supporter' again (DECISIONS 47 had removed it; 100 brought the tier back
--   on the Plans page). Supporter gives no AI credit and no other server right: only these boards.
-- * community_members gets three coarse values, computed on the device and sent by the app
--   (community_set_groups): country (ISO 3166-1 alpha-2), age group ('18-24', '25-34', '35-44',
--   '45-54', '55+') and weight class (IPF classes by sex: 'm59' = up to 59 kg, 'm66' = 59–66 kg,
--   …, 'm120+' = over 120 kg; women 'f47' … 'f84+'). Never the birth date, never the weight.
--   They are part of the member row: community_export shows them, community_leave deletes them.
-- * community_leaderboard gets p_audience (default 'everyone', so older apps keep working).

alter table public.user_plans drop constraint user_plans_plan_check;
alter table public.user_plans add constraint user_plans_plan_check
  check (plan in ('supporter', 'premium'));

alter table public.community_members
  add column country      text check (country ~ '^[A-Z]{2}$' and country !~ '^(AA|Q[M-Z]|X[A-Z]|ZZ)$'),
  add column age_group    text check (age_group in ('18-24', '25-34', '35-44', '45-54', '55+')),
  add column weight_class text check (weight_class ~ '^(m(59|66|74|83|93|105|120|120\+)|f(47|52|57|63|69|76|84|84\+))$');

/** The caller's membership, now with the groups it sent (null = not sent). */
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
    'weight_class', m.weight_class)
  from public.community_members m where m.user_id = (select auth.uid());
$$;
revoke all on function public.community_me() from public;
grant execute on function public.community_me() to authenticated;
revoke execute on function public.community_me() from anon;

/**
 * Sets (or clears, with null) the caller's country, age group and weight class. Values outside
 * the lists are refused (22023): the app sends only buckets, never the birth date or the weight.
 */
create or replace function public.community_set_groups(
  p_country text default null, p_age_group text default null, p_weight_class text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  c text := nullif(upper(trim(coalesce(p_country, ''))), '');
begin
  if c is not null and (c !~ '^[A-Z]{2}$' or c ~ '^(AA|Q[M-Z]|X[A-Z]|ZZ)$') then
    raise exception 'not a country code' using errcode = '22023';
  end if;
  if p_age_group is not null and p_age_group not in ('18-24', '25-34', '35-44', '45-54', '55+') then
    raise exception 'not an age group' using errcode = '22023';
  end if;
  if p_weight_class is not null
     and p_weight_class !~ '^(m(59|66|74|83|93|105|120|120\+)|f(47|52|57|63|69|76|84|84\+))$' then
    raise exception 'not a weight class' using errcode = '22023';
  end if;
  update public.community_members
  set country = c, age_group = p_age_group, weight_class = p_weight_class, updated_at = now()
  where user_id = uid;
  return public.community_me();
end;
$$;
revoke all on function public.community_set_groups(text, text, text) from public;
grant execute on function public.community_set_groups(text, text, text) to authenticated;
revoke execute on function public.community_set_groups(text, text, text) from anon;

-- One function with a default audience (an overload would make the old named call ambiguous).
drop function public.community_leaderboard(text, date, text, text, integer);

/**
 * A leaderboard: the members of an audience with a score for this period, metric and subject,
 * best first. Returns the total, the top p_limit and the caller's own row, each with the place
 * now and at the end of yesterday, all counted within the audience:
 * - everyone: every member (free);
 * - friends: the caller and its accepted friends;
 * - country: members with the caller's country;
 * - class: members with the caller's age group and weight class (the class carries the sex).
 * The last three need Supporter or Premium (42501). Without the caller's country / groups the
 * board is empty with 'reason' ('no_country', 'no_class') so the app can say what is missing.
 * Only names, levels, the public id and the score: never anything else.
 */
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
          'is_me', r.user_id = uid) order by r.place, m.display_name)
        from ranked r join public.community_members m on m.user_id = r.user_id
        where r.place <= least(greatest(coalesce(p_limit, 8), 1), 50) or r.user_id = uid), '[]'))
  );
end;
$$;
revoke all on function public.community_leaderboard(text, date, text, text, integer, text) from public;
grant execute on function public.community_leaderboard(text, date, text, text, integer, text) to authenticated;
revoke execute on function public.community_leaderboard(text, date, text, text, integer, text) from anon;
