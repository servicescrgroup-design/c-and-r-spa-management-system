-- Phase 1 foundation for multi-branch therapist HR, live queue, combo-based
-- pricing, and the guarantee payroll engine. UI and calculation functions
-- land in later migrations/phases; this lays down the data model so every
-- later phase has somewhere correct to read/write.

create type public.therapist_status as enum ('active', 'probation', 'suspended', 'resigned');
create type public.clock_status as enum ('available', 'in_service', 'on_break', 'off_duty');
create type public.staff_document_type as enum (
  'national_id', 'house_registration', 'certificate', 'work_permit', 'health_check', 'contract', 'bank_book', 'other'
);
create type public.payroll_adjustment_type as enum ('bonus', 'deduction', 'advance');

alter type public.pos_transaction_status add value if not exists 'open';

-- ---------------------------------------------------------------------------
-- Branch settings: hours, tax info, rooms, and the payroll rule defaults
-- (T minimum hours, G daily guarantee) that this branch uses unless a
-- therapist has a personal override.
-- ---------------------------------------------------------------------------
alter table public.branches
  add column if not exists hours jsonb not null default '{}'::jsonb,
  add column if not exists tax_id text,
  add column if not exists payroll_min_hours numeric not null default 3,
  add column if not exists payroll_guarantee_cents integer not null default 40000,
  add column if not exists queue_send_to_back boolean not null default true;

create table public.branch_rooms (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  is_active boolean not null default true
);

create index branch_rooms_branch_idx on public.branch_rooms(branch_id);

-- ---------------------------------------------------------------------------
-- Therapist HR profile: one row per staff member who is a therapist.
-- Kept separate from `staff` (which every role uses) so a receptionist or
-- accountant's row doesn't carry a pile of null therapist-only columns.
-- ---------------------------------------------------------------------------
create table public.therapist_profiles (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  nickname text,
  line_id text,
  dob date,
  gender text,
  end_date date,
  status public.therapist_status not null default 'active',
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  notes text,
  photo_url text,
  guarantee_override_cents integer,
  min_hours_override numeric,
  updated_at timestamptz not null default now()
);

create table public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  doc_type public.staff_document_type not null,
  is_required boolean not null default false,
  number text,
  issuer text,
  issued_date date,
  expiry_date date,
  file_url text,
  file_url_back text,
  notes text,
  created_at timestamptz not null default now()
);

create index staff_documents_staff_idx on public.staff_documents(staff_id);
create index staff_documents_expiry_idx on public.staff_documents(expiry_date) where expiry_date is not null;

-- ---------------------------------------------------------------------------
-- Combo + duration pricing: the shop price and therapist payout (ค่ามือ)
-- both depend on exactly which services are combined and the total
-- duration chosen, e.g. {Thai, Foot} at 90 min is one priced row, distinct
-- from Thai alone at 90 min. A branch-specific row overrides the org-wide
-- default for the same combo+duration; the sale flow must not invent a
-- price when neither row exists.
-- ---------------------------------------------------------------------------
create table public.service_combos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text
);

create table public.service_combo_members (
  combo_id uuid not null references public.service_combos(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (combo_id, service_id)
);

create table public.service_combo_prices (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references public.service_combos(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  duration_minutes integer not null,
  price_cents integer not null,
  payout_cents integer not null,
  unique (combo_id, branch_id, duration_minutes)
);

create index service_combo_prices_combo_idx on public.service_combo_prices(combo_id);

-- Finds the combo matching an exact set of service ids, and the price row
-- for that combo/duration — a branch-specific row wins over the org-wide
-- default (branch_id is null). Returns no row at all if the combo or the
-- duration isn't priced yet, by design: the sale flow must show "not
-- configured" rather than guess.
create function app.find_combo_price(
  p_service_ids uuid[],
  p_branch_id uuid,
  p_duration_minutes integer
)
returns table (combo_id uuid, price_cents integer, payout_cents integer)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select array_agg(distinct x order by x) as ids from unnest(p_service_ids) as x
  ),
  matching_combo as (
    select scm.combo_id
    from public.service_combo_members scm
    group by scm.combo_id
    having array_agg(scm.service_id order by scm.service_id) = (select ids from target)
  )
  select mc.combo_id, scp.price_cents, scp.payout_cents
  from matching_combo mc
  join public.service_combo_prices scp
    on scp.combo_id = mc.combo_id
   and scp.duration_minutes = p_duration_minutes
   and (scp.branch_id = p_branch_id or scp.branch_id is null)
  order by scp.branch_id nulls last
  limit 1;
$$;

grant execute on function app.find_combo_price(uuid[], uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Clock-in / live queue: one row per therapist, per branch, per work day.
-- queue_position drives display order (drag-and-drop reorder rewrites it);
-- new clock-ins are naturally last by clock_in_at until reordered.
-- ---------------------------------------------------------------------------
create table public.therapist_clock_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  work_date date not null,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  status public.clock_status not null default 'available',
  queue_position integer not null default 0,
  jobs_today integer not null default 0,
  unique (staff_id, branch_id, work_date)
);

create index therapist_clock_sessions_branch_day_idx
  on public.therapist_clock_sessions(branch_id, work_date, queue_position);

-- ---------------------------------------------------------------------------
-- Payroll adjustments (manual bonus/deduction/advance) and the per-day lock
-- that freezes a branch's payroll once a manager has approved it.
-- ---------------------------------------------------------------------------
create table public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  work_date date not null,
  type public.payroll_adjustment_type not null,
  amount_cents integer not null,
  reason text,
  created_by_staff_id uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index payroll_adjustments_staff_day_idx on public.payroll_adjustments(staff_id, branch_id, work_date);

create table public.payroll_day_locks (
  branch_id uuid not null references public.branches(id) on delete cascade,
  work_date date not null,
  locked_by_staff_id uuid references public.staff(id) on delete set null,
  locked_at timestamptz not null default now(),
  primary key (branch_id, work_date)
);

-- ---------------------------------------------------------------------------
-- Generic audit log: queue reorders, pay overrides, voids, document deletes.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  staff_id uuid references public.staff(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_org_created_idx on public.audit_log(org_id, created_at desc);
create index audit_log_branch_created_idx on public.audit_log(branch_id, created_at desc);

-- ---------------------------------------------------------------------------
-- POS extensions: therapist payout snapshot (separate from shop price),
-- and room assignment for a sale.
-- ---------------------------------------------------------------------------
alter table public.pos_transaction_items
  add column if not exists payout_cents integer not null default 0;

alter table public.pos_transactions
  add column if not exists room_id uuid references public.branch_rooms(id) on delete set null,
  add column if not exists combo_id uuid references public.service_combos(id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.branch_rooms enable row level security;
alter table public.therapist_profiles enable row level security;
alter table public.staff_documents enable row level security;
alter table public.service_combos enable row level security;
alter table public.service_combo_members enable row level security;
alter table public.service_combo_prices enable row level security;
alter table public.therapist_clock_sessions enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.payroll_day_locks enable row level security;
alter table public.audit_log enable row level security;

create policy "Staff view rooms in their branches" on public.branch_rooms
  for select to authenticated
  using (branch_id in (select app.staff_branch_ids()));

create policy "Owners and managers manage rooms" on public.branch_rooms
  for all to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Staff view therapist profiles in their branches" on public.therapist_profiles
  for select to authenticated
  using (
    staff_id = auth.uid()
    or app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = therapist_profiles.staff_id
        and sbr.branch_id in (select app.staff_branch_ids())
    )
  );

create policy "Owners and managers manage therapist profiles" on public.therapist_profiles
  for all to authenticated
  using (
    app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = therapist_profiles.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  )
  with check (
    app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = therapist_profiles.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );

create policy "Owners and managers view staff documents" on public.staff_documents
  for select to authenticated
  using (
    staff_id = auth.uid()
    or app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = staff_documents.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );

create policy "Owners and managers manage staff documents" on public.staff_documents
  for all to authenticated
  using (
    app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = staff_documents.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  )
  with check (
    app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = staff_documents.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );

create policy "Anyone can view combo catalog" on public.service_combos
  for select to anon, authenticated using (true);
create policy "Owners and managers manage combos" on public.service_combos
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Anyone can view combo members" on public.service_combo_members
  for select to anon, authenticated using (true);
create policy "Owners and managers manage combo members" on public.service_combo_members
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Anyone can view combo prices" on public.service_combo_prices
  for select to anon, authenticated using (true);
create policy "Owners and managers manage combo prices" on public.service_combo_prices
  for all to authenticated
  using (app.is_owner() or branch_id is null or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id is null or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "POS staff view clock sessions in their branches" on public.therapist_clock_sessions
  for select to authenticated
  using (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])) or staff_id = auth.uid());

create policy "POS staff manage clock sessions in their branches" on public.therapist_clock_sessions
  for all to authenticated
  using (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])))
  with check (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])));

create policy "Staff view their own payroll adjustments" on public.payroll_adjustments
  for select to authenticated
  using (staff_id = auth.uid() or app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Owners and managers manage payroll adjustments" on public.payroll_adjustments
  for all to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Owners and managers manage payroll locks" on public.payroll_day_locks
  for all to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Owners and managers view audit log" on public.audit_log
  for select to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Authenticated staff can write audit log" on public.audit_log
  for insert to authenticated
  with check (branch_id is null or branch_id in (select app.staff_branch_ids()));
