-- Officers already permitted to read the roster may also read current roles for its directory column.
drop policy if exists "read role assignments" on public.role_assignments;
create policy "read role assignments" on public.role_assignments
  for select to authenticated
  using (
    member_id=auth.uid()
    or public.has_club_role(array[
      'president','vice_president','hr','vice_hr','general_secretary',
      'communications_officer','treasurer','vice_treasurer','logistics_officer','vice_logistics_officer'
    ])
  );
