-- Gift cards, store credit, and prepaid packages/memberships.
create type public.gift_card_txn_type as enum ('issue', 'redeem', 'reload', 'adjust');
create type public.store_credit_txn_type as enum ('issue', 'redeem', 'adjust');
create type public.package_type as enum ('prepaid_services', 'membership');
create type public.billing_interval as enum ('one_time', 'monthly', 'annual');
create type public.customer_package_status as enum ('active', 'expired', 'cancelled');

create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  initial_value_cents integer not null,
  balance_cents integer not null,
  issued_branch_id uuid references public.branches(id) on delete set null,
  issued_to_customer_id uuid references public.customers(id) on delete set null,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.gift_card_transactions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete cascade,
  pos_transaction_id uuid references public.pos_transactions(id) on delete set null,
  type public.gift_card_txn_type not null,
  amount_cents integer not null,
  balance_after_cents integer not null,
  created_at timestamptz not null default now()
);

create index gift_card_transactions_card_idx on public.gift_card_transactions(gift_card_id);

create table public.store_credits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  balance_cents integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.store_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  store_credit_id uuid not null references public.store_credits(id) on delete cascade,
  pos_transaction_id uuid references public.pos_transactions(id) on delete set null,
  type public.store_credit_txn_type not null,
  amount_cents integer not null,
  balance_after_cents integer not null,
  reason text,
  created_at timestamptz not null default now()
);

create index store_credit_transactions_credit_idx on public.store_credit_transactions(store_credit_id);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null,
  type public.package_type not null default 'prepaid_services',
  billing_interval public.billing_interval not null default 'one_time',
  validity_days integer,
  is_active boolean not null default true
);

create table public.package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  quantity integer not null default 1
);

create table public.customer_packages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete restrict,
  purchased_at timestamptz not null default now(),
  purchased_branch_id uuid references public.branches(id) on delete set null,
  expires_at timestamptz,
  status public.customer_package_status not null default 'active',
  source_transaction_id uuid references public.pos_transactions(id) on delete set null
);

create index customer_packages_customer_idx on public.customer_packages(customer_id);

create table public.customer_package_units (
  id uuid primary key default gen_random_uuid(),
  customer_package_id uuid not null references public.customer_packages(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  quantity_total integer not null,
  quantity_used integer not null default 0
);

create table public.customer_package_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_package_id uuid not null references public.customer_packages(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  pos_transaction_item_id uuid references public.pos_transaction_items(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  quantity integer not null default 1
);

-- Keep customer_package_units.quantity_used in sync with redemptions.
create function app.apply_package_redemption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customer_package_units
  set quantity_used = quantity_used + new.quantity
  where customer_package_id = new.customer_package_id
    and service_id = new.service_id;
  return new;
end;
$$;

create trigger on_package_redemption_insert
  after insert on public.customer_package_redemptions
  for each row execute function app.apply_package_redemption();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.gift_cards enable row level security;
alter table public.gift_card_transactions enable row level security;
alter table public.store_credits enable row level security;
alter table public.store_credit_transactions enable row level security;
alter table public.packages enable row level security;
alter table public.package_items enable row level security;
alter table public.customer_packages enable row level security;
alter table public.customer_package_units enable row level security;
alter table public.customer_package_redemptions enable row level security;

create policy "Staff manage gift cards in their org" on public.gift_cards
  for all to authenticated
  using (exists (select 1 from public.staff where id = auth.uid() and org_id = gift_cards.org_id))
  with check (exists (select 1 from public.staff where id = auth.uid() and org_id = gift_cards.org_id));

create policy "Customers view their own gift cards" on public.gift_cards
  for select to authenticated
  using (issued_to_customer_id = app.current_customer_id());

create policy "Staff view gift card transactions" on public.gift_card_transactions
  for select to authenticated
  using (exists (
    select 1 from public.gift_cards gc join public.staff s on s.org_id = gc.org_id
    where gc.id = gift_card_transactions.gift_card_id and s.id = auth.uid()
  ));

create policy "Staff record gift card transactions" on public.gift_card_transactions
  for insert to authenticated
  with check (exists (
    select 1 from public.gift_cards gc join public.staff s on s.org_id = gc.org_id
    where gc.id = gift_card_transactions.gift_card_id and s.id = auth.uid()
  ));

create policy "Customers view their own gift card transactions" on public.gift_card_transactions
  for select to authenticated
  using (exists (
    select 1 from public.gift_cards gc
    where gc.id = gift_card_transactions.gift_card_id and gc.issued_to_customer_id = app.current_customer_id()
  ));

create policy "Customers view their own store credit" on public.store_credits
  for select to authenticated
  using (customer_id = app.current_customer_id());

create policy "Staff manage store credit in their org" on public.store_credits
  for all to authenticated
  using (exists (
    select 1 from public.customers c join public.staff s on s.org_id = c.org_id
    where c.id = store_credits.customer_id and s.id = auth.uid()
  ))
  with check (exists (
    select 1 from public.customers c join public.staff s on s.org_id = c.org_id
    where c.id = store_credits.customer_id and s.id = auth.uid()
  ));

create policy "Customers view their own store credit transactions" on public.store_credit_transactions
  for select to authenticated
  using (exists (
    select 1 from public.store_credits sc
    where sc.id = store_credit_transactions.store_credit_id and sc.customer_id = app.current_customer_id()
  ));

create policy "Staff manage store credit transactions" on public.store_credit_transactions
  for all to authenticated
  using (exists (
    select 1 from public.store_credits sc
    join public.customers c on c.id = sc.customer_id
    join public.staff s on s.org_id = c.org_id
    where sc.id = store_credit_transactions.store_credit_id and s.id = auth.uid()
  ))
  with check (exists (
    select 1 from public.store_credits sc
    join public.customers c on c.id = sc.customer_id
    join public.staff s on s.org_id = c.org_id
    where sc.id = store_credit_transactions.store_credit_id and s.id = auth.uid()
  ));

create policy "Anyone can view active packages" on public.packages
  for select to anon, authenticated
  using (is_active);

create policy "Owners and managers manage packages" on public.packages
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Anyone can view package items" on public.package_items
  for select to anon, authenticated
  using (true);

create policy "Owners and managers manage package items" on public.package_items
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Customers view their own packages" on public.customer_packages
  for select to authenticated
  using (customer_id = app.current_customer_id());

create policy "Staff manage customer packages in their org" on public.customer_packages
  for all to authenticated
  using (exists (
    select 1 from public.customers c join public.staff s on s.org_id = c.org_id
    where c.id = customer_packages.customer_id and s.id = auth.uid()
  ))
  with check (exists (
    select 1 from public.customers c join public.staff s on s.org_id = c.org_id
    where c.id = customer_packages.customer_id and s.id = auth.uid()
  ));

create policy "Customers view their own package units" on public.customer_package_units
  for select to authenticated
  using (exists (
    select 1 from public.customer_packages cp
    where cp.id = customer_package_units.customer_package_id and cp.customer_id = app.current_customer_id()
  ));

create policy "Staff manage customer package units" on public.customer_package_units
  for all to authenticated
  using (exists (
    select 1 from public.customer_packages cp
    join public.customers c on c.id = cp.customer_id
    join public.staff s on s.org_id = c.org_id
    where cp.id = customer_package_units.customer_package_id and s.id = auth.uid()
  ))
  with check (exists (
    select 1 from public.customer_packages cp
    join public.customers c on c.id = cp.customer_id
    join public.staff s on s.org_id = c.org_id
    where cp.id = customer_package_units.customer_package_id and s.id = auth.uid()
  ));

create policy "Customers view their own redemptions" on public.customer_package_redemptions
  for select to authenticated
  using (exists (
    select 1 from public.customer_packages cp
    where cp.id = customer_package_redemptions.customer_package_id and cp.customer_id = app.current_customer_id()
  ));

create policy "Staff manage redemptions" on public.customer_package_redemptions
  for all to authenticated
  using (exists (
    select 1 from public.customer_packages cp
    join public.customers c on c.id = cp.customer_id
    join public.staff s on s.org_id = c.org_id
    where cp.id = customer_package_redemptions.customer_package_id and s.id = auth.uid()
  ))
  with check (exists (
    select 1 from public.customer_packages cp
    join public.customers c on c.id = cp.customer_id
    join public.staff s on s.org_id = c.org_id
    where cp.id = customer_package_redemptions.customer_package_id and s.id = auth.uid()
  ));
