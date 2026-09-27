-- Expense system for Thai operations:
--  * Thai payment types (cash, bank transfer, PromptPay, card, unpaid bill).
--  * An "Operating Expenses" account so uncategorised expenses stop landing
--    in Card Processing Fees.
--  * Common spa expense categories.
--  * delete_expense(): removes an expense together with its journal entry.

alter table public.expenses drop constraint if exists expenses_payment_method_check;
alter table public.expenses add constraint expenses_payment_method_check
  check (payment_method in ('cash', 'bank_transfer', 'promptpay', 'card', 'payable', 'check', 'ach'));

insert into public.accounts (org_id, code, name, type)
select o.id, '6300', 'Operating Expenses', 'expense'
from public.organizations o
where not exists (select 1 from public.accounts a where a.org_id = o.id and a.code = '6300');

-- Earlier expenses without a mapped account were debited to 6900; move them.
update public.journal_entry_lines l
set account_id = app.account_id(je.org_id, '6300')
from public.journal_entries je
where je.id = l.journal_entry_id
  and je.source_type = 'expense'
  and l.account_id = app.account_id(je.org_id, '6900');

insert into public.expense_categories (org_id, name)
select o.id, c.name
from public.organizations o
cross join (values
  ('Rent'), ('Electricity & water'), ('Laundry'), ('Oils & supplies'), ('Towels & linen'),
  ('Staff meals'), ('Repairs & maintenance'), ('Marketing'), ('Transport'), ('Internet & phone'), ('Other')
) as c(name)
where not exists (select 1 from public.expense_categories ec where ec.org_id = o.id and ec.name = c.name);

create or replace function app.post_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_expense_account_id uuid;
  v_unpaid boolean := new.payment_method in ('payable', 'check', 'ach');
begin
  if new.journal_entry_id is not null then
    return new;
  end if;

  select default_account_id into v_expense_account_id
  from public.expense_categories where id = new.category_id;

  if v_expense_account_id is null then
    v_expense_account_id := app.account_id(new.org_id, '6300');
  end if;

  insert into public.journal_entries (org_id, branch_id, entry_date, description, source_type, source_id, created_by_staff_id)
  values (new.org_id, new.branch_id, new.expense_date, coalesce(new.description, 'Expense'), 'expense', new.id, new.created_by_staff_id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit_cents, memo)
  values (v_entry_id, v_expense_account_id, new.branch_id, new.amount_cents + new.tax_cents, 'Expense recorded');

  -- Cash, transfers, PromptPay and card all leave the shop's money now (the
  -- POS books transfers and PromptPay to Cash too); an unpaid bill is A/P.
  insert into public.journal_entry_lines (journal_entry_id, account_id, branch_id, credit_cents, memo)
  values (
    v_entry_id,
    app.account_id(new.org_id, case when v_unpaid then '2000' else '1000' end),
    new.branch_id, new.amount_cents + new.tax_cents,
    case when v_unpaid then 'Accounts payable' else 'Paid (' || replace(new.payment_method, '_', ' ') || ')' end
  );

  update public.expenses set journal_entry_id = v_entry_id where id = new.id;
  return new;
end;
$$;

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense record;
begin
  select id, branch_id, journal_entry_id into v_expense from public.expenses where id = p_expense_id;
  if v_expense.id is null then
    raise exception 'Expense not found';
  end if;
  if not app.has_branch_role(v_expense.branch_id, array['owner', 'manager']::public.role_type[]) then
    raise exception 'Only an owner or manager can delete expenses';
  end if;

  delete from public.expenses where id = v_expense.id;
  if v_expense.journal_entry_id is not null then
    delete from public.journal_entries where id = v_expense.journal_entry_id;
  end if;
end;
$$;

revoke all on function public.delete_expense(uuid) from public, anon;
grant execute on function public.delete_expense(uuid) to authenticated;
