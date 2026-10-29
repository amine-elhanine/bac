-- Keep the point ledger categories aligned with the supported product actions.
alter table public.point_transactions
  add constraint point_transactions_category_check
  check (category in ('attendance','event_participation','task_completion','volunteering','correction','other'));

-- Point history and its member notification are one database transaction.
-- The existing notification-preference trigger still honors point mutes.
create or replace function public.notify_member_of_point_transaction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications(recipient_id,title,body,category,target_path)
  values(
    new.member_id,
    case when new.points_delta > 0 then 'BAC points awarded' else 'BAC points updated' end,
    (case when new.points_delta > 0 then '+' else '' end) || new.points_delta::text || ' points · ' || new.reason,
    'points',
    '/points'
  );
  return new;
end;
$$;

revoke all on function public.notify_member_of_point_transaction() from public, anon, authenticated;
create trigger notify_point_transaction_after_insert
  after insert on public.point_transactions
  for each row execute function public.notify_member_of_point_transaction();
