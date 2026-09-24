-- Double-entry accounting core: chart of accounts, journal, reports.
create type public.account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');
create type public.journal_source_type as enum ('pos_sale', 'pos_refund', 'expense', 'payroll', 'manual', 'adjustment');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  type public.account_type not null,
  subtype text,
  parent_account_id uuid references public.accounts(id) on delete set null,
  is_active boolean not null default true,
  unique (org_id, code)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  entry_date date not null default current_date,
  description text,
  source_type public.journal_source_type not null,
  source_id uuid,
  created_by_staff_id uuid references public.staff(id) on delete set null,
  posted_at timestamptz not null default now(),
  is_reversal boolean not null default false,
  reversed_entry_id uuid references public.journal_entries(id) on delete set null
);

create index journal_entries_org_date_idx on public.journal_entries(org_id, entry_date);
create index journal_entries_source_idx on public.journal_entries(source_type, source_id);

create table public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  debit_cents integer not null default 0,
  credit_cents integer not null default 0,
  memo text,
  check (debit_cents >= 0 and credit_cents >= 0)
);

create index journal_entry_lines_entry_idx on public.journal_entry_lines(journal_entry_id);
create index journal_entry_lines_account_idx on public.journal_entry_lines(account_id);

-- Enforce debit = credit per journal entry (deferred so both inserts in a
-- posting function can land before the check runs).
create function app.check_journal_entry_balanced()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debits integer;
  v_credits integer;
  v_entry_id uuid := coalesce(new.journal_entry_id, old.journal_entry_id);
begin
  select coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0)
  into v_debits, v_credits
  from public.journal_entry_lines
  where journal_entry_id = v_entry_id;

  if v_debits != v_credits then
    raise exception 'Journal entry % is not balanced: debits % != credits %', v_entry_id, v_debits, v_credits;
  end if;

  return null;
end;
$$;

create constraint trigger journal_entry_lines_balanced
  after insert or update or delete on public.journal_entry_lines
  deferrable initially deferred
  for each row execute function app.check_journal_entry_balanced();

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  unique (org_id, period_start, period_end)
);

-- ---------------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------------

create view public.v_trial_balance with (security_invoker = true) as
select
  a.org_id,
  a.id as account_id,
  a.code,
  a.name,
  a.type,
  coalesce(sum(l.debit_cents), 0) as total_debits_cents,
  coalesce(sum(l.credit_cents), 0) as total_credits_cents,
  coalesce(sum(l.debit_cents), 0) - coalesce(sum(l.credit_cents), 0) as balance_cents
from public.accounts a
left join public.journal_entry_lines l on l.account_id = a.id
group by a.org_id, a.id, a.code, a.name, a.type;

create view public.v_profit_and_loss with (security_invoker = true) as
select
  a.org_id,
  a.type,
  a.code,
  a.name,
  je.entry_date,
  coalesce(sum(l.credit_cents), 0) - coalesce(sum(l.debit_cents), 0) as net_cents
from public.accounts a
join public.journal_entry_lines l on l.account_id = a.id
join public.journal_entries je on je.id = l.journal_entry_id
where a.type in ('revenue', 'expense')
group by a.org_id, a.type, a.code, a.name, je.entry_date;

create view public.v_balance_sheet with (security_invoker = true) as
select
  a.org_id,
  a.type,
  a.code,
  a.name,
  coalesce(sum(l.debit_cents), 0) - coalesce(sum(l.credit_cents), 0) as balance_cents
from public.accounts a
left join public.journal_entry_lines l on l.account_id = a.id
where a.type in ('asset', 'liability', 'equity')
group by a.org_id, a.type, a.code, a.name;

-- ---------------------------------------------------------------------------
-- Seed chart of accounts for every existing organization.
-- ---------------------------------------------------------------------------

insert into public.accounts (org_id, code, name, type)
select o.id, v.code, v.name, v.type::public.account_type
from public.organizations o
cross join (values
  ('1000', 'Cash', 'asset'),
  ('1010', 'Card Clearing', 'asset'),
  ('1300', 'Inventory Asset', 'asset'),
  ('2000', 'Accounts Payable', 'liability'),
  ('2100', 'Gift Card Liability', 'liability'),
  ('2110', 'Store Credit Liability', 'liability'),
  ('2200', 'Deferred Revenue - Packages', 'liability'),
  ('2300', 'Sales Tax Payable', 'liability'),
  ('2400', 'Commission Payable', 'liability'),
  ('2410', 'Tips Payable', 'liability'),
  ('3000', 'Owner''s Equity', 'equity'),
  ('4000', 'Service Revenue', 'revenue'),
  ('4100', 'Retail Product Revenue', 'revenue'),
  ('4200', 'Package & Membership Revenue', 'revenue'),
  ('4900', 'Discounts & Refunds', 'revenue'),
  ('5000', 'Cost of Goods Sold', 'expense'),
  ('6000', 'Commission Expense', 'expense'),
  ('6100', 'Payroll Wages Expense', 'expense'),
  ('6200', 'Payroll Tax Expense', 'expense'),
  ('6900', 'Card Processing Fees', 'expense')
) as v(code, name, type);

-- ---------------------------------------------------------------------------
-- RLS: accounting is owner/manager only, except staff can be granted
-- read access to their own payroll later (migration 0009).
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;
alter table public.accounting_periods enable row level security;

create policy "Owners and managers manage accounts" on public.accounts
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Owners and managers view journal entries" on public.journal_entries
  for select to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Owners and managers view journal lines" on public.journal_entry_lines
  for select to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

create policy "Owners and managers manage accounting periods" on public.accounting_periods
  for all to authenticated
  using (app.is_owner())
  with check (app.is_owner());
