-- Permanent event deletion for cancelled/completed events without financial
-- history. Events with recorded money must stay — cancel is the only option
-- for those, because the financial ledger is append-only.

create or replace function public.delete_event(p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_title text;
  event_status text;
  finance_count integer;
begin
  if auth.uid() is null or not public.has_club_permission('events.cancel') then
    raise exception 'Not authorized to delete events' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason))<4 or length(p_reason)>500 then
    raise exception 'Add a deletion reason of at least four characters.' using errcode='22023';
  end if;
  select title,status into event_title,event_status
    from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if event_status in ('published','in_progress') then
    raise exception 'Cancel this event first — only cancelled or completed events can be deleted.' using errcode='23514';
  end if;
  select count(*) into finance_count from public.financial_transactions where event_id=p_event_id;
  if finance_count > 0 then
    raise exception 'This event has financial records that must stay in the ledger. Keep it cancelled instead of deleting.' using errcode='23514';
  end if;

  perform set_config('app.change_reason','Event deleted: '||event_title||' — '||trim(p_reason),true);

  -- Detach nullable references (ledger rows keep their context minus the link).
  update public.point_transactions set event_id=null where event_id=p_event_id;
  update public.tasks set event_id=null where event_id=p_event_id;
  update public.inventory_movements set event_id=null where event_id=p_event_id;
  update public.purchase_requests set event_id=null where event_id=p_event_id;

  -- Remove the attendance chain (no financial value without the event).
  delete from public.attendance_correction_history
    where session_id in (select id from public.attendance_sessions where event_id=p_event_id);
  delete from public.attendance_records
    where session_id in (select id from public.attendance_sessions where event_id=p_event_id);
  delete from public.attendance_sessions where event_id=p_event_id;
  delete from public.payment_expectations where event_id=p_event_id;

  -- The audit_sensitive_row trigger records the DELETE automatically.
  delete from public.events where id=p_event_id;

  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
    values(auth.uid(),'delete_event','events',p_event_id::text,array['title','status'],
      trim(p_reason)||' — deleted "'||event_title||'" ('||event_status||')');
end;
$$;

revoke all on function public.delete_event(uuid,text) from public, anon;
grant execute on function public.delete_event(uuid,text) to authenticated;
