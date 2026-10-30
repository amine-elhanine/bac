create table public.task_status_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  changed_by uuid not null references public.member_profiles(id),
  status_scope text not null check (status_scope in ('task','assignment')),
  assignment_member_id uuid references public.member_profiles(id),
  previous_status text not null,
  new_status text not null,
  previous_assignment_statuses jsonb not null default '[]'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index task_status_history_task_created_idx on public.task_status_history(task_id,created_at desc);
alter table public.task_status_history enable row level security;
revoke all on public.task_status_history from anon, authenticated;

create or replace function public.update_assigned_task_status(
  p_task_id uuid,
  p_new_status text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_is_officer boolean;
  actor_owns_team boolean := false;
  actor_created_task boolean := false;
  actor_is_assigned boolean := false;
  prior_task_status text;
  target_team text;
  target_title text;
  task_creator uuid;
  prior_assignments jsonb;
  is_backward boolean := false;
  has_cancellation_history boolean := false;
  latest_cancellation public.task_status_history%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_new_status is null or p_new_status not in ('todo','in_progress','blocked','done','cancelled') then
    raise exception 'Invalid task status' using errcode='22023';
  end if;

  select status,team,title,created_by into prior_task_status,target_team,target_title,task_creator
    from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;

  actor_is_officer:=public.has_club_role(array[
    'president','vice_president','communications_officer','treasurer','vice_treasurer',
    'hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer'
  ]);
  actor_owns_team:=
    (target_team='communications' and public.has_club_role(array['communications_officer']))
    or (target_team='treasury' and public.has_club_role(array['treasurer','vice_treasurer']))
    or (target_team='hr' and public.has_club_role(array['hr','vice_hr']))
    or (target_team='secretariat' and public.has_club_role(array['general_secretary']))
    or (target_team='logistics' and public.has_club_role(array['logistics_officer','vice_logistics_officer']));
  actor_created_task := task_creator=actor_id;
  select exists(select 1 from public.task_assignments where task_id=p_task_id and member_id=actor_id)
    into actor_is_assigned;

  if not (actor_is_officer or actor_owns_team or actor_created_task or actor_is_assigned) then
    raise exception 'Not authorized to update this task' using errcode='42501';
  end if;
  if p_new_status='cancelled' and not actor_is_officer then
    raise exception 'Only board members can cancel a task' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('member_id',member_id,'status',status) order by member_id),'[]'::jsonb)
    into prior_assignments from public.task_assignments where task_id=p_task_id;
  if jsonb_array_length(prior_assignments)=0 then raise exception 'Task has no assignees' using errcode='23514'; end if;

  if prior_task_status='cancelled' and p_new_status<>'cancelled' then
    if not actor_is_officer then raise exception 'Only board members can restore a cancelled task' using errcode='42501'; end if;
    select * into latest_cancellation from public.task_status_history
      where task_id=p_task_id and status_scope='task' and new_status='cancelled'
      order by created_at desc,id desc limit 1;
    has_cancellation_history := found;
    if has_cancellation_history and p_new_status<>latest_cancellation.previous_status then
      raise exception 'Choose the status this task had before it was cancelled' using errcode='22023';
    end if;
    if p_reason is null or length(trim(p_reason))<4 then
      raise exception 'Explain why the task cancellation is being corrected' using errcode='22023';
    end if;
    insert into public.task_status_history(task_id,changed_by,status_scope,previous_status,new_status,previous_assignment_statuses,reason)
      values(p_task_id,actor_id,'task',prior_task_status,p_new_status,prior_assignments,trim(p_reason));
    if has_cancellation_history then
      update public.task_assignments ta set status=s.status,updated_at=now()
        from jsonb_to_recordset(latest_cancellation.previous_assignment_statuses) as s(member_id uuid,status text)
        where ta.task_id=p_task_id and ta.member_id=s.member_id;
    else
      update public.task_assignments set status=p_new_status,updated_at=now() where task_id=p_task_id;
    end if;
    update public.tasks set status=p_new_status,updated_at=now() where id=p_task_id;
    return p_new_status;
  end if;

  if p_new_status=prior_task_status and actor_is_officer then return p_new_status; end if;
  if actor_is_officer or actor_owns_team or actor_created_task then
    select exists(
      select 1 from jsonb_to_recordset(prior_assignments) as s(member_id uuid,status text)
      where not (
        (s.status='todo' and p_new_status in ('in_progress','blocked','done'))
        or (s.status='in_progress' and p_new_status in ('blocked','done'))
        or (s.status='blocked' and p_new_status='done')
        or (s.status=p_new_status)
        or p_new_status='cancelled'
      )
    ) into is_backward;
    if is_backward and (p_reason is null or length(trim(p_reason))<4) then
      raise exception 'Explain why this task status is being moved backward' using errcode='22023';
    end if;
    insert into public.task_status_history(task_id,changed_by,status_scope,previous_status,new_status,previous_assignment_statuses,reason)
      values(p_task_id,actor_id,'task',prior_task_status,p_new_status,prior_assignments,nullif(trim(p_reason),''));
    update public.tasks set status=p_new_status,updated_at=now() where id=p_task_id;
    update public.task_assignments set status=p_new_status,updated_at=now() where task_id=p_task_id;
  else
    if not actor_is_assigned then raise exception 'Not authorized to update this task' using errcode='42501'; end if;
    select status into prior_task_status from public.task_assignments where task_id=p_task_id and member_id=actor_id for update;
    if prior_task_status='cancelled' then raise exception 'This task has been cancelled' using errcode='42501'; end if;
    is_backward := not (
      (prior_task_status='todo' and p_new_status in ('in_progress','blocked','done'))
      or (prior_task_status='in_progress' and p_new_status in ('blocked','done'))
      or (prior_task_status='blocked' and p_new_status='done')
      or prior_task_status=p_new_status
    );
    if is_backward and (p_reason is null or length(trim(p_reason))<4) then
      raise exception 'Explain why this task status is being moved backward' using errcode='22023';
    end if;
    insert into public.task_status_history(task_id,changed_by,status_scope,assignment_member_id,previous_status,new_status,previous_assignment_statuses,reason)
      values(p_task_id,actor_id,'assignment',actor_id,prior_task_status,p_new_status,prior_assignments,nullif(trim(p_reason),''));
    update public.task_assignments set status=p_new_status,updated_at=now()
      where task_id=p_task_id and member_id=actor_id;
    update public.tasks set status=case
      when exists(select 1 from public.task_assignments where task_id=p_task_id and status='cancelled') then 'cancelled'
      when (select bool_and(status='done') from public.task_assignments where task_id=p_task_id) then 'done'
      when exists(select 1 from public.task_assignments where task_id=p_task_id and status='blocked') then 'blocked'
      when exists(select 1 from public.task_assignments where task_id=p_task_id and status='in_progress') then 'in_progress'
      else 'todo' end,updated_at=now()
      where id=p_task_id;
  end if;

  if p_new_status='cancelled' then
    insert into public.notifications(recipient_id,title,body,category,target_path)
    select ta.member_id,'Task cancelled',target_title,'task','/tasks'
    from public.task_assignments ta where ta.task_id=p_task_id and ta.member_id<>actor_id;
  elsif p_new_status in ('blocked','done') and task_creator<>actor_id then
    insert into public.notifications(recipient_id,title,body,category,target_path)
    select task_creator,case when p_new_status='blocked' then 'A task is blocked' else 'A task was completed' end,target_title,'task','/tasks';
  end if;
  return p_new_status;
end;
$$;

drop function public.update_assigned_task_status(uuid,text);
revoke all on function public.update_assigned_task_status(uuid,text,text) from public,anon;
grant execute on function public.update_assigned_task_status(uuid,text,text) to authenticated;
