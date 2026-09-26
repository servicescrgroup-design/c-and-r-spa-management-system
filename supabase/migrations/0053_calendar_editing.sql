-- Calendar editing: appointments get a discount and a payment type, and
-- completed walk-in sales can be corrected (service, duration, price,
-- discount, payment type, therapist) by an owner or manager. The sale edit
-- runs as one database function so the sale, its payment, the therapist
-- queue and the accounting entry always change together.

alter table public.appointments
  add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0),
  add column if not exists payment_method public.pos_payment_method;

-- PromptPay payments had no ledger account in sale/refund posting, so a
-- PromptPay sale could not post. Map it to cash & bank (1000) like bank
-- transfers.
do $$
declare
  v_fn text;
  v_def text;
begin
  foreach v_fn in array array['app.post_pos_transaction(uuid)', 'app.post_pos_refund(uuid)'] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position('''promptpay''' in v_def) = 0 and position('when ''bank_transfer'' then ''1000''' in v_def) > 0 then
      execute replace(
        v_def,
        'when ''bank_transfer'' then ''1000''',
        'when ''bank_transfer'' then ''1000''' || chr(10) || '        when ''promptpay'' then ''1000'''
      );
    end if;
  end loop;
end;
$$;

create table if not exists public.pos_sale_edits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.pos_transactions(id) on delete cascade,
  item_id uuid references public.pos_transaction_items(id) on delete set null,
  edited_by_staff_id uuid references public.staff(id) on delete set null,
  edited_at timestamptz not null default now(),
  before jsonb not null,
  after jsonb not null
);

alter table public.pos_sale_edits enable row level security;

create policy "Owners and managers view sale edits" on public.pos_sale_edits
  for select to authenticated
  using (
    app.is_owner()
    or exists (
      select 1 from public.pos_transactions t
      where t.id = transaction_id
        and t.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );

create or replace function public.edit_pos_sale(
  p_transaction_id uuid,
  p_item_id uuid,
  p_service_id uuid,
  p_duration_minutes integer,
  p_price_cents integer,
  p_discount_cents integer,
  p_payout_cents integer,
  p_payment_method public.pos_payment_method,
  p_staff_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txn public.pos_transactions%rowtype;
  v_item public.pos_transaction_items%rowtype;
  v_before jsonb;
  v_subtotal integer;
  v_discount integer;
  v_total integer;
  v_old_session record;
  v_new_session record;
  v_entry uuid;
begin
  select * into v_txn from public.pos_transactions where id = p_transaction_id for update;
  if v_txn.id is null then
    raise exception 'Sale not found.';
  end if;
  if not (app.is_owner() or app.has_branch_role(v_txn.branch_id, array['manager']::public.role_type[])) then
    raise exception 'Only an owner or manager can edit a sale.';
  end if;
  if v_txn.status <> 'completed' or exists (
    select 1 from public.pos_transactions r where r.original_transaction_id = v_txn.id
  ) then
    raise exception 'This sale has been refunded or voided, so it can''t be edited.';
  end if;
  if exists (
    select 1 from public.payroll_day_locks l
    where l.branch_id = v_txn.branch_id
      and l.work_date = (v_txn.created_at at time zone 'Asia/Bangkok')::date
  ) then
    raise exception 'Payroll for this day is locked. Unlock the day on the Payroll page first.';
  end if;
  if exists (
    select 1 from public.pos_payments p
    where p.transaction_id = v_txn.id
      and p.method in ('card_stripe', 'gift_card', 'store_credit', 'package_credit')
  ) or p_payment_method in ('card_stripe', 'gift_card', 'store_credit', 'package_credit') then
    raise exception 'Sales paid by online card, gift card, store credit or package can''t be edited here. Refund and ring it up again instead.';
  end if;

  select * into v_item from public.pos_transaction_items
  where id = p_item_id and transaction_id = v_txn.id and item_type = 'service'
  for update;
  if v_item.id is null then
    raise exception 'Service line not found on this sale.';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0
     or p_price_cents is null or p_price_cents < 0
     or p_discount_cents is null or p_discount_cents < 0 or p_discount_cents > p_price_cents then
    raise exception 'Check the duration, price and discount. The discount can''t be more than the price.';
  end if;

  v_before := jsonb_build_object(
    'item', to_jsonb(v_item),
    'transaction', to_jsonb(v_txn),
    'payments', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.pos_payments p where p.transaction_id = v_txn.id)
  );

  -- Change therapist. If the massage is still running, move the live queue
  -- status over too; the new therapist must be clocked in and free here.
  if p_staff_id is null then
    raise exception 'Choose a therapist.';
  end if;
  if p_staff_id is distinct from v_item.staff_id then
    select * into v_old_session from public.therapist_clock_sessions
    where active_item_id = v_item.id and clock_out_at is null;
    if v_old_session.id is not null then
      select * into v_new_session from public.therapist_clock_sessions
      where staff_id = p_staff_id and branch_id = v_txn.branch_id and clock_out_at is null
      order by clock_in_at desc limit 1;
      if v_new_session.id is null or v_new_session.status <> 'available' then
        raise exception 'That therapist isn''t clocked in and free at this branch.';
      end if;
      update public.therapist_clock_sessions
        set status = 'available', active_item_id = null, current_room_id = null
        where id = v_old_session.id;
      update public.therapist_clock_sessions
        set status = 'in_service', active_item_id = v_item.id, current_room_id = v_txn.room_id
        where id = v_new_session.id;
    end if;
    update public.pos_transaction_items
      set staff_id = p_staff_id
      where transaction_id = v_txn.id and item_type = 'service' and staff_id is not distinct from v_item.staff_id;
  end if;

  update public.pos_transaction_items
    set reference_id = p_service_id,
        duration_minutes = p_duration_minutes,
        unit_price_cents = p_price_cents,
        discount_cents = p_discount_cents,
        total_cents = p_price_cents - p_discount_cents,
        payout_cents = coalesce(p_payout_cents, payout_cents),
        description = regexp_replace(coalesce(description, 'Service'), '\d+ min', p_duration_minutes || ' min')
    where id = v_item.id;

  delete from public.pos_discounts where transaction_item_id = v_item.id;
  if p_discount_cents > 0 then
    insert into public.pos_discounts (transaction_id, transaction_item_id, discount_type, value, reason, applied_by_staff_id)
    values (v_txn.id, v_item.id, 'fixed', p_discount_cents / 100.0, 'Edited on calendar', app.current_staff_id());
  end if;

  select coalesce(sum(unit_price_cents * quantity), 0), coalesce(sum(discount_cents), 0)
    into v_subtotal, v_discount
    from public.pos_transaction_items where transaction_id = v_txn.id;
  v_total := v_subtotal - v_discount + v_txn.tax_cents + v_txn.tip_cents + v_txn.card_fee_cents;

  update public.pos_transactions
    set subtotal_cents = v_subtotal, discount_cents = v_discount, total_cents = v_total
    where id = v_txn.id;

  delete from public.pos_payments where transaction_id = v_txn.id;
  insert into public.pos_payments (transaction_id, method, amount_cents)
  values (v_txn.id, p_payment_method, v_total);

  -- Re-post the sale so revenue, payments and commissions match the edit.
  delete from public.staff_commissions
    where pos_transaction_item_id in (select id from public.pos_transaction_items where transaction_id = v_txn.id);
  for v_entry in select id from public.journal_entries where source_type = 'pos_sale' and source_id = v_txn.id loop
    delete from public.journal_entry_lines where journal_entry_id = v_entry;
    delete from public.journal_entries where id = v_entry;
  end loop;
  perform app.post_pos_transaction(v_txn.id);

  insert into public.pos_sale_edits (transaction_id, item_id, edited_by_staff_id, before, after)
  values (
    v_txn.id, v_item.id, app.current_staff_id(), v_before,
    jsonb_build_object(
      'service_id', p_service_id, 'duration_minutes', p_duration_minutes, 'price_cents', p_price_cents,
      'discount_cents', p_discount_cents, 'payout_cents', p_payout_cents, 'payment_method', p_payment_method,
      'staff_id', p_staff_id, 'total_cents', v_total
    )
  );
end;
$$;

revoke all on function public.edit_pos_sale(uuid, uuid, uuid, integer, integer, integer, integer, public.pos_payment_method, uuid) from public, anon;
grant execute on function public.edit_pos_sale(uuid, uuid, uuid, integer, integer, integer, integer, public.pos_payment_method, uuid) to authenticated;
