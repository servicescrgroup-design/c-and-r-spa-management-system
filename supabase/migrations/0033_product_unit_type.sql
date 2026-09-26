-- Lets a product record what it's measured in (e.g. "500 ml" bottle vs.
-- "1 piece"), separate from the quantity counted in branch_inventory.
alter table public.products
  add column if not exists unit_label text not null default 'piece',
  add column if not exists unit_amount numeric;
