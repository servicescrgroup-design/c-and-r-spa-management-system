-- POS registers, cash drawer sessions, and transactions.
create table public.pos_registers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null
);

create type public.drawer_session_status as enum ('open', 'closed');

create table public.cash_drawer_sessions (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.pos_registers(id) on delete cascade,
  opened_by_staff_id uuid not null references public.staff(id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_amount_cents integer not null,
  closed_by_staff_id uuid references public.staff(id) on delete set null,
  closed_at timestamptz,
  expected_amount_cents integer,
  counted_amount_cents integer,
  variance_cents integer,
  status public.drawer_session_status not null default 'open'
);

create index cash_drawer_sessions_register_idx on public.cash_drawer_sessions(register_id, status);

create type public.pos_transaction_status as enum ('completed', 'voided', 'refunded', 'partially_refunded');
create type public.pos_item_type as enum ('service', 'product', 'package', 'membership_redemption');
create type public.pos_payment_method as enum ('cash', 'card_stripe', 'gift_card', 'store_credit', 'package_credit');
create type public.pos_payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create table public.pos_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  register_id uuid not null references public.pos_registers(id) on delete restrict,
  drawer_session_id uuid not null references public.cash_drawer_sessions(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  staff_id uuid not null references public.staff(id) on delete restrict,
  status public.pos_transaction_status not null default 'completed',
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  tax_cents integer not null default 0,
  tip_cents integer not null default 0,
  total_cents integer not null default 0,
  original_transaction_id uuid references public.pos_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index pos_transactions_branch_idx on public.pos_transactions(branch_id, created_at);
create index pos_transactions_customer_idx on public.pos_transactions(customer_id);

create table public.pos_transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.pos_transactions(id) on delete cascade,
  item_type public.pos_item_type not null,
  reference_id uuid,
  description text not null,
  staff_id uuid references public.staff(id) on delete set null,
  quantity integer not null default 1,
  unit_price_cents integer not null,
  discount_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null,
  cogs_cents integer
);

create index pos_transaction_items_transaction_idx on public.pos_transaction_items(transaction_id);
create index pos_transaction_items_staff_idx on public.pos_transaction_items(staff_id);

create table public.pos_discounts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.pos_transactions(id) on delete cascade,
  transaction_item_id uuid references public.pos_transaction_items(id) on delete cascade,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  value numeric not null,
  reason text,
  applied_by_staff_id uuid not null references public.staff(id) on delete restrict
);

create table public.pos_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.pos_transactions(id) on delete cascade,
  method public.pos_payment_method not null,
  amount_cents integer not null,
  stripe_payment_intent_id text,
  gift_card_id uuid,
  store_credit_id uuid,
  status public.pos_payment_status not null default 'succeeded',
  created_at timestamptz not null default now()
);

create index pos_payments_transaction_idx on public.pos_payments(transaction_id);

-- ---------------------------------------------------------------------------
-- RLS: all POS activity is branch-scoped to owner/manager/front_desk.
-- Therapists have no POS access by default (front-desk operates checkout).
-- ---------------------------------------------------------------------------

alter table public.pos_registers enable row level security;
alter table public.cash_drawer_sessions enable row level security;
alter table public.pos_transactions enable row level security;
alter table public.pos_transaction_items enable row level security;
alter table public.pos_discounts enable row level security;
alter table public.pos_payments enable row level security;

create policy "POS staff view registers in their branches" on public.pos_registers
  for select to authenticated
  using (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])));

create policy "Owners and managers manage registers" on public.pos_registers
  for all to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "POS staff view drawer sessions in their branches" on public.cash_drawer_sessions
  for select to authenticated
  using (register_id in (
    select id from public.pos_registers
    where branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ));

create policy "POS staff manage drawer sessions in their branches" on public.cash_drawer_sessions
  for all to authenticated
  using (register_id in (
    select id from public.pos_registers
    where branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ))
  with check (register_id in (
    select id from public.pos_registers
    where branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ));

create policy "POS staff view transactions in their branches" on public.pos_transactions
  for select to authenticated
  using (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])));

create policy "POS staff record transactions in their branches" on public.pos_transactions
  for insert to authenticated
  with check (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])));

create policy "Owners and managers update transactions" on public.pos_transactions
  for update to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Customers view their own transactions" on public.pos_transactions
  for select to authenticated
  using (customer_id = app.current_customer_id());

create policy "POS staff view transaction items in their branches" on public.pos_transaction_items
  for select to authenticated
  using (exists (
    select 1 from public.pos_transactions t
    where t.id = pos_transaction_items.transaction_id
      and t.branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ));

create policy "POS staff record transaction items in their branches" on public.pos_transaction_items
  for insert to authenticated
  with check (exists (
    select 1 from public.pos_transactions t
    where t.id = pos_transaction_items.transaction_id
      and t.branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ));

create policy "POS staff view discounts in their branches" on public.pos_discounts
  for select to authenticated
  using (exists (
    select 1 from public.pos_transactions t
    where t.id = pos_discounts.transaction_id
      and t.branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ));

create policy "POS staff record discounts in their branches" on public.pos_discounts
  for insert to authenticated
  with check (exists (
    select 1 from public.pos_transactions t
    where t.id = pos_discounts.transaction_id
      and t.branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ));

create policy "POS staff view payments in their branches" on public.pos_payments
  for select to authenticated
  using (exists (
    select 1 from public.pos_transactions t
    where t.id = pos_payments.transaction_id
      and t.branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ));

create policy "POS staff record payments in their branches" on public.pos_payments
  for insert to authenticated
  with check (exists (
    select 1 from public.pos_transactions t
    where t.id = pos_payments.transaction_id
      and t.branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ));
