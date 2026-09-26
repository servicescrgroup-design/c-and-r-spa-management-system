-- Per-receptionist register access: which of a branch's registers a given
-- staff member is allowed to open. No rows for a staff member means
-- unrestricted (can open any register at their branch) — this is a
-- narrowing allowlist, not a requirement to configure.
create table public.staff_register_access (
  staff_id uuid not null references public.staff(id) on delete cascade,
  register_id uuid not null references public.pos_registers(id) on delete cascade,
  primary key (staff_id, register_id)
);

alter table public.staff_register_access enable row level security;

create policy "Staff view their own register access" on public.staff_register_access
  for select to authenticated
  using (
    staff_id = auth.uid()
    or app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = staff_register_access.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );

create policy "Owners and managers manage register access" on public.staff_register_access
  for all to authenticated
  using (
    app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = staff_register_access.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  )
  with check (
    app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = staff_register_access.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );
