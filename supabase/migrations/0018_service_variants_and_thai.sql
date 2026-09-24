-- Bilingual service names/descriptions, and multiple duration/price options
-- per service (e.g. Thai Massage: 60 min $60, 90 min $85, 120 min $110) —
-- a real spa menu rarely has one fixed duration per service.
alter table public.services
  add column if not exists name_th text,
  add column if not exists description_th text;

create table public.service_price_options (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  duration_minutes integer not null,
  price_cents integer not null,
  sort_order integer not null default 0,
  unique (service_id, duration_minutes)
);

create index service_price_options_service_idx on public.service_price_options(service_id);

alter table public.service_price_options enable row level security;

create policy "Anyone can view service price options" on public.service_price_options
  for select to anon, authenticated
  using (true);

create policy "Owners and managers manage service price options" on public.service_price_options
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

-- Backfill one option per existing service from its current default duration/price.
insert into public.service_price_options (service_id, duration_minutes, price_cents, sort_order)
select id, duration_minutes, default_price_cents, 0 from public.services
on conflict (service_id, duration_minutes) do nothing;
