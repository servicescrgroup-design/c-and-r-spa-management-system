-- Lets an owner/manager correct or remove a past inventory adjustment, not
-- just add new ones. branch_inventory.quantity_on_hand is a derived cache
-- that was only ever kept in sync on INSERT — extend the trigger to also
-- handle UPDATE (reverse the old delta, apply the new one) and DELETE
-- (reverse the deleted delta), and add RLS so owners/managers can actually
-- perform those writes.

alter table public.inventory_adjustments add column if not exists notes text;

create or replace function app.apply_inventory_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.branch_inventory (branch_id, product_id, quantity_on_hand)
    values (new.branch_id, new.product_id, new.quantity_delta)
    on conflict (branch_id, product_id)
    do update set
      quantity_on_hand = public.branch_inventory.quantity_on_hand + excluded.quantity_on_hand,
      updated_at = now();
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.branch_inventory (branch_id, product_id, quantity_on_hand)
    values (old.branch_id, old.product_id, -old.quantity_delta)
    on conflict (branch_id, product_id)
    do update set
      quantity_on_hand = public.branch_inventory.quantity_on_hand + excluded.quantity_on_hand,
      updated_at = now();
    insert into public.branch_inventory (branch_id, product_id, quantity_on_hand)
    values (new.branch_id, new.product_id, new.quantity_delta)
    on conflict (branch_id, product_id)
    do update set
      quantity_on_hand = public.branch_inventory.quantity_on_hand + excluded.quantity_on_hand,
      updated_at = now();
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.branch_inventory (branch_id, product_id, quantity_on_hand)
    values (old.branch_id, old.product_id, -old.quantity_delta)
    on conflict (branch_id, product_id)
    do update set
      quantity_on_hand = public.branch_inventory.quantity_on_hand + excluded.quantity_on_hand,
      updated_at = now();
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_inventory_adjustment_insert on public.inventory_adjustments;
create trigger on_inventory_adjustment_change
  after insert or update or delete on public.inventory_adjustments
  for each row execute function app.apply_inventory_adjustment();

create policy "Owners and managers edit inventory adjustments" on public.inventory_adjustments
  for update to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Owners and managers delete inventory adjustments" on public.inventory_adjustments
  for delete to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));
