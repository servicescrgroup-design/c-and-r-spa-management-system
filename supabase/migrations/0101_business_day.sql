-- The business day runs 05:00 to 05:00 (Bangkok), not midnight to midnight.
-- On walking-street nights the stores close around 2am; what's sold after
-- midnight belongs to the day the shift started. Bill numbers, check-ins,
-- the queue, expenses, deposits, the books and payroll locks all use this day.

create or replace function app.business_date(p_at timestamptz default now())
returns date language sql stable set search_path = '' as $$
  select ((p_at at time zone 'Asia/Bangkok') - interval '5 hours')::date
$$;
grant execute on function app.business_date(timestamptz) to authenticated, anon;

-- Swap every Bangkok calendar date for the business date in the functions that use one.
do $$
declare
  f text;
  v_def text;
  v_new text;
  v_changed int;
begin
  foreach f in array array[
    'app.auto_complete_finished_jobs',
    'app.next_customer_ref',
    'public.delete_pos_sale',
    'public.record_pos_expense',
    'public.record_transportation_fee',
    'public.remove_pos_expense',
    'public.settle_appointment_deposit',
    'public.take_appointment_deposit',
    'public.edit_pos_sale',
    'public.edit_pos_sale_full'
  ] loop
    v_changed := 0;
    for v_def in
      select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.prokind = 'f' and n.nspname || '.' || p.proname = f
    loop
      v_new := regexp_replace(v_def, '\((now\(\)|[a-z_]+\.[a-z_]+|[a-z_]+) at time zone ''Asia/Bangkok''\)::date', 'app.business_date(\1)', 'g');
      if v_new <> v_def then execute v_new; v_changed := v_changed + 1; end if;
    end loop;
    if v_changed = 0 then raise exception 'business_date: nothing to change in %', f; end if;
  end loop;
end $$;

-- "Started today" when finishing a therapist's jobs: since 05:00.
do $$
declare v_def text := pg_get_functiondef('public.finish_session_jobs(uuid)'::regprocedure); v_new text;
begin
  v_new := replace(v_def,
    $q$day_start := (date_trunc('day', now() at time zone 'Asia/Bangkok')) at time zone 'Asia/Bangkok';$q$,
    $q$day_start := (app.business_date(now()) + time '05:00') at time zone 'Asia/Bangkok';$q$);
  if v_new = v_def then raise exception 'finish_session_jobs: day_start not found'; end if;
  execute v_new;
end $$;

-- A sale's journal entry is dated its business day (it used the UTC date before).
do $$
declare v_def text := pg_get_functiondef('app.post_pos_transaction(uuid)'::regprocedure); v_new text;
begin
  v_new := replace(v_def, 'new.created_at::date', 'app.business_date(new.created_at)');
  if v_new = v_def then raise exception 'post_pos_transaction: entry date not found'; end if;
  execute v_new;
end $$;

-- Payroll: a massage finished after midnight counts for the day the shift started.
do $$
declare v_def text := pg_get_functiondef('app.compute_payroll_days(uuid,date,date)'::regprocedure); v_new text;
begin
  v_new := regexp_replace(v_def, '\(([a-z_]+\.[a-z_]+) at time zone \(select timezone from branch\)\)::date', 'app.business_date(\1)', 'g');
  if v_new = v_def then raise exception 'compute_payroll_days: dates not found'; end if;
  execute v_new;
end $$;
