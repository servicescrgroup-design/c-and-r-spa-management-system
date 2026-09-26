-- Join date for lifetime/pay-period stats, plus an org-wide certifications
-- (a.k.a. specialties) master list that the owner defines, staff get
-- assigned to (pending), and only the owner approves after testing.

alter table public.therapist_profiles add column if not exists start_date date;

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.staff_certifications (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  certification_id uuid not null references public.certifications(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  approved_by_staff_id uuid references public.staff(id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (staff_id, certification_id)
);

create index staff_certifications_staff_idx on public.staff_certifications(staff_id);

alter table public.certifications enable row level security;
alter table public.staff_certifications enable row level security;

create policy "Any staff member can view certifications" on public.certifications
  for select to authenticated
  using (app.current_staff_id() is not null);

create policy "Owners and managers manage certifications" on public.certifications
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Owners and managers view staff certifications" on public.staff_certifications
  for select to authenticated
  using (
    staff_id = auth.uid()
    or app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = staff_certifications.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );

create policy "Owners and managers manage staff certifications" on public.staff_certifications
  for all to authenticated
  using (
    app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = staff_certifications.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  )
  with check (
    app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = staff_certifications.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );
