-- Expenses, vendors, commissions, payroll, and the posting-rule triggers
-- that turn POS sales/refunds/expenses/payroll into balanced journal entries.

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  default_account_id uuid references public.accounts(id) on delete set null
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  amount_cents integer not null,
  tax_cents integer not null default 0,
  expense_date date not null default current_date,
  payment_method text not null check (payment_method in ('cash', 'card', 'check', 'ach')),
  description text,
  receipt_url text,
  status text not null default 'paid' check (status in ('pending', 'approved', 'paid')),
  created_by_staff_id uuid not null references public.staff(id) on delete restrict,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create index expenses_branch_idx on public.expenses(branch_id, expense_date);

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  role public.role_type,
  service_id uuid references public.services(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  rate_type text not null check (rate_type in ('percent', 'fixed')),
  rate_value numeric not null,
  priority integer not null default 0
);

create table public.staff_commissions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  pos_transaction_item_id uuid not null references public.pos_transaction_items(id) on delete cascade,
  rule_id uuid references public.commission_rules(id) on delete set null,
  base_amount_cents integer not null,
  commission_amount_cents integer not null,
  created_at timestamptz not null default now()
);

create index staff_commissions_staff_idx on public.staff_commissions(staff_id);

create table public.tips (
  id uuid primary key default gen_random_uuid(),
  pos_transaction_id uuid not null references public.pos_transactions(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  amount_cents integer not null,
  payout_method text not null default 'payroll' check (payout_method in ('cash', 'payroll')),
  created_at timestamptz not null default now()
);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'paid'))
);

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  base_pay_cents integer not null default 0,
  commission_cents integer not null default 0,
  tips_cents integer not null default 0,
  deductions_cents integer not null default 0,
  gross_pay_cents integer not null default 0,
  net_pay_cents integer,
  journal_entry_id uuid references public.journal_entries(id) on delete set null
);

create index payroll_entries_period_idx on public.payroll_entries(payroll_period_id);

-- ---------------------------------------------------------------------------
-- Helper: look up a chart-of-accounts id by org + code.
-- ---------------------------------------------------------------------------

create function app.account_id(p_org_id uuid, p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.accounts where org_id = p_org_id and code = p_code;
$$;

-- ---------------------------------------------------------------------------
-- Commission resolution: most-specific match wins
-- (service+branch+role > service > role > org-wide default).
-- ---------------------------------------------------------------------------

create function app.resolve_commission_rate(
  p_org_id uuid, p_branch_id uuid, p_role public.role_type,
  p_service_id uuid, p_product_id uuid
)
returns public.commission_rules
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.commission_rules
  where org_id = p_org_id
    and (branch_id is null or branch_id = p_branch_id)
    and (role is null or role = p_role)
    and (service_id is null or service_id = p_service_id)
    and (product_id is null or product_id = p_product_id)
  order by
    (branch_id is not null)::int
    + (role is not null)::int
    + (service_id is not null)::int
    + (product_id is not null)::int desc,
    priority desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Item-level triggers: derive product COGS and inventory movement at sale.
-- ---------------------------------------------------------------------------

create function app.before_pos_item_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.item_type = 'product' and new.cogs_cents is null then
    select cost_cents * new.quantity into new.cogs_cents
    from public.products where id = new.reference_id;
  end if;
  return new;
end;
$$;

create trigger before_pos_transaction_item_insert
  before insert on public.pos_transaction_items
  for each row execute function app.before_pos_item_insert();

create function app.after_pos_item_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_track_inventory boolean;
begin
  if new.item_type = 'product' then
    select branch_id into v_branch_id from public.pos_transactions where id = new.transaction_id;
    select track_inventory into v_track_inventory from public.products where id = new.reference_id;

    if v_track_inventory then
      insert into public.inventory_adjustments (branch_id, product_id, quantity_delta, reason, reference_type, reference_id)
      values (v_branch_id, new.reference_id, -new.quantity, 'sale', 'pos_transaction_item', new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger after_pos_transaction_item_insert
  after insert on public.pos_transaction_items
  for each row execute function app.after_pos_item_insert();

-- ---------------------------------------------------------------------------
-- POS sale posting: builds one balanced journal entry per completed
-- transaction from its payments (debits) against revenue/tax (credits),
-- plus COGS/inventory and accrued commission sub-entries.
-- ---------------------------------------------------------------------------

-- This is a callable function, not a trigger: a POS sale's journal entry
-- depends on its pos_transaction_items and pos_payments child rows, which
-- are inserted in follow-up statements after the pos_transactions header
-- row (an AFTER INSERT trigger on the header alone would fire too early,
-- before those child rows exist, and never re-run once the dedupe check
-- below sees a journal entry for that transaction). The POS checkout
-- server action calls this explicitly once the transaction, its items, and
-- its payments have all been written.
create function app.post_pos_transaction(p_transaction_id uuid)
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

  select coalesce(sum(cogs_cents), 0) into v_cogs_total
  from public.pos_transaction_items where transaction_id = new.id and item_type = 'product';

  if v_cogs_total > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
    values (v_entry_id, app.account_id(new.org_id, '5000'), new.branch_id, v_cogs_total, 'Cost of goods sold');
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
    values (v_entry_id, app.account_id(new.org_id, '1300'), new.branch_id, v_cogs_total, 'Inventory reduction');
  end if;

  -- Accrue commission per line item that has an assigned staff member.
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

  -- Tips are already included in the tender debited above (cash/card
  -- payments cover subtotal + tax + tip); the only new entry needed is the
  -- credit that holds that portion as a payable until paid out to staff.
  if new.tip_cents > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
    values (v_entry_id, app.account_id(new.org_id, '2410'), new.branch_id, new.tip_cents, 'Tips payable');
  end if;

  return;
end;
$$;

grant execute on function app.post_pos_transaction(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Expense posting: debit the category's mapped account, credit cash or A/P.
-- ---------------------------------------------------------------------------

create function app.post_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_expense_account_id uuid;
begin
  if new.journal_entry_id is not null then
    return new;
  end if;

  select default_account_id into v_expense_account_id
  from public.expense_categories where id = new.category_id;

  if v_expense_account_id is null then
    v_expense_account_id := app.account_id(new.org_id, '6900');
  end if;

  insert into public.journal_entries (org_id, branch_id, entry_date, description, source_type, source_id, created_by_staff_id)
  values (new.org_id, new.branch_id, new.expense_date, coalesce(new.description, 'Expense'), 'expense', new.id, new.created_by_staff_id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
  values (v_entry_id, v_expense_account_id, new.branch_id, new.amount_cents + new.tax_cents, 'Expense recorded');

  insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
  values (
    v_entry_id,
    app.account_id(new.org_id, case when new.payment_method = 'cash' then '1000' else '2000' end),
    new.branch_id, new.amount_cents + new.tax_cents,
    case when new.payment_method = 'cash' then 'Paid from cash' else 'Accounts payable' end
  );

  update public.expenses set journal_entry_id = v_entry_id where id = new.id;
  return new;
end;
$$;

create trigger on_expense_posted
  after insert on public.expenses
  for each row execute function app.post_expense();

-- ---------------------------------------------------------------------------
-- Payroll posting: debit wages/commission expense, credit cash for net pay,
-- credit tips payable if tips are paid out via payroll rather than cash.
-- ---------------------------------------------------------------------------

create function app.post_payroll_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_entry_id uuid;
begin
  if new.journal_entry_id is not null or new.net_pay_cents is null then
    return new;
  end if;

  select org_id into v_org_id from public.payroll_periods where id = new.payroll_period_id;

  insert into public.journal_entries (org_id, branch_id, entry_date, description, source_type, source_id)
  values (v_org_id, new.branch_id, current_date, 'Payroll', 'payroll', new.id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
  values (v_entry_id, app.account_id(v_org_id, '6100'), new.branch_id, new.base_pay_cents, 'Base pay');

  if new.commission_cents > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
    values (v_entry_id, app.account_id(v_org_id, '2400'), new.branch_id, new.commission_cents, 'Commission payable settled');
  end if;

  if new.tips_cents > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
    values (v_entry_id, app.account_id(v_org_id, '2410'), new.branch_id, new.tips_cents, 'Tips payable settled');
  end if;

  insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
  values (v_entry_id, app.account_id(v_org_id, '1000'), new.branch_id, new.net_pay_cents, 'Net pay disbursed');

  update public.payroll_entries set journal_entry_id = v_entry_id where id = new.id;
  return new;
end;
$$;

create trigger on_payroll_entry_posted
  after insert or update on public.payroll_entries
  for each row execute function app.post_payroll_entry();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.vendors enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.commission_rules enable row level security;
alter table public.staff_commissions enable row level security;
alter table public.tips enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_entries enable row level security;

create policy "Owners and managers manage vendors" on public.vendors
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Owners and managers manage expense categories" on public.expense_categories
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Owners and managers manage expenses" on public.expenses
  for all to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Owners and managers manage commission rules" on public.commission_rules
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Staff view their own commissions" on public.staff_commissions
  for select to authenticated
  using (staff_id = auth.uid() or app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Staff view their own tips" on public.tips
  for select to authenticated
  using (staff_id = auth.uid() or app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "POS staff record tips in their branches" on public.tips
  for insert to authenticated
  with check (exists (
    select 1 from public.pos_transactions t
    where t.id = tips.pos_transaction_id
      and t.branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ));

create policy "Owners and managers manage payroll periods" on public.payroll_periods
  for all to authenticated
  using (app.is_owner())
  with check (app.is_owner());

create policy "Staff view their own payroll entries" on public.payroll_entries
  for select to authenticated
  using (staff_id = auth.uid() or app.is_owner());

create policy "Owners manage payroll entries" on public.payroll_entries
  for all to authenticated
  using (app.is_owner())
  with check (app.is_owner());
