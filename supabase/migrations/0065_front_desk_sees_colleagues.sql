-- Front desk runs the POS and queue, so they need the therapists at their
-- branches (names and role assignments). Previously only owners and managers
-- could read these, so a receptionist's therapist list came back empty.
drop policy if exists "Staff can view role assignments in scope" on public.staff_branch_roles;
create policy "Staff can view role assignments in scope" on public.staff_branch_roles
  for select to authenticated
  using (
    staff_id = (select auth.uid())
    or app.is_owner()
    or branch_id in (select app.staff_branch_ids(array['owner', 'manager', 'front_desk']::public.role_type[]))
  );

drop policy if exists "Staff can view colleagues in their branches" on public.staff;
create policy "Staff can view colleagues in their branches" on public.staff
  for select to authenticated
  using (
    id = (select auth.uid())
    or app.is_owner()
    or exists (
      select 1
      from public.staff_branch_roles mine
      join public.staff_branch_roles theirs on theirs.staff_id = staff.id
      where mine.staff_id = (select auth.uid())
        and mine.role = any (array['owner', 'manager', 'front_desk']::public.role_type[])
        and (mine.branch_id = theirs.branch_id or mine.branch_id is null)
    )
  );
