-- Ad-hoc freelance masseurs: brought in by name for a day when the regular
-- queue is full, never a real staff/auth account. Paid in cash right at
-- checkout (never through the guarantee payroll engine), so a freelance job
-- just needs a name, which service, and that it was paid — no clock-in,
-- no skills, no payroll row.
create table public.freelance_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  work_date date not null,
  name text not null,
  status text not null default 'available' check (status in ('available', 'in_service', 'done')),
  queue_position integer not null default 0,
  jobs_today integer not null default 0,
  created_by_staff_id uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index freelance_sessions_branch_day_idx on public.freelance_sessions(branch_id, work_date, queue_position);

alter table public.pos_transaction_items
  add column if not exists freelance_session_id uuid references public.freelance_sessions(id) on delete set null,
  add column if not exists freelancer_paid boolean not null default false;

alter table public.freelance_sessions enable row level security;

create policy "POS staff view freelance sessions in their branches" on public.freelance_sessions
  for select to authenticated
  using (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])));

create policy "POS staff manage freelance sessions in their branches" on public.freelance_sessions
  for all to authenticated
  using (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])))
  with check (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])));
