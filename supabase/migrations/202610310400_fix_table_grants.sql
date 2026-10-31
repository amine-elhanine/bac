-- Row-level policies for authenticated existed on several tables, but the
-- matching table-level grants were missing, so every write through those
-- policies failed with "permission denied for table" regardless of role
-- (event creation, task assignment, idea review, stock movements, notice
-- read markers). Grant exactly the privileges the permissive policies
-- already express; row-level security remains the gate.

grant insert on public.events to authenticated;
grant update on public.events to authenticated;
grant insert on public.tasks to authenticated;
grant update on public.tasks to authenticated;
grant select on public.inventory_movements to authenticated;
grant insert on public.inventory_movements to authenticated;
grant update on public.inventory_items to authenticated;
grant update on public.member_ideas to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.task_assignments to authenticated;
grant insert on public.task_assignments to authenticated;
grant update on public.task_assignments to authenticated;
grant delete on public.task_assignments to authenticated;
