-- "Therapists view transactions behind their own items" read
-- pos_transaction_items, whose own policy reads pos_transactions: reading a
-- sale item back (insert ... returning) looped between the two policies.
-- The lookup now runs in a security-definer helper, which skips RLS and so
-- breaks the loop. Who can see what is unchanged.
create or replace function app.has_own_item_on_transaction(p_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pos_transaction_items pti
    where pti.transaction_id = p_transaction_id and pti.staff_id = auth.uid()
  );
$$;

revoke all on function app.has_own_item_on_transaction(uuid) from public, anon;
grant execute on function app.has_own_item_on_transaction(uuid) to authenticated;

drop policy if exists "Therapists view transactions behind their own items" on public.pos_transactions;
create policy "Therapists view transactions behind their own items" on public.pos_transactions
  for select to authenticated
  using (app.has_own_item_on_transaction(id));
