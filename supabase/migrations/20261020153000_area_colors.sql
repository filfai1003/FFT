-- Area colours (DECISIONS 118): Supporter and Premium choose the hue of training, nutrition and
-- streak. Only the areas the user changed are kept ({} = the default look of DECISIONS 107). The
-- app shows the choice only for Supporter / Premium and keeps it when the plan goes back to Free,
-- so the column is not tied to the plan. Green and red are never a choice (better / worse), and
-- nutrition never takes pink (protein).
alter table public.user_settings
  add column if not exists area_colors jsonb not null default '{}'::jsonb;

alter table public.user_settings
  drop constraint if exists user_settings_area_colors_check;
alter table public.user_settings
  add constraint user_settings_area_colors_check check (
    jsonb_typeof(area_colors) = 'object'
    and (area_colors - array['training', 'nutrition', 'streak']) = '{}'::jsonb
    and coalesce(area_colors ->> 'training', 'purple')
      in ('purple', 'blue', 'plum', 'pink', 'teal', 'orange')
    and coalesce(area_colors ->> 'nutrition', 'teal')
      in ('teal', 'blue', 'purple', 'plum', 'orange')
    and coalesce(area_colors ->> 'streak', 'orange')
      in ('orange', 'pink', 'plum', 'purple', 'blue', 'teal')
  );
