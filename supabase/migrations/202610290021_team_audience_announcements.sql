-- Add team-targeted news with database-enforced readership and notifications.
alter table public.announcements
  drop constraint if exists announcements_audience_check;
alter table public.announcements
  add constraint announcements_audience_check
  check (audience in ('members','officers','specific','team'));

alter table public.announcements
  add column if not exists target_team text,
  add constraint announcements_target_team_check
    check (target_team is null or target_team in ('leadership','communications','treasury','hr','secretariat','logistics')),
  add constraint announcements_team_audience_check
    check ((audience='team')=(target_team is not null));

drop policy if exists "read news by audience" on public.announcements;
create policy "read news by audience" on public.announcements
  for select to authenticated using (
    public.has_club_role(array['president','vice_president'])
    or created_by=auth.uid()
    or (published_at is not null and audience='members')
    or (published_at is not null and audience='officers' and public.has_club_role(array['communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']))
    or (published_at is not null and audience='team' and public.has_club_role(
      case target_team
        when 'leadership' then array['president','vice_president']::text[]
        when 'communications' then array['communications_officer']::text[]
        when 'treasury' then array['treasurer','vice_treasurer']::text[]
        when 'hr' then array['hr','vice_hr']::text[]
        when 'secretariat' then array['general_secretary']::text[]
        when 'logistics' then array['logistics_officer','vice_logistics_officer']::text[]
        else array[]::text[]
      end
    ))
  );

create or replace function public.notify_members_of_published_news()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare should_notify boolean := false;
begin
  if new.published_at is not null and new.audience in ('members','officers','team') then
    if tg_op='INSERT' then should_notify := true;
    elsif old.published_at is null or old.audience is distinct from new.audience or old.target_team is distinct from new.target_team then
      should_notify := true;
    end if;
  end if;

  if should_notify then
    insert into public.notifications(recipient_id,title,body,category,target_path)
    select mp.id,'BAC club update',new.title,'news','/communications'
    from public.member_profiles mp
    where mp.status='active'
      and (
        new.audience='members'
        or exists (
          select 1 from public.role_assignments ra
          join public.club_terms ct on ct.id=ra.term_id and ct.is_current
          where ra.member_id=mp.id
            and ra.starts_at<=now()
            and (ra.ends_at is null or ra.ends_at>now())
            and ra.role=any(case
              when new.audience='officers' then array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer']::text[]
              when new.target_team='leadership' then array['president','vice_president']::text[]
              when new.target_team='communications' then array['communications_officer']::text[]
              when new.target_team='treasury' then array['treasurer','vice_treasurer']::text[]
              when new.target_team='hr' then array['hr','vice_hr']::text[]
              when new.target_team='secretariat' then array['general_secretary']::text[]
              when new.target_team='logistics' then array['logistics_officer','vice_logistics_officer']::text[]
              else array[]::text[]
            end)
        )
      );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_members_of_published_news() from public, anon, authenticated;
