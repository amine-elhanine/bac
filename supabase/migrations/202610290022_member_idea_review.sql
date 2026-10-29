-- Give the General Secretary and club leadership a reasoned, traceable idea
-- review workflow and let the member see the current decision note.
alter table public.member_ideas
  add column review_note text not null default '',
  add column reviewed_at timestamptz;

-- Review updates must go through the audited RPC so direct writes cannot skip
-- the review history or the member notification.
drop policy if exists "leaders review ideas" on public.member_ideas;
revoke update on public.member_ideas from authenticated;

create table public.member_idea_review_history (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.member_ideas(id) on delete cascade,
  previous_status text not null check (previous_status in ('new','reviewing','accepted','declined','implemented')),
  new_status text not null check (new_status in ('reviewing','accepted','declined','implemented')),
  review_note text not null check (length(trim(review_note)) >= 4),
  changed_by uuid not null references public.member_profiles(id),
  created_at timestamptz not null default now()
);
create index member_idea_review_history_idea_created_idx
  on public.member_idea_review_history(idea_id,created_at desc);

alter table public.member_idea_review_history enable row level security;
revoke all on public.member_idea_review_history from public, anon, authenticated;
grant select on public.member_idea_review_history to authenticated;
create policy "submitters and leaders read idea review history"
  on public.member_idea_review_history for select to authenticated using (
    exists (
      select 1 from public.member_ideas idea
      where idea.id=idea_id
        and (idea.submitted_by=auth.uid() or public.has_club_role(array['president','vice_president','general_secretary']))
    )
  );

create or replace function public.review_member_idea(p_idea_id uuid,p_new_status text,p_review_note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idea_row public.member_ideas%rowtype;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','general_secretary']) then
    raise exception 'Not authorized to review member ideas' using errcode='42501';
  end if;
  if p_new_status is null or p_new_status not in ('reviewing','accepted','declined','implemented') then
    raise exception 'Choose a valid idea review status' using errcode='22023';
  end if;
  if p_review_note is null or length(trim(p_review_note))<4 or length(p_review_note)>1000 then
    raise exception 'Add a review note of at least four characters' using errcode='22023';
  end if;

  select * into idea_row from public.member_ideas where id=p_idea_id for update;
  if not found then raise exception 'Idea not found' using errcode='P0002'; end if;
  if not (
    (idea_row.status='new' and p_new_status in ('reviewing','accepted','declined'))
    or (idea_row.status='reviewing' and p_new_status in ('accepted','declined'))
    or (idea_row.status='accepted' and p_new_status='implemented')
  ) then
    raise exception 'This status change is not allowed from the idea’s current state' using errcode='23514';
  end if;

  perform set_config('app.change_reason',trim(p_review_note),true);
  update public.member_ideas
    set status=p_new_status,review_note=trim(p_review_note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=p_idea_id;
  insert into public.member_idea_review_history(idea_id,previous_status,new_status,review_note,changed_by)
    values(p_idea_id,idea_row.status,p_new_status,trim(p_review_note),auth.uid());
  insert into public.notifications(recipient_id,title,body,category,target_path)
    values(idea_row.submitted_by,'An idea you shared was updated',p_new_status || ' · ' || trim(p_review_note),'idea_update','/communications');
  return p_idea_id;
end;
$$;

revoke all on function public.review_member_idea(uuid,text,text) from public, anon;
grant execute on function public.review_member_idea(uuid,text,text) to authenticated;
