-- Record immutable manual cash/bank reconciliation snapshots against the ledger.
create table public.financial_reconciliations (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null,
  payment_method text not null check (payment_method in ('cash','bank_transfer','card','other')),
  transaction_count integer not null check (transaction_count >= 0),
  ledger_balance_minor bigint not null,
  actual_balance_minor bigint not null check (actual_balance_minor >= 0),
  variance_minor bigint not null,
  reason text not null check (length(trim(reason)) between 4 and 500),
  reconciled_by uuid not null references public.member_profiles(id),
  reconciled_at timestamptz not null default now(),
  check (variance_minor = actual_balance_minor - ledger_balance_minor)
);

create index financial_reconciliations_date_method_idx
  on public.financial_reconciliations(as_of_date desc,payment_method,reconciled_at desc);

alter table public.financial_reconciliations enable row level security;
revoke all on public.financial_reconciliations from public, anon, authenticated;
grant select on public.financial_reconciliations to authenticated;
create policy "finance officers read reconciliation snapshots"
  on public.financial_reconciliations for select to authenticated
  using (public.has_club_role(array['president','vice_president','treasurer','vice_treasurer']));

create trigger audit_financial_reconciliations
  after insert on public.financial_reconciliations
  for each row execute function public.audit_sensitive_row();

create or replace function public.record_financial_reconciliation(
  p_as_of_date date,
  p_payment_method text,
  p_actual_balance_minor bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_id uuid;
  ledger_balance bigint;
  entry_count integer;
  as_of_exclusive timestamptz;
begin
  if auth.uid() is null or not public.has_club_role(array['president','treasurer','vice_treasurer']) then
    raise exception 'Not authorized to record financial reconciliations.' using errcode='42501';
  end if;
  if p_as_of_date is null or p_as_of_date > (now() at time zone 'Africa/Casablanca')::date then
    raise exception 'Choose today or a date in the past.' using errcode='22023';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash','bank_transfer','card','other') then
    raise exception 'Choose a supported payment method.' using errcode='22023';
  end if;
  if p_actual_balance_minor is null or p_actual_balance_minor < 0 then
    raise exception 'The counted balance must be zero or greater.' using errcode='22023';
  end if;
  if p_reason is null or length(trim(p_reason)) < 4 or length(p_reason) > 500 then
    raise exception 'A reconciliation note between four and 500 characters is required.' using errcode='22023';
  end if;

  -- Match the transaction insert lock so the captured ledger snapshot cannot
  -- race with a newly posted finance entry.
  perform pg_advisory_xact_lock(884211, 290017);
  as_of_exclusive := ((p_as_of_date + 1)::timestamp at time zone 'Africa/Casablanca');
  select coalesce(sum(case when direction='in' then amount_minor else -amount_minor end),0)::bigint,
         count(*)::integer
    into ledger_balance,entry_count
    from public.financial_transactions
   where status='posted'
     and payment_method=p_payment_method
     and created_at < as_of_exclusive;

  perform set_config('app.change_reason',trim(p_reason),true);
  insert into public.financial_reconciliations(
    as_of_date,payment_method,transaction_count,ledger_balance_minor,
    actual_balance_minor,variance_minor,reason,reconciled_by
  ) values (
    p_as_of_date,p_payment_method,entry_count,ledger_balance,
    p_actual_balance_minor,p_actual_balance_minor-ledger_balance,trim(p_reason),auth.uid()
  ) returning id into result_id;
  return result_id;
end;
$$;

revoke all on function public.record_financial_reconciliation(date,text,bigint,text) from public, anon;
grant execute on function public.record_financial_reconciliation(date,text,bigint,text) to authenticated;

-- Extend the existing export audit RPC without changing its attendance and
-- finance authorization behavior.
create or replace function public.audit_report_export(p_report_type text, p_scope_id text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_report_type = 'attendance' then
    if not public.has_club_role(array['president','vice_president','hr','vice_hr']) then
      raise exception 'Not authorized to export attendance';
    end if;
  elsif p_report_type = 'finance' then
    if not public.has_club_role(array['president','vice_president','treasurer','vice_treasurer'])
       and p_scope_id is distinct from auth.uid()::text then
      raise exception 'Not authorized to export finance';
    end if;
  elsif p_report_type = 'financial_reconciliation' then
    if not public.has_club_role(array['president','vice_president','treasurer','vice_treasurer']) then
      raise exception 'Not authorized to export financial reconciliations';
    end if;
  else
    raise exception 'Unsupported report type';
  end if;

  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields)
  values(auth.uid(),'export','report:' || p_report_type,p_scope_id,array['csv_download']);
end;
$$;

revoke all on function public.audit_report_export(text,text) from public, anon;
grant execute on function public.audit_report_export(text,text) to authenticated;
