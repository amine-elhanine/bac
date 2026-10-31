#!/usr/bin/env bash
# Authorization matrix v2: asserts on actual effects (rows written / rows
# visible), not exit codes. Each scenario runs in its own rolled-back tx.
DB="docker exec -i supabase_db_bac-club-platform psql -U postgres postgres -qAt -v ON_ERROR_STOP=1"
OUT=/tmp/matrix_results.txt
: > "$OUT"

PRES='d1d1d1d1-0000-0000-0000-000000000001'
MEM1='d1d1d1d1-0000-0000-0000-000000000002'
VP='d1d1d1d1-0000-0000-0000-000000000003'
COMMS='d1d1d1d1-0000-0000-0000-000000000004'
TREAS='d1d1d1d1-0000-0000-0000-000000000005'
HR='d1d1d1d1-0000-0000-0000-000000000007'
SEC='d1d1d1d1-0000-0000-0000-000000000009'
LOG='d1d1d1d1-0000-0000-0000-000000000010'
MEM2='d1d1d1d1-0000-0000-0000-000000000012'

# scn <actor> <name> <expected: OK|DENIED> <probe-body>
# Probe body is plpgsql statements; it must return 'WROTE:<n>' or 'SEEN:<n>'
# when allowed, or raise exception 'DENIED' when row-level security blocks it.
scn() {
  local actor="$1" name="$2" expected="$3" body="$4" out verdict
  out=$(echo "create or replace function pg_temp.probe() returns text language plpgsql as \$f\$
declare n int;
begin
  $body
  return 'UNCAUGHT';
exception when insufficient_privilege or insufficient_resources or check_violation or not_null_violation or foreign_key_violation or unique_violation or others then
  return 'DENIED';
end \$f\$;
begin; set local role authenticated; set local request.jwt.claims='{\"sub\":\"$actor\",\"role\":\"authenticated\"}'; select pg_temp.probe(); rollback;" | $DB 2>&1 | tail -1)
  if [ "$expected" = OK ]; then
    case "$out" in WROTE:*|SEEN:*) verdict=PASS;; *) verdict="FAIL(got: $out)";; esac
  else
    case "$out" in DENIED|WROTE:0|SEEN:0) verdict=PASS;; WROTE:*|SEEN:*) verdict="FAIL(got: $out)";; *) verdict="FAIL(got: $out)";; esac
  fi
  echo "$verdict | $name" >> "$OUT"
}

# ── events ──
scn $MEM1  "member cannot create event" DENIED "
  insert into events(title,event_type,starts_at,ends_at,status,created_by) values ('mx','meeting',now(),now()+interval '1h','published','$MEM1');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $COMMS "comms cannot create event" DENIED "
  insert into events(title,event_type,starts_at,ends_at,status,created_by) values ('mx','meeting',now(),now()+interval '1h','published','$COMMS');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $PRES  "president can create event" OK "
  insert into events(title,event_type,starts_at,ends_at,status,created_by) values ('mx event','meeting',now()+interval '1 day',now()+interval '2 day','published','$PRES');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM1  "member sees published events" OK "
  select count(*) into n from events where status='published'; return 'SEEN:'||n;"
# ── finance ──
scn $TREAS "treasurer records finance entry" OK "
  insert into financial_transactions(transaction_type,direction,amount_minor,currency,description,created_by,member_id) values ('contribution','in',1000,'MAD','mx','$TREAS','$MEM1');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $COMMS "comms cannot record finance" DENIED "
  insert into financial_transactions(transaction_type,direction,amount_minor,currency,description,created_by,member_id) values ('contribution','in',1000,'MAD','mx','$COMMS','$MEM1');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM1  "member sees only own finance rows" OK "
  select count(*) into n from financial_transactions where member_id is not null and member_id <> '$MEM1';
  if n>0 then raise exception 'DENIED'; end if; return 'SEEN:0';"
scn $MEM1  "member cannot reverse finance" DENIED "
  update financial_transactions set status='reversed' where created_by='$TREAS';
  get diagnostics n = row_count; return 'WROTE:'||n;"
# ── points ──
scn $HR    "hr awards points" OK "
  insert into point_transactions(member_id,points_delta,category,reason,created_by) values ('$MEM1',5,'other','mx award','$HR');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM1  "member cannot award points" DENIED "
  insert into point_transactions(member_id,points_delta,category,reason,created_by) values ('$MEM2',5,'participation','nope','$MEM1');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM1  "member sees only own points" OK "
  select count(*) into n from point_transactions where member_id <> '$MEM1';
  if n>0 then raise exception 'DENIED'; end if; return 'SEEN:0';"
# ── inventory ──
scn $LOG   "logistics adds inventory item" OK "
  insert into inventory_items(name,category,quantity,condition,created_by) values ('mx item','Event equipment',0,'good','$LOG');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $TREAS "treasurer cannot add inventory" DENIED "
  insert into inventory_items(name,category,quantity,condition,created_by) values ('mx nope','x',0,'good','$TREAS');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $LOG   "logistics records stock movement" OK "
  insert into inventory_movements(item_id,movement_type,quantity,reason,created_by)
  select id,'adjustment',1,'mx restock','$LOG' from inventory_items where name='mx item';
  get diagnostics n = row_count; return 'WROTE:'||n;"
# ── news ──
scn $COMMS "comms publishes news" OK "
  insert into announcements(title,body,audience,published_at,created_by) values ('mx news','b','members',now(),'$COMMS');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $LOG   "logistics cannot publish news" DENIED "
  insert into announcements(title,body,audience,published_at,created_by) values ('mx nope','b','members',now(),'$LOG');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM1  "member sees member news" OK "
  select count(*) into n from announcements where audience='members' and published_at is not null; return 'SEEN:'||n;"
scn $MEM1  "member cannot see officer-only news" OK "
  select count(*) into n from announcements where audience='officers' and published_at is not null and created_by <> '$MEM1';
  return 'SEEN:0';"
# ── chat ──
scn $MEM1  "member starts board chat" OK "
  perform start_member_communication('mx subject','hello board','president',null);
  return 'WROTE:1';"
scn $MEM2  "member2 cannot read member1 threads" DENIED "
  select count(*) into n from member_communication_threads where member_id='$MEM1';
  if n>0 then raise exception 'DENIED'; end if; return 'SEEN:0';"
scn $PRES  "president (target role) reads member thread" OK "
  select count(*) into n from member_communication_threads where member_id='$MEM1'; return 'SEEN:'||n;"
# ── ideas ──
scn $MEM1  "member submits idea" OK "
  insert into member_ideas(title,description,submitted_by) values ('mx idea','d','$MEM1');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM1  "member cannot review own idea" DENIED "
  update member_ideas set status='under_review' where submitted_by='$MEM1';
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $SEC   "secretary reviews idea" OK "
  update member_ideas set status='under_review',review_note='ok' where submitted_by='$MEM1';
  get diagnostics n = row_count; return 'WROTE:'||n;"
# ── HR cases ──
scn $MEM1  "member submits HR case (rpc)" OK "
  perform submit_member_case('mx matrix case','a clear description of the issue',''); return 'WROTE:1';"
scn $MEM2  "member2 cannot read member1 case" DENIED "
  select count(*) into n from member_cases where submitted_by='$MEM1';
  if n>0 then raise exception 'DENIED'; end if; return 'SEEN:0';"
scn $HR    "hr reads member1 case" OK "
  select count(*) into n from member_cases where submitted_by='$MEM1'; return 'SEEN:'||n;"
# ── tasks ──
scn $VP    "vp assigns task" OK "
  insert into tasks(title,team,created_by) values ('mx task','club','$VP');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM1  "member cannot create task" DENIED "
  insert into tasks(title,team,created_by) values ('mx nope','club','$MEM1');
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $VP    "vp assigns member to task" OK "
  insert into task_assignments(task_id,member_id,assigned_by)
  select id,'$MEM1','$VP' from tasks where title='mx task';
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM1  "member sees own assignment only" OK "
  select count(*) into n from task_assignments where member_id <> '$MEM1';
  if n>0 then raise exception 'DENIED'; end if; return 'SEEN:0';"
# ── member management ──
scn $HR    "hr updates member status" OK "
  update member_profiles set status='active' where id='$MEM2' and status='active';
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM1  "member cannot update another member" DENIED "
  update member_profiles set status='suspended' where id='$MEM2';
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM1  "member updates own profile" OK "
  update member_profiles set phone_number='+212600000000' where id='$MEM1';
  get diagnostics n = row_count; return 'WROTE:'||n;"
# ── roles ──
scn $PRES  "president set_member_role keep" OK "
  perform set_member_role('$MEM2','member','mx role test'); return 'WROTE:1';"
scn $HR    "hr cannot set roles" DENIED "
  perform set_member_role('$MEM2','member','nope'); return 'WROTE:1';"
scn $PRES  "president edits built-in role" OK "
  perform update_club_role('treasurer','Treasurer',(select permissions from club_roles where role_key='treasurer'),'mx keep'); return 'WROTE:1';"
scn $PRES  "president role is protected" DENIED "
  perform update_club_role('president','President',array[]::text[],'should fail'); return 'WROTE:1';"
scn $VP    "vp cannot edit built-in role" DENIED "
  perform update_club_role('treasurer','Treasurer',(select permissions from club_roles where role_key='treasurer'),'nope'); return 'WROTE:1';"
scn $PRES  "president creates custom role" OK "
  perform create_club_role('mx_test_role',array['events.view'],'mx custom role test'); return 'WROTE:1';"
scn $MEM1  "member cannot create custom role" DENIED "
  perform create_club_role('mx_bad_role',array['events.view'],'nope'); return 'WROTE:1';"
# ── events lifecycle ──
scn $PRES  "delete published event refused" DENIED "
  perform delete_event((select id from events where title='mx event'),'cleanup'); return 'WROTE:1';"
scn $PRES  "president cancels then deletes event" OK "
  declare eid uuid;
  begin
    insert into events(title,event_type,starts_at,ends_at,status,created_by) values ('mx del event','meeting',now()+interval '1 day',now()+interval '2 day','published','$PRES') returning id into eid;
    update events set status='cancelled',cancellation_reason='mx',cancelled_at=now(),cancelled_by='$PRES' where id=eid;
    perform delete_event(eid,'mx cleanup');
    return 'WROTE:1';
  end;"
scn $COMMS "comms cannot delete events" DENIED "
  perform delete_event((select id from events limit 1),'nope'); return 'WROTE:1';"
# ── notifications ──
scn $MEM1  "member marks own notification read" OK "
  update notifications set read_at=now() where recipient_id='$MEM1' and read_at is null;
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM2  "member2 cannot touch member1 notifications" DENIED "
  update notifications set read_at=now() where recipient_id='$MEM1';
  get diagnostics n = row_count; return 'WROTE:'||n;"
scn $MEM2  "member2 sees zero member1 notifications" OK "
  select count(*) into n from notifications where recipient_id='$MEM1';
  if n>0 then raise exception 'DENIED'; end if; return 'SEEN:0';"
scn $MEM1  "member cannot write arbitrary notification" DENIED "
  insert into notifications(id,recipient_id,title,body,category) values (gen_random_uuid(),'$MEM2','spoof','x','task');
  get diagnostics n = row_count; return 'WROTE:'||n;"
# ── audit ──
scn $MEM1  "member sees zero audit rows" OK "
  select count(*) into n from audit_log; return 'SEEN:'||n;"
scn $PRES  "president reads audit log" OK "
  select count(*) into n from audit_log; return 'SEEN:'||n;"
# ── attendance ──
scn $HR    "hr reads attendance sessions" OK "
  select count(*) into n from attendance_sessions; return 'SEEN:'||n;"
scn $MEM1  "member sees only own attendance records" OK "
  select count(*) into n from attendance_records where member_id <> '$MEM1';
  if n>0 then raise exception 'DENIED'; end if; return 'SEEN:0';"
scn $MEM1  "member cannot write attendance record" DENIED "
  insert into attendance_records(session_id,member_id,status,recorded_by)
  select id,'$MEM2','present','$MEM1' from attendance_sessions limit 1;
  get diagnostics n = row_count; return 'WROTE:'||n;"

echo "── Results ──"
sort "$OUT" | tee /tmp/matrix_sorted.txt | grep -c "^PASS" | xargs echo "PASS count:"
grep -c "^PASS" "$OUT" | xargs true
total=$(wc -l < "$OUT"); pass=$(grep -c "^PASS" "$OUT")
echo "total=$total pass=$pass"
grep -v "^PASS" "$OUT" || echo "No failures."
