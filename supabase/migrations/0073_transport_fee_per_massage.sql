-- Transport fee per massage: the checkout can pay a therapist's transport
-- from the drawer for a given massage. The expense keeps a link to that
-- massage so the Sales page and Payroll can show it next to the job, and it
-- is removed when the massage or the whole bill is deleted.
alter table public.expenses
  add column if not exists pos_transaction_item_id uuid references public.pos_transaction_items(id) on delete set null;
create index if not exists expenses_pos_transaction_item_id_idx on public.expenses (pos_transaction_item_id);

create or replace function app.delete_item_expenses(p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense record;
begin
  for v_expense in select id, journal_entry_id from public.expenses where pos_transaction_item_id = any(p_item_ids) loop
    delete from public.expenses where id = v_expense.id;
    if v_expense.journal_entry_id is not null then
      delete from public.journal_entry_lines where journal_entry_id = v_expense.journal_entry_id;
      delete from public.journal_entries where id = v_expense.journal_entry_id;
    end if;
  end loop;
end;
$$;
revoke all on function app.delete_item_expenses(uuid[]) from public, anon, authenticated;

drop function if exists public.record_transportation_fee(uuid, uuid, integer);
create or replace function public.record_transportation_fee(
  p_branch_id uuid,
  p_staff_id uuid,
  p_amount_cents integer,
  p_item_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_category uuid;
  v_drawer uuid;
  v_name text;
  v_service text;
  v_id uuid;
begin
  if not app.has_branch_role(p_branch_id, array['owner', 'manager', 'front_desk']::public.role_type[]) then
    raise exception 'Not authorized to add fees at this branch';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_item_id is not null then
    select i.description into v_service
    from public.pos_transaction_items i
    join public.pos_transactions t on t.id = i.transaction_id
    where i.id = p_item_id and t.branch_id = p_branch_id and i.staff_id = p_staff_id;
    if not found then
      raise exception 'That massage isn''t this therapist''s at this branch';
    end if;
  end if;

  select org_id into v_org from public.branches where id = p_branch_id;
  select id into v_category from public.expense_categories where org_id = v_org and name = 'Transportation fee' limit 1;
  select coalesce(nullif(tp.nickname, ''), s.first_name) into v_name
  from public.staff s left join public.therapist_profiles tp on tp.staff_id = s.id
  where s.id = p_staff_id;

  select ds.id into v_drawer
  from public.cash_drawer_sessions ds
  join public.pos_registers r on r.id = ds.register_id
  where r.branch_id = p_branch_id and ds.status = 'open' and ds.opened_by_staff_id = auth.uid()
  order by ds.opened_at desc
  limit 1;

  insert into public.expenses (org_id, branch_id, category_id, amount_cents, payment_method, description,
                               created_by_staff_id, drawer_session_id, staff_id, pos_transaction_item_id,
                               expense_date)
  values (v_org, p_branch_id, v_category, p_amount_cents, 'cash',
          'Transportation fee · ' || coalesce(v_name, 'therapist') || coalesce(' · ' || v_service, ''),
          auth.uid(), v_drawer, p_staff_id, p_item_id,
          (now() at time zone 'Asia/Bangkok')::date)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_transportation_fee(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.record_transportation_fee(uuid, uuid, integer, uuid) to authenticated;

create or replace function public.edit_pos_sale_full(
  p_transaction_id uuid,
  p_lines jsonb,
  p_tip_cents integer,
  p_payments jsonb,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txn public.pos_transactions%rowtype;
  v_before jsonb;
  v_line jsonb;
  v_item public.pos_transaction_items%rowtype;
  v_price integer;
  v_discount integer;
  v_minutes integer;
  v_staff uuid;
  v_service uuid;
  v_name text;
  v_session record;
  v_new_session record;
  v_subtotal integer;
  v_disc_total integer;
  v_total integer;
  v_paid integer;
  v_pay jsonb;
  v_entry uuid;
begin
  select * into v_txn from public.pos_transactions where id = p_transaction_id for update;
  if v_txn.id is null then
    raise exception 'Sale not found.';
  end if;
  if not (app.is_owner() or app.has_branch_role(v_txn.branch_id, array['manager']::public.role_type[])) then
    raise exception 'Only an owner or manager can edit a sale.';
  end if;
  if v_txn.status <> 'completed' or exists (select 1 from public.pos_transactions r where r.original_transaction_id = v_txn.id) then
    raise exception 'This sale has been refunded or voided, so it can''t be edited.';
  end if;
  if exists (
    select 1 from public.payroll_day_locks l
    where l.branch_id = v_txn.branch_id and l.work_date = (v_txn.created_at at time zone 'Asia/Bangkok')::date
  ) then
    raise exception 'Payroll for this day is locked. Unlock the day on the Payroll page first.';
  end if;
  if exists (
    select 1 from public.pos_payments p
    where p.transaction_id = v_txn.id and p.method in ('card_stripe', 'gift_card', 'store_credit', 'package_credit')
  ) then
    raise exception 'Sales paid by online card, gift card, store credit or package can''t be edited here. Refund and ring it up again instead.';
  end if;
  if p_tip_cents is null or p_tip_cents < 0 then
    raise exception 'The tip can''t be negative.';
  end if;

  v_before := jsonb_build_object(
    'transaction', to_jsonb(v_txn),
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb) from public.pos_transaction_items i where i.transaction_id = v_txn.id),
    'payments', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.pos_payments p where p.transaction_id = v_txn.id)
  );

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from public.pos_transaction_items
    where id = (v_line->>'id')::uuid and transaction_id = v_txn.id
    for update;
    if v_item.id is null then
      raise exception 'A line isn''t on this sale.';
    end if;

    -- The therapist's queue entry follows the line.
    select * into v_session from public.therapist_clock_sessions where active_item_id = v_item.id and clock_out_at is null;

    if coalesce((v_line->>'remove')::boolean, false) then
      if v_item.item_type <> 'service'
         or exists (select 1 from public.customer_package_redemptions r where r.pos_transaction_item_id = v_item.id) then
        raise exception 'Only massage lines can be removed here. Refund products and packages instead.';
      end if;
      if v_session.id is not null then
        update public.therapist_clock_sessions
        set status = 'available', active_item_id = null, current_room_id = null, current_bed_id = null
        where id = v_session.id;
      end if;
      perform app.delete_item_expenses(array[v_item.id]);
      delete from public.staff_commissions where pos_transaction_item_id = v_item.id;
      delete from public.pos_discounts where transaction_item_id = v_item.id;
      delete from public.pos_transaction_items where id = v_item.id;
      continue;
    end if;

    v_price := coalesce((v_line->>'unit_price_cents')::int, v_item.unit_price_cents);
    v_discount := coalesce((v_line->>'discount_cents')::int, v_item.discount_cents);
    v_minutes := coalesce((v_line->>'duration_minutes')::int, v_item.duration_minutes);
    if v_price < 0 or v_discount < 0 or v_discount > v_price * v_item.quantity then
      raise exception 'Check the prices: a discount can''t be more than its line.';
    end if;
    if v_item.item_type = 'service' and (v_minutes is null or v_minutes <= 0) then
      raise exception 'Each massage needs its minutes.';
    end if;

    v_staff := case when v_line ? 'staff_id' then nullif(v_line->>'staff_id', '')::uuid else v_item.staff_id end;
    v_service := case when v_line ? 'service_id' then nullif(v_line->>'service_id', '')::uuid else v_item.reference_id end;

    -- A new service or length gets a fresh description; a freelancer's name stays in front.
    v_name := v_item.description;
    if v_item.item_type = 'service' and not v_item.is_add_on
       and (v_service is distinct from v_item.reference_id or v_minutes is distinct from v_item.duration_minutes) then
      select s.name into v_name from public.services s where s.id = v_service;
      v_name := coalesce(v_name, 'Service') || ' · ' || v_minutes || ' min';
      if v_item.freelance_session_id is not null then
        v_name := coalesce(substring(v_item.description from '^Freelance \([^)]*\) · '), '') || v_name;
      end if;
    end if;

    if v_session.id is not null and v_staff is distinct from v_item.staff_id then
      update public.therapist_clock_sessions
      set status = 'available', active_item_id = null, current_room_id = null, current_bed_id = null
      where id = v_session.id;
      select * into v_new_session from public.therapist_clock_sessions
      where staff_id = v_staff and branch_id = v_txn.branch_id and clock_out_at is null and status = 'available' and active_item_id is null
      order by clock_in_at desc limit 1;
      if v_new_session.id is not null then
        update public.therapist_clock_sessions
        set status = 'in_service', active_item_id = v_item.id,
            current_room_id = coalesce(nullif(v_line->>'room_id', '')::uuid, v_item.room_id),
            current_bed_id = coalesce(nullif(v_line->>'bed_id', '')::uuid, v_item.bed_id)
        where id = v_new_session.id;
      end if;
    elsif v_session.id is not null then
      update public.therapist_clock_sessions
      set current_room_id = case when v_line ? 'room_id' then nullif(v_line->>'room_id', '')::uuid else current_room_id end,
          current_bed_id = case when v_line ? 'bed_id' then nullif(v_line->>'bed_id', '')::uuid else current_bed_id end
      where id = v_session.id;
    end if;

    update public.pos_transaction_items
    set reference_id = v_service,
        description = v_name,
        duration_minutes = v_minutes,
        unit_price_cents = v_price,
        discount_cents = v_discount,
        total_cents = v_price * quantity - v_discount,
        payout_cents = coalesce((v_line->>'payout_cents')::int, payout_cents),
        staff_id = case when freelance_session_id is null then v_staff else staff_id end,
        room_id = case when v_line ? 'room_id' then nullif(v_line->>'room_id', '')::uuid else room_id end,
        bed_id = case when v_line ? 'bed_id' then nullif(v_line->>'bed_id', '')::uuid else bed_id end,
        start_at = case when v_line ? 'start_at' then nullif(v_line->>'start_at', '')::timestamptz else start_at end,
        customer_name = case when v_line ? 'customer_name' then nullif(trim(v_line->>'customer_name'), '') else customer_name end
    where id = v_item.id;

    -- A transport fee paid for this massage follows its therapist.
    update public.expenses set staff_id = v_staff
    where pos_transaction_item_id = v_item.id and v_staff is not null and staff_id is distinct from v_staff;

    delete from public.pos_discounts where transaction_item_id = v_item.id;
    if v_discount > 0 then
      insert into public.pos_discounts (transaction_id, transaction_item_id, discount_type, value, reason, applied_by_staff_id)
      values (v_txn.id, v_item.id, 'fixed', v_discount / 100.0, coalesce(nullif(p_note, ''), 'Edited on Sales page'), app.current_staff_id());
    end if;
  end loop;

  if not exists (select 1 from public.pos_transaction_items where transaction_id = v_txn.id) then
    raise exception 'A sale needs at least one line. Refund it instead of removing everything.';
  end if;

  select coalesce(sum(unit_price_cents * quantity), 0), coalesce(sum(discount_cents), 0)
    into v_subtotal, v_disc_total
    from public.pos_transaction_items where transaction_id = v_txn.id;
  v_total := v_subtotal - v_disc_total + v_txn.tax_cents + p_tip_cents + v_txn.card_fee_cents;

  select coalesce(sum((x->>'amount_cents')::int), 0) into v_paid from jsonb_array_elements(p_payments) x;
  if v_paid <> v_total then
    raise exception 'Payments (%) don''t add up to the new total (%).', v_paid, v_total;
  end if;
  for v_pay in select * from jsonb_array_elements(p_payments) loop
    if (v_pay->>'method') not in ('cash', 'bank_transfer', 'promptpay', 'card_manual') then
      raise exception 'Use cash, bank transfer, PromptPay or card.';
    end if;
  end loop;

  update public.pos_transactions
  set subtotal_cents = v_subtotal, discount_cents = v_disc_total, tip_cents = p_tip_cents, total_cents = v_total
  where id = v_txn.id;

  delete from public.pos_payments where transaction_id = v_txn.id;
  insert into public.pos_payments (transaction_id, method, amount_cents)
  select v_txn.id, (x->>'method')::public.pos_payment_method, (x->>'amount_cents')::int
  from jsonb_array_elements(p_payments) x
  where (x->>'amount_cents')::int <> 0;

  delete from public.staff_commissions
    where pos_transaction_item_id in (select id from public.pos_transaction_items where transaction_id = v_txn.id);
  for v_entry in select id from public.journal_entries where source_type = 'pos_sale' and source_id = v_txn.id loop
    delete from public.journal_entry_lines where journal_entry_id = v_entry;
    delete from public.journal_entries where id = v_entry;
  end loop;
  perform app.post_pos_transaction(v_txn.id);

  insert into public.pos_sale_edits (transaction_id, item_id, edited_by_staff_id, before, after)
  values (
    v_txn.id, null, app.current_staff_id(), v_before,
    jsonb_build_object(
      'note', p_note,
      'transaction', (select to_jsonb(t) from public.pos_transactions t where t.id = v_txn.id),
      'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb) from public.pos_transaction_items i where i.transaction_id = v_txn.id),
      'payments', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.pos_payments p where p.transaction_id = v_txn.id)
    )
  );
end;
$$;

revoke all on function public.edit_pos_sale_full(uuid, jsonb, integer, jsonb, text) from public, anon;
grant execute on function public.edit_pos_sale_full(uuid, jsonb, integer, jsonb, text) to authenticated;

create or replace function public.delete_pos_sale(p_transaction_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txn public.pos_transactions%rowtype;
  v_ids uuid[];
  v_item_ids uuid[];
  v_entry uuid;
begin
  select * into v_txn from public.pos_transactions where id = p_transaction_id for update;
  if v_txn.id is null then
    raise exception 'Sale not found.';
  end if;
  if v_txn.original_transaction_id is not null then
    raise exception 'This is a refund. Delete the original sale instead.';
  end if;
  if not (app.is_owner() or app.has_branch_role(v_txn.branch_id, array['manager']::public.role_type[])) then
    raise exception 'Only an owner or manager can delete a sale.';
  end if;
  if exists (
    select 1 from public.payroll_day_locks l
    where l.branch_id = v_txn.branch_id and l.work_date = (v_txn.created_at at time zone 'Asia/Bangkok')::date
  ) then
    raise exception 'Payroll for this day is locked. Unlock the day on the Payroll page first.';
  end if;

  v_ids := array(select v_txn.id union select id from public.pos_transactions where original_transaction_id = v_txn.id);
  v_item_ids := array(select id from public.pos_transaction_items where transaction_id = any(v_ids));

  if exists (
    select 1 from public.pos_payments p
    where p.transaction_id = any(v_ids) and p.method in ('card_stripe', 'gift_card', 'store_credit', 'package_credit')
  )
  or exists (select 1 from public.customer_packages cp where cp.source_transaction_id = any(v_ids))
  or exists (select 1 from public.gift_card_transactions g where g.pos_transaction_id = any(v_ids))
  or exists (select 1 from public.store_credit_transactions s where s.pos_transaction_id = any(v_ids))
  or exists (select 1 from public.customer_package_redemptions r where r.pos_transaction_item_id = any(v_item_ids)) then
    raise exception 'This sale used an online card, gift card, store credit or package, so it can''t be deleted. Refund it instead.';
  end if;

  insert into public.audit_log (org_id, branch_id, staff_id, action, entity_type, entity_id, detail)
  values (
    v_txn.org_id, v_txn.branch_id, app.current_staff_id(), 'delete', 'pos_transaction', v_txn.id,
    jsonb_build_object(
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'transaction', to_jsonb(v_txn),
      'refunds', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pos_transactions t where t.original_transaction_id = v_txn.id),
      'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb) from public.pos_transaction_items i where i.transaction_id = any(v_ids)),
      'payments', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.pos_payments p where p.transaction_id = any(v_ids)),
      'edits', (select coalesce(jsonb_agg(to_jsonb(e) order by e.edited_at), '[]'::jsonb) from public.pos_sale_edits e where e.transaction_id = v_txn.id),
      'transport_fees', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.expenses x where x.pos_transaction_item_id = any(v_item_ids))
    )
  );

  -- A therapist still on one of these massages goes back to the queue.
  update public.therapist_clock_sessions
  set status = 'available', active_item_id = null, current_room_id = null, current_bed_id = null
  where active_item_id = any(v_item_ids);

  -- Transport fees paid for these massages are removed with them.
  perform app.delete_item_expenses(v_item_ids);

  -- Deleting the stock movements puts the products back on the shelf.
  delete from public.inventory_adjustments
  where reference_type = 'pos_transaction_item' and reference_id = any(v_item_ids);

  for v_entry in
    select id from public.journal_entries where source_type in ('pos_sale', 'pos_refund') and source_id = any(v_ids)
  loop
    delete from public.journal_entry_lines where journal_entry_id = v_entry;
    delete from public.journal_entries where id = v_entry;
  end loop;

  delete from public.pos_sale_edits where item_id = any(v_item_ids) or transaction_id = any(v_ids);
  delete from public.pos_transactions where original_transaction_id = v_txn.id;
  delete from public.pos_transactions where id = v_txn.id;
end;
$$;

revoke all on function public.delete_pos_sale(uuid, text) from public, anon;
grant execute on function public.delete_pos_sale(uuid, text) to authenticated;
