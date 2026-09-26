-- Front desk can name a walk-in sale or link it to a customer after the
-- session. They can't update sales in general (totals, payments), so this
-- function changes only those two fields, for staff of that branch.
create or replace function public.set_sale_customer(
  p_transaction_id uuid,
  p_customer_name text,
  p_customer_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch uuid;
begin
  select branch_id into v_branch from public.pos_transactions where id = p_transaction_id;
  if v_branch is null then
    raise exception 'Sale not found.';
  end if;
  if not app.has_branch_role(v_branch, array['owner', 'manager', 'front_desk']::public.role_type[]) then
    raise exception 'Not authorized to edit sales at this branch.';
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Customer not found.';
  end if;

  update public.pos_transactions
    set customer_name = nullif(btrim(coalesce(p_customer_name, '')), ''),
        customer_id = p_customer_id
    where id = p_transaction_id;
end;
$$;

revoke all on function public.set_sale_customer(uuid, text, uuid) from public, anon;
grant execute on function public.set_sale_customer(uuid, text, uuid) to authenticated;
