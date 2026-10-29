-- Keep an independent status per assignee while exposing a team-level task status.
alter table public.task_assignments
  add column status text not null default 'todo'
    check (status in ('todo','in_progress','blocked','done','cancelled')),
  add column updated_at timestamptz not null default now();

create or replace function public.update_assigned_task_status(p_task_id uuid, p_new_status text)
returns text language plpgsql security definer set search_path = public
as $$
declare officer boolean; assigned_member boolean; all_done boolean; any_blocked boolean; any_progress boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_new_status is null or p_new_status not in ('todo','in_progress','blocked','done','cancelled') then
    raise exception 'Invalid task status' using errcode='22023';
  end if;
  officer:=public.has_club_role(array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']);
  if officer then
    update public.tasks set status=p_new_status,updated_at=now() where id=p_task_id;
    if not found then raise exception 'Task not found' using errcode='P0002'; end if;
    update public.task_assignments set status=p_new_status,updated_at=now() where task_id=p_task_id;
  else
    if p_new_status='cancelled' then raise exception 'Only club officers can cancel a task' using errcode='42501'; end if;
    select exists(
      select 1 from public.task_assignments ta join public.tasks t on t.id=ta.task_id
      where ta.task_id=p_task_id and ta.member_id=auth.uid() and t.status<>'cancelled'
    ) into assigned_member;
    if not assigned_member then raise exception 'Not authorized to update this task' using errcode='42501'; end if;
    update public.task_assignments set status=p_new_status,updated_at=now()
      where task_id=p_task_id and member_id=auth.uid();
    select coalesce(bool_and(status='done'),false),
           coalesce(bool_or(status='blocked'),false),
           coalesce(bool_or(status in ('in_progress','done')),false)
      into all_done,any_blocked,any_progress
      from public.task_assignments where task_id=p_task_id;
    update public.tasks set status=case when all_done then 'done' when any_blocked then 'blocked' when any_progress then 'in_progress' else 'todo' end,updated_at=now()
      where id=p_task_id;
  end if;
  return p_new_status;
end; $$;
revoke all on function public.update_assigned_task_status(uuid,text) from public;
grant execute on function public.update_assigned_task_status(uuid,text) to authenticated;
