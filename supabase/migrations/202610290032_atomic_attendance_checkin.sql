-- Validate event/session state and record check-in in one transaction.
-- Lock the event before the session, matching the cancellation workflow's order.
create or replace function public.record_attendance_check_in(
  p_token_hash text,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  checked_at timestamptz := clock_timestamp();
  target_token_id uuid;
  target_session_id uuid;
  target_event_id uuid;
  event_status text;
  event_ends_at timestamptz;
  session_state text;
  session_opens_at timestamptz;
  session_closes_at timestamptz;
  member_status text;
  member_must_change_password boolean;
  existing public.attendance_records%rowtype;
  created public.attendance_records%rowtype;
begin
  select id,session_id into target_token_id,target_session_id
  from public.attendance_qr_tokens
  where token_hash=p_token_hash and expires_at>checked_at;
  if not found then return jsonb_build_object('error','invalid_token'); end if;

  select event_id into target_event_id
  from public.attendance_sessions where id=target_session_id;
  if not found then return jsonb_build_object('error','closed_session'); end if;

  select status,ends_at into event_status,event_ends_at
  from public.events where id=target_event_id for share;
  if not found then return jsonb_build_object('error','event_closed'); end if;

  select state,opens_at,closes_at into session_state,session_opens_at,session_closes_at
  from public.attendance_sessions where id=target_session_id for share;
  if not found then return jsonb_build_object('error','closed_session'); end if;

  select status,must_change_password into member_status,member_must_change_password
  from public.member_profiles where id=p_member_id for share;
  if not found or member_status<>'active' or member_must_change_password then
    return jsonb_build_object('error','inactive_member');
  end if;

  -- Recheck wall-clock constraints after all row locks may have waited.
  checked_at := clock_timestamp();
  if not exists (
    select 1 from public.attendance_qr_tokens
    where id=target_token_id and expires_at>checked_at
  ) then
    return jsonb_build_object('error','invalid_token');
  end if;
  if event_status not in ('published','in_progress')
     or (event_ends_at is not null and event_ends_at<=checked_at) then
    return jsonb_build_object('error','event_closed');
  end if;
  if session_state<>'open' or session_opens_at>checked_at or session_closes_at<=checked_at then
    return jsonb_build_object('error','closed_session');
  end if;

  select * into existing from public.attendance_records
  where session_id=target_session_id and member_id=p_member_id;
  if found then
    return jsonb_build_object(
      'status','already_checked_in',
      'attendance',jsonb_build_object('id',existing.id,'status',existing.status,'checked_in_at',existing.checked_in_at),
      'event_id',target_event_id
    );
  end if;

  begin
    insert into public.attendance_records(session_id,member_id,status,source,checked_in_at,recorded_by)
    values(target_session_id,p_member_id,'present','qr',checked_at,p_member_id)
    returning * into created;
  exception when unique_violation then
    select * into existing from public.attendance_records
    where session_id=target_session_id and member_id=p_member_id;
    if found then
      return jsonb_build_object(
        'status','already_checked_in',
        'attendance',jsonb_build_object('id',existing.id,'status',existing.status,'checked_in_at',existing.checked_in_at),
        'event_id',target_event_id
      );
    end if;
    raise;
  end;

  return jsonb_build_object(
    'status','checked_in',
    'attendance',jsonb_build_object('id',created.id,'status',created.status,'checked_in_at',created.checked_in_at),
    'event_id',target_event_id
  );
end;
$$;

revoke all on function public.record_attendance_check_in(text,uuid) from public, anon, authenticated;
grant execute on function public.record_attendance_check_in(text,uuid) to service_role;
