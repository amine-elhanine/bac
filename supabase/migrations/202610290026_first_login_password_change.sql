-- Manual, in-person member activation must force the temporary password to be
-- replaced before the member can enter the live workspace.
alter table public.member_profiles
  add column must_change_password boolean not null default false;

create or replace function public.complete_member_first_login(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_member_id is null or not exists(
    select 1 from public.member_profiles where id=p_member_id and must_change_password=true
  ) then
    raise exception 'No first-login password change is pending for this member.' using errcode='23514';
  end if;
  perform set_config('app.change_reason','Member replaced the temporary first-login password',true);
  update public.member_profiles set must_change_password=false,updated_at=now() where id=p_member_id;
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
    values(p_member_id,'complete_first_login','member_profiles',p_member_id::text,array['must_change_password'],'Temporary password replaced during first login');
end;
$$;

revoke all on function public.complete_member_first_login(uuid) from public,anon,authenticated;
grant execute on function public.complete_member_first_login(uuid) to service_role;
