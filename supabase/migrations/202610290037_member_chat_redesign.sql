-- Communication redesign: conversations are directed to a board ROLE
-- (the current holder receives and answers them), all board members can
-- open conversations with members, and club replies no longer wait for the
-- member to answer first — a chat, not a letter.

alter table public.member_communication_threads
  add column if not exists target_role text;
alter table public.member_communication_threads
  drop constraint if exists member_communication_threads_target_role_check;
alter table public.member_communication_threads
  add constraint member_communication_threads_target_role_check
    check (target_role is null or target_role in (
      'president','vice_president','communications_officer','treasurer','vice_treasurer',
      'hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer'
    ));

-- Legacy threads were directed to the Communications team.
update public.member_communication_threads
  set target_role = 'communications_officer'
  where target_role is null;

-- Visibility: the member, the current holder of the targeted role, and the
-- President/Vice President (board oversight).
drop policy if exists "members and communications officers read communication threads"
  on public.member_communication_threads;
drop policy if exists "thread parties, target role holders, and leadership read threads" on public.member_communication_threads;
create policy "thread parties, target role holders, and leadership read threads"
  on public.member_communication_threads for select to authenticated using (
    member_id = auth.uid()
    or public.has_club_role(array['president','vice_president'])
    or (target_role is not null and public.has_club_role(array[target_role]))
  );
drop policy if exists "thread participants read communication messages"
  on public.member_communication_messages;
drop policy if exists "thread party messages follow thread visibility" on public.member_communication_messages;
create policy "thread party messages follow thread visibility"
  on public.member_communication_messages for select to authenticated using (
    exists (
      select 1 from public.member_communication_threads t
      where t.id = thread_id
        and (
          t.member_id = auth.uid()
          or public.has_club_role(array['president','vice_president'])
          or (t.target_role is not null and public.has_club_role(array[t.target_role]))
        )
    )
  );

-- ─── Start: members target a board role; board members target a member ─────
drop function if exists public.start_member_communication(text,text,uuid);
create or replace function public.start_member_communication(
  p_subject text,
  p_body text,
  p_target_role text default null,
  p_member_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thread_id uuid;
  actor_officer_roles text[];
  target_member uuid;
  target_role text;
  first_sender_side text;
begin
  if auth.uid() is null or not exists(select 1 from public.member_profiles where id=auth.uid() and status='active') then
    raise exception 'An active member account is required.' using errcode='42501';
  end if;
  if p_subject is null or length(trim(p_subject))<2 or length(p_subject)>140
     or p_body is null or length(trim(p_body))<1 or length(p_body)>4000 then
    raise exception 'Enter a subject and a message of up to 4,000 characters.' using errcode='22023';
  end if;

  select coalesce(array_agg(ra.role), array[]::text[]) into actor_officer_roles
    from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    where ra.member_id=auth.uid() and ra.role<>'member'
      and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now());

  if p_member_id is not null then
    -- A board member opens a conversation with a member.
    if cardinality(actor_officer_roles)=0 then
      raise exception 'Only board members can start a conversation with a member.' using errcode='42501';
    end if;
    if p_member_id=auth.uid() then
      raise exception 'Choose a member other than yourself.' using errcode='22023';
    end if;
    select mp.id into target_member from public.member_profiles mp
      where mp.id=p_member_id and mp.status='active';
    if not found then
      raise exception 'Choose an active member.' using errcode='22023';
    end if;
    target_role := actor_officer_roles[1];
    first_sender_side := 'club_team';
  else
    -- A member opens a conversation with the board role they choose.
    if p_target_role is null or p_target_role not in (
      'president','vice_president','communications_officer','treasurer','vice_treasurer',
      'hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer'
    ) then
      raise exception 'Choose the board member you want to talk to.' using errcode='22023';
    end if;
    target_member := auth.uid();
    target_role := p_target_role;
    first_sender_side := 'member';
  end if;

  perform set_config('app.change_reason','Conversation started: '||target_role,true);
  insert into public.member_communication_threads(member_id,subject,target_role)
    values(target_member,trim(p_subject),target_role) returning id into thread_id;
  insert into public.member_communication_messages(thread_id,sender_id,sender_side,body)
    values(thread_id,auth.uid(),first_sender_side,trim(p_body));
  update public.member_communication_threads
    set status = case when first_sender_side='club_team' then 'awaiting_member' else 'open' end
    where id=thread_id;

  if first_sender_side='member' then
    -- Notify the current holder(s) of the targeted role.
    insert into public.notifications(recipient_id,title,body,category,target_path)
    select ra.member_id,'New member message for you',trim(p_subject),'general','/communications'
    from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    join public.member_profiles mp on mp.id=ra.member_id and mp.status='active'
    where ra.role = target_role
      and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now());
  else
    -- Notify the member.
    insert into public.notifications(recipient_id,title,body,category,target_path)
    values(target_member,'A message from the BAC team',trim(p_subject),'general','/communications');
  end if;
  return thread_id;
end;
$$;

revoke all on function public.start_member_communication(text,text,text,uuid) from public,anon;
drop function if exists public.start_member_communication(text,text);
drop function if exists public.start_member_communication(text,text,uuid);
grant execute on function public.start_member_communication(text,text,text,uuid) to authenticated;

-- ─── Replies: chat cadence — either side can write in an open thread ───────
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
  if not actor_is_member and not actor_is_board
     and not public.has_club_role(array['president','vice_president']) then
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

-- ─── Close: the targeted role holder, Communications, or leadership ────────
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
    public.has_club_role(array['president','vice_president','communications_officer'])
    or (thread_row.target_role is not null and public.has_club_role(array[thread_row.target_role]))
  ) then
    raise exception 'Only the board side can close conversations.' using errcode='42501';
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
