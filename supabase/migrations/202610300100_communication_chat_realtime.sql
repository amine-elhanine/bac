-- Live chat experience: stream member communication changes to the workspace
-- realtime channel so replies land in the open conversation instantly
-- (row-level security still filters what each subscriber can see).
alter publication supabase_realtime add table public.member_communication_threads;
alter publication supabase_realtime add table public.member_communication_messages;
