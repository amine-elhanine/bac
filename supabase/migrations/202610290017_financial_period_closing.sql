-- The finance UI records MAD only. Prevent mixed-currency totals in balances and closes.
alter table public.financial_transactions
  add constraint financial_transactions_currency_mad
  check (currency='MAD');

create table public.financial_period_closures (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  transaction_count integer not null check (transaction_count >= 0),
  income_minor bigint not null check (income_minor >= 0),
  expenses_minor bigint not null check (expenses_minor >= 0),
  net_minor bigint not null,
  reason text not null check (length(trim(reason)) between 4 and 400),
  closed_by uuid not null references public.member_profiles(id),
  closed_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (net_minor=income_minor-expenses_minor),
  unique (start_date,end_date)
);

alter table public.financial_period_closures enable row level security;
revoke all on public.financial_period_closures from anon, authenticated;
grant select on public.financial_period_closures to authenticated;
create policy "finance officers read closed periods" on public.financial_period_closures
  for select to authenticated
  using (public.has_club_role(array['president','vice_president','treasurer','vice_treasurer']));

-- Use one lock for inserts and close operations to avoid a transaction racing
-- the snapshot and then appearing in an already closed period.
create or replace function public.prevent_financial_backdating()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare local_transaction_date date;
begin
  perform pg_advisory_xact_lock(884211, 290017);
  local_transaction_date := (new.created_at at time zone 'Africa/Casablanca')::date;

  if new.created_at < now() - interval '2 minutes'
     or new.created_at > now() + interval '2 minutes' then
    raise exception 'Financial transactions cannot be backdated or future-dated.';
  end if;

  if exists (
    select 1 from public.financial_period_closures c
    where local_transaction_date between c.start_date and c.end_date
  ) then
    raise exception 'This financial date belongs to a closed period.';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_financial_backdating() from public, anon, authenticated;
create trigger prevent_financial_backdating_before_insert
  before insert on public.financial_transactions
  for each row execute function public.prevent_financial_backdating();

create or replace function public.close_financial_period(p_start_date date,p_end_date date,p_reason text)
returns public.financial_period_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result public.financial_period_closures%rowtype;
begin
  if auth.uid() is null or not public.has_club_role(array['president','treasurer','vice_treasurer']) then
    raise exception 'Not authorized to close a financial period.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date >= (now() at time zone 'Africa/Casablanca')::date then
    raise exception 'A period can only be closed after its end date has passed.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 4 or length(trim(p_reason)) > 400 then
    raise exception 'A reason between four and 400 characters is required.';
  end if;

  perform pg_advisory_xact_lock(884211, 290017);
  if exists (
    select 1 from public.financial_period_closures c
    where p_start_date <= c.end_date and p_end_date >= c.start_date
  ) then
    raise exception 'This date range overlaps an already closed period.';
  end if;

  insert into public.financial_period_closures(
    start_date,end_date,transaction_count,income_minor,expenses_minor,net_minor,reason,closed_by
  )
  select p_start_date,p_end_date,count(*)::integer,
    coalesce(sum(amount_minor) filter(where direction='in'),0)::bigint,
    coalesce(sum(amount_minor) filter(where direction='out'),0)::bigint,
    coalesce(sum(case when direction='in' then amount_minor else -amount_minor end),0)::bigint,
    trim(p_reason),auth.uid()
  from public.financial_transactions
  where status='posted'
    and created_at >= (p_start_date::timestamp at time zone 'Africa/Casablanca')
    and created_at < ((p_end_date + 1)::timestamp at time zone 'Africa/Casablanca')
  returning * into result;

  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
  values(auth.uid(),'close','financial_period_closures',result.id::text,
    array['start_date','end_date','transaction_count','income_minor','expenses_minor','net_minor'],trim(p_reason));
  return result;
end;
$$;

revoke all on function public.close_financial_period(date,date,text) from public, anon;
grant execute on function public.close_financial_period(date,date,text) to authenticated;

create index financial_period_closures_dates_idx
  on public.financial_period_closures(start_date desc,end_date desc);
create index financial_transactions_created_at_idx
  on public.financial_transactions(created_at desc) where status='posted';
