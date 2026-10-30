-- Conversations between a member and a board member are strictly private:
-- only the member who opened them and the current holder of the targeted
-- board role can read, reply to, or close them. Leadership oversight
-- (President/Vice President seeing every thread) is removed.

-- ─── RLS: only the thread's member and the targeted role holder ───────────
drop policy if exists "thread parties, target role holders, and leadership read threads"
  on public.member_communication_threads;
drop policy if exists "thread member and target role holders read threads"
  on public.member_communication_threads;
create policy "thread member and target role holders read threads"
  on public.member_communication_threads for select to authenticated using (
    member_id = auth.uid()
    or (target_role is not null and public.has_club_role(array[target_role]))
  );

drop policy if exists "thread party messages follow thread visibility"
  on public.member_communication_messages;
create policy "thread party messages follow thread visibility"
  on public.member_communication_messages for select to authenticated using (
    exists (
      select 1 from public.member_communication_threads t
      where t.id = thread_id
        and (
          t.member_id = auth.uid()
          or (t.target_role is not null and public.has_club_role(array[t.target_role]))
        )
    )
  );

-- ─── Replies: only the member and the targeted role holder ────────────────
create or replace function public.send_member_communication_message(p_thread_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thread_row public.member_communication_threads%rowtype;
  actor_is_member boolean;
  actor_is_board boolean;
  new_message_id uuid;
begin
  if auth.uid() is null or p_body is null or length(trim(p_body))<1 or length(p_body)>4000 then
    raise exception 'Enter a message of up to 4,000 characters.' using errcode='22023';
  end if;
  select * into thread_row from public.member_communication_threads where id=p_thread_id for update;
  if not found then raise exception 'Conversation not found.' using errcode='P0002'; end if;

  actor_is_member := thread_row.member_id = auth.uid();
  actor_is_board := thread_row.target_role is not null
    and public.has_club_role(array[thread_row.target_role]);
  if not actor_is_member and not actor_is_board then
    raise exception 'Not authorized to reply to this conversation.' using errcode='42501';
  end if;
  if thread_row.status='closed' then raise exception 'This conversation is closed.' using errcode='23514'; end if;

  if actor_is_member then
    perform set_config('app.change_reason','Member replied',true);
    insert into public.member_communication_messages(thread_id,sender_id,sender_side,body)
      values(p_thread_id,auth.uid(),'member',trim(p_body)) returning id into new_message_id;
    update public.member_communication_threads set status='open',updated_at=now() where id=p_thread_id;
    -- Notify the current holder(s) of the targeted role.
    insert into public.notifications(recipient_id,title,body,category,target_path)
    select ra.member_id,'New message in: '||thread_row.subject,left(trim(p_body),160),'general','/communications'
    from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    join public.member_profiles mp on mp.id=ra.member_id and mp.status='active'
    where thread_row.target_role is not null
      and ra.role = thread_row.target_role
      and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
      and ra.member_id<>auth.uid();
  else
    perform set_config('app.change_reason','Board replied',true);
    insert into public.member_communication_messages(thread_id,sender_id,sender_side,body)
      values(p_thread_id,auth.uid(),'club_team',trim(p_body)) returning id into new_message_id;
    update public.member_communication_threads set status='awaiting_member',updated_at=now() where id=p_thread_id;
    if not actor_is_member then
      insert into public.notifications(recipient_id,title,body,category,target_path)
      values(thread_row.member_id,'New message: '||thread_row.subject,left(trim(p_body),160),'general','/communications');
    end if;
  end if;
  return new_message_id;
end;
$$;

revoke all on function public.send_member_communication_message(uuid,text) from public,anon;
grant execute on function public.send_member_communication_message(uuid,text) to authenticated;

-- ─── Close: only the targeted role holder ──────────────────────────────────
create or replace function public.close_member_communication(p_thread_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare thread_row public.member_communication_threads%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into thread_row from public.member_communication_threads where id=p_thread_id for update;
  if not found then raise exception 'Conversation not found.' using errcode='P0002'; end if;
  if not (
    thread_row.target_role is not null
    and public.has_club_role(array[thread_row.target_role])
  ) then
    raise exception 'Only the board member of this conversation can close it.' using errcode='42501';
  end if;
  if thread_row.status='closed' then raise exception 'This conversation is already closed.' using errcode='23514'; end if;
  if p_reason is null or length(trim(p_reason))<4 or length(p_reason)>500 then
    raise exception 'Add a closure note of at least four characters.' using errcode='22023';
  end if;
  perform set_config('app.change_reason',trim(p_reason),true);
  update public.member_communication_threads
    set status='closed',closure_note=trim(p_reason),closed_by=auth.uid(),closed_at=now(),updated_at=now()
    where id=p_thread_id;
  insert into public.notifications(recipient_id,title,body,category,target_path)
    values(thread_row.member_id,'Your conversation was closed',thread_row.subject || ' · ' || trim(p_reason),'general','/communications');
  return p_thread_id;
end;
$$;

revoke all on function public.close_member_communication(uuid,text) from public,anon;
grant execute on function public.close_member_communication(uuid,text) to authenticated;
