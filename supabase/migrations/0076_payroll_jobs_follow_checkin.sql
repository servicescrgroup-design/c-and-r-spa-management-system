-- A therapist works at one store per day, but a sale can be rung up at the
-- other store's register. Payroll used to count a massage only at the store
-- that sold it, so a therapist checked in at Chiang Mai Gate whose massages
-- were sold at Sunday Walking Street showed 0 jobs and a full top-up.
-- Massages (and tips) now count at the store the therapist checked in at
-- that day, or the selling store if they didn't check in.
create or replace function app.payroll_job_branch(p_staff_id uuid, p_work_date date, p_sale_branch uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.branch_id from public.therapist_clock_sessions s
     where s.staff_id = p_staff_id and s.work_date = p_work_date
     order by s.clock_in_at limit 1),
    p_sale_branch
  );
$$;
revoke all on function app.payroll_job_branch(uuid, date, uuid) from public, anon;

do $patch$
declare
  v_def text;
  v_old text;
begin
  v_def := pg_get_functiondef('app.compute_payroll_days'::regproc);
  v_old := v_def;
  v_def := replace(v_def,
    $a$    from public.pos_transaction_items pti
    join public.pos_transactions pt on pt.id = pti.transaction_id
    where pt.branch_id = p_branch_id
      and pti.completed_at is not null$a$,
    $b$    from public.pos_transaction_items pti
    join public.pos_transactions pt on pt.id = pti.transaction_id
    where pti.completed_at is not null
      and pti.staff_id is not null
      and pti.completed_at >= (p_start - 1)::timestamptz
      and pti.completed_at < (p_end + 2)::timestamptz
      and app.payroll_job_branch(pti.staff_id, (pti.completed_at at time zone (select timezone from branch))::date, pt.branch_id) = p_branch_id$b$);
  v_def := replace(v_def,
    $a$    join public.pos_transactions pt on pt.id = t.pos_transaction_id
    where pt.branch_id = p_branch_id$a$,
    $b$    join public.pos_transactions pt on pt.id = t.pos_transaction_id
    where app.payroll_job_branch(t.staff_id, (t.created_at at time zone (select timezone from branch))::date, pt.branch_id) = p_branch_id$b$);
  if length(v_def) - length(v_old) < 300 then
    raise exception 'compute_payroll_days patch did not apply';
  end if;
  execute v_def;
end
$patch$;
