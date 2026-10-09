-- Recipes were removed from the product: drop the recipe columns of the food log (servings only
-- existed for recipe entries), then the per-serving view and the recipe tables.
alter table public.food_logs drop constraint if exists food_logs_amount_given;
alter table public.food_logs drop column if exists recipe_id;
alter table public.food_logs drop column if exists servings;

drop view if exists public.recipe_nutrition;
drop table if exists public.recipe_items;
drop table if exists public.recipes;
