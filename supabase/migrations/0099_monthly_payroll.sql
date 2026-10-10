-- Monthly pay sheet, one period from the 26th to the 25th: base salary, days
-- worked and missed, overtime, bonus, deductions, the เงินประกัน instalment,
-- net pay and whether it has been paid, per staff member. Past months can be
-- imported from a CSV. Deposit instalments and refunds on a pay line are
-- mirrored into the deposit ledger, which stays the running balance.

-- Pay settings per staff member (what the sheet prefills).
alter table public.staff
  add column if not exists monthly_salary_cents integer,
  add column if not exists daily_rate_cents integer,
  add column if not exists ot_rate_cents integer,
  add column if not exists deposit_monthly_cents integer not null default 300000;

create table public.monthly_pay_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default app.current_org_id(),
  period_start date not null,
  period_end date not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, period_start),
  check (period_end > period_start)
);

create table public.monthly_pay_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default app.current_org_id(),
  period_id uuid not null references public.monthly_pay_periods(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  pay_basis text not null default 'monthly' check (pay_basis in ('monthly', 'daily')),
  base_salary_cents integer not null default 0,
  days_worked numeric(5,1) not null default 0,
  days_missed numeric(5,1) not null default 0,
  ot_hours numeric(6,2) not null default 0,
  ot_cents integer not null default 0,
  bonus_cents integer not null default 0,
  deductions_cents integer not null default 0,
  deposit_cents integer not null default 0,
  deposit_refund_cents integer not null default 0,
  net_pay_cents integer generated always as
    (base_salary_cents + ot_cents + bonus_cents - deductions_cents - deposit_cents + deposit_refund_cents) stored,
  status text not null default 'draft' check (status in ('draft', 'unpaid', 'paid', 'on_hold')),
  paid_on date,
  paid_method text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, staff_id)
);
create index monthly_pay_lines_staff_idx on public.monthly_pay_lines (staff_id);
create index monthly_pay_periods_org_start_idx on public.monthly_pay_periods (org_id, period_start);

-- Business fence and owner access, the same shape as every other table.
create trigger aa_fill_org_id before insert on public.monthly_pay_periods
  for each row execute function app.fill_org_id();
create trigger aa_fill_org_id before insert on public.monthly_pay_lines
  for each row execute function app.fill_org_id('monthly_pay_periods', 'period_id');

alter table public.monthly_pay_periods enable row level security;
alter table public.monthly_pay_lines enable row level security;

create policy "Business fence" on public.monthly_pay_periods as restrictive for all to authenticated
  using ((select app.my_org_ids()) @> array[org_id]) with check ((select app.my_org_ids()) @> array[org_id]);
create policy "Business fence" on public.monthly_pay_lines as restrictive for all to authenticated
  using ((select app.my_org_ids()) @> array[org_id]) with check ((select app.my_org_ids()) @> array[org_id]);

create policy "Owners manage monthly pay periods" on public.monthly_pay_periods for all to authenticated
  using (app.is_owner()) with check (app.is_owner());
create policy "Owners manage monthly pay lines" on public.monthly_pay_lines for all to authenticated
  using (app.is_owner()) with check (app.is_owner());
create policy "Staff see their own pay lines" on public.monthly_pay_lines for select to authenticated
  using (staff_id = app.current_staff_id());

-- Keep updated_at honest.
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger touch_updated_at before update on public.monthly_pay_lines
  for each row execute function app.touch_updated_at();

-- The deposit ledger learns which pay line an entry came from, and the date
-- it belongs to (the period end for payroll entries).
alter table public.therapist_deposit_ledger
  add column if not exists pay_line_id uuid references public.monthly_pay_lines(id) on delete cascade,
  add column if not exists entry_date date;
update public.therapist_deposit_ledger
   set entry_date = (created_at at time zone 'Asia/Bangkok')::date
 where entry_date is null;
alter table public.therapist_deposit_ledger
  alter column entry_date set not null,
  alter column entry_date set default (now() at time zone 'Asia/Bangkok')::date;
create index if not exists therapist_deposit_ledger_pay_line_idx on public.therapist_deposit_ledger (pay_line_id);

-- A pay line's เงินประกัน instalment and refund are the ledger's entries for
-- that line, one per kind: rewritten whenever the line changes (a zero amount
-- means none this month), gone when the line is deleted.
create unique index if not exists therapist_deposit_ledger_pay_line_kind_idx
  on public.therapist_deposit_ledger (pay_line_id, entry_type) where pay_line_id is not null;

create or replace function app.sync_pay_line_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p public.monthly_pay_periods;
  v_label text;
begin
  select * into p from public.monthly_pay_periods where id = new.period_id;
  v_label := to_char(p.period_start, 'DD Mon YYYY') || ' - ' || to_char(p.period_end, 'DD Mon YYYY');
  insert into public.therapist_deposit_ledger
    (org_id, staff_id, entry_type, amount_cents, note, pay_line_id, entry_date, created_by_staff_id)
  values
    (new.org_id, new.staff_id, 'deduction', new.deposit_cents, 'Deposit instalment, pay ' || v_label, new.id, p.period_end, app.current_staff_id()),
    (new.org_id, new.staff_id, 'refund', new.deposit_refund_cents, 'Deposit refund, pay ' || v_label, new.id, p.period_end, app.current_staff_id())
  on conflict (pay_line_id, entry_type) where pay_line_id is not null
  do update set amount_cents = excluded.amount_cents, note = excluded.note, entry_date = excluded.entry_date, staff_id = excluded.staff_id;
  return new;
end $$;
create trigger sync_pay_line_deposit
  after insert or update of deposit_cents, deposit_refund_cents, staff_id, period_id on public.monthly_pay_lines
  for each row execute function app.sync_pay_line_deposit();

-- Days with a clock-in per staff member inside a date range, for "days worked".
create or replace function public.clock_in_days(p_start date, p_end date)
returns table (staff_id uuid, days integer)
language sql stable security invoker set search_path = public as $$
  select staff_id, count(distinct work_date)::integer
  from public.therapist_clock_sessions
  where work_date between p_start and p_end
  group by staff_id
$$;
grant execute on function public.clock_in_days(date, date) to authenticated;
