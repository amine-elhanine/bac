-- Allow Treasury to discover only its own abandoned uploads for cleanup.
-- Keep the bucket private and require an age buffer to avoid racing uploads.
drop policy if exists "treasury lists aged unlinked receipt uploads" on storage.objects;
create policy "treasury lists aged unlinked receipt uploads" on storage.objects
  for select to authenticated using (
    bucket_id='financial-receipts'
    and (storage.foldername(name))[1]=auth.uid()::text
    and public.has_club_role(array['president','treasurer','vice_treasurer'])
    and created_at < now() - interval '24 hours'
    and not exists (select 1 from public.financial_transactions ft where ft.receipt_path=name)
  );

drop policy if exists "remove unlinked receipt upload" on storage.objects;
create policy "remove aged unlinked receipt upload" on storage.objects
  for delete to authenticated using (
    bucket_id='financial-receipts'
    and (storage.foldername(name))[1]=auth.uid()::text
    and public.has_club_role(array['president','treasurer','vice_treasurer'])
    and created_at < now() - interval '24 hours'
    and not exists (select 1 from public.financial_transactions ft where ft.receipt_path=name)
  );

create or replace function public.list_orphan_receipt_uploads()
returns table(path text, uploaded_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_club_role(array['president','treasurer','vice_treasurer']) then
    raise exception 'Not authorized to list receipt uploads';
  end if;
  return query
  select o.name,o.created_at
  from storage.objects o
  where o.bucket_id='financial-receipts'
    and (storage.foldername(o.name))[1]=auth.uid()::text
    and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.financial_transactions ft where ft.receipt_path=o.name)
  order by o.created_at asc
  limit 50;
end;
$$;

revoke all on function public.list_orphan_receipt_uploads() from public, anon;
grant execute on function public.list_orphan_receipt_uploads() to authenticated;

create or replace function public.audit_orphan_receipt_cleanup(p_paths text[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.has_club_role(array['president','treasurer','vice_treasurer']) then
    raise exception 'Not authorized to clean up receipt uploads';
  end if;
  if p_paths is null or cardinality(p_paths) < 1 or cardinality(p_paths) > 50 then
    raise exception 'Select between 1 and 50 receipt uploads';
  end if;
  if exists (
    select 1 from unnest(p_paths) p(path)
    where p.path is null or p.path !~ ('^' || auth.uid()::text || '/[^/]+/[^/]+\.(pdf|jpg|png|webp)$')
  ) then raise exception 'Invalid receipt path'; end if;
  if exists (
    select 1 from unnest(p_paths) p(path)
    join public.financial_transactions ft on ft.receipt_path=p.path
  ) then raise exception 'A selected receipt is now linked to a transaction'; end if;
  if exists (
    select 1 from unnest(p_paths) p(path)
    join storage.objects o on o.bucket_id='financial-receipts' and o.name=p.path
    where o.created_at >= now() - interval '24 hours'
  ) then raise exception 'Receipt uploads must be at least 24 hours old'; end if;
  if exists (
    select 1 from unnest(p_paths) p(path)
    left join storage.objects o on o.bucket_id='financial-receipts' and o.name=p.path
    where o.id is null
  ) then raise exception 'A selected receipt no longer exists'; end if;

  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason)
  select auth.uid(),'cleanup_authorized','storage:financial-receipts',p.path,array['orphan_upload'], 'Treasury cleanup authorized for unlinked upload older than 24 hours'
  from unnest(p_paths) p(path);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.audit_orphan_receipt_cleanup(text[]) from public, anon;
grant execute on function public.audit_orphan_receipt_cleanup(text[]) to authenticated;
