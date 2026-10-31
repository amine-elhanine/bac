-- The 0600 permission rework recreated the point_transactions read policy but
-- never recreated an INSERT policy, so even HR could not award points through
-- the app (the Points screen inserts directly). Restore the audited insert:
-- only holders of hr.points.manage, recording themselves as the actor, with a
-- validated category (database CHECK) and a non-empty reason (CHECK).

create policy "points awarded by permission" on public.point_transactions
  for insert to authenticated
  with check (
    public.has_club_permission('hr.points.manage')
    and created_by = auth.uid()
  );
