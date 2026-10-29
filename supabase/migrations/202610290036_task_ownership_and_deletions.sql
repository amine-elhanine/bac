-- Task ownership and deletions: the creator manages the task they created,
-- authorized officers can delete tasks, and Communications/leadership can
-- open a conversation with a member.

-- ─── 1. Task status: creator joins leadership and team owners ─────────────
create or replace function public.update_assigned_task_status(p_task_id uuid, p_new_status text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_is_leadership boolean;
  actor_owns_team boolean := false;
  actor_created_task boolean := false;
  target_team text;
  target_title text;
  task_creator uuid;
  all_done boolean;
  any_blocked boolean;
  any_progress boolean;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_new_status is null or p_new_status not in ('todo','in_progress','blocked','done','cancelled') then
    raise exception 'Invalid task status' using errcode='22023';
  end if;

  select team,title,created_by into target_team,target_title,task_creator
    from public.tasks where id=p_task_id;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;

  actor_is_leadership:=public.has_club_role(array['president','vice_president']);
  actor_owns_team:=
    (target_team='communications' and public.has_club_role(array['communications_officer']))
    or (target_team='treasury' and public.has_club_role(array['treasurer','vice_treasurer']))
    or (target_team='hr' and public.has_club_role(array['hr','vice_hr']))
    or (target_team='secretariat' and public.has_club_role(array['general_secretary']))
    or (target_team='logistics' and public.has_club_role(array['logistics_officer','vice_logistics_officer']));
  actor_created_task:=(task_creator=actor_id);

  if actor_is_leadership or actor_owns_team or actor_created_task then
    update public.tasks set status=p_new_status,updated_at=now() where id=p_task_id;
    update public.task_assignments set status=p_new_status,updated_at=now() where task_id=p_task_id;
    if p_new_status='cancelled' then
      insert into public.notifications(recipient_id,title,body,category,target_path)
      select ta.member_id,'Task cancelled',target_title,'task','/tasks'
      from public.task_assignments ta
      where ta.task_id=p_task_id and ta.member_id<>actor_id;
    end if;
  else
    if p_new_status='cancelled' then
      raise exception 'Only club leadership, the responsible team, or the task creator can cancel a task' using errcode='42501';
    end if;
    if not exists(select 1 from public.task_assignments ta where ta.task_id=p_task_id and ta.member_id=actor_id) then
      raise exception 'Not authorized to update this task' using errcode='42501';
    end if;
    update public.task_assignments set status=p_new_status,updated_at=now()
      where task_id=p_task_id and member_id=actor_id;
    select coalesce(bool_and(status='done'),false),
           coalesce(bool_or(status='blocked'),false),
           coalesce(bool_or(status in ('in_progress','done')),false)
      into all_done,any_blocked,any_progress
      from public.task_assignments where task_id=p_task_id;
    update public.tasks set status=case when all_done then 'done' when any_blocked then 'blocked' when any_progress then 'in_progress' else 'todo' end,updated_at=now()
      where id=p_task_id;
    if p_new_status in ('blocked','done') and task_creator<>actor_id then
      insert into public.notifications(recipient_id,title,body,category,target_path)
      values(task_creator,case when p_new_status='blocked' then 'A task is blocked' else 'A task was completed' end,target_title,'task','/tasks');
    end if;
  end if;
  return p_new_status;
end;
$$;

-- ─── 2. Task deletion: leadership, team owner, or creator ──────────────────
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

  if not (
    public.has_club_role(array['president','vice_president'])
    or (target_team='communications' and public.has_club_role(array['communications_officer']))
    or (target_team='treasury' and public.has_club_role(array['treasurer','vice_treasurer']))
    or (target_team='hr' and public.has_club_role(array['hr','vice_hr']))
    or (target_team='secretariat' and public.has_club_role(array['general_secretary']))
    or (target_team='logistics' and public.has_club_role(array['logistics_officer','vice_logistics_officer']))
    or task_creator=actor_id
  ) then
    raise exception 'Not authorized to delete this task' using errcode='42501';
  end if;

  perform set_config('app.change_reason','Task deleted: '||target_title,true);
  delete from public.task_assignments where task_id=p_task_id;
  delete from public.tasks where id=p_task_id;
end;
$$;

revoke all on function public.delete_task(uuid) from public, anon;
grant execute on function public.delete_task(uuid) to authenticated;

-- ─── 3. Officer-initiated conversations ────────────────────────────────────
drop function if exists public.start_member_communication(text,text);
create or replace function public.start_member_communication(p_subject text, p_body text, p_member_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thread_id uuid;
  target_member uuid;
  actor_is_club_team boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.member_profiles where id=auth.uid() and status='active') then
    raise exception 'An active member account is required.' using errcode='42501';
  end if;
  if p_subject is null or length(trim(p_subject))<2 or length(p_subject)>140
     or p_body is null or length(trim(p_body))<1 or length(p_body)>4000 then
    raise exception 'Enter a subject and a message of up to 4,000 characters.' using errcode='22023';
  end if;

  actor_is_club_team := public.has_club_role(array['president','vice_president','communications_officer']);
  if p_member_id is null then
    target_member := auth.uid();
  else
    -- Only the club team may open a conversation with a member.
    if not actor_is_club_team then
      raise exception 'Only the Communications team and club leadership can start a conversation with a member.' using errcode='42501';
    end if;
    if p_member_id=auth.uid() then
      raise exception 'Choose a member other than yourself.' using errcode='22023';
    end if;
    select mp.id into target_member from public.member_profiles mp
      where mp.id=p_member_id and mp.status='active';
    if not found then
      raise exception 'Choose an active member.' using errcode='22023';
    end if;
  end if;

  perform set_config('app.change_reason','Conversation opened with '||target_member::text,true);
  insert into public.member_communication_threads(member_id,subject)
    values(target_member,trim(p_subject)) returning id into thread_id;
  insert into public.member_communication_messages(thread_id,sender_id,sender_side,body)
    values(thread_id,auth.uid(),case when target_member=auth.uid() then 'member' else 'club_team' end,trim(p_body));
  update public.member_communication_threads set status=case when target_member=auth.uid() then 'open' else 'awaiting_member' end
    where id=thread_id;

  if target_member=auth.uid() then
    -- Notify the club team (member started the conversation).
    insert into public.notifications(recipient_id,title,body,category,target_path)
    select officers.member_id,'New member message',trim(p_subject),'general','/communications'
    from (
      select distinct ra.member_id from public.role_assignments ra
      join public.club_terms ct on ct.id=ra.term_id and ct.is_current
      join public.member_profiles mp on mp.id=ra.member_id and mp.status='active'
      where ra.role=any(array['president','vice_president','communications_officer']::text[])
        and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
        and ra.member_id<>auth.uid()
    ) officers;
  else
    -- Notify the member (club team started the conversation).
    insert into public.notifications(recipient_id,title,body,category,target_path)
    values(target_member,'A message from the BAC team',trim(p_subject),'general','/communications');
  end if;
  return thread_id;
end;
$$;

revoke all on function public.start_member_communication(text,text,uuid) from public,anon;
grant execute on function public.start_member_communication(text,text,uuid) to authenticated;
