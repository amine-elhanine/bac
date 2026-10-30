create table public.club_roles (
  role_key text primary key check (role_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  display_name text not null check (length(trim(display_name)) between 2 and 60),
  permission_roles text[] not null default '{}',
  is_custom boolean not null default false,
  created_by uuid references public.member_profiles(id),
  created_at timestamptz not null default now(),
  check (not is_custom or not (permission_roles && array['president','vice_president']::text[]))
);

insert into public.club_roles(role_key,display_name,permission_roles)
values
  ('president','President',array['president']),
  ('vice_president','Vice President',array['vice_president']),
  ('communications_officer','Communications Officer',array['communications_officer']),
  ('treasurer','Treasurer',array['treasurer']),
  ('vice_treasurer','Vice Treasurer',array['vice_treasurer']),
  ('hr','HR',array['hr']),
  ('vice_hr','Vice HR',array['vice_hr']),
  ('general_secretary','General Secretary',array['general_secretary']),
  ('logistics_officer','Logistics Officer',array['logistics_officer']),
  ('vice_logistics_officer','Vice Logistics Officer',array['vice_logistics_officer']),
  ('member','Member',array[]::text[]);

alter table public.club_roles enable row level security;
grant select on public.club_roles to authenticated;
create policy "authenticated users read role catalog" on public.club_roles
  for select to authenticated using (true);
revoke insert,update,delete on public.club_roles from anon,authenticated;

alter table public.role_assignments drop constraint role_assignments_role_check;
alter table public.role_assignments add constraint role_assignments_role_fkey
  foreign key (role) references public.club_roles(role_key);
drop index public.one_current_holder_per_role_term;
create unique index one_current_holder_per_builtin_role_term
  on public.role_assignments(term_id,role)
  where ends_at is null and role in (
    'president','vice_president','communications_officer','treasurer','vice_treasurer',
    'hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer'
  );

create or replace function public.has_club_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    join public.club_roles cr on cr.role_key=ra.role
    where ra.member_id=auth.uid() and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
      and (ra.role=any(allowed_roles) or cr.permission_roles && allowed_roles)
  );
$$;
revoke all on function public.has_club_role(text[]) from public;
grant execute on function public.has_club_role(text[]) to authenticated;

create or replace function public.create_club_role(p_name text,p_permission_roles text[],p_reason text)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare new_key text; valid_permissions text[];
begin
  if auth.uid() is null or not exists (
    select 1 from public.role_assignments ra join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    where ra.member_id=auth.uid() and ra.role='president' and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
  ) then raise exception 'Only the President can create club roles' using errcode='42501'; end if;
  if p_name is null or length(trim(p_name))<2 or length(trim(p_name))>60 or p_reason is null or length(trim(p_reason))<4 then
    raise exception 'A role name and reason are required' using errcode='22023';
  end if;
  if p_permission_roles is null or cardinality(p_permission_roles)=0 or cardinality(p_permission_roles)>8 then
    raise exception 'Choose at least one permission group' using errcode='22023';
  end if;
  select array_agg(distinct permission order by permission) into valid_permissions
    from unnest(p_permission_roles) as selected(permission)
    where permission in ('communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer');
  if valid_permissions is null or cardinality(valid_permissions)<>cardinality(p_permission_roles) then
    raise exception 'One or more permission groups are not available for custom roles' using errcode='22023';
  end if;
  new_key:='custom_'||trim(both '_' from regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','_','g'));
  if new_key='custom_' then new_key:='custom_'||substr(md5(lower(trim(p_name))),1,12); end if;
  new_key:=left(new_key,64);
  if new_key='custom_' or exists(select 1 from public.club_roles where role_key=new_key or lower(display_name)=lower(trim(p_name))) then
    raise exception 'A club role already uses that name' using errcode='23505';
  end if;
  insert into public.club_roles(role_key,display_name,permission_roles,is_custom,created_by)
    values(new_key,trim(p_name),valid_permissions,true,auth.uid());
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
    values(auth.uid(),'create_role','club_roles',new_key,array['display_name','permission_roles'],trim(p_reason));
  return new_key;
end;
$$;
revoke all on function public.create_club_role(text,text[],text) from public,anon;
grant execute on function public.create_club_role(text,text[],text) to authenticated;

create or replace function public.set_member_role(p_member_id uuid,p_new_role text,p_reason text)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare current_term uuid; current_role text; member_status text; existing_holder uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.role_assignments ra join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    where ra.member_id=auth.uid() and ra.role='president' and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
  ) then raise exception 'Only the President can change club role assignments' using errcode='42501'; end if;
  if p_new_role is null or not exists(select 1 from public.club_roles where role_key=p_new_role) or p_reason is null or length(trim(p_reason))<4 then
    raise exception 'A valid role and reason are required' using errcode='22023';
  end if;
  select id into current_term from public.club_terms where is_current for update;
  if not found then raise exception 'There is no current club term' using errcode='P0002'; end if;
  select status into member_status from public.member_profiles where id=p_member_id for update;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  if member_status<>'active' and p_new_role<>'member' then raise exception 'Only active members can hold an officer role' using errcode='22023'; end if;
  select role into current_role from public.role_assignments where member_id=p_member_id and term_id=current_term and role<>'member' and starts_at<=now() and ends_at is null for update;
  if current_role is not distinct from nullif(p_new_role,'member') then return coalesce(current_role,'member'); end if;
  if current_role='president' and p_new_role<>'president' and not exists(
    select 1 from public.role_assignments ra join public.member_profiles mp on mp.id=ra.member_id
    where ra.term_id=current_term and ra.role='president' and ra.member_id<>p_member_id and ra.starts_at<=now() and ra.ends_at is null and mp.status='active'
  ) then raise exception 'Assign another active President before removing the current President' using errcode='23514'; end if;
  if p_new_role in ('president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer') then
    select member_id into existing_holder from public.role_assignments where term_id=current_term and role=p_new_role and starts_at<=now() and ends_at is null and member_id<>p_member_id for update;
    if found and p_new_role<>'president' then raise exception 'This officer role is already assigned to another member' using errcode='23505'; end if;
    if found and p_new_role='president' then
      update public.role_assignments set ends_at=now() where member_id=existing_holder and term_id=current_term and role='president' and ends_at is null;
      insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by)
        values(existing_holder,'president',null,'Transferred to another member: '||trim(p_reason),auth.uid());
    end if;
  end if;
  if current_role is not null then update public.role_assignments set ends_at=now() where member_id=p_member_id and term_id=current_term and role=current_role and ends_at is null; end if;
  if p_new_role<>'member' then
    insert into public.role_assignments(member_id,term_id,role,assigned_by,starts_at) values(p_member_id,current_term,p_new_role,auth.uid(),now());
  end if;
  insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by)
    values(p_member_id,current_role,nullif(p_new_role,'member'),trim(p_reason),auth.uid());
  return p_new_role;
end;
$$;
revoke all on function public.set_member_role(uuid,text,text) from public;
grant execute on function public.set_member_role(uuid,text,text) to authenticated;
