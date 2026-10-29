-- One-time BAC bootstrap template for a new Supabase project.
--
-- Before running: finish ALL supabase/migrations/*.sql migrations, create and
-- confirm the first President's Auth user in the Supabase dashboard, then fill
-- every REPLACE value below in your private SQL editor copy. Never commit real
-- names, email addresses, Auth IDs, or member data to this repository.
-- This script refuses to run while any placeholder remains or if a current
-- term/profile already exists.

do $$
declare
  p_auth_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- Auth user UUID
  p_email text := 'REPLACE WITH CONFIRMED AUTH EMAIL';
  p_full_name text := 'REPLACE WITH PRESIDENT NAME';
  p_member_code text := 'REPLACE WITH MEMBER CODE';
  p_study_program text := null; -- optional, or replace with a private value
  p_cohort text := null; -- optional, or replace with a private value
  p_term_name text := 'REPLACE WITH CLUB TERM NAME';
  p_term_starts_on date := date '2000-01-01'; -- replace with the actual start
  p_term_ends_on date := date '2000-01-01'; -- replace with the actual end
  v_auth_email text;
  v_term_id uuid;
begin
  if p_auth_user_id = '00000000-0000-0000-0000-000000000000'::uuid
     or p_email like 'REPLACE %'
     or p_full_name like 'REPLACE %'
     or p_member_code like 'REPLACE %'
     or p_term_name like 'REPLACE %'
     or p_term_starts_on = date '2000-01-01'
     or p_term_ends_on = date '2000-01-01' then
    raise exception 'Replace every required placeholder in your private SQL editor copy before running.';
  end if;
  if length(trim(p_full_name)) < 2 or length(trim(p_full_name)) > 120
     or length(trim(p_member_code)) < 2 or length(trim(p_member_code)) > 32
     or upper(trim(p_member_code)) !~ '^[A-Z0-9_-]+$'
     or length(trim(p_term_name)) < 2 or length(trim(p_term_name)) > 120
     or trim(p_email) = '' then
    raise exception 'Check the President name, member code, email, and term name lengths/format.';
  end if;
  if p_term_ends_on < p_term_starts_on then
    raise exception 'The club term end date must not precede its start date.';
  end if;
  if p_term_starts_on > timezone('Africa/Casablanca',now())::date then
    raise exception 'A future term cannot be marked current. Run this setup on or after the term start date.';
  end if;
  if p_term_ends_on < timezone('Africa/Casablanca',now())::date then
    raise exception 'A past term cannot be marked current. Check the term end date.';
  end if;

  select lower(email) into v_auth_email
  from auth.users
  where id = p_auth_user_id and email_confirmed_at is not null;
  if not found then
    raise exception 'Create and confirm this Auth user in the Supabase dashboard before running the bootstrap.';
  end if;
  if v_auth_email is distinct from lower(trim(p_email)) then
    raise exception 'The supplied email must match the confirmed Auth user.';
  end if;
  if exists(select 1 from public.club_terms)
     or exists(select 1 from public.member_profiles) then
    raise exception 'Club terms or member profiles already exist; this bootstrap is only for a new empty project.';
  end if;

  insert into public.club_terms(name,starts_on,ends_on,is_current)
  values(trim(p_term_name),p_term_starts_on,p_term_ends_on,true)
  returning id into v_term_id;

  insert into public.member_profiles(
    id,member_code,full_name,email,study_program,cohort,status,joined_on,must_change_password
  ) values(
    p_auth_user_id,upper(trim(p_member_code)),trim(p_full_name),lower(trim(p_email)),
    nullif(trim(p_study_program),''),nullif(trim(p_cohort),''),'active',current_date,false
  );

  insert into public.role_assignments(member_id,term_id,role,assigned_by,starts_at)
  values(p_auth_user_id,v_term_id,'president',p_auth_user_id,now());

  insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by)
  values(p_auth_user_id,null,'president','Initial President account setup',p_auth_user_id);

  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
  values(p_auth_user_id,'bootstrap','club_terms',v_term_id::text,array['initial_term','president_role'],'Initial BAC workspace bootstrap');
end;
$$;
