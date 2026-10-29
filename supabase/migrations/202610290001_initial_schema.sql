-- BAC initial schema. Seed with test data only; never import real member data here.
create extension if not exists pgcrypto;

create table public.club_terms (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  starts_on date not null, ends_on date not null, is_current boolean not null default false,
  created_at timestamptz not null default now(), check (ends_on >= starts_on)
);
create unique index one_current_club_term on public.club_terms(is_current) where is_current;

create table public.member_profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  member_code text not null unique, full_name text not null, email text,
  study_program text, cohort text,
  status text not null default 'active' check (status in ('applicant','active','suspended','former')),
  joined_on date, archived_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.member_status_history (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.member_profiles(id),
  old_status text not null, new_status text not null,
  reason text not null check (nullif(trim(reason),'') is not null),
  changed_by uuid not null references public.member_profiles(id), created_at timestamptz not null default now()
);
create index member_status_history_member_created_idx on public.member_status_history(member_id,created_at desc);
create table public.member_profile_history (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.member_profiles(id),
  previous_full_name text not null, new_full_name text not null,
  previous_email text, new_email text, previous_study_program text, new_study_program text,
  previous_cohort text, new_cohort text,
  reason text not null check (length(trim(reason)) >= 4),
  changed_by uuid not null references public.member_profiles(id), created_at timestamptz not null default now()
);
create index member_profile_history_member_created_idx on public.member_profile_history(member_id,created_at desc);
create or replace function public.guard_member_status_update()
returns trigger language plpgsql set search_path = public
as $$
begin
  if old.status is distinct from new.status and current_setting('app.member_status_change',true) is distinct from 'on' then
    raise exception 'Use the audited member status action' using errcode='42501';
  end if;
  if (old.full_name,old.email,old.study_program,old.cohort) is distinct from (new.full_name,new.email,new.study_program,new.cohort)
     and current_setting('app.member_profile_update',true) is distinct from 'on' then
    raise exception 'Use the audited member profile action' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger guard_member_status_update before update on public.member_profiles
for each row execute function public.guard_member_status_update();
create table public.role_assignments (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.member_profiles(id),
  term_id uuid not null references public.club_terms(id),
  role text not null check (role in ('president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer','member')),
  assigned_by uuid references public.member_profiles(id), starts_at timestamptz not null default now(),
  ends_at timestamptz, created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create unique index one_office_role_per_member_term on public.role_assignments(member_id,term_id) where ends_at is null and role<>'member';
create unique index one_current_holder_per_role_term on public.role_assignments(term_id,role) where ends_at is null and role<>'member';
create table public.role_assignment_history (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.member_profiles(id),
  previous_role text, new_role text,
  reason text not null check (length(trim(reason)) >= 4),
  changed_by uuid not null references public.member_profiles(id), created_at timestamptz not null default now()
);
create index role_assignment_history_member_created_idx on public.role_assignment_history(member_id,created_at desc);

create table public.events (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '',
  event_type text not null default 'meeting' check (event_type in ('meeting','event','workshop','caravan','other')),
  starts_at timestamptz not null, ends_at timestamptz, location text,
  status text not null default 'draft' check (status in ('draft','published','in_progress','completed','cancelled')),
  expected_contribution_minor bigint not null default 0 check (expected_contribution_minor >= 0),
  currency char(3) not null default 'MAD', created_by uuid not null references public.member_profiles(id),
  updated_by uuid references public.member_profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index events_starts_at_idx on public.events(starts_at);

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(), event_id uuid not null unique references public.events(id),
  opens_at timestamptz not null, closes_at timestamptz not null,
  state text not null default 'closed' check (state in ('closed','open','finalized')),
  created_by uuid not null references public.member_profiles(id), created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.attendance_sessions(id),
  member_id uuid not null references public.member_profiles(id),
  status text not null check (status in ('pending_confirmation','present','absent','excused','corrected')),
  source text not null default 'qr' check (source in ('qr','manual','import')),
  checked_in_at timestamptz, recorded_by uuid references public.member_profiles(id), correction_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(session_id,member_id), check (source <> 'manual' or nullif(trim(correction_reason),'') is not null),
  check (status <> 'corrected' or nullif(trim(correction_reason),'') is not null)
);
create table public.attendance_correction_history (
  id uuid primary key default gen_random_uuid(), attendance_record_id uuid not null references public.attendance_records(id),
  session_id uuid not null references public.attendance_sessions(id), member_id uuid not null references public.member_profiles(id),
  previous_status text, previous_source text, previous_checked_in_at timestamptz,
  new_status text not null check (new_status in ('present','absent','excused')), reason text not null check (length(trim(reason)) >= 4),
  changed_by uuid not null references public.member_profiles(id), created_at timestamptz not null default now()
);
create index attendance_correction_member_created_idx on public.attendance_correction_history(member_id,created_at desc);
-- Raw QR challenges are short-lived and available only to Edge Functions using
-- the service role. Store hashes, never the token returned to a device.
create table public.attendance_qr_tokens (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, issued_by uuid not null references public.member_profiles(id),
  created_at timestamptz not null default now()
);

create table public.payment_expectations (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
  member_id uuid not null references public.member_profiles(id), expected_minor bigint not null check (expected_minor >= 0),
  waiver_minor bigint not null default 0 check (waiver_minor >= 0 and waiver_minor <= expected_minor),
  waiver_reason text, waived_by uuid references public.member_profiles(id), created_at timestamptz not null default now(),
  unique(event_id,member_id), check (waiver_minor = 0 or nullif(trim(waiver_reason),'') is not null)
);
create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(), event_id uuid references public.events(id),
  member_id uuid references public.member_profiles(id),
  transaction_type text not null check (transaction_type in ('contribution','purchase','refund','other_income','other_expense','reversal')),
  amount_minor bigint not null check (amount_minor > 0), direction text not null check (direction in ('in','out')),
  currency char(3) not null default 'MAD', payment_method text check (payment_method in ('cash','bank_transfer','card','other')),
  description text not null, reference text, receipt_path text, correction_reason text,
  status text not null default 'posted' check (status in ('draft','submitted','approved','posted','rejected')),
  reverses_transaction_id uuid references public.financial_transactions(id),
  created_by uuid not null references public.member_profiles(id), approved_by uuid references public.member_profiles(id),
  created_at timestamptz not null default now(),
  check ((transaction_type = 'reversal') = (reverses_transaction_id is not null)),
  check (transaction_type <> 'reversal' or nullif(trim(correction_reason),'') is not null),
  check (transaction_type <> 'contribution' or (direction = 'in' and member_id is not null)),
  check (transaction_type <> 'purchase' or direction = 'out')
);
create unique index one_reversal_per_financial_transaction
  on public.financial_transactions(reverses_transaction_id)
  where transaction_type='reversal';
create table public.point_transactions (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.member_profiles(id),
  event_id uuid references public.events(id), points_delta integer not null check (points_delta <> 0),
  category text not null, reason text not null check (nullif(trim(reason),'') is not null), reverses_transaction_id uuid references public.point_transactions(id),
  created_by uuid not null references public.member_profiles(id), created_at timestamptz not null default now()
);
-- Security-invoker view: underlying point RLS keeps members to their own balance.
create view public.member_point_balances with (security_invoker = true) as
  select member_id, coalesce(sum(points_delta),0)::bigint as points_balance
  from public.point_transactions group by member_id;
create table public.tasks (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '',
  team text check (team in ('president','communications','treasury','hr','secretariat','logistics','club')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','done','cancelled')),
  due_at timestamptz, event_id uuid references public.events(id),
  created_by uuid not null references public.member_profiles(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.task_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.member_profiles(id), assigned_by uuid not null references public.member_profiles(id),
  created_at timestamptz not null default now(), primary key(task_id,member_id)
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(), title text not null, body text not null,
  audience text not null default 'members' check (audience in ('members','officers','specific')),
  published_at timestamptz, created_by uuid not null references public.member_profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.member_ideas (
  id uuid primary key default gen_random_uuid(), submitted_by uuid not null references public.member_profiles(id),
  title text not null, description text not null,
  status text not null default 'new' check (status in ('new','reviewing','accepted','declined','implemented')),
  reviewed_by uuid references public.member_profiles(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(), name text not null, category text not null,
  quantity integer not null default 0 check (quantity >= 0),
  condition text not null default 'good' check (condition in ('good','needs_attention','damaged','retired')),
  storage_location text, notes text not null default '', created_by uuid not null references public.member_profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(), item_id uuid not null references public.inventory_items(id),
  member_id uuid references public.member_profiles(id), event_id uuid references public.events(id),
  quantity integer not null check (quantity <> 0),
  movement_type text not null check (movement_type in ('received','checked_out','returned','adjustment','retired')),
  reason text not null, created_by uuid not null references public.member_profiles(id), created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.member_profiles(id) on delete cascade,
  title text not null, body text not null, category text not null default 'general', target_path text,
  read_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_log (
  id bigint generated always as identity primary key, actor_id uuid references public.member_profiles(id),
  action text not null, table_name text not null, record_id text, changed_fields text[] not null default '{}',
  reason text, created_at timestamptz not null default now()
);

create view public.event_payment_reconciliation with (security_invoker = true) as
select pe.event_id,pe.member_id,pe.expected_minor,pe.waiver_minor,pe.waiver_reason,
  coalesce(sum(case when ft.direction='in' then ft.amount_minor else -ft.amount_minor end) filter(where ft.id is not null),0)::bigint as received_minor,
  greatest(pe.expected_minor-pe.waiver_minor-coalesce(sum(case when ft.direction='in' then ft.amount_minor else -ft.amount_minor end) filter(where ft.id is not null),0),0)::bigint as due_minor,
  case when coalesce(sum(case when ft.direction='in' then ft.amount_minor else -ft.amount_minor end) filter(where ft.id is not null),0) >= pe.expected_minor-pe.waiver_minor then 'paid'
       when coalesce(sum(case when ft.direction='in' then ft.amount_minor else -ft.amount_minor end) filter(where ft.id is not null),0) > 0 then 'partial'
       when pe.waiver_minor >= pe.expected_minor then 'waived' else 'due' end as payment_status
from public.payment_expectations pe
left join public.financial_transactions ft on ft.event_id=pe.event_id and ft.member_id=pe.member_id and ft.status='posted' and ft.transaction_type in ('contribution','reversal')
group by pe.event_id,pe.member_id,pe.expected_minor,pe.waiver_minor,pe.waiver_reason;

create view public.recorded_financial_balance with (security_invoker = true) as
select coalesce(sum(case when direction='in' then amount_minor else -amount_minor end) filter(where status='posted'),0)::bigint as balance_minor
from public.financial_transactions;

create or replace function public.has_club_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.role_assignments ra join public.club_terms ct on ct.id=ra.term_id and ct.is_current
  where ra.member_id=auth.uid() and ra.role=any(allowed_roles) and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
); $$;
revoke all on function public.has_club_role(text[]) from public;
grant execute on function public.has_club_role(text[]) to authenticated;

create or replace function public.audit_sensitive_row()
returns trigger language plpgsql security definer set search_path = public
as $$
declare before_row jsonb; after_row jsonb; changed text[]; target_id text;
begin
  if tg_op='INSERT' then before_row:='{}'::jsonb; else before_row:=to_jsonb(old); end if;
  if tg_op='DELETE' then after_row:='{}'::jsonb; else after_row:=to_jsonb(new); end if;
  target_id:=coalesce(after_row->>'id',before_row->>'id',
    case when after_row ? 'task_id' then (after_row->>'task_id')||':'||(after_row->>'member_id') end,
    case when before_row ? 'task_id' then (before_row->>'task_id')||':'||(before_row->>'member_id') end);
  select coalesce(array_agg(k),'{}') into changed from (
    select key k from jsonb_each(after_row) where after_row->key is distinct from before_row->key and key<>'updated_at'
  ) fields;
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
  values(coalesce(auth.uid(),nullif(after_row->>'updated_by','')::uuid,nullif(after_row->>'recorded_by','')::uuid,nullif(after_row->>'created_by','')::uuid,nullif(after_row->>'assigned_by','')::uuid,nullif(after_row->>'changed_by','')::uuid),lower(tg_op),tg_table_name,target_id,changed,nullif(current_setting('app.change_reason',true),''));
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;

do $$ declare tab text; begin
  foreach tab in array array['member_profiles','member_status_history','member_profile_history','role_assignments','role_assignment_history','events','attendance_sessions','attendance_records','attendance_correction_history','payment_expectations','financial_transactions','point_transactions','tasks','task_assignments','announcements','member_ideas','inventory_items','inventory_movements'] loop
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_sensitive_row()',tab,tab);
  end loop;
end $$;

-- Enable RLS on all tables before granting authenticated access.
alter table public.club_terms enable row level security;
alter table public.member_profiles enable row level security;
alter table public.member_status_history enable row level security;
alter table public.member_profile_history enable row level security;
alter table public.role_assignments enable row level security;
alter table public.role_assignment_history enable row level security;
alter table public.events enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_correction_history enable row level security;
alter table public.attendance_qr_tokens enable row level security;
alter table public.payment_expectations enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.point_transactions enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.announcements enable row level security;
alter table public.member_ideas enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

create policy "read current term" on public.club_terms for select to authenticated using (is_current or public.has_club_role(array['president','vice_president','hr','vice_hr','general_secretary']));
create policy "read own profile or roster" on public.member_profiles for select to authenticated using (id=auth.uid() or public.has_club_role(array['president','vice_president','hr','vice_hr','treasurer','vice_treasurer','communications_officer','general_secretary','logistics_officer','vice_logistics_officer']));
create policy "president manages profiles" on public.member_profiles for all to authenticated using (public.has_club_role(array['president'])) with check (public.has_club_role(array['president']));
create policy "HR reads member status history" on public.member_status_history for select to authenticated using (public.has_club_role(array['president','vice_president','hr','vice_hr']));
create policy "HR reads member profile history" on public.member_profile_history for select to authenticated using (public.has_club_role(array['president','vice_president','hr','vice_hr']));
create policy "read role assignments" on public.role_assignments for select to authenticated using (member_id=auth.uid() or public.has_club_role(array['president','vice_president','hr','vice_hr','general_secretary']));
create policy "president reads role assignments" on public.role_assignments for select to authenticated using (public.has_club_role(array['president']));
create policy "president reads role history" on public.role_assignment_history for select to authenticated using (public.has_club_role(array['president']));
create policy "read published events" on public.events for select to authenticated using (status<>'draft' or public.has_club_role(array['president','vice_president','hr','vice_hr','communications_officer','general_secretary','logistics_officer','vice_logistics_officer','treasurer','vice_treasurer']));
create policy "officers update events" on public.events for update to authenticated using (public.has_club_role(array['president','vice_president','hr','vice_hr'])) with check (public.has_club_role(array['president','vice_president','hr','vice_hr']));
create policy "officers create events as themselves" on public.events for insert to authenticated with check (public.has_club_role(array['president','vice_president','hr','vice_hr']) and created_by=auth.uid());
create policy "president removes events" on public.events for delete to authenticated using (public.has_club_role(array['president']));
create policy "HR reads attendance sessions" on public.attendance_sessions for select to authenticated using (public.has_club_role(array['president','vice_president','hr','vice_hr']));
create policy "members read sessions with own attendance" on public.attendance_sessions for select to authenticated using (exists(select 1 from public.attendance_records ar where ar.session_id=id and ar.member_id=auth.uid()));
create policy "HR updates attendance sessions" on public.attendance_sessions for update to authenticated using (public.has_club_role(array['president','vice_president','hr','vice_hr'])) with check (public.has_club_role(array['president','vice_president','hr','vice_hr']));
create policy "HR creates attendance sessions as themselves" on public.attendance_sessions for insert to authenticated with check (public.has_club_role(array['president','vice_president','hr','vice_hr']) and created_by=auth.uid());
create policy "members and HR read attendance" on public.attendance_records for select to authenticated using (member_id=auth.uid() or public.has_club_role(array['president','vice_president','hr','vice_hr']));
create policy "HR reads attendance correction history" on public.attendance_correction_history for select to authenticated using (public.has_club_role(array['president','vice_president','hr','vice_hr']));
-- Intentionally no authenticated-client policies for attendance_qr_tokens.
create policy "read own or treasury payment expectations" on public.payment_expectations for select to authenticated using (member_id=auth.uid() or public.has_club_role(array['president','vice_president','treasurer','vice_treasurer']));
create policy "treasury manages expectations" on public.payment_expectations for all to authenticated using (public.has_club_role(array['president','treasurer','vice_treasurer'])) with check (public.has_club_role(array['president','treasurer','vice_treasurer']));
create policy "read own or treasury financial entries" on public.financial_transactions for select to authenticated using (member_id=auth.uid() or public.has_club_role(array['president','vice_president','treasurer','vice_treasurer']));
create policy "treasury creates entries" on public.financial_transactions for insert to authenticated with check (public.has_club_role(array['president','treasurer','vice_treasurer']) and created_by=auth.uid());
create policy "no financial overwrite" on public.financial_transactions for update to authenticated using (false) with check (false);
create policy "read own or HR points" on public.point_transactions for select to authenticated using (member_id=auth.uid() or public.has_club_role(array['president','vice_president','hr','vice_hr']));
create policy "HR awards points" on public.point_transactions for insert to authenticated with check (public.has_club_role(array['president','hr','vice_hr']) and created_by=auth.uid());
create policy "points immutable" on public.point_transactions for update to authenticated using (false) with check (false);
create policy "no point deletion" on public.point_transactions for delete to authenticated using (false);
create policy "assigned members read tasks" on public.tasks for select to authenticated using (public.has_club_role(array['president','vice_president']) or created_by=auth.uid() or exists(select 1 from public.task_assignments ta where ta.task_id=id and ta.member_id=auth.uid()));
create policy "officers create tasks" on public.tasks for insert to authenticated with check (public.has_club_role(array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']) and created_by=auth.uid());
create policy "officers update tasks" on public.tasks for update to authenticated using (public.has_club_role(array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer'])) with check (public.has_club_role(array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']));
create policy "members read own assignments" on public.task_assignments for select to authenticated using (member_id=auth.uid() or public.has_club_role(array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']));
create policy "officers assign tasks" on public.task_assignments for all to authenticated using (public.has_club_role(array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer'])) with check (public.has_club_role(array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']) and assigned_by=auth.uid());
create policy "read news by audience" on public.announcements for select to authenticated using (
  public.has_club_role(array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer'])
  or (published_at is not null and audience='members')
);
create policy "communications and secretary publish as themselves" on public.announcements for insert to authenticated with check (public.has_club_role(array['president','vice_president','communications_officer','general_secretary']) and created_by=auth.uid());
create policy "communications and secretary update news" on public.announcements for update to authenticated using (public.has_club_role(array['president','vice_president','communications_officer','general_secretary'])) with check (public.has_club_role(array['president','vice_president','communications_officer','general_secretary']));
create policy "president removes news" on public.announcements for delete to authenticated using (public.has_club_role(array['president']));
create policy "members submit own ideas" on public.member_ideas for insert to authenticated with check (submitted_by=auth.uid());
create policy "members and leaders read ideas" on public.member_ideas for select to authenticated using (submitted_by=auth.uid() or public.has_club_role(array['president','vice_president','general_secretary']));
create policy "leaders review ideas" on public.member_ideas for update to authenticated using (public.has_club_role(array['president','vice_president','general_secretary'])) with check (public.has_club_role(array['president','vice_president','general_secretary']));
create policy "members read inventory" on public.inventory_items for select to authenticated using (true);
create policy "logistics manages inventory" on public.inventory_items for update to authenticated using (public.has_club_role(array['president','vice_president','logistics_officer','vice_logistics_officer'])) with check (public.has_club_role(array['president','vice_president','logistics_officer','vice_logistics_officer']));
create policy "logistics creates inventory as themselves" on public.inventory_items for insert to authenticated with check (public.has_club_role(array['president','vice_president','logistics_officer','vice_logistics_officer']) and created_by=auth.uid());
create policy "president retires inventory records" on public.inventory_items for delete to authenticated using (public.has_club_role(array['president']));
create policy "members read inventory movements" on public.inventory_movements for select to authenticated using (true);
create policy "logistics records inventory movements" on public.inventory_movements for insert to authenticated with check (public.has_club_role(array['president','vice_president','logistics_officer','vice_logistics_officer']) and created_by=auth.uid());
create policy "inventory movements are immutable" on public.inventory_movements for update to authenticated using (false) with check (false);
create policy "inventory movements cannot be deleted" on public.inventory_movements for delete to authenticated using (false);
create policy "read own notifications" on public.notifications for select to authenticated using (recipient_id=auth.uid());
create policy "update own notifications" on public.notifications for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());
create policy "officers create notifications" on public.notifications for insert to authenticated with check (public.has_club_role(array['president','vice_president','communications_officer','general_secretary','hr','vice_hr','treasurer','vice_treasurer','logistics_officer','vice_logistics_officer']));
create policy "president reads audit" on public.audit_log for select to authenticated using (public.has_club_role(array['president']));

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.member_point_balances to authenticated;
grant select on public.event_payment_reconciliation to authenticated;
grant select on public.recorded_financial_balance to authenticated;

create or replace function public.change_member_status(p_member_id uuid, p_new_status text, p_reason text)
returns text language plpgsql security definer set search_path = public
as $$
declare previous_status text; current_term uuid; active_role text;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','hr','vice_hr']) then
    raise exception 'Not authorized to change membership status' using errcode='42501';
  end if;
  if p_new_status is null or p_new_status not in ('applicant','active','suspended','former') or length(trim(p_reason)) < 4 then
    raise exception 'A valid status and reason are required' using errcode='22023';
  end if;
  select status into previous_status from public.member_profiles where id=p_member_id for update;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  if p_new_status<>'active' then
    select id into current_term from public.club_terms where is_current;
    select role into active_role from public.role_assignments where member_id=p_member_id and term_id=current_term and role<>'member' and starts_at<=now() and ends_at is null for update;
    if active_role='president' and not exists(
      select 1 from public.role_assignments ra join public.member_profiles mp on mp.id=ra.member_id
      where ra.term_id=current_term and ra.role='president' and ra.member_id<>p_member_id and ra.starts_at<=now() and ra.ends_at is null and mp.status='active'
    ) then raise exception 'Assign another active President before changing this status' using errcode='23514'; end if;
    if active_role is not null then
      update public.role_assignments set ends_at=now() where member_id=p_member_id and term_id=current_term and role=active_role and ends_at is null;
      insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by)
        values(p_member_id,active_role,null,'Membership status changed: '||trim(p_reason),auth.uid());
    end if;
  end if;
  perform set_config('app.member_status_change','on',true);
  update public.member_profiles set status=p_new_status,
    archived_at=case when p_new_status='former' then coalesce(archived_at,current_date) else null end,
    updated_at=now() where id=p_member_id;
  insert into public.member_status_history(member_id,old_status,new_status,reason,changed_by)
    values(p_member_id,previous_status,p_new_status,trim(p_reason),auth.uid());
  return p_new_status;
end; $$;
revoke all on function public.change_member_status(uuid,text,text) from public;
grant execute on function public.change_member_status(uuid,text,text) to authenticated;

create or replace function public.update_member_profile(p_member_id uuid,p_full_name text,p_email text,p_study_program text,p_cohort text,p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare prior public.member_profiles%rowtype; next_email text; next_program text; next_cohort text;
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
  select * into prior from public.member_profiles where id=p_member_id for update;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  next_email:=nullif(trim(p_email),''); next_program:=nullif(trim(p_study_program),''); next_cohort:=nullif(trim(p_cohort),'');
  if (prior.full_name,prior.email,prior.study_program,prior.cohort) is not distinct from (trim(p_full_name),next_email,next_program,next_cohort) then return; end if;
  perform set_config('app.member_profile_update','on',true);
  update public.member_profiles set full_name=trim(p_full_name),email=next_email,study_program=next_program,cohort=next_cohort,updated_at=now() where id=p_member_id;
  insert into public.member_profile_history(member_id,previous_full_name,new_full_name,previous_email,new_email,previous_study_program,new_study_program,previous_cohort,new_cohort,reason,changed_by)
    values(p_member_id,prior.full_name,trim(p_full_name),prior.email,next_email,prior.study_program,next_program,prior.cohort,next_cohort,trim(p_reason),auth.uid());
end; $$;
revoke all on function public.update_member_profile(uuid,text,text,text,text,text) from public;
grant execute on function public.update_member_profile(uuid,text,text,text,text,text) to authenticated;

create or replace function public.set_member_role(p_member_id uuid,p_new_role text,p_reason text)
returns text language plpgsql security definer set search_path = public
as $$
declare current_term uuid; current_role text; member_status text; existing_holder uuid;
begin
  if auth.uid() is null or not public.has_club_role(array['president']) then
    raise exception 'Only the President can change club role assignments' using errcode='42501';
  end if;
  if p_new_role is null or p_new_role not in ('president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer','member') or p_reason is null or length(trim(p_reason)) < 4 then
    raise exception 'A valid role and reason are required' using errcode='22023';
  end if;
  select id into current_term from public.club_terms where is_current for update;
  if not found then raise exception 'There is no current club term' using errcode='P0002'; end if;
  select status into member_status from public.member_profiles where id=p_member_id for update;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  if member_status <> 'active' and p_new_role <> 'member' then raise exception 'Only active members can hold an officer role' using errcode='22023'; end if;
  select role into current_role from public.role_assignments where member_id=p_member_id and term_id=current_term and role<>'member' and starts_at<=now() and ends_at is null for update;
  if current_role is not distinct from nullif(p_new_role,'member') then return current_role; end if;
  if current_role='president' and p_new_role<>'president' and not exists(
    select 1 from public.role_assignments ra join public.member_profiles mp on mp.id=ra.member_id
    where ra.term_id=current_term and ra.role='president' and ra.member_id<>p_member_id and ra.starts_at<=now() and ra.ends_at is null and mp.status='active'
  ) then raise exception 'Assign another active President before removing the current President' using errcode='23514'; end if;
  if p_new_role<>'member' then
    select member_id into existing_holder from public.role_assignments where term_id=current_term and role=p_new_role and starts_at<=now() and ends_at is null and member_id<>p_member_id for update;
    if found and p_new_role<>'president' then raise exception 'This officer role is already assigned to another member' using errcode='23505'; end if;
    if found and p_new_role='president' then
      update public.role_assignments set ends_at=now() where member_id=existing_holder and term_id=current_term and role='president' and ends_at is null;
      insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by)
        values(existing_holder,'president',null,'Transferred to another member: '||trim(p_reason),auth.uid());
    end if;
  end if;
  if current_role is not null then
    update public.role_assignments set ends_at=now() where member_id=p_member_id and term_id=current_term and role=current_role and ends_at is null;
  end if;
  if p_new_role<>'member' then
    insert into public.role_assignments(member_id,term_id,role,assigned_by,starts_at) values(p_member_id,current_term,p_new_role,auth.uid(),now());
  end if;
  insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by)
    values(p_member_id,current_role,nullif(p_new_role,'member'),trim(p_reason),auth.uid());
  return p_new_role;
end; $$;
revoke all on function public.set_member_role(uuid,text,text) from public;
grant execute on function public.set_member_role(uuid,text,text) to authenticated;

create or replace function public.generate_event_payment_expectations(p_event_id uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare target_amount bigint; target_status text; inserted_count integer;
begin
  if auth.uid() is null or not public.has_club_role(array['president','treasurer','vice_treasurer']) then
    raise exception 'Not authorized to generate payment expectations' using errcode='42501';
  end if;
  select expected_contribution_minor,status into target_amount,target_status from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if target_status not in ('published','in_progress','completed') or target_amount<=0 then
    raise exception 'The event must be published and have a positive expected contribution' using errcode='22023';
  end if;
  insert into public.payment_expectations(event_id,member_id,expected_minor)
    select p_event_id,id,target_amount from public.member_profiles where status='active'
    on conflict(event_id,member_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end; $$;
revoke all on function public.generate_event_payment_expectations(uuid) from public;
grant execute on function public.generate_event_payment_expectations(uuid) to authenticated;

create or replace function public.update_assigned_task_status(p_task_id uuid, p_new_status text)
returns text language plpgsql security definer set search_path = public
as $$
declare assigned_member boolean; officer boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_new_status is null or p_new_status not in ('todo','in_progress','blocked','done','cancelled') then
    raise exception 'Invalid task status' using errcode='22023';
  end if;
  officer:=public.has_club_role(array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']);
  select exists(select 1 from public.task_assignments where task_id=p_task_id and member_id=auth.uid()) into assigned_member;
  if not officer and not assigned_member then raise exception 'Not authorized to update this task' using errcode='42501'; end if;
  if not officer and p_new_status='cancelled' then raise exception 'Only club officers can cancel a task' using errcode='42501'; end if;
  update public.tasks set status=p_new_status,updated_at=now() where id=p_task_id;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;
  return p_new_status;
end; $$;
revoke all on function public.update_assigned_task_status(uuid,text) from public;
grant execute on function public.update_assigned_task_status(uuid,text) to authenticated;

create or replace function public.record_manual_attendance(p_session_id uuid, p_member_id uuid, p_status text, p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare prior_status text; prior_source text; prior_checked_in timestamptz; prior_record_id uuid; attendance_id uuid;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','hr','vice_hr']) then
    raise exception 'Not authorized to correct attendance' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('present','absent','excused') or p_reason is null or length(trim(p_reason)) < 4 then
    raise exception 'A valid status and correction reason are required' using errcode='22023';
  end if;
  if not exists(select 1 from public.attendance_sessions where id=p_session_id) then
    raise exception 'Attendance session not found' using errcode='P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text||':'||p_member_id::text,0));
  select id,status,source,checked_in_at into prior_record_id,prior_status,prior_source,prior_checked_in
    from public.attendance_records where session_id=p_session_id and member_id=p_member_id for update;
  insert into public.attendance_records(session_id,member_id,status,source,checked_in_at,recorded_by,correction_reason)
    values(p_session_id,p_member_id,p_status,'manual',case when p_status='present' then now() else null end,auth.uid(),trim(p_reason))
    on conflict(session_id,member_id) do update set status=excluded.status,source='manual',checked_in_at=excluded.checked_in_at,recorded_by=auth.uid(),correction_reason=excluded.correction_reason,updated_at=now()
    returning id into attendance_id;
  insert into public.attendance_correction_history(attendance_record_id,session_id,member_id,previous_status,previous_source,previous_checked_in_at,new_status,reason,changed_by)
    values(attendance_id,p_session_id,p_member_id,prior_status,prior_source,prior_checked_in,p_status,trim(p_reason),auth.uid());
  return attendance_id;
end; $$;
revoke all on function public.record_manual_attendance(uuid,uuid,text,text) from public;
grant execute on function public.record_manual_attendance(uuid,uuid,text,text) to authenticated;
