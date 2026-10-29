-- Supabase Realtime push for the live workspace. The client subscribes to
-- postgres_changes on these tables (RLS still applies to each subscriber, so
-- members only receive their own notifications and permitted rows). The 60s
-- polling in the client remains as a fallback for browsers where realtime is
-- unavailable.
do $$
declare target_table text;
begin
  foreach target_table in array array[
    'notifications','events','tasks','task_assignments','announcements'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    exception
      when duplicate_object then null; -- already a member of the publication
      when undefined_object then null; -- publication missing outside Supabase
    end;
  end loop;
end $$;
