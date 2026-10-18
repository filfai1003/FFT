-- The admin log can only grow from the admin panel (DECISIONS 97). The panel writes in sudo mode as
-- the role admin_panel (admin/roles.js, created by the panel at start), which has no UPDATE /
-- DELETE / TRUNCATE right on admin_audit; this trigger refuses it too, in case a right comes back
-- (admin_panel owns no table, so it cannot drop or disable the trigger). The owner's own jobs are
-- not affected: the 12-month cleanup of the api service and the anonymisation when an account is
-- deleted (security definer functions run as the owner, even when admin_panel deletes the account).

create or replace function public.admin_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'admin_panel' then
    raise exception 'the admin log cannot be changed or deleted from the admin panel'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.admin_audit_append_only() from public;

create trigger admin_audit_append_only
  before update or delete on public.admin_audit
  for each row execute function public.admin_audit_append_only();

create trigger admin_audit_no_truncate
  before truncate on public.admin_audit
  for each statement execute function public.admin_audit_append_only();
