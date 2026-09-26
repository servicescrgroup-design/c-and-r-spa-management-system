-- Product photo, manual display order (drag-to-reorder), and per-branch
-- "carried here" overrides — mirrors branch_service_overrides.
alter table public.products
  add column if not exists image_url text,
  add column if not exists sort_order integer not null default 0;

with ordered as (
  select id, row_number() over (order by created_at) as rn
  from public.products
)
update public.products p
set sort_order = ordered.rn
from ordered
where ordered.id = p.id;

create table public.branch_product_overrides (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  is_carried boolean not null default false,
  primary key (branch_id, product_id)
);

alter table public.branch_product_overrides enable row level security;

create policy "Anyone can view branch product overrides" on public.branch_product_overrides
  for select to authenticated
  using (true);

create policy "Owners and managers manage branch product overrides" on public.branch_product_overrides
  for all to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Owners and managers manage product images" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'product-images'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  )
  with check (
    bucket_id = 'product-images'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  );

create policy "Anyone can view product images" on storage.objects
  for select
  using (bucket_id = 'product-images');
