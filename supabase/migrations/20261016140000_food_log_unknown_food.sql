-- A food log can point to a product the server does not have: packaged products found straight on
-- Open Food Facts (our server unreachable, or it found nothing) are saved only on the device. The
-- log already carries its own copy of the values (name, grams, kcal, macros), so instead of
-- refusing the row (the sync then lost it) the link to the unknown product is dropped.

create or replace function public.food_log_known_food()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.food_id is not null
     and not exists (select 1 from public.foods f where f.id = new.food_id) then
    new.food_id := null;
  end if;
  return new;
end;
$$;

create trigger food_logs_known_food
  before insert or update of food_id on public.food_logs
  for each row execute function public.food_log_known_food();
