-- Front desk can record an expense from the POS (cash out of their drawer, or paid another way).

create policy "Staff view expense categories" on public.expense_categories
  for select to authenticated
  using (app.current_staff_id() is not null);

create policy "Front desk view expenses they entered" on public.expenses
  for select to authenticated
  using (created_by_staff_id = auth.uid());

create or replace function public.record_pos_expense(
  p_branch_id uuid,
  p_category_id uuid,
  p_amount_cents integer,
  p_method text,
  p_description text default null,
  p_drawer_session_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_id uuid;
  v_drawer uuid;
begin
  if not app.can_run_front_desk(p_branch_id) then
    raise exception 'Not allowed to record expenses at this store.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount above 0.';
  end if;
  if p_method not in ('cash', 'bank_transfer', 'promptpay', 'card') then
    raise exception 'Choose how it was paid.';
  end if;
  select org_id into v_org from public.branches where id = p_branch_id;
  if not exists (select 1 from public.expense_categories where id = p_category_id and org_id = v_org) then
    raise exception 'Choose a category.';
  end if;

  -- Cash comes out of an open drawer at this store.
  if p_method = 'cash' then
    select ds.id into v_drawer
    from public.cash_drawer_sessions ds join public.pos_registers r on r.id = ds.register_id
    where ds.id = p_drawer_session_id and ds.status = 'open' and r.branch_id = p_branch_id;
    if v_drawer is null then
      raise exception 'Open or join a drawer at this store to pay cash out of it.';
    end if;
  end if;

  insert into public.expenses (org_id, branch_id, category_id, amount_cents, payment_method, description,
                               created_by_staff_id, drawer_session_id, expense_date)
  values (v_org, p_branch_id, p_category_id, p_amount_cents, p_method, nullif(trim(coalesce(p_description, '')), ''),
          auth.uid(), v_drawer, (now() at time zone 'Asia/Bangkok')::date)
  returning id into v_id;
  return v_id;
end $$;

-- Undo your own expense entered by mistake: same day, and its drawer (if any) still open.
create or replace function public.remove_pos_expense(p_expense_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_expense_id;
  if e.id is null then raise exception 'Expense not found.'; end if;
  if not (app.is_owner() or app.has_branch_role(e.branch_id, array['manager']::public.role_type[])) then
    if e.created_by_staff_id is distinct from auth.uid() then
      raise exception 'You can only remove expenses you entered.';
    end if;
    if e.expense_date <> (now() at time zone 'Asia/Bangkok')::date then
      raise exception 'Only today''s expenses can be removed here. Ask the owner.';
    end if;
    if e.drawer_session_id is not null and not exists (
      select 1 from public.cash_drawer_sessions where id = e.drawer_session_id and status = 'open'
    ) then
      raise exception 'That drawer is closed. Ask the owner.';
    end if;
  end if;
  delete from public.expenses where id = e.id;
  if e.journal_entry_id is not null then
    delete from public.journal_entries where id = e.journal_entry_id;
  end if;
end $$;

revoke all on function public.record_pos_expense(uuid, uuid, integer, text, text, uuid) from public, anon;
revoke all on function public.remove_pos_expense(uuid) from public, anon;
grant execute on function public.record_pos_expense(uuid, uuid, integer, text, text, uuid) to authenticated;
grant execute on function public.remove_pos_expense(uuid) to authenticated;
