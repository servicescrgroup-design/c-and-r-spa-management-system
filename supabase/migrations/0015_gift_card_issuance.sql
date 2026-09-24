-- Selling a gift card isn't revenue — it's cash in exchange for a liability
-- (Gift Card Liability) that gets drawn down on redemption later. That's a
-- different debit/credit shape than a normal item sale, so it gets its own
-- posting path rather than going through pos_transaction_items.
create or replace function app.gift_card_code()
returns text
language sql
volatile
set search_path = public
as $$
  select upper(substr(md5(gen_random_uuid()::text), 1, 10));
$$;

create function app.issue_gift_card(
  p_branch_id uuid,
  p_drawer_session_id uuid,
  p_amount_cents integer,
  p_customer_id uuid,
  p_payment_method public.pos_payment_method
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_register_id uuid;
  v_staff_id uuid := auth.uid();
  v_txn_id uuid;
  v_gift_card_id uuid;
  v_entry_id uuid;
begin
  select org_id into v_org_id from public.branches where id = p_branch_id;
  if v_org_id is null then
    raise exception 'Branch not found.';
  end if;
  if not app.has_branch_role(p_branch_id, array['owner','manager','front_desk']::public.role_type[]) then
    raise exception 'Not authorized to sell gift cards at this branch.';
  end if;
  if p_amount_cents <= 0 then
    raise exception 'Amount must be greater than zero.';
  end if;

  select register_id into v_register_id from public.cash_drawer_sessions where id = p_drawer_session_id;

  insert into public.pos_transactions (org_id, branch_id, register_id, drawer_session_id, customer_id, staff_id, subtotal_cents, total_cents)
  values (v_org_id, p_branch_id, v_register_id, p_drawer_session_id, p_customer_id, v_staff_id, p_amount_cents, p_amount_cents)
  returning id into v_txn_id;

  insert into public.pos_payments (transaction_id, method, amount_cents)
  values (v_txn_id, p_payment_method, p_amount_cents);

  insert into public.gift_cards (org_id, code, initial_value_cents, balance_cents, issued_branch_id, issued_to_customer_id)
  values (v_org_id, app.gift_card_code(), p_amount_cents, p_amount_cents, p_branch_id, p_customer_id)
  returning id into v_gift_card_id;

  insert into public.gift_card_transactions (gift_card_id, pos_transaction_id, type, amount_cents, balance_after_cents)
  values (v_gift_card_id, v_txn_id, 'issue', p_amount_cents, p_amount_cents);

  insert into public.journal_entries (org_id, branch_id, entry_date, description, source_type, source_id, created_by_staff_id)
  values (v_org_id, p_branch_id, current_date, 'Gift card issued', 'pos_sale', v_txn_id, v_staff_id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
  values (
    v_entry_id,
    app.account_id(v_org_id, case p_payment_method when 'cash' then '1000' else '1010' end),
    p_branch_id, p_amount_cents, 'Gift card sale payment'
  );
  insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
  values (v_entry_id, app.account_id(v_org_id, '2100'), p_branch_id, p_amount_cents, 'Gift card liability issued');

  return v_gift_card_id;
end;
$$;

grant execute on function app.issue_gift_card(uuid, uuid, integer, uuid, public.pos_payment_method) to authenticated;

create function public.issue_gift_card(
  p_branch_id uuid,
  p_drawer_session_id uuid,
  p_amount_cents integer,
  p_customer_id uuid,
  p_payment_method public.pos_payment_method
)
returns uuid
language sql
security invoker
set search_path = public
as $$
  select app.issue_gift_card(p_branch_id, p_drawer_session_id, p_amount_cents, p_customer_id, p_payment_method);
$$;

grant execute on function public.issue_gift_card(uuid, uuid, integer, uuid, public.pos_payment_method) to authenticated;
