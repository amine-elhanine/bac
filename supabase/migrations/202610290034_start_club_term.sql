-- Let the current President start a new club term and assign its elected team
-- in one transaction. A term cannot be made current before its start date.
create or replace function public.start_club_term(
  p_term_name text,
  p_starts_on date,
  p_ends_on date,
  p_assignments jsonb,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_term public.club_terms%rowtype;
  new_term_id uuid;
  assignment jsonb;
  assignment_role text;
  assignment_member uuid;
  member_status text;
  must_change_password boolean;
  seen_roles text[] := array[]::text[];
  seen_members uuid[] := array[]::uuid[];
  president_count integer := 0;
  today_in_club date := timezone('Africa/Casablanca',now())::date;
begin
  if auth.uid() is null or not public.has_club_role(array['president']) then
    raise exception 'Only the current President can start a new club term' using errcode='42501';
  end if;
  if p_term_name is null or length(trim(p_term_name))<2 or length(trim(p_term_name))>120
     or p_reason is null or length(trim(p_reason))<4 then
    raise exception 'A term name and reason are required' using errcode='22023';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on
     or p_starts_on>today_in_club or p_ends_on<today_in_club then
    raise exception 'The new term must include today and cannot start in the future' using errcode='22023';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments)<>'array' then
    raise exception 'Provide a list of elected officer assignments' using errcode='22023';
  end if;

  select * into prior_term from public.club_terms where is_current for update;
  if not found then raise exception 'No current club term exists' using errcode='P0002'; end if;
  if p_starts_on<=prior_term.ends_on then
    raise exception 'The new term must start after the current term ends' using errcode='22023';
  end if;
  if exists(select 1 from public.club_terms where lower(name)=lower(trim(p_term_name))) then
    raise exception 'A club term already uses that name' using errcode='23505';
  end if;
  if exists(
    select 1 from public.club_terms
    where daterange(starts_on,ends_on,'[]') && daterange(p_starts_on,p_ends_on,'[]')
  ) then
    raise exception 'Club terms cannot overlap' using errcode='23P01';
  end if;

  for assignment in select value from jsonb_array_elements(p_assignments)
  loop
    assignment_role:=assignment->>'role';
    if assignment_role is null or assignment_role not in (
      'president','vice_president','communications_officer','treasurer','vice_treasurer',
      'hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer'
    ) then
      raise exception 'An assignment contains an invalid officer role' using errcode='22023';
    end if;
    if assignment_role=any(seen_roles) then
      raise exception 'Each officer role may be assigned only once' using errcode='23505';
    end if;
    begin
      assignment_member:=(assignment->>'member_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'An assignment contains an invalid member ID' using errcode='22023';
    end;
    if assignment_member=any(seen_members) then
      raise exception 'A member may hold only one officer role in a term' using errcode='23505';
    end if;
    select mp.status,mp.must_change_password into member_status,must_change_password
      from public.member_profiles mp where mp.id=assignment_member for update;
    if not found or member_status<>'active' or must_change_password then
      raise exception 'Every elected officer must have an active member account with first sign-in completed' using errcode='22023';
    end if;
    seen_roles:=array_append(seen_roles,assignment_role);
    seen_members:=array_append(seen_members,assignment_member);
    if assignment_role='president' then president_count:=president_count+1; end if;
  end loop;
  if president_count<>1 then
    raise exception 'Assign exactly one President to the new term' using errcode='22023';
  end if;

  update public.club_terms set is_current=false where id=prior_term.id;
  insert into public.club_terms(name,starts_on,ends_on,is_current)
    values(trim(p_term_name),p_starts_on,p_ends_on,true) returning id into new_term_id;

  for assignment in select value from jsonb_array_elements(p_assignments)
  loop
    assignment_role:=assignment->>'role';
    assignment_member:=(assignment->>'member_id')::uuid;
    insert into public.role_assignments(member_id,term_id,role,assigned_by,starts_at)
      values(assignment_member,new_term_id,assignment_role,auth.uid(),now());
    insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by)
      values(assignment_member,null,assignment_role,'New term '||trim(p_term_name)||': '||trim(p_reason),auth.uid());
  end loop;

  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
    values(auth.uid(),'start_term','club_terms',new_term_id::text,array['term','officer_assignments'],trim(p_reason));
  return new_term_id;
end;
$$;

revoke all on function public.start_club_term(text,date,date,jsonb,text) from public,anon;
grant execute on function public.start_club_term(text,date,date,jsonb,text) to authenticated;
