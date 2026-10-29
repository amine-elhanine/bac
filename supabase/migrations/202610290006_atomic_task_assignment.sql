-- Task, assignees, audit triggers, and member notices are committed together.
revoke insert, update on public.tasks from authenticated;
revoke insert, update, delete on public.task_assignments from authenticated;

create or replace function public.create_assigned_task(
  p_title text, p_description text, p_team text, p_priority text,
  p_due_at timestamptz, p_member_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_task_id uuid; unique_assignee_count integer; active_assignee_count integer;
begin
  if auth.uid() is null or not public.has_club_role(array[
    'president','vice_president','communications_officer','treasurer','vice_treasurer',
    'hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer'
  ]) then
    raise exception 'Not authorized to create club tasks' using errcode='42501';
  end if;
  if p_title is null or length(trim(p_title))<2 or length(p_title)>140
     or length(coalesce(p_description,''))>2000
     or p_team is null or p_team not in ('club','president','communications','treasury','hr','secretariat','logistics')
     or p_priority is null or p_priority not in ('low','normal','high','urgent') then
    raise exception 'Task details are invalid' using errcode='22023';
  end if;
  if not public.has_club_role(array['president','vice_president']) then
    if (p_team in ('club','president'))
       or (p_team='communications' and not public.has_club_role(array['communications_officer']))
       or (p_team='treasury' and not public.has_club_role(array['treasurer','vice_treasurer']))
       or (p_team='hr' and not public.has_club_role(array['hr','vice_hr']))
       or (p_team='secretariat' and not public.has_club_role(array['general_secretary']))
       or (p_team='logistics' and not public.has_club_role(array['logistics_officer','vice_logistics_officer'])) then
      raise exception 'You may only create tasks for your own team' using errcode='42501';
    end if;
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
revoke all on function public.create_assigned_task(text,text,text,text,timestamptz,uuid[]) from public;
grant execute on function public.create_assigned_task(text,text,text,text,timestamptz,uuid[]) to authenticated;
