create table public.club_permission_catalog (
  permission_key text primary key,
  module_name text not null,
  display_name text not null,
  description text not null,
  built_in_roles text[] not null default '{}'
);

insert into public.club_permission_catalog(permission_key,module_name,display_name,description,built_in_roles) values
('members.view','Members','View member directory','Read member roster details and contact information.',array['president','vice_president','hr','vice_hr','treasurer','vice_treasurer','communications_officer','general_secretary','logistics_officer','vice_logistics_officer']),
('members.invite','Members','Invite members','Create and onboard member accounts.',array['president','vice_president','hr','vice_hr']),
('members.profile.edit','Members','Edit member profiles','Change names, email addresses, phone numbers, study programs, and cohorts.',array['president','vice_president','hr','vice_hr']),
('members.status.edit','Members','Change membership status','Activate, suspend, or archive member accounts.',array['president','vice_president','hr','vice_hr']),
('members.history.view','HR','View member history','Read member profile and membership status history.',array['president','vice_president','hr','vice_hr']),
('members.roles.view','Roles','View role assignments','Read the current role assignments.',array['president','vice_president','hr','vice_hr','general_secretary']),
('members.account.manage','Members','Manage member accounts','Reset passwords and delete eligible accounts.',array['president','vice_president','hr','vice_hr']),
('events.view','Events','View events','Read published event details and calendars.',array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']),
('events.manage','Events','Create and edit events','Create, publish, edit, complete, and cancel events.',array['president','vice_president','hr','vice_hr']),
('attendance.view','Attendance','View attendance','Read attendance sessions, rosters, and reports.',array['president','vice_president','hr','vice_hr']),
('attendance.sessions.manage','Attendance','Manage attendance sessions','Open and close attendance sessions and issue QR codes.',array['president','vice_president','hr','vice_hr']),
('attendance.records.correct','Attendance','Correct attendance records','Change a member attendance record with a reason.',array['president','vice_president','hr','vice_hr']),
('finance.view','Finance','View financial records','Read club financial transactions and balances.',array['president','vice_president','treasurer','vice_treasurer']),
('finance.records.manage','Finance','Record financial activity','Record contributions, purchases, and reversals.',array['president','treasurer','vice_treasurer']),
('finance.purchases.review','Finance','Review purchase requests','Approve or decline purchase requests and record payment.',array['president','vice_president','treasurer','vice_treasurer']),
('finance.reconcile','Finance','Reconcile balances','Record and review financial reconciliations.',array['president','vice_president','treasurer','vice_treasurer']),
('finance.periods.close','Finance','Close financial periods','Close a financial period with an audited reason.',array['president','treasurer']),
('points.view','Points','View points','Read point transactions and member balances.',array['president','vice_president','hr','vice_hr']),
('points.manage','Points','Manage points','Award and correct member points.',array['president','hr','vice_hr']),
('tasks.view','Tasks','View assigned tasks','Read tasks assigned to the member or managed by their team.',array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer','member']),
('tasks.manage','Tasks','Manage tasks','Manage task status and assignments.',array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']),
('hr.cases.view','HR','View HR support cases','Read submitted support cases and their history.',array['president','vice_president','hr','vice_hr']),
('hr.cases.manage','HR','Respond to HR support cases','Change case status and send a response to the member.',array['president','vice_president','hr','vice_hr']),
('roles.view','Roles & Permissions','View roles and permissions','Read role definitions and their permissions.',array['president']),
('roles.manage','Roles & Permissions','Create roles and edit permissions','Create custom roles and choose their permissions.',array['president']);

-- Only permissions enforced by the current API are offered to custom roles.
-- Additional module permissions can be added here as each module receives
-- equivalent row-level and RPC authorization checks.
delete from public.club_permission_catalog where permission_key not in (
  'members.view','members.invite','members.profile.edit','members.status.edit','members.history.view',
  'members.account.manage','hr.cases.view','hr.cases.manage','roles.view','roles.manage'
);

alter table public.club_roles add column permissions text[] not null default '{}';
update public.club_roles cr set permissions=coalesce((
  select array_agg(pc.permission_key order by pc.module_name,pc.display_name)
  from public.club_permission_catalog pc where cr.role_key=any(pc.built_in_roles)
),'{}'::text[]) where not cr.is_custom;
update public.club_roles cr set permissions=coalesce((
  select array_agg(pc.permission_key order by pc.module_name,pc.display_name)
  from public.club_permission_catalog pc where pc.built_in_roles && cr.permission_roles
),'{}'::text[]) where cr.is_custom;
update public.club_roles set permission_roles='{}' where is_custom;

alter table public.club_permission_catalog enable row level security;
grant select on public.club_permission_catalog to authenticated;
create policy "authenticated users read permission catalog" on public.club_permission_catalog
  for select to authenticated using (true);

create or replace function public.has_club_permission(p_permission_key text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    join public.club_roles cr on cr.role_key=ra.role
    where ra.member_id=auth.uid() and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
      and p_permission_key=any(cr.permissions)
  );
$$;
revoke all on function public.has_club_permission(text) from public,anon;
grant execute on function public.has_club_permission(text) to authenticated;

create or replace function public.has_club_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.role_assignments ra join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    where ra.member_id=auth.uid() and ra.role=any(allowed_roles) and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
  );
$$;
revoke all on function public.has_club_role(text[]) from public,anon;
grant execute on function public.has_club_role(text[]) to authenticated;

drop function public.create_club_role(text,text[],text);
create function public.create_club_role(p_name text,p_permissions text[],p_reason text)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare new_key text;
begin
  if auth.uid() is null or not public.has_club_permission('roles.manage') then
    raise exception 'Not authorized to create club roles' using errcode='42501';
  end if;
  if p_name is null or length(trim(p_name))<2 or length(trim(p_name))>60 or p_reason is null or length(trim(p_reason))<4 then
    raise exception 'A role name and reason are required' using errcode='22023';
  end if;
  if p_permissions is null or cardinality(p_permissions)=0 or cardinality(p_permissions)>40 or exists(
    select 1 from unnest(p_permissions) requested(permission_key)
    where not exists(select 1 from public.club_permission_catalog where permission_key=requested.permission_key and permission_key<>'roles.manage')
  ) then raise exception 'Choose valid permissions for this role' using errcode='22023'; end if;
  new_key:='custom_'||trim(both '_' from regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','_','g'));
  if new_key='custom_' then new_key:='custom_'||substr(md5(lower(trim(p_name))),1,12); end if;
  new_key:=left(new_key,64);
  if exists(select 1 from public.club_roles where role_key=new_key or lower(display_name)=lower(trim(p_name))) then
    raise exception 'A club role already uses that name' using errcode='23505';
  end if;
  insert into public.club_roles(role_key,display_name,permission_roles,permissions,is_custom,created_by)
    values(new_key,trim(p_name),'{}',p_permissions,true,auth.uid());
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
    values(auth.uid(),'create_role','club_roles',new_key,array['display_name','permissions'],trim(p_reason));
  return new_key;
end;
$$;
revoke all on function public.create_club_role(text,text[],text) from public,anon;
grant execute on function public.create_club_role(text,text[],text) to authenticated;

create or replace function public.update_club_role_permissions(p_role_key text,p_permissions text[],p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare previous_permissions text[];
begin
  if auth.uid() is null or not public.has_club_permission('roles.manage') then
    raise exception 'Not authorized to change role permissions' using errcode='42501';
  end if;
  if p_role_key is null or p_permissions is null or cardinality(p_permissions)>40 or p_reason is null or length(trim(p_reason))<4 then
    raise exception 'A valid permission list and reason are required' using errcode='22023';
  end if;
  if exists(select 1 from public.club_roles where role_key=p_role_key and not is_custom) then
    raise exception 'Built-in role permissions cannot be edited' using errcode='42501';
  end if;
  if not exists(select 1 from public.club_roles where role_key=p_role_key and is_custom) then
    raise exception 'Custom role not found' using errcode='P0002';
  end if;
  if exists(select 1 from unnest(p_permissions) requested(permission_key)
      where not exists(select 1 from public.club_permission_catalog where permission_key=requested.permission_key and permission_key<>'roles.manage')) then
    raise exception 'One or more permissions are not available' using errcode='22023';
  end if;
  select permissions into previous_permissions from public.club_roles where role_key=p_role_key for update;
  if previous_permissions is not distinct from p_permissions then return; end if;
  update public.club_roles set permissions=p_permissions where role_key=p_role_key;
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
    values(auth.uid(),'update_role_permissions','club_roles',p_role_key,array['permissions'],trim(p_reason));
end;
$$;
revoke all on function public.update_club_role_permissions(text,text[],text) from public,anon;
grant execute on function public.update_club_role_permissions(text,text[],text) to authenticated;

drop policy "read own profile or roster" on public.member_profiles;
create policy "read own profile or roster" on public.member_profiles for select to authenticated
  using (id=auth.uid() or public.has_club_permission('members.view'));
drop policy "HR reads member status history" on public.member_status_history;
create policy "HR reads member status history" on public.member_status_history for select to authenticated
  using (public.has_club_permission('members.history.view'));
drop policy "HR reads member profile history" on public.member_profile_history;
create policy "HR reads member profile history" on public.member_profile_history for select to authenticated
  using (public.has_club_permission('members.history.view'));
drop policy "read role assignments" on public.role_assignments;
create policy "read role assignments" on public.role_assignments for select to authenticated
  using (member_id=auth.uid() or public.has_club_permission('members.roles.view'));
drop policy "president reads role assignments" on public.role_assignments;
create policy "president reads role assignments" on public.role_assignments for select to authenticated
  using (public.has_club_permission('roles.manage'));

drop function public.set_member_role(uuid,text,text);
create function public.set_member_role(p_member_id uuid,p_new_role text,p_reason text)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare current_term uuid; current_role text; existing_holder uuid;
begin
  if auth.uid() is null or not public.has_club_permission('roles.manage') then
    raise exception 'Only the President can manage role assignments' using errcode='42501';
  end if;
  if p_new_role is null or p_reason is null or length(trim(p_reason))<4 then
    raise exception 'A role and reason are required' using errcode='22023';
  end if;
  if not exists(select 1 from public.club_roles where role_key=p_new_role and not is_custom) then
    raise exception 'Choose a built-in officer role' using errcode='22023';
  end if;
  select id into current_term from public.club_terms where is_current;
  if current_term is null then raise exception 'No current club term' using errcode='23514'; end if;
  if not exists(select 1 from public.member_profiles where id=p_member_id and status='active') then
    raise exception 'Only active members can receive officer roles' using errcode='23514';
  end if;
  select role into current_role from public.role_assignments where member_id=p_member_id and term_id=current_term and role<>'member' and starts_at<=now() and ends_at is null for update;
  if current_role=p_new_role then return p_new_role; end if;
  if p_new_role='president' then
    select member_id into existing_holder from public.role_assignments where term_id=current_term and role='president' and starts_at<=now() and ends_at is null and member_id<>p_member_id for update;
    if existing_holder is not null then
      update public.role_assignments set ends_at=now() where member_id=existing_holder and term_id=current_term and role='president' and ends_at is null;
      insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by) values(existing_holder,'president',null,'President role transferred: '||trim(p_reason),auth.uid());
    end if;
  else
    select member_id into existing_holder from public.role_assignments where term_id=current_term and role=p_new_role and starts_at<=now() and ends_at is null and member_id<>p_member_id for update;
    if existing_holder is not null then raise exception 'That officer role is already assigned' using errcode='23505'; end if;
  end if;
  if current_role is not null then update public.role_assignments set ends_at=now() where member_id=p_member_id and term_id=current_term and role=current_role and ends_at is null; end if;
  if p_new_role<>'member' then insert into public.role_assignments(member_id,term_id,role,assigned_by,starts_at) values(p_member_id,current_term,p_new_role,auth.uid(),now()); end if;
  insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by) values(p_member_id,current_role,nullif(p_new_role,'member'),trim(p_reason),auth.uid());
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason) values(auth.uid(),'set_member_role','role_assignments',p_member_id,array['role'],trim(p_reason));
  return p_new_role;
end;
$$;
revoke all on function public.set_member_role(uuid,text,text) from public,anon;
grant execute on function public.set_member_role(uuid,text,text) to authenticated;

drop policy "submitters and HR read cases" on public.member_cases;
create policy "submitters and HR read cases" on public.member_cases for select to authenticated
  using (submitted_by=auth.uid() or public.has_club_permission('hr.cases.view'));
drop policy "submitters and HR read case history" on public.member_case_history;
create policy "submitters and HR read case history" on public.member_case_history for select to authenticated
  using (exists(select 1 from public.member_cases mc where mc.id=case_id
    and (mc.submitted_by=auth.uid() or public.has_club_permission('hr.cases.view'))));

create or replace function public.update_member_profile(
  p_member_id uuid,p_full_name text,p_email text,p_study_program text,p_cohort text,p_reason text,p_phone_number text default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare prior public.member_profiles%rowtype; next_email text; next_program text; next_cohort text; next_phone text;
begin
  if auth.uid() is null or not public.has_club_permission('members.profile.edit') then
    raise exception 'Not authorized to edit member profiles' using errcode='42501';
  end if;
  if p_full_name is null or length(trim(p_full_name))<2 or length(trim(p_full_name))>120 or p_reason is null or length(trim(p_reason))<4 then
    raise exception 'A valid member name and change reason are required' using errcode='22023';
  end if;
  if p_email is not null and length(trim(p_email))>254 then raise exception 'Email address is too long' using errcode='22023'; end if;
  if p_study_program is not null and length(trim(p_study_program))>150 then raise exception 'Study program is too long' using errcode='22023'; end if;
  if p_cohort is not null and length(trim(p_cohort))>80 then raise exception 'Cohort is too long' using errcode='22023'; end if;
  if p_phone_number is not null and (length(trim(p_phone_number))>32 or trim(p_phone_number) !~ '^[+0-9() .-]+$') then raise exception 'Enter a valid phone number' using errcode='22023'; end if;
  select * into prior from public.member_profiles where id=p_member_id for update;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  next_email:=nullif(trim(p_email),''); next_program:=nullif(trim(p_study_program),''); next_cohort:=nullif(trim(p_cohort),''); next_phone:=nullif(trim(p_phone_number),'');
  if (prior.full_name,prior.email,prior.study_program,prior.cohort,prior.phone_number) is not distinct from (trim(p_full_name),next_email,next_program,next_cohort,next_phone) then return; end if;
  perform set_config('app.member_profile_update','on',true);
  update public.member_profiles set full_name=trim(p_full_name),email=next_email,study_program=next_program,cohort=next_cohort,phone_number=next_phone,updated_at=now() where id=p_member_id;
  insert into public.member_profile_history(member_id,previous_full_name,new_full_name,previous_email,new_email,previous_study_program,new_study_program,previous_cohort,new_cohort,previous_phone_number,new_phone_number,reason,changed_by)
    values(p_member_id,prior.full_name,trim(p_full_name),prior.email,next_email,prior.study_program,next_program,prior.cohort,next_cohort,prior.phone_number,next_phone,trim(p_reason),auth.uid());
end;
$$;
revoke all on function public.update_member_profile(uuid,text,text,text,text,text) from public;
revoke all on function public.update_member_profile(uuid,text,text,text,text,text,text) from public;
grant execute on function public.update_member_profile(uuid,text,text,text,text,text,text) to authenticated;

create or replace function public.change_member_status(p_member_id uuid,p_new_status text,p_reason text)
returns text language plpgsql security definer set search_path = public
as $$
declare previous_status text; current_term uuid; active_role text;
begin
  if auth.uid() is null or not public.has_club_permission('members.status.edit') then
    raise exception 'Not authorized to change membership status' using errcode='42501';
  end if;
  if p_new_status is null or p_new_status not in ('applicant','active','suspended','former') or length(trim(p_reason))<4 then
    raise exception 'A valid status and reason are required' using errcode='22023';
  end if;
  select status into previous_status from public.member_profiles where id=p_member_id for update;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  if p_new_status<>'active' then
    select id into current_term from public.club_terms where is_current;
    select role into active_role from public.role_assignments where member_id=p_member_id and term_id=current_term and role<>'member' and starts_at<=now() and ends_at is null for update;
    if active_role='president' and not exists(
      select 1 from public.role_assignments ra join public.member_profiles mp on mp.id=ra.member_id
      where ra.term_id=current_term and ra.role='president' and ra.member_id<>p_member_id and ra.starts_at<=now() and ra.ends_at is null and mp.status='active'
    ) then raise exception 'Assign another active President before changing this status' using errcode='23514'; end if;
    if active_role is not null then
      update public.role_assignments set ends_at=now() where member_id=p_member_id and term_id=current_term and role=active_role and ends_at is null;
      insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by)
        values(p_member_id,active_role,null,'Membership status changed: '||trim(p_reason),auth.uid());
    end if;
  end if;
  perform set_config('app.member_status_change','on',true);
  update public.member_profiles set status=p_new_status,archived_at=case when p_new_status='former' then coalesce(archived_at,current_date) else null end,updated_at=now() where id=p_member_id;
  insert into public.member_status_history(member_id,old_status,new_status,reason,changed_by) values(p_member_id,previous_status,p_new_status,trim(p_reason),auth.uid());
  return p_new_status;
end;
$$;
revoke all on function public.change_member_status(uuid,text,text) from public;
grant execute on function public.change_member_status(uuid,text,text) to authenticated;

create or replace function public.update_member_case(p_case_id uuid,p_new_status text,p_response text)
returns text language plpgsql security definer set search_path = public
as $$
declare case_row public.member_cases%rowtype; safe_response text; history_note text;
begin
  if auth.uid() is null or not public.has_club_permission('hr.cases.manage') then
    raise exception 'Not authorized to manage HR cases' using errcode='42501';
  end if;
  if p_new_status is null or p_new_status not in ('new','reviewing','resolved','closed') or length(coalesce(p_response,''))>3000 then
    raise exception 'Case status or response is invalid' using errcode='22023';
  end if;
  select * into case_row from public.member_cases where id=p_case_id for update;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  safe_response:=trim(coalesce(p_response,''));
  if p_new_status in ('resolved','closed') and length(safe_response)<4 then raise exception 'Add a response before resolving or closing a case' using errcode='22023'; end if;
  history_note:=case when safe_response<>'' then safe_response else 'Case status updated' end;
  update public.member_cases set status=p_new_status,response=case when safe_response<>'' then safe_response else response end,updated_at=now(),
    resolved_at=case when p_new_status in ('resolved','closed') then coalesce(resolved_at,now()) when p_new_status in ('new','reviewing') then null else resolved_at end
    where id=p_case_id;
  insert into public.member_case_history(case_id,old_status,new_status,note,changed_by) values(p_case_id,case_row.status,p_new_status,history_note,auth.uid());
  insert into public.notifications(recipient_id,title,body,category,target_path)
    values(case_row.submitted_by,'HR updated your support case',case when safe_response<>'' then 'Status: '||replace(p_new_status,'_',' ')||' · '||left(safe_response,240) else 'Status: '||replace(p_new_status,'_',' ') end,'hr_case','/support');
  return p_new_status;
end;
$$;
revoke all on function public.update_member_case(uuid,text,text) from public;
grant execute on function public.update_member_case(uuid,text,text) to authenticated;

create or replace function public.update_assigned_task_status(
  p_task_id uuid,p_new_status text,p_reason text default null
)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  actor_id uuid:=auth.uid(); actor_can_manage boolean; actor_owns_team boolean:=false;
  actor_created_task boolean:=false; actor_is_assigned boolean:=false;
  prior_task_status text; target_team text; target_title text; task_creator uuid;
  prior_assignments jsonb; is_backward boolean:=false; latest_cancellation public.task_status_history%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_new_status is null or p_new_status not in ('todo','in_progress','blocked','done','cancelled') then
    raise exception 'Invalid task status' using errcode='22023';
  end if;
  select status,team,title,created_by into prior_task_status,target_team,target_title,task_creator
    from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;
  actor_can_manage:=public.has_club_permission('tasks.manage');
  actor_owns_team:=
    (target_team='communications' and public.has_club_role(array['communications_officer']))
    or (target_team='treasury' and public.has_club_role(array['treasurer','vice_treasurer']))
    or (target_team='hr' and public.has_club_role(array['hr','vice_hr']))
    or (target_team='secretariat' and public.has_club_role(array['general_secretary']))
    or (target_team='logistics' and public.has_club_role(array['logistics_officer','vice_logistics_officer']));
  actor_created_task:=task_creator=actor_id;
  select exists(select 1 from public.task_assignments where task_id=p_task_id and member_id=actor_id) into actor_is_assigned;
  if not (actor_can_manage or actor_owns_team or actor_created_task or actor_is_assigned) then
    raise exception 'Not authorized to update this task' using errcode='42501';
  end if;
  if p_new_status='cancelled' and not actor_can_manage then
    raise exception 'Only board members can cancel a task' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('member_id',member_id,'status',status) order by member_id),'[]'::jsonb)
    into prior_assignments from public.task_assignments where task_id=p_task_id;
  if jsonb_array_length(prior_assignments)=0 then raise exception 'Task has no assignees' using errcode='23514'; end if;
  if prior_task_status='cancelled' and p_new_status<>'cancelled' then
    if not actor_can_manage then raise exception 'Only board members can restore a cancelled task' using errcode='42501'; end if;
    select * into latest_cancellation from public.task_status_history where task_id=p_task_id and status_scope='task' and new_status='cancelled' order by created_at desc,id desc limit 1;
    if found and p_new_status<>latest_cancellation.previous_status then raise exception 'Choose the status this task had before it was cancelled' using errcode='22023'; end if;
    if p_reason is null or length(trim(p_reason))<4 then raise exception 'Explain why this task cancellation is being corrected' using errcode='22023'; end if;
    insert into public.task_status_history(task_id,changed_by,status_scope,previous_status,new_status,previous_assignment_statuses,reason)
      values(p_task_id,actor_id,'task',prior_task_status,p_new_status,prior_assignments,trim(p_reason));
    if found then
      update public.task_assignments ta set status=s.status,updated_at=now() from jsonb_to_recordset(latest_cancellation.previous_assignment_statuses) as s(member_id uuid,status text) where ta.task_id=p_task_id and ta.member_id=s.member_id;
    else update public.task_assignments set status=p_new_status,updated_at=now() where task_id=p_task_id; end if;
    update public.tasks set status=p_new_status,updated_at=now() where id=p_task_id;
    return p_new_status;
  end if;
  if p_new_status=prior_task_status and actor_can_manage then return p_new_status; end if;
  if actor_can_manage or actor_owns_team or actor_created_task then
    select exists(select 1 from jsonb_to_recordset(prior_assignments) as s(member_id uuid,status text)
      where not ((s.status='todo' and p_new_status in ('in_progress','blocked','done')) or (s.status='in_progress' and p_new_status in ('blocked','done')) or (s.status='blocked' and p_new_status='done') or s.status=p_new_status or p_new_status='cancelled')) into is_backward;
    if is_backward and (p_reason is null or length(trim(p_reason))<4) then raise exception 'Explain why this task status is being moved backward' using errcode='22023'; end if;
    insert into public.task_status_history(task_id,changed_by,status_scope,previous_status,new_status,previous_assignment_statuses,reason)
      values(p_task_id,actor_id,'task',prior_task_status,p_new_status,prior_assignments,nullif(trim(p_reason),''));
    update public.tasks set status=p_new_status,updated_at=now() where id=p_task_id;
    update public.task_assignments set status=p_new_status,updated_at=now() where task_id=p_task_id;
  else
    if not actor_is_assigned then raise exception 'Not authorized to update this task' using errcode='42501'; end if;
    select status into prior_task_status from public.task_assignments where task_id=p_task_id and member_id=actor_id for update;
    if prior_task_status='cancelled' then raise exception 'This task has been cancelled' using errcode='42501'; end if;
    is_backward:=not ((prior_task_status='todo' and p_new_status in ('in_progress','blocked','done')) or (prior_task_status='in_progress' and p_new_status in ('blocked','done')) or (prior_task_status='blocked' and p_new_status='done') or prior_task_status=p_new_status);
    if is_backward and (p_reason is null or length(trim(p_reason))<4) then raise exception 'Explain why this task status is being moved backward' using errcode='22023'; end if;
    insert into public.task_status_history(task_id,changed_by,status_scope,assignment_member_id,previous_status,new_status,previous_assignment_statuses,reason)
      values(p_task_id,actor_id,'assignment',actor_id,prior_task_status,p_new_status,prior_assignments,nullif(trim(p_reason),''));
    update public.task_assignments set status=p_new_status,updated_at=now() where task_id=p_task_id and member_id=actor_id;
    update public.tasks set status=case when exists(select 1 from public.task_assignments where task_id=p_task_id and status='cancelled') then 'cancelled' when (select bool_and(status='done') from public.task_assignments where task_id=p_task_id) then 'done' when exists(select 1 from public.task_assignments where task_id=p_task_id and status='blocked') then 'blocked' when exists(select 1 from public.task_assignments where task_id=p_task_id and status='in_progress') then 'in_progress' else 'todo' end,updated_at=now() where id=p_task_id;
  end if;
  if p_new_status='cancelled' then
    insert into public.notifications(recipient_id,title,body,category,target_path) select ta.member_id,'Task cancelled',target_title,'task','/tasks' from public.task_assignments ta where ta.task_id=p_task_id and ta.member_id<>actor_id;
  elsif p_new_status in ('blocked','done') and task_creator<>actor_id then
    insert into public.notifications(recipient_id,title,body,category,target_path) values(task_creator,case when p_new_status='blocked' then 'A task is blocked' else 'A task was completed' end,target_title,'task','/tasks');
  end if;
  return p_new_status;
end;
$$;
revoke all on function public.update_assigned_task_status(uuid,text,text) from public,anon;
grant execute on function public.update_assigned_task_status(uuid,text,text) to authenticated;

