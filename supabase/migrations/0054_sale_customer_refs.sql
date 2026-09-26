-- Walk-in sales no longer need a customer. Every sale gets a reference built
-- from the store code and the Chiang Mai date, e.g. CR1-27-09-26-01 for the
-- first sale at store CR1 on 27 Sep 2026. A name can be typed at checkout or
-- added later, and a real customer record can be linked afterwards.
-- Also stops staff accounts from being created as customers.

-- 1. Store codes -------------------------------------------------------------
alter table public.branches add column if not exists code text;

update public.branches set code = 'CR1' where slug = 'c-and-r-sunday-walking-street' and code is null;
update public.branches set code = 'CR2' where slug = 'c-and-r-chiang-mai-gate' and code is null;

-- Any other existing branch: next free CRn.
do $$
declare
  v_branch record;
  v_n integer;
begin
  for v_branch in select id from public.branches where code is null order by created_at loop
    select coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::integer), 0) + 1 into v_n from public.branches;
    update public.branches set code = 'CR' || v_n where id = v_branch.id;
  end loop;
end;
$$;

alter table public.branches alter column code set not null;
alter table public.branches add constraint branches_code_unique unique (code);

create or replace function app.assign_branch_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    select 'CR' || (coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::integer), 0) + 1)
      into new.code from public.branches;
  end if;
  new.code := upper(btrim(new.code));
  return new;
end;
$$;

drop trigger if exists branches_assign_code on public.branches;
create trigger branches_assign_code
  before insert or update of code on public.branches
  for each row execute function app.assign_branch_code();

-- 2. Sale references ---------------------------------------------------------
alter table public.pos_transactions
  add column if not exists customer_ref text,
  add column if not exists customer_name text;

create table if not exists public.sale_daily_counters (
  branch_id uuid not null references public.branches(id) on delete cascade,
  sale_date date not null,
  last_seq integer not null default 0,
  primary key (branch_id, sale_date)
);
alter table public.sale_daily_counters enable row level security;
-- No policies: only the security-definer function below touches it.

create or replace function app.next_customer_ref(p_branch_id uuid, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := (p_at at time zone 'Asia/Bangkok')::date;
  v_seq integer;
  v_code text;
begin
  insert into public.sale_daily_counters (branch_id, sale_date, last_seq)
  values (p_branch_id, v_date, 1)
  on conflict (branch_id, sale_date) do update set last_seq = public.sale_daily_counters.last_seq + 1
  returning last_seq into v_seq;

  select code into v_code from public.branches where id = p_branch_id;
  return coalesce(v_code, 'CR') || '-' || to_char(v_date, 'DD-MM-YY') || '-' || lpad(v_seq::text, 2, '0');
end;
$$;

create or replace function app.assign_customer_ref()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_ref is null and new.original_transaction_id is null then
    new.customer_ref := app.next_customer_ref(new.branch_id, coalesce(new.created_at, now()));
  end if;
  if new.customer_name is not null then
    new.customer_name := nullif(btrim(new.customer_name), '');
  end if;
  return new;
end;
$$;

drop trigger if exists pos_transactions_customer_ref on public.pos_transactions;
create trigger pos_transactions_customer_ref
  before insert on public.pos_transactions
  for each row execute function app.assign_customer_ref();

-- Backfill existing sales in the order they happened.
do $$
declare
  v_txn record;
begin
  for v_txn in
    select id, branch_id, created_at from public.pos_transactions
    where customer_ref is null and original_transaction_id is null
    order by created_at
  loop
    update public.pos_transactions
      set customer_ref = app.next_customer_ref(v_txn.branch_id, v_txn.created_at)
      where id = v_txn.id;
  end loop;
end;
$$;

create unique index if not exists pos_transactions_customer_ref_key
  on public.pos_transactions (customer_ref) where customer_ref is not null;

revoke all on function app.next_customer_ref(uuid, timestamptz) from public, anon, authenticated;
revoke all on function app.assign_customer_ref() from public, anon, authenticated;
revoke all on function app.assign_branch_code() from public, anon, authenticated;

-- 3. Staff are not customers -------------------------------------------------
-- Staff logins made in the back office went through the customer sign-up
-- trigger. Remove those auto-created customer rows (only when unused), and
-- drop the matching row whenever a staff record is created from now on.
delete from public.customers c
where (
    exists (select 1 from public.staff s where s.id = c.auth_user_id)
    or c.email ilike '%@crthaimassage.staff'
    or (c.email ilike '%@crthaimassage.local' and coalesce(c.first_name, '') = '' and coalesce(c.last_name, '') = '')
  )
  and not exists (select 1 from public.pos_transactions t where t.customer_id = c.id)
  and not exists (select 1 from public.appointments a where a.customer_id = c.id)
  and not exists (select 1 from public.customer_packages p where p.customer_id = c.id)
  and not exists (select 1 from public.gift_cards g where g.issued_to_customer_id = c.id)
  and not exists (select 1 from public.store_credits sc where sc.customer_id = c.id and sc.balance_cents <> 0);

create or replace function app.remove_staff_customer_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.customers c
  where c.auth_user_id = new.id
    and not exists (select 1 from public.pos_transactions t where t.customer_id = c.id)
    and not exists (select 1 from public.appointments a where a.customer_id = c.id);
  return new;
end;
$$;

drop trigger if exists staff_remove_customer_row on public.staff;
create trigger staff_remove_customer_row
  after insert on public.staff
  for each row execute function app.remove_staff_customer_row();

revoke all on function app.remove_staff_customer_row() from public, anon, authenticated;
