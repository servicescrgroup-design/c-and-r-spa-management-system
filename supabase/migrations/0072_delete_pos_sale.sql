-- Delete a bill from the POS Sales page, together with any refund made
-- against it. Its journal entries, commissions and stock movements go with
-- it, and a full copy is kept in audit_log so the deletion can be traced.
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
      'edits', (select coalesce(jsonb_agg(to_jsonb(e) order by e.edited_at), '[]'::jsonb) from public.pos_sale_edits e where e.transaction_id = v_txn.id)
    )
  );

  -- A therapist still on one of these massages goes back to the queue.
  update public.therapist_clock_sessions
  set status = 'available', active_item_id = null, current_room_id = null, current_bed_id = null
  where active_item_id = any(v_item_ids);

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
