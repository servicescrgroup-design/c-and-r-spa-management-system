-- Lets a therapist be assigned to more than one branch while tracking which
-- one is "home" — the sale flow doesn't care, but payroll uses this to add a
-- configurable transportation fee when someone clocks in away from home.
alter table public.staff_branch_roles
  add column if not exists is_home boolean not null default false;

alter table public.branches
  add column if not exists transportation_fee_cents integer not null default 0;
