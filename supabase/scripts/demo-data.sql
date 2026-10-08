-- DEMO DATA for local development: 12 weeks of body entries and workouts for the first user that
-- finished onboarding. Run:  npm run db:demo   (safe to run again: it replaces its own rows).
do $$
declare
  u uuid;
  w int;
  d date;
  sid uuid;
  ex record;
begin
  select id into u from public.profiles where onboarding_completed_at is not null order by created_at limit 1;
  if u is null then raise exception 'No onboarded user. Finish the onboarding in the app first.'; end if;

  delete from public.session_sets where user_id = u and session_id in (select id from public.workout_sessions where user_id = u and notes = 'demo');
  delete from public.session_exercises where user_id = u and session_id in (select id from public.workout_sessions where user_id = u and notes = 'demo');
  delete from public.workout_sessions where user_id = u and notes = 'demo';
  delete from public.body_metrics where user_id = u and notes = 'demo';

  for w in 0..11 loop
    d := current_date - (11 - w) * 7;

    insert into public.body_metrics (id, user_id, day, weight_kg, body_fat_pct, bf_method, waist_cm, hips_cm, chest_cm, arm_cm, thigh_cm, notes)
    values (gen_random_uuid(), u, d, round((81.2 - w * 0.25)::numeric, 1), round((18.9 - w * 0.19)::numeric, 1), 'scale',
            round((86 - w * 0.3)::numeric, 1), round((97.5 - w * 0.12)::numeric, 1), round((101 + w * 0.1)::numeric, 1),
            round((36 + w * 0.05)::numeric, 1), 58, 'demo');

    -- two workouts a week: Push (bench, incline press, lateral raise) and Legs (squat, RDL)
    for ex in
      select * from (values
        ('Push A', array['bench-press', 'incline-db-press', 'lateral-raise'], array[80.0, 26.0, 10.0], 1),
        ('Legs',   array['back-squat', 'romanian-deadlift'],                  array[100.0, 90.0], 3)
      ) as t(name, slugs, base, offs)
    loop
      sid := gen_random_uuid();
      insert into public.workout_sessions (id, user_id, day_name, started_at, ended_at, status, notes, cycle_number)
      values (sid, u, ex.name, (d + ex.offs)::timestamptz + interval '18 hours',
              (d + ex.offs)::timestamptz + interval '19 hours', 'done', 'demo', w + 1);
      insert into public.session_sets (user_id, session_id, exercise_id, set_index, weight_kg, reps, completed_at)
      select u, sid, e.id, s.i,
             round(((ex.base[array_position(ex.slugs, e.slug)] * (1 + 0.012 * w)) / 2.5)::numeric) * 2.5,
             8 - s.i, (d + ex.offs)::timestamptz + interval '18 hours'
      from public.exercises e
      cross join generate_series(0, 2) as s(i)
      where e.owner_id is null and e.slug = any (ex.slugs);
    end loop;
  end loop;
end
$$;
