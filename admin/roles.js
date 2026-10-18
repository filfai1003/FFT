/**
 * The role the admin panel writes with in sudo mode (DECISIONS 97): `admin_panel`, not the
 * database owner. It can read and change the data of every schema like before, but it cannot change
 * or delete the admin log (`public.admin_audit`): no UPDATE / DELETE / TRUNCATE right on it, and
 * the trigger of 20261018210000_admin_audit_append_only.sql refuses it even if a right comes back.
 * It is not the owner of any table, so its SQL cannot drop that trigger or disable it.
 * Its password is new at every start of the panel and never stored anywhere.
 * No dependencies: the verify test runs the same statements on the embedded database.
 */
export const PANEL_ROLE = 'admin_panel';

export function panelRoleSetup(password) {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(password)) throw new Error('bad admin_panel password');
  return [
    `do $$ begin
      if not exists (select 1 from pg_roles where rolname = '${PANEL_ROLE}') then
        create role ${PANEL_ROLE} nologin;
      end if;
    end $$`,
    `alter role ${PANEL_ROLE} with login password '${password}' nosuperuser nocreaterole nocreatedb`,
    `alter role ${PANEL_ROLE} bypassrls`,
    `alter role ${PANEL_ROLE} set statement_timeout = '30s'`,
    `grant pg_read_all_data to ${PANEL_ROLE}`,
    // Rights table by table (not pg_write_all_data, whose rights cannot be taken back on one table).
    `do $$
    declare s text;
    begin
      for s in select nspname from pg_namespace
               where nspname not like 'pg\\_%' and nspname <> 'information_schema' loop
        begin
          execute format('grant usage on schema %I to ${PANEL_ROLE}', s);
          execute format('grant select, insert, update, delete on all tables in schema %I to ${PANEL_ROLE}', s);
          execute format('grant usage, select, update on all sequences in schema %I to ${PANEL_ROLE}', s);
          execute format('grant execute on all functions in schema %I to ${PANEL_ROLE}', s);
        exception when insufficient_privilege then
          raise notice '${PANEL_ROLE}: no rights given on schema %', s;
        end;
      end loop;
    end $$`,
    // Tables the owner creates later (migrations) get the same rights without a restart.
    `alter default privileges grant select, insert, update, delete on tables to ${PANEL_ROLE}`,
    `alter default privileges grant usage, select, update on sequences to ${PANEL_ROLE}`,
    `revoke update, delete, truncate on public.admin_audit from ${PANEL_ROLE}`,
  ];
}
