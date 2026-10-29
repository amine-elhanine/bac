-- Enforce income/expense direction and exact, one-step financial reversals at the database boundary.
alter table public.financial_transactions
  add constraint financial_transaction_direction_matches_type check (
    (transaction_type not in ('contribution','other_income') or direction='in')
    and (transaction_type not in ('purchase','other_expense') or direction='out')
  ),
  add constraint financial_reversals_are_posted check (
    transaction_type<>'reversal' or status='posted'
  );

create or replace function public.validate_financial_transaction()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare original public.financial_transactions%rowtype;
begin
  if new.transaction_type<>'reversal' then return new; end if;

  select * into original
    from public.financial_transactions
    where id=new.reverses_transaction_id;
  if not found then
    raise exception 'The transaction being reversed does not exist.' using errcode='23503';
  end if;
  if original.transaction_type='reversal' or original.status<>'posted' then
    raise exception 'Only a posted, original transaction can be reversed.' using errcode='23514';
  end if;
  if new.amount_minor is distinct from original.amount_minor
     or new.direction is distinct from (case when original.direction='in' then 'out' else 'in' end)
     or new.currency is distinct from original.currency
     or new.event_id is distinct from original.event_id
     or new.member_id is distinct from original.member_id then
    raise exception 'A reversal must exactly mirror the original amount, direction, currency, event, and member.'
      using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function public.validate_financial_transaction() from public;
create trigger validate_financial_transaction_before_insert
  before insert on public.financial_transactions
  for each row execute function public.validate_financial_transaction();
