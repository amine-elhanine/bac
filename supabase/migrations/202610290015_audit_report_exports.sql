-- Report exports can contain attendance, membership, or financial data.
-- Record each export before a client is allowed to fetch and download it.
create or replace function public.audit_report_export(p_report_type text, p_scope_id text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_report_type = 'attendance' then
    if not public.has_club_role(array['president','vice_president','hr','vice_hr']) then
      raise exception 'Not authorized to export attendance';
    end if;
  elsif p_report_type = 'finance' then
    if not public.has_club_role(array['president','vice_president','treasurer','vice_treasurer'])
       and p_scope_id is distinct from auth.uid()::text then
      raise exception 'Not authorized to export finance';
    end if;
  else
    raise exception 'Unsupported report type';
  end if;

  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields)
  values(auth.uid(),'export','report:' || p_report_type,p_scope_id,array['csv_download']);
end;
$$;

revoke all on function public.audit_report_export(text,text) from public, anon;
grant execute on function public.audit_report_export(text,text) to authenticated;
