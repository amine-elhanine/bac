-- pgTAP suite for the financial ledger guards.
-- Run with the Supabase CLI (requires Docker):  supabase test db
-- Each section wraps its fixtures in begin/rollback so tests stay isolated.
-- auth.users fixtures use the minimum column set; adjust if your local auth
-- schema version requires additional columns.

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
  insert into public.club_terms (id, name, starts_on, ends_on, is_current)
  values (term_id, 'Test term', current_date - 30, current_date + 30, true);
  -- 2222… = Treasurer, 3333… = Member B (attendee), 4444… = Member C (absent)
  perform pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'treasurer@test.local');
  perform pg_temp.make_user('33333333-3333-3333-3333-333333333333', 'member-b@test.local');
  perform pg_temp.make_user('44444444-4444-4444-4444-444444444444', 'member-c@test.local');
  insert into public.member_profiles (id, member_code, full_name, email, status, joined_on, must_change_password) values
    ('22222222-2222-2222-2222-222222222222', 'BAC-T', 'Treasurer Test', 'treasurer@test.local', 'active', current_date, false),
    ('33333333-3333-3333-3333-333333333333', 'BAC-B', 'Member B', 'member-b@test.local', 'active', current_date, false),
    ('44444444-4444-4444-4444-444444444444', 'BAC-C', 'Member C', 'member-c@test.local', 'active', current_date, false);
  insert into public.role_assignments (member_id, term_id, role, starts_at)
    values ('22222222-2222-2222-2222-222222222222', term_id, 'treasurer', now() - interval '1 day');
end;
$$;

select plan(6);
select pg_temp.seed_club();

-- A posted contribution that later tests reverse.
insert into public.financial_transactions (id, transaction_type, amount_minor, direction, currency, description, status, created_by)
values ('55555555-5555-5555-5555-555555555555', 'other_income', 5000, 'in', 'MAD', 'Test income entry', 'posted',
        '22222222-2222-2222-2222-222222222222');

-- 1. A reversal must mirror the original amount exactly.
select throws_ok(
  'insert into public.financial_transactions (transaction_type, amount_minor, direction, currency, description, status, reverses_transaction_id, correction_reason, created_by)
   values (''reversal'', 4000, ''out'', ''MAD'', ''Reversal: Test income entry'', ''posted'',
           ''55555555-5555-5555-5555-555555555555'', ''Amount does not match'', ''22222222-2222-2222-2222-222222222222'')',
  '23514',
  NULL,
  'Reversal with a mismatched amount is rejected'
);

-- 2. An exact mirror reversal is accepted.
select lives_ok(
  'insert into public.financial_transactions (transaction_type, amount_minor, direction, currency, description, status, reverses_transaction_id, correction_reason, created_by)
   values (''reversal'', 5000, ''out'', ''MAD'', ''Reversal: Test income entry'', ''posted'',
           ''55555555-5555-5555-5555-555555555555'', ''Correcting a double entry'', ''22222222-2222-2222-2222-222222222222'')',
  'Exact mirror reversal is accepted'
);

-- 3. A second reversal of the same entry violates the unique partial index.
select throws_ok(
  'insert into public.financial_transactions (transaction_type, amount_minor, direction, currency, description, status, reverses_transaction_id, correction_reason, created_by)
   values (''reversal'', 5000, ''out'', ''MAD'', ''Second reversal'', ''posted'',
           ''55555555-5555-5555-5555-555555555555'', ''Trying to reverse twice'', ''22222222-2222-2222-2222-222222222222'')',
  '23505',
  NULL,
  'Second reversal of the same entry is rejected'
);

-- 4-6. Attendance-gated contribution rules (migrations 027–029).
insert into public.events (id, title, event_type, starts_at, status, expected_contribution_minor, created_by)
values ('66666666-6666-6666-6666-666666666666', 'Test gathering', 'meeting', now() - interval '2 hours', 'completed', 5000,
        '22222222-2222-2222-2222-222222222222');
insert into public.attendance_sessions (id, event_id, opens_at, closes_at, state, created_by)
values ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666',
        now() - interval '2 hours', now() - interval '1 hour', 'finalized',
        '22222222-2222-2222-2222-222222222222');
insert into public.attendance_records (session_id, member_id, status, source, checked_in_at, recorded_by, correction_reason)
values ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'present', 'manual', now() - interval '90 minutes',
        '22222222-2222-2222-2222-222222222222', 'Paper roster verified during test setup');
insert into public.payment_expectations (event_id, member_id, expected_minor, attendance_eligible)
values ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 5000, true);

-- 4. A payment larger than the remaining due is rejected.
select throws_ok(
  'insert into public.financial_transactions (transaction_type, amount_minor, direction, currency, description, status, event_id, member_id, created_by)
   values (''contribution'', 6000, ''in'', ''MAD'', ''Overpayment'', ''posted'',
           ''66666666-6666-6666-6666-666666666666'', ''33333333-3333-3333-3333-333333333333'',
           ''22222222-2222-2222-2222-222222222222'')',
  '23514',
  NULL,
  'Payment above the remaining due is rejected'
);

-- 5. A partial payment within the remaining due is accepted.
select lives_ok(
  'insert into public.financial_transactions (transaction_type, amount_minor, direction, currency, description, status, event_id, member_id, created_by)
   values (''contribution'', 2000, ''in'', ''MAD'', ''Partial payment'', ''posted'',
           ''66666666-6666-6666-6666-666666666666'', ''33333333-3333-3333-3333-333333333333'',
           ''22222222-2222-2222-2222-222222222222'')',
  'Partial payment is accepted'
);

-- 6. A member without recorded attendance cannot pay a fixed event contribution.
select throws_ok(
  'insert into public.financial_transactions (transaction_type, amount_minor, direction, currency, description, status, event_id, member_id, created_by)
   values (''contribution'', 1000, ''in'', ''MAD'', ''Absent member payment'', ''posted'',
           ''66666666-6666-6666-6666-666666666666'', ''44444444-4444-4444-4444-444444444444'',
           ''22222222-2222-2222-2222-222222222222'')',
  '23514',
  NULL,
  'Payment by a non-attendee is rejected'
);

select * from finish();
rollback;
