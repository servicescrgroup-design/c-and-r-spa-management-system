-- Categories and vendors can be added from the expense form's dropdowns, by the owner,
-- managers or front desk. POS expenses can name a vendor.

create policy "Staff view vendors" on public.vendors
  for select to authenticated
  using (app.current_staff_id() is not null);

create or replace function app.is_desk_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select app.is_owner() or exists (
    select 1 from public.staff_branch_roles
    where staff_id = auth.uid() and role in ('owner', 'manager', 'front_desk')
  )
$$;

/** Returns the category with this name, creating it if it's new. */
create or replace function public.add_expense_category(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_name text := trim(coalesce(p_name, ''));
begin
  if not app.is_desk_staff() then raise exception 'Not allowed.'; end if;
  if v_name = '' then raise exception 'Enter a category name.'; end if;
  select id into v_org from public.organizations limit 1;
  select id into v_id from public.expense_categories where org_id = v_org and lower(name) = lower(v_name) limit 1;
  if v_id is null then
    insert into public.expense_categories (org_id, name) values (v_org, v_name) returning id into v_id;
  end if;
  return v_id;
end $$;

/** Returns the vendor with this name, creating it if it's new. */
create or replace function public.add_vendor(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_name text := trim(coalesce(p_name, ''));
begin
  if not app.is_desk_staff() then raise exception 'Not allowed.'; end if;
  if v_name = '' then raise exception 'Enter a vendor name.'; end if;
  select id into v_org from public.organizations limit 1;
  select id into v_id from public.vendors where org_id = v_org and lower(name) = lower(v_name) limit 1;
  if v_id is null then
    insert into public.vendors (org_id, name) values (v_org, v_name) returning id into v_id;
  end if;
  return v_id;
end $$;

-- POS expenses can name a vendor.
drop function if exists public.record_pos_expense(uuid, uuid, integer, text, text, uuid);
create or replace function public.record_pos_expense(
  p_branch_id uuid,
  p_category_id uuid,
  p_amount_cents integer,
  p_method text,
  p_description text default null,
  p_drawer_session_id uuid default null,
  p_vendor_id uuid default null
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
  if p_vendor_id is not null and not exists (select 1 from public.vendors where id = p_vendor_id and org_id = v_org) then
    raise exception 'Choose a vendor from the list.';
  end if;

  if p_method = 'cash' then
    select ds.id into v_drawer
    from public.cash_drawer_sessions ds join public.pos_registers r on r.id = ds.register_id
    where ds.id = p_drawer_session_id and ds.status = 'open' and r.branch_id = p_branch_id;
    if v_drawer is null then
      raise exception 'Open or join a drawer at this store to pay cash out of it.';
    end if;
  end if;

  insert into public.expenses (org_id, branch_id, category_id, vendor_id, amount_cents, payment_method, description,
                               created_by_staff_id, drawer_session_id, expense_date)
  values (v_org, p_branch_id, p_category_id, p_vendor_id, p_amount_cents, p_method, nullif(trim(coalesce(p_description, '')), ''),
          auth.uid(), v_drawer, (now() at time zone 'Asia/Bangkok')::date)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.record_pos_expense(uuid, uuid, integer, text, text, uuid, uuid) from public, anon;
revoke all on function public.add_expense_category(text) from public, anon;
revoke all on function public.add_vendor(text) from public, anon;
grant execute on function public.record_pos_expense(uuid, uuid, integer, text, text, uuid, uuid) to authenticated;
grant execute on function public.add_expense_category(text) to authenticated;
grant execute on function public.add_vendor(text) to authenticated;
