-- Members lost Calendar, Attendance (QR check-in), Points, Finance (own
-- history), Communications (board chat + ideas), and HR Support from the
-- sidebar when the permission catalog rework left the member role with only
-- tasks.view. This restores member-facing access with dedicated self-service
-- permission keys (RLS already scopes members to their own rows, so these
-- keys only control module visibility, not extra data access).

insert into public.club_permission_catalog(permission_key,module_name,display_name,description,built_in_roles) values
  ('attendance.self','Attendance','Check in to events','Scan the event QR code to record your attendance and view your own history.',
   array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer','member']),
  ('communications.chat','Communication','Chat with the board','Start conversations with board members, read club news, and submit ideas.',
   array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer','member']),
  ('hr.cases.submit','HR','Submit support cases','Open a private, audited support case with HR.',
   array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer','member']),
  ('finance.self','Finance','View own finance history','Read your own contribution payments, receipts, and finance notices.',
   array['president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer','member'])
on conflict (permission_key) do nothing;

-- Catalog documentation: members read published events and their own points.
update public.club_permission_catalog
  set built_in_roles = array_append(built_in_roles,'member')
  where permission_key in ('events.view','points.view')
    and not ('member' = any(built_in_roles));

-- Member role: restore the member-facing permission set. Row-level security
-- keeps every one of these scoped to the member's own data.
update public.club_roles
  set permissions = array['events.view','tasks.view','points.view','attendance.self','communications.chat','hr.cases.submit','finance.self']
  where role_key='member' and not is_custom;

-- Officers keep their existing sets and gain the self-service keys.
update public.club_roles
  set permissions = array_append(array_append(array_append(array_append(
        permissions,'attendance.self'),'communications.chat'),'hr.cases.submit'),'finance.self')
  where not is_custom
    and role_key in ('president','vice_president','communications_officer','treasurer','vice_treasurer','hr','vice_hr','general_secretary','logistics_officer','vice_logistics_officer')
    and not ('attendance.self' = any(permissions));
