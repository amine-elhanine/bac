-- Restrict task management to club leadership or the task's own team.
-- Assigned members can continue updating only their own assignment.
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
  is_assigned boolean;
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

  if actor_is_leadership or actor_owns_team then
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
      raise exception 'Only club leadership or the responsible team can cancel a task' using errcode='42501';
    end if;
    select exists(select 1 from public.task_assignments ta where ta.task_id=p_task_id and ta.member_id=actor_id)
      into is_assigned;
    if not is_assigned then raise exception 'Not authorized to update this task' using errcode='42501'; end if;
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

revoke all on function public.update_assigned_task_status(uuid,text) from public, anon;
grant execute on function public.update_assigned_task_status(uuid,text) to authenticated;
