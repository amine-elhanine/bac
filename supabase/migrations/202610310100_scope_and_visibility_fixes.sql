-- Fixes carried over from the code review:
-- 1. tasks.delete RLS was "anyone with the permission deletes any task" —
--    now scoped to the creator, the responsible team's officer, or leadership.
-- 2. delete_task RPC tightened to match (creator or team officer or leadership
--    or tasks.delete + team scope).
-- 3. Officer-wide news visibility restored for the Communications Officer and
--    Treasury team (they lost access when the audience policy switched to
--    members.roles.view, which those roles never held).
-- 4. The announcement audience check uses the permission catalog instead of
--    has_club_permission('members.roles.view') for the officers audience.

-- ─── 1. tasks.delete: team-scoped ──────────────────────────────────────────
drop policy if exists "delete tasks by permission" on public.tasks;
create policy "delete tasks by team scope or creator" on public.tasks for delete to authenticated using (
  created_by = auth.uid()
  or public.has_club_permission('tasks.delete') and (
    team is null or team = 'club'
    or (team = 'communications' and public.has_club_role(array['communications_officer']))
    or (team = 'treasury' and public.has_club_role(array['treasurer','vice_treasurer']))
    or (team = 'hr' and public.has_club_role(array['hr','vice_hr']))
    or (team = 'secretariat' and public.has_club_role(array['general_secretary']))
    or (team = 'logistics' and public.has_club_role(array['logistics_officer','vice_logistics_officer']))
    or (team = 'president' and public.has_club_role(array['president']))
  )
);

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
    task_creator = actor_id
    or public.has_club_role(array['president','vice_president'])
    or (target_team = 'communications' and public.has_club_role(array['communications_officer']))
    or (target_team = 'treasury' and public.has_club_role(array['treasurer','vice_treasurer']))
    or (target_team = 'hr' and public.has_club_role(array['hr','vice_hr']))
    or (target_team = 'secretariat' and public.has_club_role(array['general_secretary']))
    or (target_team = 'logistics' and public.has_club_role(array['logistics_officer','vice_logistics_officer']))
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

-- ─── 2. Officer-wide news visibility: comms officer + treasury restored ────
drop policy if exists "read news by audience" on public.announcements;
create policy "read news by audience" on public.announcements for select to authenticated using (
  created_by = auth.uid()
  or public.has_club_permission('communications.news.manage')
  or (published_at is not null and audience = 'members')
  or (published_at is not null and audience = 'officers' and (
    public.has_club_permission('members.roles.view')
    or public.has_club_permission('communications.news.manage')
    or public.has_club_permission('finance.view')
    or public.has_club_permission('logistics.view')
  ))
  or (published_at is not null and audience = 'team' and case target_team
    when 'leadership' then public.has_club_permission('roles.manage')
    when 'communications' then public.has_club_permission('communications.news.manage')
    when 'treasury' then public.has_club_permission('finance.view')
    when 'hr' then public.has_club_permission('hr.cases.view')
    when 'secretariat' then public.has_club_permission('communications.ideas.review')
    when 'logistics' then public.has_club_permission('logistics.view')
    else false end
  )
);
