-- Refund/void posting. A refund is modeled as a new pos_transactions row
-- (status 'completed', original_transaction_id set) with its own positive-
-- magnitude items/payments representing what was refunded — never a mutation
-- of the original sale, so the audit trail stays intact.
--
-- The inventory trigger needs to know which direction to move stock: a sale
-- decrements, a refund restocks. It decides by checking whether the item's
-- transaction has original_transaction_id set.
create or replace function app.after_pos_item_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_track_inventory boolean;
  v_is_refund boolean;
begin
  if new.item_type = 'product' then
    select branch_id, (original_transaction_id is not null)
      into v_branch_id, v_is_refund
      from public.pos_transactions where id = new.transaction_id;
    select track_inventory into v_track_inventory from public.products where id = new.reference_id;

    if v_track_inventory then
      insert into public.inventory_adjustments (branch_id, product_id, quantity_delta, reason, reference_type, reference_id)
      values (
        v_branch_id,
        new.reference_id,
        case when v_is_refund then new.quantity else -new.quantity end,
        case when v_is_refund then 'refund' else 'sale' end,
        'pos_transaction_item',
        new.id
      );
    end if;
  end if;
  return new;
end;
$$;

-- Mirror-image posting: every line is the opposite side of the equivalent
-- sale line, using the refund transaction's own (positive-magnitude) items
-- and payments. Commission already accrued on the original sale is left
-- alone — clawing it back is a manual adjustment for now, not automated.
create function app.post_pos_refund(p_refund_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  refund public.pos_transactions%rowtype;
  v_entry_id uuid;
  v_payment record;
  v_revenue record;
  v_cogs_total integer;
begin
  select * into refund from public.pos_transactions where id = p_refund_transaction_id;

  if refund.id is null or refund.original_transaction_id is null then
    raise exception 'Not a refund transaction.';
  end if;
  if not app.has_branch_role(refund.branch_id, array['owner','manager']::public.role_type[]) then
    raise exception 'Not authorized to post this refund.';
  end if;
  if exists (select 1 from public.journal_entries where source_type = 'pos_refund' and source_id = refund.id) then
    return;
  end if;

  insert into public.journal_entries (org_id, branch_id, entry_date, description, source_type, source_id, created_by_staff_id)
  values (refund.org_id, refund.branch_id, refund.created_at::date, 'POS refund', 'pos_refund', refund.id, refund.staff_id)
  returning id into v_entry_id;

  for v_payment in select * from public.pos_payments where transaction_id = refund.id loop
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
    values (
      v_entry_id,
      app.account_id(refund.org_id, case v_payment.method
        when 'cash' then '1000'
        when 'card_stripe' then '1010'
        when 'gift_card' then '2100'
        when 'store_credit' then '2110'
        when 'package_credit' then '2200'
      end),
      refund.branch_id, v_payment.amount_cents, 'Refund via: ' || v_payment.method
    );
  end loop;

  for v_revenue in
    select item_type, sum(total_cents) as amount
    from public.pos_transaction_items
    where transaction_id = refund.id
    group by item_type
  loop
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
    values (
      v_entry_id,
      app.account_id(refund.org_id, case v_revenue.item_type
        when 'service' then '4000'
        when 'product' then '4100'
        else '4200'
      end),
      refund.branch_id, v_revenue.amount, 'Revenue reversed: ' || v_revenue.item_type
    );
  end loop;

  if refund.tax_cents > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
    values (v_entry_id, app.account_id(refund.org_id, '2300'), refund.branch_id, refund.tax_cents, 'Sales tax reversed');
  end if;

  select coalesce(sum(cogs_cents), 0) into v_cogs_total
  from public.pos_transaction_items where transaction_id = refund.id and item_type = 'product';

  if v_cogs_total > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
    values (v_entry_id, app.account_id(refund.org_id, '5000'), refund.branch_id, v_cogs_total, 'Cost of goods sold reversed');
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
    values (v_entry_id, app.account_id(refund.org_id, '1300'), refund.branch_id, v_cogs_total, 'Inventory restocked');
  end if;

  if refund.tip_cents > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
    values (v_entry_id, app.account_id(refund.org_id, '2410'), refund.branch_id, refund.tip_cents, 'Tips payable reversed');
  end if;

  return;
end;
$$;

grant execute on function app.post_pos_refund(uuid) to authenticated;

create function public.post_pos_refund(p_refund_transaction_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  select app.post_pos_refund(p_refund_transaction_id);
$$;

grant execute on function public.post_pos_refund(uuid) to authenticated;
