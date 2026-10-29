-- Confidential, member-submitted cases for HR support and conflict resolution.
create table public.member_cases (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.member_profiles(id),
  title text not null check (length(trim(title)) between 4 and 120),
  description text not null check (length(trim(description)) between 10 and 5000),
  people_involved text not null default '' check (length(people_involved)<=300),
  status text not null default 'new' check (status in ('new','reviewing','resolved','closed')),
  response text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index member_cases_submitter_created_idx on public.member_cases(submitted_by,created_at desc);
create index member_cases_status_created_idx on public.member_cases(status,created_at desc);

create table public.member_case_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.member_cases(id),
  old_status text,
  new_status text not null check (new_status in ('new','reviewing','resolved','closed')),
  note text not null,
  changed_by uuid not null references public.member_profiles(id),
  created_at timestamptz not null default now()
);
create index member_case_history_case_created_idx on public.member_case_history(case_id,created_at desc);

alter table public.member_cases enable row level security;
alter table public.member_case_history enable row level security;
grant select on public.member_cases,public.member_case_history to authenticated;
revoke insert,update,delete on public.member_cases,public.member_case_history from authenticated;

create policy "submitters and HR read cases" on public.member_cases for select to authenticated using (
  submitted_by=auth.uid() or public.has_club_role(array['president','vice_president','hr','vice_hr'])
);
create policy "submitters and HR read case history" on public.member_case_history for select to authenticated using (
  exists(select 1 from public.member_cases mc where mc.id=case_id and
    (mc.submitted_by=auth.uid() or public.has_club_role(array['president','vice_president','hr','vice_hr'])))
);

create trigger audit_member_cases after insert or update or delete on public.member_cases
  for each row execute function public.audit_sensitive_row();
create trigger audit_member_case_history after insert or update or delete on public.member_case_history
  for each row execute function public.audit_sensitive_row();

create or replace function public.submit_member_case(p_title text,p_description text,p_people_involved text default '')
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_case_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.member_profiles where id=auth.uid() and status='active') then
    raise exception 'Active club membership is required' using errcode='42501';
  end if;
  if p_title is null or length(trim(p_title))<4 or length(p_title)>120
     or p_description is null or length(trim(p_description))<10 or length(p_description)>5000
     or length(coalesce(p_people_involved,''))>300 then
    raise exception 'Add a short title and a clear description of at least 10 characters' using errcode='22023';
  end if;
  insert into public.member_cases(submitted_by,title,description,people_involved)
    values(auth.uid(),trim(p_title),trim(p_description),trim(coalesce(p_people_involved,''))) returning id into new_case_id;
  insert into public.member_case_history(case_id,old_status,new_status,note,changed_by)
    values(new_case_id,null,'new','Report submitted',auth.uid());
  insert into public.notifications(recipient_id,title,body,category,target_path)
    select distinct ra.member_id,'A member asked HR for support','A confidential case is waiting for review.','hr_case','/support'
    from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    join public.member_profiles mp on mp.id=ra.member_id and mp.status='active'
    where ra.role in ('president','vice_president','hr','vice_hr') and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now());
  return new_case_id;
end; $$;
revoke all on function public.submit_member_case(text,text,text) from public;
grant execute on function public.submit_member_case(text,text,text) to authenticated;

create or replace function public.update_member_case(p_case_id uuid,p_new_status text,p_response text)
returns text language plpgsql security definer set search_path = public
as $$
declare case_row public.member_cases%rowtype; safe_response text; history_note text;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','hr','vice_hr']) then
    raise exception 'Not authorized to manage HR cases' using errcode='42501';
  end if;
  if p_new_status is null or p_new_status not in ('new','reviewing','resolved','closed')
     or length(coalesce(p_response,''))>3000 then
    raise exception 'Case status or response is invalid' using errcode='22023';
  end if;
  select * into case_row from public.member_cases where id=p_case_id for update;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  safe_response:=trim(coalesce(p_response,''));
  if p_new_status in ('resolved','closed') and length(safe_response)<4 then
    raise exception 'Add a response before resolving or closing a case' using errcode='22023';
  end if;
  history_note:=case when safe_response<>'' then safe_response else 'Case status updated' end;
  update public.member_cases set status=p_new_status,
    response=case when safe_response<>'' then safe_response else response end,
    updated_at=now(),
    resolved_at=case when p_new_status in ('resolved','closed') then coalesce(resolved_at,now()) when p_new_status in ('new','reviewing') then null else resolved_at end
    where id=p_case_id;
  insert into public.member_case_history(case_id,old_status,new_status,note,changed_by)
    values(p_case_id,case_row.status,p_new_status,history_note,auth.uid());
  insert into public.notifications(recipient_id,title,body,category,target_path)
    values(case_row.submitted_by,'HR updated your support case',
      case when safe_response<>'' then 'Status: '||replace(p_new_status,'_',' ')||' · '||left(safe_response,240) else 'Status: '||replace(p_new_status,'_',' ') end,
      'hr_case','/support');
  return p_new_status;
end; $$;
revoke all on function public.update_member_case(uuid,text,text) from public;
grant execute on function public.update_member_case(uuid,text,text) to authenticated;
