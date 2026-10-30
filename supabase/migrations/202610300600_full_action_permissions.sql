-- Full action-level role permissions and authorization rules.
-- This migration is additive to 202610300500_detailed_role_permissions.sql.
insert into public.club_permission_catalog(permission_key,module_name,display_name,description,built_in_roles) values
('members.view','Members','View member directory','Read member roster details and contact information.',array['president','vice_president','hr','vice_hr','treasurer','vice_treasurer','communications_officer','general_secretary','logistics_officer','vice_logistics_officer']),
('members.invite','Members','Invite members','Create and onboard member accounts.',array['president','vice_president','hr','vice_hr']),
('members.profile.edit','Members','Edit member profiles','Change names, email addresses, phone numbers, study programs, and cohorts.',array['president','vice_president','hr','vice_hr']),
('members.status.edit','Members','Change membership status','Activate, suspend, or archive member accounts.',array['president','vice_president','hr','vice_hr']),
('members.history.view','HR','View member history','Read member profile and membership status history.',array['president','vice_president','hr','vice_hr']),
('members.roles.view','Roles','View role assignments','Read the current role assignments.',array['president','vice_president','hr','vice_hr','general_secretary']),
('members.roles.manage','Roles','Assign built-in roles','Assign board roles to members.',array['president']),
('roles.assign_custom','Roles & Permissions','Assign custom roles','Assign custom roles to members.',array['president']),
('terms.manage','Roles','Manage officer terms','Start a new club term and transfer officer assignments.',array['president']),
('members.account.manage','Members','Manage member accounts','Reset passwords and delete eligible accounts.',array['president','vice_president','hr','vice_hr']),
('events.view','Events','View events','Read published event details and calendars.',array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']),
('events.create','Events','Create events','Create and publish club events.',array['president','vice_president','hr','vice_hr']),
('events.edit','Events','Edit events','Change scheduled event details.',array['president','vice_president','hr','vice_hr']),
('events.cancel','Events','Cancel events','Cancel events with a reason.',array['president','vice_president','hr','vice_hr']),
('events.complete','Events','Complete events','Finalize ended events with a reason.',array['president','vice_president','hr','vice_hr']),
('events.contribution.manage','Events','Set event contributions','Set or change event contributions.',array['president','treasurer','vice_treasurer']),
('logistics.view','Logistics','View inventory and requests','Read club inventory and purchase requests.',array['president','vice_president','logistics_officer','vice_logistics_officer']),
('attendance.roster.view','Attendance','View attendance rosters','Read attendance sessions and member rosters without changing or exporting them.',array['president','vice_president','hr','vice_hr']),
('attendance.sessions.manage','Attendance','Manage attendance sessions','Open and close attendance sessions and issue QR codes.',array['president','vice_president','hr','vice_hr']),
('attendance.reports.view','Attendance','View attendance reports','Read attendance rosters, history and reports.',array['president','vice_president','hr','vice_hr']),
('attendance.records.correct','Attendance','Correct attendance records','Change a member attendance record with a reason.',array['president','vice_president','hr','vice_hr']),
('finance.view','Finance','View financial records','Read club financial transactions and balances.',array['president','vice_president','treasurer','vice_treasurer']),
('finance.records.manage','Finance','Record financial activity','Record contributions, purchases, and reversals.',array['president','treasurer','vice_treasurer']),
('finance.contributions.manage','Finance','Manage event contributions','Generate collection expectations and set event contributions.',array['president','treasurer','vice_treasurer']),
('finance.receipts.audit','Finance','Audit receipt uploads','Find and remove abandoned receipt uploads.',array['president','treasurer','vice_treasurer']),
('finance.reports.export','Finance','Export finance reports','Export club ledger and reconciliation reports.',array['president','vice_president','treasurer','vice_treasurer']),
('finance.purchases.review','Finance','Review purchase requests','Approve or decline purchase requests and record payment.',array['president','vice_president','treasurer','vice_treasurer']),
('finance.reconcile','Finance','Reconcile balances','Record and review financial reconciliations.',array['president','vice_president','treasurer','vice_treasurer']),
('finance.periods.close','Finance','Close financial periods','Close a financial period with an audited reason.',array['president','treasurer']),
('points.view','Points','View points','Read point transactions and member balances.',array['president','vice_president','hr','vice_hr']),
('hr.points.manage','HR','Manage member points','Award and correct member participation points.',array['president','hr','vice_hr']),
('tasks.view','Tasks','View assigned tasks','Read tasks assigned to the member or managed by their team.',array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer','member']),
('tasks.manage','Tasks','Manage tasks','Create tasks, assign members, and change task status.',array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']),
('tasks.cancel','Tasks','Cancel tasks','Cancel a task or restore a mistaken cancellation.',array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']),
('tasks.delete','Tasks','Delete tasks','Delete tasks you own or can manage for your team.',array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']),
('hr.cases.view','HR','View HR support cases','Read submitted support cases and their history.',array['president','vice_president','hr','vice_hr']),
('hr.cases.manage','HR','Respond to HR support cases','Change case status and send a response to the member.',array['president','vice_president','hr','vice_hr']),
('communications.inbox.manage','Communications','Manage member inbox','Start and respond to private member conversations.',array['president','vice_president','communications_officer']),
('communications.news.manage','Communications','Publish club news','Create, edit, and publish announcements.',array['president','vice_president','communications_officer','general_secretary']),
('communications.ideas.review','Communications','Review member ideas','Review and respond to submitted ideas.',array['president','vice_president','general_secretary']),
('logistics.inventory.manage','Logistics','Manage inventory','Add inventory items and record stock movements.',array['president','vice_president','logistics_officer','vice_logistics_officer']),
('logistics.purchases.request','Logistics','Request purchases','Submit requests for club materials.',array['president','vice_president','logistics_officer','vice_logistics_officer']),
('roles.view','Roles & Permissions','View roles and permissions','Read role definitions and their permissions.',array['president']),
('roles.manage','Roles & Permissions','Create roles and edit permissions','Create custom roles and choose their permissions.',array['president'])
on conflict (permission_key) do update set module_name=excluded.module_name,display_name=excluded.display_name,description=excluded.description,built_in_roles=excluded.built_in_roles;

update public.club_roles cr set permissions=coalesce((
  select array_agg(pc.permission_key order by pc.module_name,pc.display_name)
  from public.club_permission_catalog pc where cr.role_key=any(pc.built_in_roles)
),'{}'::text[]) where not cr.is_custom;

-- Replace broad legacy policies so custom roles are governed by their grants.
drop policy if exists "read own profile or roster" on public.member_profiles;
drop policy if exists "president manages profiles" on public.member_profiles;
drop policy if exists "HR reads member status history" on public.member_status_history;
drop policy if exists "HR reads member profile history" on public.member_profile_history;
drop policy if exists "read role assignments" on public.role_assignments;
drop policy if exists "president reads role assignments" on public.role_assignments;
drop policy if exists "president reads role history" on public.role_assignment_history;
drop policy if exists "read published events" on public.events;
drop policy if exists "officers update events" on public.events;
drop policy if exists "officers create events as themselves" on public.events;
drop policy if exists "president removes events" on public.events;
drop policy if exists "HR reads attendance sessions" on public.attendance_sessions;
drop policy if exists "members read sessions with own attendance" on public.attendance_sessions;
drop policy if exists "HR updates attendance sessions" on public.attendance_sessions;
drop policy if exists "HR creates attendance sessions as themselves" on public.attendance_sessions;
drop policy if exists "members and HR read attendance" on public.attendance_records;
drop policy if exists "HR reads attendance correction history" on public.attendance_correction_history;
drop policy if exists "read own or treasury payment expectations" on public.payment_expectations;
drop policy if exists "treasury manages expectations" on public.payment_expectations;
drop policy if exists "read own or treasury financial entries" on public.financial_transactions;
drop policy if exists "treasury creates entries" on public.financial_transactions;
drop policy if exists "read own or HR points" on public.point_transactions;
drop policy if exists "HR awards points" on public.point_transactions;
drop policy if exists "assigned members read tasks" on public.tasks;
drop policy if exists "officers create tasks" on public.tasks;
drop policy if exists "officers update tasks" on public.tasks;
drop policy if exists "members read own assignments" on public.task_assignments;
drop policy if exists "officers assign tasks" on public.task_assignments;
drop policy if exists "read news by audience" on public.announcements;
drop policy if exists "communications and secretary publish as themselves" on public.announcements;
drop policy if exists "communications and secretary update news" on public.announcements;
drop policy if exists "president removes news" on public.announcements;
drop policy if exists "members submit own ideas" on public.member_ideas;
drop policy if exists "members and leaders read ideas" on public.member_ideas;
drop policy if exists "leaders review ideas" on public.member_ideas;
drop policy if exists "members read inventory" on public.inventory_items;
drop policy if exists "logistics manages inventory" on public.inventory_items;
drop policy if exists "logistics creates inventory as themselves" on public.inventory_items;
drop policy if exists "logistics creates zero-stock inventory as themselves" on public.inventory_items;
drop policy if exists "president retires inventory records" on public.inventory_items;
drop policy if exists "members read inventory movements" on public.inventory_movements;
drop policy if exists "logistics records inventory movements" on public.inventory_movements;
drop policy if exists "officers create notifications" on public.notifications;
drop policy if exists "submitters and HR read cases" on public.member_cases;
drop policy if exists "submitters and HR read case history" on public.member_case_history;
drop policy if exists "authenticated users read role catalog" on public.club_roles;
drop policy if exists "no financial overwrite" on public.financial_transactions;
drop policy if exists "points immutable" on public.point_transactions;
drop policy if exists "no point deletion" on public.point_transactions;
drop policy if exists "inventory movements are immutable" on public.inventory_movements;
drop policy if exists "inventory movements cannot be deleted" on public.inventory_movements;
drop policy if exists "read current term" on public.club_terms;
drop policy if exists "president reads audit" on public.audit_log;
drop policy if exists "read own notifications" on public.notifications;
drop policy if exists "update own notifications" on public.notifications;
drop policy if exists "thread member and target role holders read threads" on public.member_communication_threads;
drop policy if exists "thread party messages follow thread visibility" on public.member_communication_messages;
drop policy if exists "members and communications officers read communication threads" on public.member_communication_threads;
drop policy if exists "thread participants read communication messages" on public.member_communication_messages;
create policy "roles catalog follows permissions" on public.club_roles for select to authenticated using (
  exists(select 1 from public.role_assignments ra where ra.role=role_key and ra.member_id=auth.uid())
  or public.has_club_permission('roles.view') or public.has_club_permission('roles.manage')
);

alter table public.club_permission_catalog enable row level security;
grant select on public.club_permission_catalog to authenticated;
drop policy if exists "authenticated users read permission catalog" on public.club_permission_catalog;
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

create or replace function public.create_club_role(p_name text,p_permissions text[],p_reason text)
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
  if p_permissions is null or cardinality(p_permissions)>(select count(*) from public.club_permission_catalog) or exists(
    select 1 from unnest(p_permissions) requested(permission_key)
    where not exists(select 1 from public.club_permission_catalog where permission_key=requested.permission_key and permission_key not in ('roles.manage','members.roles.manage','roles.assign_custom','terms.manage'))
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
  if p_role_key is null or p_permissions is null or cardinality(p_permissions)>(select count(*) from public.club_permission_catalog) or p_reason is null or length(trim(p_reason))<4 then
    raise exception 'A valid permission list and reason are required' using errcode='22023';
  end if;
  if exists(select 1 from public.club_roles where role_key=p_role_key and not is_custom) then
    raise exception 'Built-in role permissions cannot be edited' using errcode='42501';
  end if;
  if not exists(select 1 from public.club_roles where role_key=p_role_key and is_custom) then
    raise exception 'Custom role not found' using errcode='P0002';
  end if;
  if exists(select 1 from unnest(p_permissions) requested(permission_key)
      where not exists(select 1 from public.club_permission_catalog where permission_key=requested.permission_key and permission_key not in ('roles.manage','members.roles.manage','roles.assign_custom','terms.manage'))) then
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

drop policy if exists "read own profile or roster" on public.member_profiles;
drop policy if exists "members read own profile" on public.member_profiles;
drop policy if exists "president manages profiles" on public.member_profiles;
create policy "read own profile or roster" on public.member_profiles for select to authenticated using (id=auth.uid() or public.has_club_permission('members.view'));
drop policy if exists "edit member profiles by permission" on public.member_profiles;
drop policy if exists "HR reads member status history" on public.member_status_history;
create policy "HR reads member status history" on public.member_status_history for select to authenticated using (public.has_club_permission('members.history.view'));
drop policy if exists "HR reads member profile history" on public.member_profile_history;
create policy "HR reads member profile history" on public.member_profile_history for select to authenticated using (public.has_club_permission('members.history.view'));

create or replace function public.set_member_role(p_member_id uuid,p_new_role text,p_reason text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare current_term uuid; current_role text; existing_holder uuid; is_target_custom boolean;
begin
  if auth.uid() is null or not (public.has_club_permission('members.roles.manage') or public.has_club_permission('roles.assign_custom')) then raise exception 'Not authorized to assign club roles' using errcode='42501'; end if;
  if p_new_role is null or p_reason is null or length(trim(p_reason))<4 then raise exception 'A role and reason are required' using errcode='22023'; end if;
  select is_custom into is_target_custom from public.club_roles where role_key=p_new_role;
  if not found then raise exception 'Choose an available role' using errcode='22023'; end if;
  if (is_target_custom and not public.has_club_permission('roles.assign_custom')) or (not is_target_custom and p_new_role<>'member' and not public.has_club_permission('members.roles.manage')) then raise exception 'You are not authorized to assign this role' using errcode='42501'; end if;
  select id into current_term from public.club_terms where is_current;
  if current_term is null then raise exception 'No current club term' using errcode='23514'; end if;
  if not exists(select 1 from public.member_profiles where id=p_member_id and status='active') then raise exception 'Only active members can receive roles' using errcode='23514'; end if;
  select role into current_role from public.role_assignments where member_id=p_member_id and term_id=current_term and role<>'member' and starts_at<=now() and ends_at is null for update;
  if current_role=p_new_role then return p_new_role; end if;
  if not is_target_custom and p_new_role<>'member' then
    select member_id into existing_holder from public.role_assignments where term_id=current_term and role=p_new_role and starts_at<=now() and ends_at is null and member_id<>p_member_id for update;
    if existing_holder is not null and p_new_role<>'president' then raise exception 'That officer role is already assigned' using errcode='23505'; end if;
    if existing_holder is not null and p_new_role='president' then update public.role_assignments set ends_at=now() where member_id=existing_holder and term_id=current_term and role='president' and ends_at is null; insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by) values(existing_holder,'president',null,'President role transferred: '||trim(p_reason),auth.uid()); end if;
  end if;
  if current_role is not null then update public.role_assignments set ends_at=now() where member_id=p_member_id and term_id=current_term and role=current_role and ends_at is null; end if;
  if p_new_role<>'member' then insert into public.role_assignments(member_id,term_id,role,assigned_by,starts_at) values(p_member_id,current_term,p_new_role,auth.uid(),now()); end if;
  insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by) values(p_member_id,current_role,nullif(p_new_role,'member'),trim(p_reason),auth.uid());
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason) values(auth.uid(),'set_member_role','role_assignments',p_member_id,array['role'],trim(p_reason));
  return p_new_role;
end; $$;

revoke all on function public.set_member_role(uuid,text,text) from public,anon;
grant execute on function public.set_member_role(uuid,text,text) to authenticated;


-- Remove legacy role-key RLS policies; permissive policies combine with OR.
drop policy if exists "read published events" on public.events;
create policy "read published events" on public.events for select to authenticated using (status<>'draft' or public.has_club_permission('events.view') or public.has_club_permission('events.create') or public.has_club_permission('events.edit'));
drop policy if exists "update events by permission" on public.events;
create policy "update events by permission" on public.events for update to authenticated using (public.has_club_permission('events.edit')) with check (public.has_club_permission('events.edit'));
drop policy if exists "delete events by permission" on public.events;
create policy "delete events by permission" on public.events for delete to authenticated using (public.has_club_permission('events.cancel'));
drop policy if exists "create events by permission" on public.events;
create policy "create events by permission" on public.events for insert to authenticated with check (public.has_club_permission('events.create') and created_by=auth.uid());

drop policy if exists "read role assignments" on public.role_assignments;
create policy "read role assignments" on public.role_assignments for select to authenticated using (member_id=auth.uid() or public.has_club_permission('members.roles.view'));
drop policy if exists "president reads role assignments" on public.role_assignments;
create policy "president reads role assignments" on public.role_assignments for select to authenticated using (public.has_club_permission('roles.manage') or public.has_club_permission('roles.assign_custom'));
drop policy if exists "read role assignment history" on public.role_assignment_history;
create policy "read role assignment history" on public.role_assignment_history for select to authenticated using (member_id=auth.uid() or public.has_club_permission('members.history.view'));

drop policy if exists "read attendance sessions by permission" on public.attendance_sessions;
create policy "read attendance sessions by permission" on public.attendance_sessions for select to authenticated using (public.has_club_permission('attendance.reports.view') or exists(select 1 from public.attendance_records ar where ar.session_id=id and ar.member_id=auth.uid()));
drop policy if exists "manage attendance sessions by permission" on public.attendance_sessions;
create policy "manage attendance sessions by permission" on public.attendance_sessions for all to authenticated using (public.has_club_permission('attendance.sessions.manage')) with check (public.has_club_permission('attendance.sessions.manage'));
drop policy if exists "members read attendance records" on public.attendance_records;
create policy "members read attendance records" on public.attendance_records for select to authenticated using (member_id=auth.uid() or public.has_club_permission('attendance.reports.view') or public.has_club_permission('attendance.roster.view'));
drop policy if exists "correct attendance by permission" on public.attendance_records;
create policy "correct attendance by permission" on public.attendance_records for all to authenticated using (public.has_club_permission('attendance.records.correct')) with check (public.has_club_permission('attendance.records.correct'));
drop policy if exists "read attendance correction history by permission" on public.attendance_correction_history;
create policy "read attendance correction history by permission" on public.attendance_correction_history for select to authenticated using (public.has_club_permission('attendance.reports.view'));
drop policy if exists "finance permission reads transactions" on public.financial_transactions;
create policy "finance permission reads transactions" on public.financial_transactions for select to authenticated using (member_id=auth.uid() or public.has_club_permission('finance.view'));
drop policy if exists "finance creates transactions" on public.financial_transactions;
create policy "finance creates transactions" on public.financial_transactions for insert to authenticated with check (public.has_club_permission('finance.records.manage') and created_by=auth.uid());
drop policy if exists "read own points or permitted points" on public.point_transactions;
create policy "read own points or permitted points" on public.point_transactions for select to authenticated using (member_id=auth.uid() or public.has_club_permission('points.view') or public.has_club_permission('hr.points.manage'));
drop policy if exists "read own tasks or permitted tasks" on public.tasks;
create policy "read own tasks or permitted tasks" on public.tasks for select to authenticated using (public.has_club_permission('tasks.manage') or public.has_club_permission('tasks.view') or created_by=auth.uid() or exists(select 1 from public.task_assignments ta where ta.task_id=id and ta.member_id=auth.uid()));
drop policy if exists "create tasks by permission" on public.tasks;
create policy "create tasks by permission" on public.tasks for insert to authenticated with check (public.has_club_permission('tasks.manage') and created_by=auth.uid());
drop policy if exists "update tasks by permission" on public.tasks;
create policy "update tasks by permission" on public.tasks for update to authenticated using (public.has_club_permission('tasks.manage')) with check (public.has_club_permission('tasks.manage'));
drop policy if exists "read own task assignments or manage" on public.task_assignments;
create policy "read own task assignments or manage" on public.task_assignments for select to authenticated using (member_id=auth.uid() or public.has_club_permission('tasks.manage') or public.has_club_permission('tasks.view'));
drop policy if exists "manage task assignments by permission" on public.task_assignments;
create policy "manage task assignments by permission" on public.task_assignments for all to authenticated using (public.has_club_permission('tasks.manage')) with check (public.has_club_permission('tasks.manage') and assigned_by=auth.uid());
drop policy if exists "delete tasks by permission" on public.tasks;
create policy "delete tasks by permission" on public.tasks for delete to authenticated using (public.has_club_permission('tasks.delete'));
drop policy if exists "read news by audience" on public.announcements;
create policy "read news by audience" on public.announcements for select to authenticated using (created_by=auth.uid() or public.has_club_permission('communications.news.manage') or (published_at is not null and audience='members') or (published_at is not null and audience='officers' and public.has_club_permission('members.roles.view')) or (published_at is not null and audience='team' and case target_team when 'leadership' then public.has_club_permission('roles.manage') when 'communications' then public.has_club_permission('communications.news.manage') when 'treasury' then public.has_club_permission('finance.view') when 'hr' then public.has_club_permission('hr.cases.view') when 'secretariat' then public.has_club_permission('communications.ideas.review') when 'logistics' then public.has_club_permission('logistics.view') else false end));
drop policy if exists "publish news by permission" on public.announcements;
create policy "publish news by permission" on public.announcements for insert to authenticated with check (public.has_club_permission('communications.news.manage') and created_by=auth.uid());
drop policy if exists "update news by permission" on public.announcements;
create policy "update news by permission" on public.announcements for update to authenticated using (public.has_club_permission('communications.news.manage')) with check (public.has_club_permission('communications.news.manage'));
drop policy if exists "delete news by permission" on public.announcements;
create policy "delete news by permission" on public.announcements for delete to authenticated using (public.has_club_permission('communications.news.manage'));
drop policy if exists "authenticated users submit own ideas" on public.member_ideas;
drop policy if exists "read ideas by permission" on public.member_ideas;
create policy "read ideas by permission" on public.member_ideas for select to authenticated using (submitted_by=auth.uid() or public.has_club_permission('communications.ideas.review'));
drop policy if exists "submit own ideas" on public.member_ideas;
create policy "submit own ideas" on public.member_ideas for insert to authenticated with check (submitted_by=auth.uid());
drop policy if exists "review ideas by permission" on public.member_ideas;
create policy "review ideas by permission" on public.member_ideas for update to authenticated using (public.has_club_permission('communications.ideas.review')) with check (public.has_club_permission('communications.ideas.review'));
drop policy if exists "read inventory by permission" on public.inventory_items;
create policy "read inventory by permission" on public.inventory_items for select to authenticated using (true);
drop policy if exists "manage inventory by permission" on public.inventory_items;
create policy "manage inventory by permission" on public.inventory_items for update to authenticated using (public.has_club_permission('logistics.inventory.manage')) with check (public.has_club_permission('logistics.inventory.manage'));
drop policy if exists "create inventory by permission" on public.inventory_items;
create policy "create inventory by permission" on public.inventory_items for insert to authenticated with check (public.has_club_permission('logistics.inventory.manage') and created_by=auth.uid());
drop policy if exists "delete inventory by permission" on public.inventory_items;
create policy "delete inventory by permission" on public.inventory_items for delete to authenticated using (public.has_club_permission('logistics.inventory.manage'));
drop policy if exists "read movements by permission" on public.inventory_movements;
create policy "read movements by permission" on public.inventory_movements for select to authenticated using (true);
drop policy if exists "create movements by permission" on public.inventory_movements;
create policy "create movements by permission" on public.inventory_movements for insert to authenticated with check (public.has_club_permission('logistics.inventory.manage') and created_by=auth.uid());
drop policy if exists "read payment expectations" on public.payment_expectations;
create policy "read payment expectations" on public.payment_expectations for select to authenticated using (member_id=auth.uid() or public.has_club_permission('finance.view') or public.has_club_permission('finance.contributions.manage'));
drop policy if exists "manage payment expectations" on public.payment_expectations;
create policy "manage payment expectations" on public.payment_expectations for all to authenticated using (public.has_club_permission('finance.contributions.manage')) with check (public.has_club_permission('finance.contributions.manage'));
drop policy if exists "read member case for submitter or HR" on public.member_cases;
create policy "read member case for submitter or HR" on public.member_cases for select to authenticated using (submitted_by=auth.uid() or public.has_club_permission('hr.cases.view'));
drop policy if exists "read member case history for submitter or HR" on public.member_case_history;
create policy "read member case history for submitter or HR" on public.member_case_history for select to authenticated using (exists(select 1 from public.member_cases mc where mc.id=case_id and (mc.submitted_by=auth.uid() or public.has_club_permission('hr.cases.view'))));
drop policy if exists "finance reconciliation by permission" on public.financial_reconciliations;
create policy "finance reconciliation by permission" on public.financial_reconciliations for select to authenticated using (public.has_club_permission('finance.view') or public.has_club_permission('finance.reconcile'));
drop policy if exists "finance periods by permission" on public.financial_period_closures;
create policy "finance periods by permission" on public.financial_period_closures for select to authenticated using (public.has_club_permission('finance.view') or public.has_club_permission('finance.periods.close'));
drop policy if exists "purchase request visibility by permission" on public.purchase_requests;
create policy "purchase request visibility by permission" on public.purchase_requests for select to authenticated using (requested_by=auth.uid() or public.has_club_permission('finance.purchases.review'));

create or replace function public.audit_report_export(p_report_type text,p_scope_id text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_report_type='attendance' then
    if not public.has_club_permission('attendance.reports.view') then raise exception 'Not authorized to export attendance'; end if;
  elsif p_report_type='finance' then
    if not public.has_club_permission('finance.reports.export') and p_scope_id is distinct from auth.uid()::text then raise exception 'Not authorized to export finance'; end if;
  elsif p_report_type='financial_reconciliation' then
    if not public.has_club_permission('finance.reports.export') then raise exception 'Not authorized to export financial reconciliations'; end if;
  else raise exception 'Unsupported report type'; end if;
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields) values(auth.uid(),'export','report:'||p_report_type,p_scope_id,array['csv_download']);
end; $$;
revoke all on function public.audit_report_export(text,text) from public,anon;
grant execute on function public.audit_report_export(text,text) to authenticated;

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
  prior_assignments jsonb; is_backward boolean:=false; has_cancellation boolean:=false; latest_cancellation public.task_status_history%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_new_status is null or p_new_status not in ('todo','in_progress','blocked','done','cancelled') then
    raise exception 'Invalid task status' using errcode='22023';
  end if;
  select status,team,title,created_by into prior_task_status,target_team,target_title,task_creator
    from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;
  actor_can_manage:=public.has_club_permission('tasks.manage');
  actor_owns_team:=actor_can_manage;
  actor_created_task:=task_creator=actor_id;
  select exists(select 1 from public.task_assignments where task_id=p_task_id and member_id=actor_id) into actor_is_assigned;
  if not (actor_can_manage or actor_owns_team or actor_created_task or actor_is_assigned) then
    raise exception 'Not authorized to update this task' using errcode='42501';
  end if;
  if p_new_status='cancelled' and not public.has_club_permission('tasks.cancel') then
    raise exception 'Only board members can cancel a task' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('member_id',member_id,'status',status) order by member_id),'[]'::jsonb)
    into prior_assignments from public.task_assignments where task_id=p_task_id;
  if jsonb_array_length(prior_assignments)=0 then raise exception 'Task has no assignees' using errcode='23514'; end if;
  if prior_task_status='cancelled' and p_new_status<>'cancelled' then
    if not public.has_club_permission('tasks.cancel') then raise exception 'Only task cancellation managers can restore a cancelled task' using errcode='42501'; end if;
    select * into latest_cancellation from public.task_status_history where task_id=p_task_id and status_scope='task' and new_status='cancelled' order by created_at desc,id desc limit 1;
    has_cancellation:=found;
    if has_cancellation and p_new_status<>latest_cancellation.previous_status then raise exception 'Choose the status this task had before it was cancelled' using errcode='22023'; end if;
    if p_reason is null or length(trim(p_reason))<4 then raise exception 'Explain why this task cancellation is being corrected' using errcode='22023'; end if;
    insert into public.task_status_history(task_id,changed_by,status_scope,previous_status,new_status,previous_assignment_statuses,reason)
      values(p_task_id,actor_id,'task',prior_task_status,p_new_status,prior_assignments,trim(p_reason));
    if has_cancellation then
      update public.task_assignments ta set status=s.status,updated_at=now() from jsonb_to_recordset(latest_cancellation.previous_assignment_statuses) as s(member_id uuid,status text) where ta.task_id=p_task_id and ta.member_id=s.member_id;
    else update public.task_assignments set status=p_new_status,updated_at=now() where task_id=p_task_id; end if;
    update public.tasks set status=p_new_status,updated_at=now() where id=p_task_id;
    return p_new_status;
  end if;
  if p_new_status=prior_task_status then return p_new_status; end if;
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



-- Rebind board actions to granular role permissions.
create or replace function public.record_manual_attendance(p_session_id uuid, p_member_id uuid, p_status text, p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare prior_status text; prior_source text; prior_checked_in timestamptz; prior_record_id uuid; attendance_id uuid;
begin
  if auth.uid() is null or not public.has_club_permission('attendance.records.correct') then
    raise exception 'Not authorized to correct attendance' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('present','absent','excused') or p_reason is null or length(trim(p_reason)) < 4 then
    raise exception 'A valid status and correction reason are required' using errcode='22023';
  end if;
  if not exists(select 1 from public.attendance_sessions where id=p_session_id) then
    raise exception 'Attendance session not found' using errcode='P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text||':'||p_member_id::text,0));
  select id,status,source,checked_in_at into prior_record_id,prior_status,prior_source,prior_checked_in
    from public.attendance_records where session_id=p_session_id and member_id=p_member_id for update;
  insert into public.attendance_records(session_id,member_id,status,source,checked_in_at,recorded_by,correction_reason)
    values(p_session_id,p_member_id,p_status,'manual',case when p_status='present' then now() else null end,auth.uid(),trim(p_reason))
    on conflict(session_id,member_id) do update set status=excluded.status,source='manual',checked_in_at=excluded.checked_in_at,recorded_by=auth.uid(),correction_reason=excluded.correction_reason,updated_at=now()
    returning id into attendance_id;
  insert into public.attendance_correction_history(attendance_record_id,session_id,member_id,previous_status,previous_source,previous_checked_in_at,new_status,reason,changed_by)
    values(attendance_id,p_session_id,p_member_id,prior_status,prior_source,prior_checked_in,p_status,trim(p_reason),auth.uid());
  return attendance_id;
end; $$;

create or replace function public.record_inventory_movement(
  p_item_id uuid, p_movement_type text, p_quantity integer,
  p_member_id uuid default null, p_event_id uuid default null, p_reason text default ''
)
returns integer language plpgsql security definer set search_path = public
as $$
declare item_row public.inventory_items%rowtype; signed_delta integer; resulting_quantity integer; outstanding_for_member integer;
begin
  if auth.uid() is null or not public.has_club_permission('logistics.inventory.manage') then
    raise exception 'Not authorized to manage inventory' using errcode='42501';
  end if;
  if p_quantity is null or p_quantity=0 or p_movement_type is null or p_movement_type not in ('received','checked_out','returned','adjustment') or length(trim(coalesce(p_reason,'')))<4 then
    raise exception 'A valid movement, non-zero quantity, and reason are required' using errcode='22023';
  end if;
  if p_movement_type <> 'adjustment' and p_quantity < 0 then
    raise exception 'Enter a positive quantity for this movement' using errcode='22023';
  end if;
  if p_movement_type in ('checked_out','returned') and p_member_id is null then
    raise exception 'A member is required for check-out and return' using errcode='22023';
  end if;
  select * into item_row from public.inventory_items where id=p_item_id for update;
  if not found then raise exception 'Inventory item not found' using errcode='P0002'; end if;
  if p_movement_type='returned' then
    select greatest(0,coalesce(-sum(quantity),0))::integer into outstanding_for_member
      from public.inventory_movements where item_id=p_item_id and member_id=p_member_id and movement_type in ('checked_out','returned');
    if p_quantity > outstanding_for_member then raise exception 'Return exceeds this memberâ€™s outstanding check-out' using errcode='22023'; end if;
  end if;
  signed_delta := case p_movement_type when 'checked_out' then -abs(p_quantity) when 'adjustment' then p_quantity else abs(p_quantity) end;
  resulting_quantity := item_row.quantity + signed_delta;
  if resulting_quantity < 0 then raise exception 'Movement exceeds available stock' using errcode='22023'; end if;
  insert into public.inventory_movements(item_id,member_id,event_id,quantity,movement_type,reason,created_by)
    values(p_item_id,p_member_id,p_event_id,signed_delta,p_movement_type,trim(p_reason),auth.uid());
  update public.inventory_items set quantity=resulting_quantity,updated_at=now() where id=p_item_id;
  return resulting_quantity;
end; $$;

create or replace function public.create_assigned_task(
  p_title text, p_description text, p_team text, p_priority text,
  p_due_at timestamptz, p_member_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_task_id uuid; unique_assignee_count integer; active_assignee_count integer;
begin
  if auth.uid() is null or not public.has_club_permission('tasks.manage') then
    raise exception 'Not authorized to create club tasks' using errcode='42501';
  end if;
  if p_title is null or length(trim(p_title))<2 or length(p_title)>140
     or length(coalesce(p_description,''))>2000
     or p_team is null or p_team not in ('club','president','communications','treasury','hr','secretariat','logistics')
     or p_priority is null or p_priority not in ('low','normal','high','urgent') then
    raise exception 'Task details are invalid' using errcode='22023';
  end if;
  
  if p_member_ids is null or cardinality(p_member_ids)=0 or cardinality(p_member_ids)>100 then
    raise exception 'Choose between 1 and 100 active members' using errcode='22023';
  end if;
  select count(distinct assignee_id)::integer into unique_assignee_count
    from unnest(p_member_ids) as selected(assignee_id) where assignee_id is not null;
  if unique_assignee_count<>cardinality(p_member_ids) then
    raise exception 'Assignee list must contain unique member accounts' using errcode='22023';
  end if;
  select count(*)::integer into active_assignee_count from public.member_profiles
    where id=any(p_member_ids) and status='active';
  if active_assignee_count<>cardinality(p_member_ids) then
    raise exception 'Every assignee must have active club membership' using errcode='22023';
  end if;

  insert into public.tasks(title,description,team,priority,status,due_at,created_by)
    values(trim(p_title),coalesce(trim(p_description),''),p_team,p_priority,'todo',p_due_at,auth.uid())
    returning id into new_task_id;
  insert into public.task_assignments(task_id,member_id,assigned_by)
    select new_task_id,assignee_id,auth.uid() from unnest(p_member_ids) as selected(assignee_id);
  insert into public.notifications(recipient_id,title,body,category,target_path)
    select assignee_id,'A task was assigned to you',trim(p_title),'task','/tasks'
    from unnest(p_member_ids) as selected(assignee_id);
  return new_task_id;
end; $$;

create or replace function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_team text;
  target_title text;
  task_creator uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select team,title,created_by into target_team,target_title,task_creator
    from public.tasks where id=p_task_id;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;

  if not public.has_club_permission('tasks.delete') and task_creator<>actor_id then
    raise exception 'Not authorized to delete this task' using errcode='42501';
  end if;

  perform set_config('app.change_reason','Task deleted: '||target_title,true);
  delete from public.task_assignments where task_id=p_task_id;
  delete from public.tasks where id=p_task_id;
end;
$$;

create or replace function public.create_club_event(
  p_title text,p_description text,p_event_type text,p_starts_at timestamptz,
  p_location text,p_expected_contribution_minor bigint
)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare event_id uuid;
begin
  if auth.uid() is null or not public.has_club_permission('events.create') then
    raise exception 'Not authorized to create club events' using errcode='42501';
  end if;
  if p_title is null or length(trim(p_title))<2 or length(p_title)>120
     or length(coalesce(p_description,''))>1500
     or p_event_type is null or p_event_type not in ('meeting','event','workshop','caravan','other')
     or p_starts_at is null or length(coalesce(p_location,''))>160
     or p_expected_contribution_minor is null or p_expected_contribution_minor<0 then
    raise exception 'Event details or contribution are invalid' using errcode='22023';
  end if;
  if p_expected_contribution_minor>0 and not public.has_club_permission('finance.contributions.manage') then
    raise exception 'Only the President or Treasury team can set an event contribution' using errcode='42501';
  end if;
  perform set_config('app.change_reason','Event created by an authorized officer',true);
  insert into public.events(title,description,event_type,starts_at,location,status,expected_contribution_minor,created_by,updated_by)
    values(trim(p_title),coalesce(trim(p_description),''),p_event_type,p_starts_at,nullif(trim(coalesce(p_location,'')),''),'published',p_expected_contribution_minor,auth.uid(),auth.uid())
    returning id into event_id;
  return event_id;
end; $$;

create or replace function public.set_event_contribution(p_event_id uuid,p_expected_minor bigint,p_reason text)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare current_status text; updated_expectations integer;
begin
  if auth.uid() is null or not (public.has_club_permission('events.contribution.manage') or public.has_club_permission('finance.contributions.manage')) then
    raise exception 'Not authorized to manage event contributions' using errcode='42501';
  end if;
  if p_expected_minor is null or p_expected_minor<0 or p_reason is null or length(trim(p_reason))<4 or length(p_reason)>500 then
    raise exception 'Enter a non-negative contribution and a reason of at least four characters' using errcode='22023';
  end if;
  select status into current_status from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if current_status not in ('published','in_progress') then
    raise exception 'Only published or in-progress events can have contribution changes' using errcode='23514';
  end if;
  perform set_config('app.change_reason',trim(p_reason),true);
  update public.events set expected_contribution_minor=p_expected_minor,updated_by=auth.uid() where id=p_event_id;
  update public.payment_expectations
    set expected_minor=p_expected_minor,waiver_minor=least(waiver_minor,p_expected_minor)
    where event_id=p_event_id;
  get diagnostics updated_expectations = row_count;
  return updated_expectations;
end; $$;

create or replace function public.cancel_club_event(p_event_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare event_status text;
begin
  if auth.uid() is null or not public.has_club_permission('events.cancel') then
    raise exception 'Not authorized to cancel club events' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason))<4 or length(p_reason)>500 then
    raise exception 'Add a cancellation reason of at least four characters.' using errcode='22023';
  end if;
  select status into event_status from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if event_status not in ('published','in_progress') then
    raise exception 'Only a published or in-progress event can be cancelled.' using errcode='23514';
  end if;
  perform set_config('app.change_reason',trim(p_reason),true);
  update public.events set status='cancelled',cancellation_reason=trim(p_reason),
    cancelled_at=now(),cancelled_by=auth.uid(),updated_by=auth.uid()
    where id=p_event_id;
  update public.attendance_sessions set state='closed' where event_id=p_event_id and state='open';
  return p_event_id;
end; $$;

create or replace function public.complete_club_event(p_event_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_status text;
  event_end timestamptz;
begin
  if auth.uid() is null or not public.has_club_permission('events.complete') then
    raise exception 'Not authorized to complete club events' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 4 or length(p_reason) > 500 then
    raise exception 'Add a completion note of at least four characters' using errcode='22023';
  end if;

  select status,coalesce(ends_at,starts_at)
    into event_status,event_end
    from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if event_status not in ('published','in_progress') then
    raise exception 'Only a published or in-progress event can be completed' using errcode='23514';
  end if;
  if event_end > now() then
    raise exception 'The event cannot be completed before its scheduled end time' using errcode='23514';
  end if;

  perform set_config('app.change_reason',trim(p_reason),true);
  update public.attendance_sessions
    set state='finalized'
    where event_id=p_event_id and state <> 'finalized';
  update public.events
    set status='completed',updated_by=auth.uid()
    where id=p_event_id;
  return p_event_id;
end;
$$;

create or replace function public.generate_event_payment_expectations(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_amount bigint;
  target_status text;
  attendee_count integer := 0;
begin
  if auth.uid() is null or not public.has_club_permission('finance.contributions.manage') then
    raise exception 'Not authorized to generate payment expectations' using errcode='42501';
  end if;

  select expected_contribution_minor,status
    into target_amount,target_status
    from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if target_status not in ('published','in_progress','completed') or target_amount<=0 then
    raise exception 'The event must be published and have a positive expected contribution' using errcode='22023';
  end if;
  if not exists(select 1 from public.attendance_sessions where event_id=p_event_id) then
    raise exception 'An attendance session must exist before syncing contribution expectations' using errcode='23514';
  end if;

  perform set_config('app.change_reason','Treasury refreshed contribution eligibility from present attendance',true);

  update public.payment_expectations pe
    set attendance_eligible=false,updated_by=auth.uid()
    where pe.event_id=p_event_id and pe.attendance_eligible=true
      and not exists (
        select 1 from public.attendance_sessions s
        join public.attendance_records ar on ar.session_id=s.id
        where s.event_id=p_event_id and ar.member_id=pe.member_id and ar.status='present'
      );
  insert into public.payment_expectations(event_id,member_id,expected_minor,attendance_eligible,updated_by)
    select p_event_id,ar.member_id,target_amount,true,auth.uid()
    from public.attendance_sessions s
    join public.attendance_records ar on ar.session_id=s.id and ar.status='present'
    where s.event_id=p_event_id
    on conflict(event_id,member_id) do update
      set expected_minor=excluded.expected_minor,
          attendance_eligible=true,
          updated_by=auth.uid()
      where payment_expectations.expected_minor is distinct from excluded.expected_minor
         or payment_expectations.attendance_eligible is distinct from true;
  select count(distinct ar.member_id)::integer into attendee_count
    from public.attendance_sessions s
    join public.attendance_records ar on ar.session_id=s.id and ar.status='present'
    where s.event_id=p_event_id;
  return attendee_count;
end;
$$;

create or replace function public.close_financial_period(p_start_date date,p_end_date date,p_reason text)
returns public.financial_period_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result public.financial_period_closures%rowtype;
begin
  if auth.uid() is null or not public.has_club_permission('finance.periods.close') then
    raise exception 'Not authorized to close a financial period.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date >= (now() at time zone 'Africa/Casablanca')::date then
    raise exception 'A period can only be closed after its end date has passed.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 4 or length(trim(p_reason)) > 400 then
    raise exception 'A reason between four and 400 characters is required.';
  end if;

  perform pg_advisory_xact_lock(884211, 290017);
  if exists (
    select 1 from public.financial_period_closures c
    where p_start_date <= c.end_date and p_end_date >= c.start_date
  ) then
    raise exception 'This date range overlaps an already closed period.';
  end if;

  insert into public.financial_period_closures(
    start_date,end_date,transaction_count,income_minor,expenses_minor,net_minor,reason,closed_by
  )
  select p_start_date,p_end_date,count(*)::integer,
    coalesce(sum(amount_minor) filter(where direction='in'),0)::bigint,
    coalesce(sum(amount_minor) filter(where direction='out'),0)::bigint,
    coalesce(sum(case when direction='in' then amount_minor else -amount_minor end),0)::bigint,
    trim(p_reason),auth.uid()
  from public.financial_transactions
  where status='posted'
    and created_at >= (p_start_date::timestamp at time zone 'Africa/Casablanca')
    and created_at < ((p_end_date + 1)::timestamp at time zone 'Africa/Casablanca')
  returning * into result;

  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
  values(auth.uid(),'close','financial_period_closures',result.id::text,
    array['start_date','end_date','transaction_count','income_minor','expenses_minor','net_minor'],trim(p_reason));
  return result;
end;
$$;

create or replace function public.record_financial_reconciliation(
  p_as_of_date date,
  p_payment_method text,
  p_actual_balance_minor bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_id uuid;
  ledger_balance bigint;
  entry_count integer;
  as_of_exclusive timestamptz;
begin
  if auth.uid() is null or not public.has_club_permission('finance.reconcile') then
    raise exception 'Not authorized to record financial reconciliations.' using errcode='42501';
  end if;
  if p_as_of_date is null or p_as_of_date > (now() at time zone 'Africa/Casablanca')::date then
    raise exception 'Choose today or a date in the past.' using errcode='22023';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash','bank_transfer','card','other') then
    raise exception 'Choose a supported payment method.' using errcode='22023';
  end if;
  if p_actual_balance_minor is null or p_actual_balance_minor < 0 then
    raise exception 'The counted balance must be zero or greater.' using errcode='22023';
  end if;
  if p_reason is null or length(trim(p_reason)) < 4 or length(p_reason) > 500 then
    raise exception 'A reconciliation note between four and 500 characters is required.' using errcode='22023';
  end if;

  -- Match the transaction insert lock so the captured ledger snapshot cannot
  -- race with a newly posted finance entry.
  perform pg_advisory_xact_lock(884211, 290017);
  as_of_exclusive := ((p_as_of_date + 1)::timestamp at time zone 'Africa/Casablanca');
  select coalesce(sum(case when direction='in' then amount_minor else -amount_minor end),0)::bigint,
         count(*)::integer
    into ledger_balance,entry_count
    from public.financial_transactions
   where status='posted'
     and payment_method=p_payment_method
     and created_at < as_of_exclusive;

  perform set_config('app.change_reason',trim(p_reason),true);
  insert into public.financial_reconciliations(
    as_of_date,payment_method,transaction_count,ledger_balance_minor,
    actual_balance_minor,variance_minor,reason,reconciled_by
  ) values (
    p_as_of_date,p_payment_method,entry_count,ledger_balance,
    p_actual_balance_minor,p_actual_balance_minor-ledger_balance,trim(p_reason),auth.uid()
  ) returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.review_member_idea(p_idea_id uuid,p_new_status text,p_review_note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idea_row public.member_ideas%rowtype;
begin
  if auth.uid() is null or not public.has_club_permission('communications.ideas.review') then
    raise exception 'Not authorized to review member ideas' using errcode='42501';
  end if;
  if p_new_status is null or p_new_status not in ('reviewing','accepted','declined','implemented') then
    raise exception 'Choose a valid idea review status' using errcode='22023';
  end if;
  if p_review_note is null or length(trim(p_review_note))<4 or length(p_review_note)>1000 then
    raise exception 'Add a review note of at least four characters' using errcode='22023';
  end if;

  select * into idea_row from public.member_ideas where id=p_idea_id for update;
  if not found then raise exception 'Idea not found' using errcode='P0002'; end if;
  if not (
    (idea_row.status='new' and p_new_status in ('reviewing','accepted','declined'))
    or (idea_row.status='reviewing' and p_new_status in ('accepted','declined'))
    or (idea_row.status='accepted' and p_new_status='implemented')
  ) then
    raise exception 'This status change is not allowed from the ideaâ€™s current state' using errcode='23514';
  end if;

  perform set_config('app.change_reason',trim(p_review_note),true);
  update public.member_ideas
    set status=p_new_status,review_note=trim(p_review_note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=p_idea_id;
  insert into public.member_idea_review_history(idea_id,previous_status,new_status,review_note,changed_by)
    values(p_idea_id,idea_row.status,p_new_status,trim(p_review_note),auth.uid());
  insert into public.notifications(recipient_id,title,body,category,target_path)
    values(idea_row.submitted_by,'An idea you shared was updated',p_new_status || ' · ' || trim(p_review_note),'idea_update','/communications');
  return p_idea_id;
end;
$$;

create or replace function public.submit_purchase_request(
  p_item_description text,p_category text,p_quantity integer,
  p_estimated_amount_minor bigint,p_reason text,p_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare request_id uuid;
begin
  if auth.uid() is null or not public.has_club_permission('logistics.purchases.request') then
    raise exception 'Not authorized to request club purchases' using errcode='42501';
  end if;
  if p_item_description is null or length(trim(p_item_description))<2 or length(p_item_description)>160
     or p_category is null or length(trim(p_category))<2 or length(p_category)>80
     or p_quantity is null or p_quantity<1
     or (p_estimated_amount_minor is not null and p_estimated_amount_minor<0)
     or p_reason is null or length(trim(p_reason))<4 or length(p_reason)>1000 then
    raise exception 'Purchase request details are invalid' using errcode='22023';
  end if;
  if p_event_id is not null and not exists(select 1 from public.events where id=p_event_id) then
    raise exception 'The selected event does not exist' using errcode='P0002';
  end if;
  perform set_config('app.change_reason','Purchase request submitted: ' || trim(p_reason),true);
  insert into public.purchase_requests(item_description,category,quantity,estimated_amount_minor,reason,event_id,requested_by)
    values(trim(p_item_description),trim(p_category),p_quantity,p_estimated_amount_minor,trim(p_reason),p_event_id,auth.uid())
    returning id into request_id;
  insert into public.notifications(recipient_id,title,body,category,target_path)
  select recipients.member_id,'New purchase request',trim(p_item_description) || ' · ' || p_quantity::text || ' item(s)','general','/finance'
  from (
    select distinct ra.member_id from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    join public.member_profiles mp on mp.id=ra.member_id and mp.status='active'
    where ra.role=any(array['president','vice_president','treasurer','vice_treasurer']::text[])
      and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
      and ra.member_id<>auth.uid()
  ) recipients;
  return request_id;
end;
$$;

create or replace function public.decide_purchase_request(p_request_id uuid,p_decision text,p_note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare request_row public.purchase_requests%rowtype;
begin
  if auth.uid() is null or not public.has_club_permission('finance.purchases.review') then
    raise exception 'Not authorized to decide purchase requests' using errcode='42501';
  end if;
  if p_decision not in ('approved','declined') or p_note is null or length(trim(p_note))<4 or length(p_note)>1000 then
    raise exception 'Choose approval or decline and provide a reason of at least four characters' using errcode='22023';
  end if;
  select * into request_row from public.purchase_requests where id=p_request_id for update;
  if not found then raise exception 'Purchase request not found' using errcode='P0002'; end if;
  if request_row.status<>'submitted' then raise exception 'Only submitted requests can be approved or declined' using errcode='23514'; end if;

  perform set_config('app.change_reason',trim(p_note),true);
  update public.purchase_requests set status=p_decision,decision_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=p_request_id;
  insert into public.notifications(recipient_id,title,body,category,target_path)
    values(request_row.requested_by,'Purchase request ' || p_decision,request_row.item_description || ' · ' || trim(p_note),'general','/logistics');
  return p_request_id;
end;
$$;


-- Receipt storage access follows the same finance permissions as the UI.
drop policy if exists "finance members read linked receipts" on storage.objects;
create policy "finance members read linked receipts" on storage.objects for select to authenticated using (
  bucket_id='financial-receipts' and exists(
    select 1 from public.financial_transactions ft where ft.receipt_path=name
      and (ft.member_id=auth.uid() or public.has_club_permission('finance.view'))
  )
);
drop policy if exists "treasury uploads own receipt files" on storage.objects;
create policy "treasury uploads own receipt files" on storage.objects for insert to authenticated with check (
  bucket_id='financial-receipts' and (storage.foldername(name))[1]=auth.uid()::text
  and public.has_club_permission('finance.records.manage')
);
drop policy if exists "treasury lists aged unlinked receipt uploads" on storage.objects;
create policy "treasury lists aged unlinked receipt uploads" on storage.objects for select to authenticated using (
  bucket_id='financial-receipts' and (storage.foldername(name))[1]=auth.uid()::text
  and public.has_club_permission('finance.receipts.audit') and created_at<now()-interval '24 hours'
  and not exists(select 1 from public.financial_transactions ft where ft.receipt_path=name)
);
drop policy if exists "remove aged unlinked receipt upload" on storage.objects;
create policy "remove aged unlinked receipt upload" on storage.objects for delete to authenticated using (
  bucket_id='financial-receipts' and (storage.foldername(name))[1]=auth.uid()::text
  and public.has_club_permission('finance.receipts.audit') and created_at<now()-interval '24 hours'
  and not exists(select 1 from public.financial_transactions ft where ft.receipt_path=name)
);

create or replace function public.list_orphan_receipt_uploads()
returns table(path text, uploaded_at timestamptz) language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.has_club_permission('finance.receipts.audit') then raise exception 'Not authorized to list receipt uploads'; end if;
  return query select o.name,o.created_at from storage.objects o where o.bucket_id='financial-receipts'
    and (storage.foldername(o.name))[1]=auth.uid()::text and o.created_at<now()-interval '24 hours'
    and not exists(select 1 from public.financial_transactions ft where ft.receipt_path=o.name)
    order by o.created_at asc limit 50;
end; $$;
revoke all on function public.list_orphan_receipt_uploads() from public,anon;
grant execute on function public.list_orphan_receipt_uploads() to authenticated;

create or replace function public.audit_orphan_receipt_cleanup(p_paths text[])
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.has_club_permission('finance.receipts.audit') then raise exception 'Not authorized to clean up receipt uploads'; end if;
  if p_paths is null or cardinality(p_paths)<1 or cardinality(p_paths)>50 then raise exception 'Select between 1 and 50 receipt uploads'; end if;
  if exists(select 1 from unnest(p_paths) p(path) where p.path is null or p.path !~ ('^'||auth.uid()::text||'/[^/]+/[^/]+\.(pdf|jpg|png|webp)$')) then raise exception 'Invalid receipt path'; end if;
  if exists(select 1 from unnest(p_paths) p(path) join public.financial_transactions ft on ft.receipt_path=p.path) then raise exception 'A selected receipt is now linked to a transaction'; end if;
  if exists(select 1 from unnest(p_paths) p(path) join storage.objects o on o.bucket_id='financial-receipts' and o.name=p.path where o.created_at>=now()-interval '24 hours') then raise exception 'Receipt uploads must be at least 24 hours old'; end if;
  if exists(select 1 from unnest(p_paths) p(path) left join storage.objects o on o.bucket_id='financial-receipts' and o.name=p.path where o.id is null) then raise exception 'A selected receipt no longer exists'; end if;
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
  select auth.uid(),'cleanup_authorized','storage:financial-receipts',p.path,array['orphan_upload'],'Finance receipt cleanup authorized for unlinked upload older than 24 hours' from unnest(p_paths) p(path);
  get diagnostics v_count=row_count; return v_count;
end; $$;
revoke all on function public.audit_orphan_receipt_cleanup(text[]) from public,anon;
grant execute on function public.audit_orphan_receipt_cleanup(text[]) to authenticated;

