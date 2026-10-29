-- Keep inventory stock and its immutable movement ledger in sync.
drop policy if exists "logistics manages inventory" on public.inventory_items;
drop policy if exists "logistics creates inventory as themselves" on public.inventory_items;
create policy "logistics creates zero-stock inventory as themselves"
  on public.inventory_items for insert to authenticated
  with check (public.has_club_role(array['president','vice_president','logistics_officer','vice_logistics_officer']) and created_by=auth.uid() and quantity=0);

drop policy if exists "logistics records inventory movements" on public.inventory_movements;
revoke insert, update, delete on public.inventory_movements from authenticated;
-- Metadata can be edited later without granting direct stock changes.
revoke update on public.inventory_items from authenticated;
grant update (name,category,condition,storage_location,notes,updated_at) on public.inventory_items to authenticated;

create or replace function public.record_inventory_movement(
  p_item_id uuid, p_movement_type text, p_quantity integer,
  p_member_id uuid default null, p_event_id uuid default null, p_reason text default ''
)
returns integer language plpgsql security definer set search_path = public
as $$
declare item_row public.inventory_items%rowtype; signed_delta integer; resulting_quantity integer; outstanding_for_member integer;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','logistics_officer','vice_logistics_officer']) then
    raise exception 'Not authorized to manage inventory' using errcode='42501';
  end if;
  if p_quantity is null or p_quantity=0 or p_movement_type is null or p_movement_type not in ('received','checked_out','returned','adjustment') or length(trim(coalesce(p_reason,'')))<4 then
    raise exception 'A valid movement, non-zero quantity, and reason are required' using errcode='22023';
  end if;
  if p_movement_type <> 'adjustment' and p_quantity < 0 then
    raise exception 'Enter a positive quantity for this movement' using errcode='22023';
  end if;
  if p_movement_type in ('checked_out','returned') and p_member_id is null then
    raise exception 'A member is required for check-out and return' using errcode='22023';
  end if;
  select * into item_row from public.inventory_items where id=p_item_id for update;
  if not found then raise exception 'Inventory item not found' using errcode='P0002'; end if;
  if p_movement_type='returned' then
    select greatest(0,coalesce(-sum(quantity),0))::integer into outstanding_for_member
      from public.inventory_movements where item_id=p_item_id and member_id=p_member_id and movement_type in ('checked_out','returned');
    if p_quantity > outstanding_for_member then raise exception 'Return exceeds this member’s outstanding check-out' using errcode='22023'; end if;
  end if;
  signed_delta := case p_movement_type when 'checked_out' then -abs(p_quantity) when 'adjustment' then p_quantity else abs(p_quantity) end;
  resulting_quantity := item_row.quantity + signed_delta;
  if resulting_quantity < 0 then raise exception 'Movement exceeds available stock' using errcode='22023'; end if;
  insert into public.inventory_movements(item_id,member_id,event_id,quantity,movement_type,reason,created_by)
    values(p_item_id,p_member_id,p_event_id,signed_delta,p_movement_type,trim(p_reason),auth.uid());
  update public.inventory_items set quantity=resulting_quantity,updated_at=now() where id=p_item_id;
  return resulting_quantity;
end; $$;
revoke all on function public.record_inventory_movement(uuid,text,integer,uuid,uuid,text) from public;
grant execute on function public.record_inventory_movement(uuid,text,integer,uuid,uuid,text) to authenticated;
