alter table public.member_profiles add column phone_number text;

alter table public.member_profile_history
  add column previous_phone_number text,
  add column new_phone_number text;

create or replace function public.update_member_profile(
  p_member_id uuid,
  p_full_name text,
  p_email text,
  p_study_program text,
  p_cohort text,
  p_reason text,
  p_phone_number text default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare prior public.member_profiles%rowtype; next_email text; next_program text; next_cohort text; next_phone text;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','hr','vice_hr']) then
    raise exception 'Not authorized to edit member profiles' using errcode='42501';
  end if;
  if p_full_name is null or length(trim(p_full_name)) < 2 or length(trim(p_full_name)) > 120 or p_reason is null or length(trim(p_reason)) < 4 then
    raise exception 'A valid member name and change reason are required' using errcode='22023';
  end if;
  if p_email is not null and length(trim(p_email)) > 254 then raise exception 'Email address is too long' using errcode='22023'; end if;
  if p_study_program is not null and length(trim(p_study_program)) > 150 then raise exception 'Study program is too long' using errcode='22023'; end if;
  if p_cohort is not null and length(trim(p_cohort)) > 80 then raise exception 'Cohort is too long' using errcode='22023'; end if;
  if p_phone_number is not null and (length(trim(p_phone_number)) > 32 or trim(p_phone_number) !~ '^[+0-9() .-]+$') then raise exception 'Enter a valid phone number' using errcode='22023'; end if;
  select * into prior from public.member_profiles where id=p_member_id for update;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  next_email:=nullif(trim(p_email),''); next_program:=nullif(trim(p_study_program),''); next_cohort:=nullif(trim(p_cohort),''); next_phone:=nullif(trim(p_phone_number),'');
  if (prior.full_name,prior.email,prior.study_program,prior.cohort,prior.phone_number) is not distinct from (trim(p_full_name),next_email,next_program,next_cohort,next_phone) then return; end if;
  perform set_config('app.member_profile_update','on',true);
  update public.member_profiles set full_name=trim(p_full_name),email=next_email,study_program=next_program,cohort=next_cohort,phone_number=next_phone,updated_at=now() where id=p_member_id;
  insert into public.member_profile_history(member_id,previous_full_name,new_full_name,previous_email,new_email,previous_study_program,new_study_program,previous_cohort,new_cohort,previous_phone_number,new_phone_number,reason,changed_by)
    values(p_member_id,prior.full_name,trim(p_full_name),prior.email,next_email,prior.study_program,next_program,prior.cohort,next_cohort,prior.phone_number,next_phone,trim(p_reason),auth.uid());
end; $$;
revoke all on function public.update_member_profile(uuid,text,text,text,text,text) from public;
revoke all on function public.update_member_profile(uuid,text,text,text,text,text,text) from public;
grant execute on function public.update_member_profile(uuid,text,text,text,text,text,text) to authenticated;
