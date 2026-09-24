-- Service catalog, retail products, and per-branch inventory.
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.service_categories(id) on delete set null,
  name text not null,
  description text,
  duration_minutes integer not null,
  default_price_cents integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.branch_service_overrides (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  price_cents integer,
  is_offered boolean not null default true,
  unique (branch_id, service_id)
);

create table public.staff_services (
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  sku text not null,
  name text not null,
  description text,
  cost_cents integer not null default 0,
  retail_price_cents integer not null,
  is_active boolean not null default true,
  track_inventory boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, sku)
);

create table public.branch_inventory (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity_on_hand integer not null default 0,
  reorder_threshold integer not null default 0,
  reorder_quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (branch_id, product_id)
);

create type public.inventory_adjustment_reason as enum (
  'receiving', 'sale', 'refund', 'damage', 'count_correction', 'transfer'
);

create table public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete set null,
  quantity_delta integer not null,
  reason public.inventory_adjustment_reason not null,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index inventory_adjustments_branch_product_idx
  on public.inventory_adjustments(branch_id, product_id);

-- Keep branch_inventory.quantity_on_hand as a derived cache of the
-- inventory_adjustments audit log, so callers only ever insert an
-- adjustment row and never write the running total directly.
create function app.apply_inventory_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.branch_inventory (branch_id, product_id, quantity_on_hand)
  values (new.branch_id, new.product_id, new.quantity_delta)
  on conflict (branch_id, product_id)
  do update set
    quantity_on_hand = public.branch_inventory.quantity_on_hand + excluded.quantity_on_hand,
    updated_at = now();
  return new;
end;
$$;

create trigger on_inventory_adjustment_insert
  after insert on public.inventory_adjustments
  for each row execute function app.apply_inventory_adjustment();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.branch_service_overrides enable row level security;
alter table public.staff_services enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.branch_inventory enable row level security;
alter table public.inventory_adjustments enable row level security;

-- Reference catalogs: staff read, owner/manager write; anon can read active
-- services/prices so the booking flow can render a menu.
create policy "Staff view service categories" on public.service_categories
  for select to authenticated
  using (exists (select 1 from public.staff where id = auth.uid() and org_id = service_categories.org_id));

create policy "Owners and managers manage service categories" on public.service_categories
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Anyone can view active services" on public.services
  for select to anon, authenticated
  using (is_active);

create policy "Owners and managers manage services" on public.services
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Anyone can view branch service overrides" on public.branch_service_overrides
  for select to anon, authenticated
  using (true);

create policy "Owners and managers manage branch service overrides" on public.branch_service_overrides
  for all to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Staff view their own service skills" on public.staff_services
  for select to authenticated
  using (staff_id = auth.uid() or app.is_owner());

create policy "Owners and managers manage staff service skills" on public.staff_services
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Staff view product categories" on public.product_categories
  for select to authenticated
  using (exists (select 1 from public.staff where id = auth.uid() and org_id = product_categories.org_id));

create policy "Owners and managers manage product categories" on public.product_categories
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Staff view active products" on public.products
  for select to authenticated
  using (exists (select 1 from public.staff where id = auth.uid() and org_id = products.org_id));

create policy "Owners and managers manage products" on public.products
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Staff view inventory in their branches" on public.branch_inventory
  for select to authenticated
  using (branch_id in (select app.staff_branch_ids()));

create policy "Owners and managers adjust inventory rows directly" on public.branch_inventory
  for all to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Staff view inventory adjustments in their branches" on public.inventory_adjustments
  for select to authenticated
  using (branch_id in (select app.staff_branch_ids()));

create policy "Staff record inventory adjustments in their branches" on public.inventory_adjustments
  for insert to authenticated
  with check (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])));
