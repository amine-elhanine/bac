-- pgTAP suite for atomic QR check-in, notification write locking, and the
-- audited term handover. Run with the Supabase CLI (requires Docker):
--   supabase test db
-- Each section wraps its fixtures in begin/rollback so tests stay isolated.

begin;
create or replace function pg_temp.make_user(p_id uuid, p_email text) returns void
language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, '', now(), now(), now());
$$;

create or replace function pg_temp.seed_club() returns void
language plpgsql as $$
declare
  term_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  update public.club_terms set is_current = false;
  insert into public.club_terms (id, name, starts_on, ends_on, is_current)
  values (term_id, 'Test term', current_date - 30, current_date + 30, true);
  -- 2222… President/HR, 3333… active member, 4444… suspended member
  perform pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'hr@test.local');
  perform pg_temp.make_user('33333333-3333-3333-3333-333333333333', 'member-b@test.local');
  perform pg_temp.make_user('44444444-4444-4444-4444-444444444444', 'member-c@test.local');
  insert into public.member_profiles (id, member_code, full_name, email, status, joined_on, must_change_password) values
    ('22222222-2222-2222-2222-222222222222', 'BAC-HR', 'HR Test', 'hr@test.local', 'active', current_date, false),
    ('33333333-3333-3333-3333-333333333333', 'BAC-B', 'Member B', 'member-b@test.local', 'active', current_date, false),
    ('44444444-4444-4444-4444-444444444444', 'BAC-C', 'Member C', 'member-c@test.local', 'suspended', current_date, false);
  insert into public.role_assignments (member_id, term_id, role, starts_at)
    values ('22222222-2222-2222-2222-222222222222', term_id, 'president', now() - interval '1 day');
end;
$$;

create or replace function pg_temp.seed_open_session() returns void
language plpgsql as $$
begin
  insert into public.events (id, title, event_type, starts_at, ends_at, status, created_by)
  values ('66666666-6666-6666-6666-666666666666', 'Test gathering', 'meeting', now() - interval '30 minutes', now() + interval '2 hours', 'in_progress',
          '22222222-2222-2222-2222-222222222222');
  insert into public.attendance_sessions (id, event_id, opens_at, closes_at, state, created_by)
  values ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666',
          now() - interval '20 minutes', now() + interval '90 minutes', 'open',
          '22222222-2222-2222-2222-222222222222');
end;
$$;

create or replace function pg_temp.insert_qr_token(p_hash text, p_expires timestamptz) returns void
language sql as $$
  insert into public.attendance_qr_tokens (session_id, token_hash, expires_at, issued_by)
  values ('77777777-7777-7777-7777-777777777777', p_hash, p_expires, '22222222-2222-2222-2222-222222222222');
$$;

select plan(10);
select pg_temp.seed_club();

-- ─── Atomic check-in (migration 202610290032) ──────────────────────────────
set local role service_role;
select pg_temp.seed_open_session();

-- 1. An expired token is invalid.
select pg_temp.insert_qr_token(encode(sha256('expired-token'::bytea), 'hex'), now() - interval '5 seconds');
select is(
  (public.record_attendance_check_in(encode(sha256('expired-token'::bytea), 'hex'), '33333333-3333-3333-3333-333333333333')->>'error'),
  'invalid_token',
  'Expired token is rejected as invalid'
);

-- 2. A live token checks the member in.
select pg_temp.insert_qr_token(encode(sha256('live-token'::bytea), 'hex'), now() + interval '30 seconds');
select is(
  (public.record_attendance_check_in(encode(sha256('live-token'::bytea), 'hex'), '33333333-3333-3333-3333-333333333333')->>'status'),
  'checked_in',
  'Live token records a check-in'
);

-- 3. Replaying the same token returns already_checked_in, not a duplicate row.
select is(
  (public.record_attendance_check_in(encode(sha256('live-token'::bytea), 'hex'), '33333333-3333-3333-3333-333333333333')->>'status'),
  'already_checked_in',
  'Replayed token returns already_checked_in'
);
select is(
  (select count(*) from public.attendance_records where session_id = '77777777-7777-7777-7777-777777777777'),
  1::bigint,
  'Exactly one attendance record exists after replay'
);

-- 4. A suspended member cannot check in.
select is(
  (public.record_attendance_check_in(encode(sha256('live-token'::bytea), 'hex'), '44444444-4444-4444-4444-444444444444')->>'error'),
  'inactive_member',
  'Suspended member is rejected as inactive'
);

-- ─── Notification write lock (migration 202610290031) ──────────────────────
reset role;
insert into public.notifications (id, recipient_id, title, body, category)
values ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', 'Test notice', 'Body', 'general');

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

-- 5. Members cannot forge notifications.
select throws_ok(
  'insert into public.notifications (recipient_id, title, body, category) values (''33333333-3333-3333-3333-333333333333'', ''Forged'', ''No'', ''general'')',
  '42501',
  NULL,
  'Direct notification insert by a member is denied'
);

-- 6. Members may mark their own notice read.
select lives_ok(
  'update public.notifications set read_at = now() where id = ''88888888-8888-8888-8888-888888888888''',
  'Member can mark own notification read'
);

-- 7. Members cannot rewrite notice content (column-level grant).
select throws_ok(
  'update public.notifications set title = ''Rewritten'' where id = ''88888888-8888-8888-8888-888888888888''',
  '42501',
  NULL,
  'Member cannot rewrite notification content'
);

-- ─── Term handover validation (migration 202610290034) ─────────────────────
reset role;

-- 8. A term cannot start in the future.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $sql$select public.start_club_term('Future term', current_date + 1, current_date + 366,
    '[{"role":"president","member_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'Starting early')$sql$,
  '22023',
  NULL,
  'Future-dated term start is rejected'
);

-- 9. A non-President cannot start a term.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok(
  $sql$select public.start_club_term('Usurped term', current_date, current_date + 365,
    '[{"role":"president","member_id":"33333333-3333-3333-3333-333333333333"}]'::jsonb, 'Not president')$sql$,
  '42501',
  NULL,
  'Non-President cannot start a term'
);

select * from finish();
rollback;
