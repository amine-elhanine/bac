-- Notify only the member whose contribution is posted or reversed.
-- Finance notices remain mandatory, like task and HR notices.
create or replace function public.notify_member_of_financial_transaction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_name text;
  amount_label text;
  action_label text;
begin
  if new.status <> 'posted'
     or new.transaction_type not in ('contribution','reversal')
     or new.member_id is null then
    return new;
  end if;

  select e.title into event_name from public.events e where e.id = new.event_id;
  amount_label := (new.amount_minor / 100)::text || '.'
    || lpad((new.amount_minor % 100)::text, 2, '0') || ' ' || trim(new.currency);
  action_label := case when new.transaction_type = 'reversal' then 'was reversed' else 'was recorded' end;

  insert into public.notifications(recipient_id,title,body,category,target_path)
  values (
    new.member_id,
    case when new.transaction_type = 'reversal' then 'Payment reversed' else 'Payment recorded' end,
    'Your ' || amount_label || ' contribution ' || action_label
      || case when event_name is not null then ' for ' || event_name else '' end || '.',
    'finance',
    '/finance'
  );
  return new;
end;
$$;

revoke all on function public.notify_member_of_financial_transaction() from public, anon, authenticated;
create trigger notify_member_of_financial_transaction_after_insert
  after insert on public.financial_transactions
  for each row execute function public.notify_member_of_financial_transaction();
