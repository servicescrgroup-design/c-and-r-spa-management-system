-- Booking deposits, booked the standard way:
--  * Taken: money in (cash/transfer/card), owed to the guest -> 2150 Customer Deposits. Not revenue.
--  * Used at checkout: a 'deposit' payment line; the sale's revenue is recognised that day as usual.
--  * Kept (no-show): 2150 -> service revenue on the day it's kept.
--  * Refunded: 2150 -> back out of cash or card.

insert into public.accounts (org_id, code, name, type)
select o.id, '2150', 'Customer Deposits', 'liability'
from public.organizations o
where not exists (select 1 from public.accounts a where a.org_id = o.id and a.code = '2150');

alter table public.appointments
  add column if not exists deposit_drawer_session_id uuid references public.cash_drawer_sessions(id) on delete set null,
  add column if not exists deposit_settled text check (deposit_settled in ('applied', 'kept', 'refunded')),
  add column if not exists deposit_settled_at timestamptz,
  add column if not exists deposit_transaction_id uuid references public.pos_transactions(id) on delete set null,
  add column if not exists deposit_settle_drawer_session_id uuid references public.cash_drawer_sessions(id) on delete set null;

create index if not exists appointments_deposit_drawer_idx on public.appointments (deposit_drawer_session_id);
create index if not exists appointments_deposit_txn_idx on public.appointments (deposit_transaction_id);

-- Payment method -> account.
create or replace function app.payment_account_code(p_method text)
returns text language sql immutable as $$
  select case p_method
    when 'cash' then '1000' when 'bank_transfer' then '1000' when 'promptpay' then '1000'
    when 'card_manual' then '1010' when 'card_stripe' then '1010'
    when 'gift_card' then '2100' when 'store_credit' then '2110' when 'package_credit' then '2200'
    when 'deposit' then '2150'
  end
$$;

-- Sales and refunds: a deposit payment line posts against Customer Deposits.
do $patch$
declare
  fn text;
  def text;
  patched text;
begin
  foreach fn in array array['app.post_pos_transaction', 'app.post_pos_refund'] loop
    def := pg_get_functiondef(fn::regproc);
    patched := replace(def,
      E'        when ''package_credit'' then ''2200''\n      end)',
      E'        when ''package_credit'' then ''2200''\n        when ''deposit'' then ''2150''\n      end)');
    if length(patched) = length(def) then
      raise exception '%: payment account map not found', fn;
    end if;
    execute patched;
  end loop;

  -- Editing a bill can't change how much of it the deposit paid.
  def := pg_get_functiondef('public.edit_pos_sale_full'::regproc);
  patched := replace(def,
    E'    if (v_pay->>''method'') not in (''cash'', ''bank_transfer'', ''promptpay'', ''card_manual'') then\n      raise exception ''Use cash, bank transfer, PromptPay or card.'';\n    end if;\n  end loop;',
    E'    if (v_pay->>''method'') not in (''cash'', ''bank_transfer'', ''promptpay'', ''card_manual'', ''deposit'') then\n      raise exception ''Use cash, bank transfer, PromptPay or card.'';\n    end if;\n  end loop;\n  if (select coalesce(sum((x->>''amount_cents'')::int), 0) from jsonb_array_elements(p_payments) x where x->>''method'' = ''deposit'')\n     <> (select coalesce(sum(amount_cents), 0) from public.pos_payments where transaction_id = v_txn.id and method = ''deposit'') then\n    raise exception ''The deposit part of this bill can''''t change. Keep the deposit amount the same.'';\n  end if;');
  if length(patched) = length(def) then
    raise exception 'edit_pos_sale_full: payment check not found';
  end if;
  execute patched;
end
$patch$;

-- Deleting a bill that used a deposit frees the deposit again.
create or replace function app.release_deposit_on_sale_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.appointments
     set deposit_settled = null, deposit_settled_at = null, deposit_transaction_id = null,
         status = case when status = 'completed' then 'confirmed' else status end
   where deposit_transaction_id = old.id and deposit_settled = 'applied';
  return old;
end $$;
drop trigger if exists release_deposit_on_sale_delete on public.pos_transactions;
create trigger release_deposit_on_sale_delete before delete on public.pos_transactions
  for each row execute function app.release_deposit_on_sale_delete();

-- One journal entry per deposit event, source 'deposit' + appointment id.
create or replace function app.post_deposit_entry(p_appt public.appointments, p_kind text, p_date date, p_debit text, p_credit text, p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_entry uuid;
begin
  insert into public.journal_entries (org_id, branch_id, entry_date, description, source_type, source_id, created_by_staff_id)
  values (p_appt.org_id, p_appt.branch_id, p_date, p_kind, 'deposit', p_appt.id, app.current_staff_id())
  returning id into v_entry;
  insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
  values (v_entry, app.account_id(p_appt.org_id, p_debit), p_appt.branch_id, p_amount, p_kind);
  insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
  values (v_entry, app.account_id(p_appt.org_id, p_credit), p_appt.branch_id, p_amount, p_kind);
end $$;

create or replace function app.drop_deposit_entries(p_appt_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare v_entry uuid;
begin
  for v_entry in select id from public.journal_entries where source_type = 'deposit' and source_id = p_appt_id and description = p_kind loop
    delete from public.journal_entry_lines where journal_entry_id = v_entry;
    delete from public.journal_entries where id = v_entry;
  end loop;
end $$;

create or replace function app.can_run_front_desk(p_branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.is_owner() or app.has_branch_role(p_branch_id, array['owner','manager','front_desk']::public.role_type[])
$$;

/** Take (or correct) a booking's deposit. */
create or replace function public.take_appointment_deposit(
  p_appointment_id uuid, p_amount_cents integer, p_method public.pos_payment_method,
  p_paid_at timestamptz, p_note text, p_drawer_session_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_appointment_id for update;
  if a.id is null then raise exception 'Booking not found.'; end if;
  if not app.can_run_front_desk(a.branch_id) then raise exception 'Not allowed at this store.'; end if;
  if a.deposit_settled is not null then raise exception 'This deposit was already used, kept or refunded.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Enter a deposit above 0.'; end if;
  if p_method not in ('cash', 'bank_transfer', 'promptpay', 'card_manual') then raise exception 'Use cash, PromptPay / transfer or card.'; end if;

  update public.appointments
     set deposit_status = 'paid', deposit_amount_cents = p_amount_cents, deposit_method = p_method,
         deposit_paid_at = coalesce(p_paid_at, now()), deposit_received_by_staff_id = app.current_staff_id(),
         deposit_note = nullif(trim(coalesce(p_note, '')), ''), deposit_drawer_session_id = p_drawer_session_id
   where id = a.id
  returning * into a;

  perform app.drop_deposit_entries(a.id, 'Deposit received');
  perform app.post_deposit_entry(a, 'Deposit received', (a.deposit_paid_at at time zone 'Asia/Bangkok')::date,
    app.payment_account_code(p_method::text), '2150', p_amount_cents);
end $$;

/** Undo a deposit entered by mistake (only while it hasn't been used, kept or refunded). */
create or replace function public.remove_appointment_deposit(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_appointment_id for update;
  if a.id is null then raise exception 'Booking not found.'; end if;
  if not app.can_run_front_desk(a.branch_id) then raise exception 'Not allowed at this store.'; end if;
  if a.deposit_settled is not null then raise exception 'This deposit was already used, kept or refunded.'; end if;
  perform app.drop_deposit_entries(a.id, 'Deposit received');
  update public.appointments
     set deposit_status = 'not_required', deposit_amount_cents = null, deposit_method = null, deposit_paid_at = null,
         deposit_received_by_staff_id = null, deposit_note = null, deposit_drawer_session_id = null
   where id = a.id;
end $$;

/** No-show or cancellation: keep the deposit (becomes revenue today) or give it back. */
create or replace function public.settle_appointment_deposit(p_appointment_id uuid, p_outcome text, p_drawer_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_appointment_id for update;
  if a.id is null then raise exception 'Booking not found.'; end if;
  if not app.can_run_front_desk(a.branch_id) then raise exception 'Not allowed at this store.'; end if;
  if a.deposit_status <> 'paid' or coalesce(a.deposit_amount_cents, 0) <= 0 then raise exception 'There is no deposit on this booking.'; end if;
  if a.deposit_settled is not null then raise exception 'This deposit was already used, kept or refunded.'; end if;
  if p_outcome not in ('kept', 'refunded') then raise exception 'Choose keep or refund.'; end if;

  if p_outcome = 'kept' then
    perform app.post_deposit_entry(a, 'Deposit kept', (now() at time zone 'Asia/Bangkok')::date, '2150', '4000', a.deposit_amount_cents);
    update public.appointments
       set deposit_settled = 'kept', deposit_settled_at = now(), deposit_settle_drawer_session_id = null,
           status = case when status in ('cancelled', 'no_show') then status else 'no_show' end
     where id = a.id;
  else
    perform app.post_deposit_entry(a, 'Deposit refunded', (now() at time zone 'Asia/Bangkok')::date,
      '2150', app.payment_account_code(a.deposit_method::text), a.deposit_amount_cents);
    update public.appointments
       set deposit_settled = 'refunded', deposit_settled_at = now(), deposit_status = 'refunded',
           deposit_settle_drawer_session_id = p_drawer_session_id,
           status = case when status in ('completed', 'no_show') then status else 'cancelled' end
     where id = a.id;
  end if;
end $$;

/** Mark a booking's deposit as used by a sale that has a matching 'deposit' payment line. */
create or replace function public.apply_appointment_deposit(p_appointment_id uuid, p_transaction_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; v_paid integer;
begin
  select * into a from public.appointments where id = p_appointment_id for update;
  if a.id is null then raise exception 'Booking not found.'; end if;
  if not app.can_run_front_desk(a.branch_id) then raise exception 'Not allowed at this store.'; end if;
  if a.deposit_status <> 'paid' or a.deposit_settled is not null then raise exception 'This deposit can''t be used.'; end if;
  select coalesce(sum(amount_cents), 0) into v_paid from public.pos_payments where transaction_id = p_transaction_id and method = 'deposit';
  if v_paid <> a.deposit_amount_cents then raise exception 'The sale''s deposit payment doesn''t match the booking deposit.'; end if;
  update public.appointments
     set deposit_settled = 'applied', deposit_settled_at = now(), deposit_transaction_id = p_transaction_id,
         status = case when status in ('cancelled', 'no_show') then status else 'completed' end
   where id = a.id;
end $$;

revoke all on function public.take_appointment_deposit(uuid, integer, public.pos_payment_method, timestamptz, text, uuid) from public, anon;
revoke all on function public.remove_appointment_deposit(uuid) from public, anon;
revoke all on function public.settle_appointment_deposit(uuid, text, uuid) from public, anon;
revoke all on function public.apply_appointment_deposit(uuid, uuid) from public, anon;
grant execute on function public.take_appointment_deposit(uuid, integer, public.pos_payment_method, timestamptz, text, uuid) to authenticated;
grant execute on function public.remove_appointment_deposit(uuid) to authenticated;
grant execute on function public.settle_appointment_deposit(uuid, text, uuid) to authenticated;
grant execute on function public.apply_appointment_deposit(uuid, uuid) to authenticated;

-- Deposits already taken before this change: put them on the books as held for the guest.
do $backfill$
declare a public.appointments;
begin
  for a in select * from public.appointments
           where deposit_status = 'paid' and coalesce(deposit_amount_cents, 0) > 0 and deposit_method is not null
             and not exists (select 1 from public.journal_entries j where j.source_type = 'deposit' and j.source_id = appointments.id)
  loop
    perform app.post_deposit_entry(a, 'Deposit received', (coalesce(a.deposit_paid_at, a.created_at) at time zone 'Asia/Bangkok')::date,
      coalesce(app.payment_account_code(a.deposit_method::text), '1000'), '2150', a.deposit_amount_cents);
  end loop;
end
$backfill$;
