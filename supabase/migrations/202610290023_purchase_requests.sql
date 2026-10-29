-- Route equipment/material needs from Logistics to Treasury while keeping
-- purchases in the immutable financial ledger.
create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  item_description text not null check (length(trim(item_description)) between 2 and 160),
  category text not null check (length(trim(category)) between 2 and 80),
  quantity integer not null check (quantity > 0),
  estimated_amount_minor bigint check (estimated_amount_minor is null or estimated_amount_minor >= 0),
  reason text not null check (length(trim(reason)) between 4 and 1000),
  event_id uuid references public.events(id),
  requested_by uuid not null references public.member_profiles(id),
  status text not null default 'submitted' check (status in ('submitted','approved','declined','paid')),
  decision_note text,
  reviewed_by uuid references public.member_profiles(id),
  reviewed_at timestamptz,
  paid_transaction_id uuid unique references public.financial_transactions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='paid')=(paid_transaction_id is not null)),
  check ((status in ('approved','declined','paid'))=(reviewed_by is not null and reviewed_at is not null and nullif(trim(decision_note),'') is not null))
);
create index purchase_requests_status_created_idx on public.purchase_requests(status,created_at desc);
create index purchase_requests_requester_created_idx on public.purchase_requests(requested_by,created_at desc);

alter table public.financial_transactions
  add column purchase_request_id uuid unique references public.purchase_requests(id);

alter table public.purchase_requests enable row level security;
revoke all on public.purchase_requests from public, anon, authenticated;
grant select on public.purchase_requests to authenticated;
create policy "requesters and responsible officers read purchases"
  on public.purchase_requests for select to authenticated using (
    requested_by=auth.uid()
    or public.has_club_role(array['president','vice_president','treasurer','vice_treasurer','logistics_officer','vice_logistics_officer'])
  );

create trigger audit_purchase_requests
  after insert or update or delete on public.purchase_requests
  for each row execute function public.audit_sensitive_row();

create or replace function public.submit_purchase_request(
  p_item_description text,p_category text,p_quantity integer,
  p_estimated_amount_minor bigint,p_reason text,p_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare request_id uuid;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','logistics_officer','vice_logistics_officer']) then
    raise exception 'Not authorized to request club purchases' using errcode='42501';
  end if;
  if p_item_description is null or length(trim(p_item_description))<2 or length(p_item_description)>160
     or p_category is null or length(trim(p_category))<2 or length(p_category)>80
     or p_quantity is null or p_quantity<1
     or (p_estimated_amount_minor is not null and p_estimated_amount_minor<0)
     or p_reason is null or length(trim(p_reason))<4 or length(p_reason)>1000 then
    raise exception 'Purchase request details are invalid' using errcode='22023';
  end if;
  if p_event_id is not null and not exists(select 1 from public.events where id=p_event_id) then
    raise exception 'The selected event does not exist' using errcode='P0002';
  end if;
  perform set_config('app.change_reason','Purchase request submitted: ' || trim(p_reason),true);
  insert into public.purchase_requests(item_description,category,quantity,estimated_amount_minor,reason,event_id,requested_by)
    values(trim(p_item_description),trim(p_category),p_quantity,p_estimated_amount_minor,trim(p_reason),p_event_id,auth.uid())
    returning id into request_id;
  insert into public.notifications(recipient_id,title,body,category,target_path)
  select recipients.member_id,'New purchase request',trim(p_item_description) || ' · ' || p_quantity::text || ' item(s)','general','/finance'
  from (
    select distinct ra.member_id from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    join public.member_profiles mp on mp.id=ra.member_id and mp.status='active'
    where ra.role=any(array['president','vice_president','treasurer','vice_treasurer']::text[])
      and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
      and ra.member_id<>auth.uid()
  ) recipients;
  return request_id;
end;
$$;

create or replace function public.decide_purchase_request(p_request_id uuid,p_decision text,p_note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare request_row public.purchase_requests%rowtype;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','treasurer','vice_treasurer']) then
    raise exception 'Not authorized to decide purchase requests' using errcode='42501';
  end if;
  if p_decision not in ('approved','declined') or p_note is null or length(trim(p_note))<4 or length(p_note)>1000 then
    raise exception 'Choose approval or decline and provide a reason of at least four characters' using errcode='22023';
  end if;
  select * into request_row from public.purchase_requests where id=p_request_id for update;
  if not found then raise exception 'Purchase request not found' using errcode='P0002'; end if;
  if request_row.status<>'submitted' then raise exception 'Only submitted requests can be approved or declined' using errcode='23514'; end if;

  perform set_config('app.change_reason',trim(p_note),true);
  update public.purchase_requests set status=p_decision,decision_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=p_request_id;
  insert into public.notifications(recipient_id,title,body,category,target_path)
    values(request_row.requested_by,'Purchase request ' || p_decision,request_row.item_description || ' · ' || trim(p_note),'general','/logistics');
  return p_request_id;
end;
$$;

create or replace function public.validate_purchase_request_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare request_status text;
begin
  if new.purchase_request_id is null then return new; end if;
  if auth.uid() is null or not public.has_club_role(array['president','treasurer','vice_treasurer']) then
    raise exception 'Only Treasury can pay an approved purchase request' using errcode='42501';
  end if;
  if new.transaction_type<>'purchase' or new.direction<>'out' or new.status<>'posted' then
    raise exception 'A purchase request must be paid with a posted outgoing purchase transaction' using errcode='23514';
  end if;
  select status into request_status from public.purchase_requests where id=new.purchase_request_id for update;
  if not found or request_status<>'approved' then
    raise exception 'Only an approved purchase request can be paid' using errcode='23514';
  end if;
  perform set_config('app.change_reason','Approved purchase request paid through the financial ledger',true);
  return new;
end;
$$;

create or replace function public.mark_purchase_request_paid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare request_owner uuid; request_description text;
begin
  if new.purchase_request_id is null then return new; end if;
  update public.purchase_requests
    set status='paid',paid_transaction_id=new.id,updated_at=now()
    where id=new.purchase_request_id and status='approved'
    returning requested_by,item_description into request_owner,request_description;
  if request_owner is null then raise exception 'Purchase request could not be marked paid' using errcode='23514'; end if;
  insert into public.notifications(recipient_id,title,body,category,target_path)
    values(request_owner,'Purchase request paid',request_description || ' · ' || (new.amount_minor::numeric/100)::text || ' MAD','general','/logistics');
  return new;
end;
$$;

revoke all on function public.submit_purchase_request(text,text,integer,bigint,text,uuid) from public, anon;
revoke all on function public.decide_purchase_request(uuid,text,text) from public, anon;
revoke all on function public.validate_purchase_request_payment() from public, anon, authenticated;
revoke all on function public.mark_purchase_request_paid() from public, anon, authenticated;
grant execute on function public.submit_purchase_request(text,text,integer,bigint,text,uuid) to authenticated;
grant execute on function public.decide_purchase_request(uuid,text,text) to authenticated;

create trigger validate_purchase_request_payment_before_insert
  before insert on public.financial_transactions
  for each row execute function public.validate_purchase_request_payment();
create trigger mark_purchase_request_paid_after_insert
  after insert on public.financial_transactions
  for each row execute function public.mark_purchase_request_paid();
