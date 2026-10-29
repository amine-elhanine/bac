-- Notifications are created by trusted SECURITY DEFINER workflows only.
-- Members may mark their own notices read, but cannot forge or rewrite them.
drop policy if exists "officers create notifications" on public.notifications;
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
