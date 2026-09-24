-- Front-desk checkout needs cash, bank transfer, and manual credit card
-- (a physical terminal, not the online Stripe flow), split across multiple
-- tenders on one sale, plus an optional surcharge passed through to the
-- customer when a card is used to cover processing costs.
alter type public.pos_payment_method add value if not exists 'bank_transfer';
alter type public.pos_payment_method add value if not exists 'card_manual';

alter table public.pos_transactions
  add column if not exists card_fee_cents integer not null default 0;

insert into public.accounts (org_id, code, name, type)
select o.id, '4300', 'Card Surcharge Income', 'revenue'
from public.organizations o
where not exists (
  select 1 from public.accounts a where a.org_id = o.id and a.code = '4300'
);

-- Re-post logic: adds the card fee as its own revenue credit (the extra
-- amount charged to the customer to cover card processing), and no longer
-- assumes a single payment method.
create or replace function app.post_pos_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new public.pos_transactions%rowtype;
  v_entry_id uuid;
  v_payment record;
  v_revenue record;
  v_cogs_total integer;
  v_item record;
  v_rule public.commission_rules;
  v_commission_cents integer;
  v_staff_role public.role_type;
begin
  select * into new from public.pos_transactions where id = p_transaction_id;

  if new.id is null or new.status <> 'completed' then
    return;
  end if;
  if not app.has_branch_role(new.branch_id, array['owner','manager','front_desk']::public.role_type[]) then
    raise exception 'Not authorized to post this transaction.';
  end if;
  if exists (select 1 from public.journal_entries where source_type = 'pos_sale' and source_id = new.id) then
    return;
  end if;

  insert into public.journal_entries (org_id, branch_id, entry_date, description, source_type, source_id, created_by_staff_id)
  values (new.org_id, new.branch_id, new.created_at::date, 'POS sale', 'pos_sale', new.id, new.staff_id)
  returning id into v_entry_id;

  for v_payment in select * from public.pos_payments where transaction_id = new.id loop
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
    values (
      v_entry_id,
      app.account_id(new.org_id, case v_payment.method
        when 'cash' then '1000'
        when 'bank_transfer' then '1000'
        when 'card_manual' then '1010'
        when 'card_stripe' then '1010'
        when 'gift_card' then '2100'
        when 'store_credit' then '2110'
        when 'package_credit' then '2200'
      end),
      new.branch_id, v_payment.amount_cents, 'Payment: ' || v_payment.method
    );
  end loop;

  for v_revenue in
    select item_type, sum(total_cents) as amount
    from public.pos_transaction_items
    where transaction_id = new.id
    group by item_type
  loop
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
    values (
      v_entry_id,
      app.account_id(new.org_id, case v_revenue.item_type
        when 'service' then '4000'
        when 'product' then '4100'
        else '4200'
      end),
      new.branch_id, v_revenue.amount, 'Revenue: ' || v_revenue.item_type
    );
  end loop;

  if new.tax_cents > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
    values (v_entry_id, app.account_id(new.org_id, '2300'), new.branch_id, new.tax_cents, 'Sales tax collected');
  end if;

  if new.card_fee_cents > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
    values (v_entry_id, app.account_id(new.org_id, '4300'), new.branch_id, new.card_fee_cents, 'Card surcharge collected');
  end if;

  select coalesce(sum(cogs_cents), 0) into v_cogs_total
  from public.pos_transaction_items where transaction_id = new.id and item_type = 'product';

  if v_cogs_total > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
    values (v_entry_id, app.account_id(new.org_id, '5000'), new.branch_id, v_cogs_total, 'Cost of goods sold');
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
    values (v_entry_id, app.account_id(new.org_id, '1300'), new.branch_id, v_cogs_total, 'Inventory reduction');
  end if;

  for v_item in
    select * from public.pos_transaction_items
    where transaction_id = new.id and staff_id is not null
  loop
    select role into v_staff_role from public.staff_branch_roles
    where staff_id = v_item.staff_id and (branch_id = new.branch_id or branch_id is null)
    order by branch_id nulls last limit 1;

    v_rule := app.resolve_commission_rate(
      new.org_id, new.branch_id, v_staff_role,
      case when v_item.item_type = 'service' then v_item.reference_id end,
      case when v_item.item_type = 'product' then v_item.reference_id end
    );

    if v_rule.id is not null then
      v_commission_cents := case v_rule.rate_type
        when 'percent' then round(v_item.total_cents * v_rule.rate_value / 100.0)
        else round(v_rule.rate_value * 100)
      end;

      if v_commission_cents > 0 then
        insert into public.staff_commissions (staff_id, pos_transaction_item_id, rule_id, base_amount_cents, commission_amount_cents)
        values (v_item.staff_id, v_item.id, v_rule.id, v_item.total_cents, v_commission_cents);

        insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
        values (v_entry_id, app.account_id(new.org_id, '6000'), new.branch_id, v_commission_cents, 'Commission accrued');
        insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
        values (v_entry_id, app.account_id(new.org_id, '2400'), new.branch_id, v_commission_cents, 'Commission payable');
      end if;
    end if;
  end loop;

  if new.tip_cents > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
    values (v_entry_id, app.account_id(new.org_id, '2410'), new.branch_id, new.tip_cents, 'Tips payable');
  end if;

  return;
end;
$$;

-- Refund posting also needs to know about the card-fee mapping and the new
-- payment methods for the same reasons as the sale posting above.
create or replace function app.post_pos_refund(p_refund_transaction_id uuid)
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
        when 'bank_transfer' then '1000'
        when 'card_manual' then '1010'
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

  if refund.card_fee_cents > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
    values (v_entry_id, app.account_id(refund.org_id, '4300'), refund.branch_id, refund.card_fee_cents, 'Card surcharge reversed');
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
