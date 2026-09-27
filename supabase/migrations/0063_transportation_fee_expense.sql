-- Transportation fees are a variable business cost, not therapist pay: they
-- are recorded as expenses (category "Transportation fee"), paid in cash from
-- the drawer that is open, and the drawer's expected cash accounts for them.
alter table public.expenses
  add column if not exists drawer_session_id uuid references public.cash_drawer_sessions(id) on delete set null,
  add column if not exists staff_id uuid references public.staff(id) on delete set null;

create index if not exists expenses_drawer_session_idx on public.expenses (drawer_session_id);
create index if not exists expenses_staff_idx on public.expenses (staff_id);

insert into public.expense_categories (org_id, name)
select o.id, 'Transportation fee'
from public.organizations o
where not exists (select 1 from public.expense_categories ec where ec.org_id = o.id and ec.name = 'Transportation fee');

-- Front desk can't write expenses directly, so the POS goes through this.
create or replace function public.record_transportation_fee(p_branch_id uuid, p_staff_id uuid, p_amount_cents integer)
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
  v_id uuid;
begin
  if not app.has_branch_role(p_branch_id, array['owner', 'manager', 'front_desk']::public.role_type[]) then
    raise exception 'Not authorized to add fees at this branch';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
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
                               created_by_staff_id, drawer_session_id, staff_id,
                               expense_date)
  values (v_org, p_branch_id, v_category, p_amount_cents, 'cash', 'Transportation fee · ' || coalesce(v_name, 'therapist'),
          auth.uid(), v_drawer, p_staff_id,
          (now() at time zone 'Asia/Bangkok')::date)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_transportation_fee(uuid, uuid, integer) from public, anon;
grant execute on function public.record_transportation_fee(uuid, uuid, integer) to authenticated;

-- Cash paid out of a drawer during its shift (e.g. transportation fees).
create or replace function public.drawer_cash_paid_out(p_drawer_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(e.amount_cents + e.tax_cents), 0)::integer
  from public.expenses e
  join public.cash_drawer_sessions ds on ds.id = e.drawer_session_id
  join public.pos_registers r on r.id = ds.register_id
  where e.drawer_session_id = p_drawer_session_id
    and e.payment_method = 'cash'
    and app.has_branch_role(r.branch_id, array['owner', 'manager', 'front_desk']::public.role_type[]);
$$;

revoke all on function public.drawer_cash_paid_out(uuid) from public, anon;
grant execute on function public.drawer_cash_paid_out(uuid) to authenticated;

-- Move fees already added to payroll over to expenses.
insert into public.expenses (org_id, branch_id, category_id, amount_cents, payment_method, description,
                             created_by_staff_id, staff_id, expense_date)
select b.org_id, pa.branch_id, ec.id, pa.amount_cents, 'cash',
       'Transportation fee · ' || coalesce(nullif(tp.nickname, ''), s.first_name),
       coalesce(pa.created_by_staff_id, pa.staff_id), pa.staff_id, pa.work_date
from public.payroll_adjustments pa
join public.branches b on b.id = pa.branch_id
join public.expense_categories ec on ec.org_id = b.org_id and ec.name = 'Transportation fee'
join public.staff s on s.id = pa.staff_id
left join public.therapist_profiles tp on tp.staff_id = pa.staff_id
where pa.reason = 'Transportation fee' and pa.type = 'bonus';

delete from public.payroll_adjustments where reason = 'Transportation fee' and type = 'bonus';
