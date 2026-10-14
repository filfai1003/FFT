-- Sending the same change again (same time of action) must change nothing: before, the repeated
-- write was stored again and set_updated_at gave it the current time, so a repeated change could
-- win over later ones. Now only a strictly newer change replaces a row.

create or replace function public.sync_push(p_table text, p_rows jsonb, p_deletes jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  pk text := case when p_table = 'user_settings' then 'user_id' else 'id' end;
  cols text;
  sets text;
begin
  if not (p_table = any (public.sync_tables())) then
    raise exception 'not a synced table: %', p_table using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_rows, '[]')) > 0 then
    -- The columns the device sent that the table has (never server_at).
    select string_agg(quote_ident(c.column_name), ', '),
           string_agg(format('%1$I = excluded.%1$I', c.column_name), ', ')
             filter (where c.column_name <> pk)
      into cols, sets
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = p_table
       and c.column_name <> 'server_at'
       and p_rows -> 0 ? c.column_name;
    execute format(
      'insert into public.%1$I as t (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) '
      'on conflict (%3$I) do update set %4$s where t.updated_at < excluded.updated_at',
      p_table, cols, pk, sets)
    using p_rows;
  end if;

  if jsonb_array_length(coalesce(p_deletes, '[]')) > 0 then
    execute format(
      'delete from public.%1$I t using jsonb_to_recordset($1) as d(id text, at timestamptz) '
      'where t.%2$I::text = d.id and t.updated_at <= d.at',
      p_table, pk)
    using p_deletes;
  end if;
end;
$$;
