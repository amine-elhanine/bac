-- The President can now edit existing built-in roles: rename them and change
-- their permission set. The President role itself stays locked so whoever
-- holds roles.manage can never remove their own management access, and the
-- protected management permissions stay ungrantable through this path.

create or replace function public.update_club_role(
  p_role_key text,
  p_display_name text,
  p_permissions text[],
  p_reason text
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  is_builtin boolean;
  previous_permissions text[];
  previous_name text;
begin
  if auth.uid() is null or not public.has_club_permission('roles.manage') then
    raise exception 'Not authorized to change roles' using errcode='42501';
  end if;
  if p_role_key is null or p_display_name is null or p_permissions is null
     or p_reason is null or length(trim(p_reason))<4 then
    raise exception 'A role, name, permission list, and reason are required' using errcode='22023';
  end if;
  if length(trim(p_display_name))<2 or length(trim(p_display_name))>60 then
    raise exception 'The role name must be between 2 and 60 characters' using errcode='22023';
  end if;
  select not is_custom, permissions, display_name into is_builtin, previous_permissions, previous_name
    from public.club_roles where role_key=p_role_key for update;
  if not found then raise exception 'Role not found' using errcode='P0002'; end if;
  if is_builtin and p_role_key='president' then
    raise exception 'The President role cannot be edited' using errcode='42501';
  end if;
  if exists(select 1 from unnest(p_permissions) requested(permission_key)
      where not exists(select 1 from public.club_permission_catalog where permission_key=requested.permission_key and permission_key not in ('roles.manage','members.roles.manage','roles.assign_custom','terms.manage'))) then
    raise exception 'One or more permissions are not available' using errcode='22023';
  end if;
  if previous_permissions is not distinct from p_permissions
     and previous_name is not distinct from trim(p_display_name) then
    return;
  end if;
  update public.club_roles
    set display_name=trim(p_display_name), permissions=p_permissions
    where role_key=p_role_key;
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
    values(auth.uid(),'update_club_role','club_roles',p_role_key,
      array[case when previous_name is distinct from trim(p_display_name) then 'display_name' end,
             case when previous_permissions is distinct from p_permissions then 'permissions' end]::text[],
      trim(p_reason)||' — "'||coalesce(previous_name,p_role_key)||'" → "'||trim(p_display_name)||'" ('||array_length(p_permissions,1)||' permissions)');
end;
$$;

revoke all on function public.update_club_role(text,text,text[],text) from public, anon;
grant execute on function public.update_club_role(text,text,text[],text) to authenticated;
