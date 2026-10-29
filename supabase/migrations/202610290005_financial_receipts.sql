-- Private receipt files; transaction rows remain the authority for who may read a receipt.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('financial-receipts','financial-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "finance members read linked receipts" on storage.objects;
create policy "finance members read linked receipts" on storage.objects
  for select to authenticated using (
    bucket_id='financial-receipts'
    and exists (
      select 1 from public.financial_transactions ft
      where ft.receipt_path=name
        and (ft.member_id=auth.uid() or public.has_club_role(array['president','vice_president','treasurer','vice_treasurer']))
    )
  );

drop policy if exists "treasury uploads own receipt files" on storage.objects;
create policy "treasury uploads own receipt files" on storage.objects
  for insert to authenticated with check (
    bucket_id='financial-receipts'
    and (storage.foldername(name))[1]=auth.uid()::text
    and public.has_club_role(array['president','treasurer','vice_treasurer'])
  );

drop policy if exists "remove unlinked receipt upload" on storage.objects;
create policy "remove unlinked receipt upload" on storage.objects
  for delete to authenticated using (
    bucket_id='financial-receipts'
    and (storage.foldername(name))[1]=auth.uid()::text
    and public.has_club_role(array['president','treasurer','vice_treasurer'])
    and not exists (select 1 from public.financial_transactions ft where ft.receipt_path=name)
  );
