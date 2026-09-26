-- Bug fix: app.compute_payroll_days is plpgsql, so its own OUT parameters
-- (staff_id, work_date) are in scope through the whole function body,
-- including the return-query SQL text. Two CTEs referenced those columns
-- unqualified ("group by staff_id, work_date"), which Postgres can't
-- resolve against a plpgsql variable of the same name vs. a table column
-- of the same name — it raised "column reference is ambiguous" the first
-- time this function actually ran. Fix: qualify every such reference.
create or replace function app.compute_payroll_days(p_branch_id uuid, p_start date, p_end date)
returns table (
  work_date date,
  session_id uuid,
  staff_id uuid,
  name text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  clocked_hours numeric,
  service_hours numeric,
  jobs_count integer,
  payout_cents integer,
  guarantee_topup_cents integer,
  tips_cents integer,
  bonus_cents integer,
  deduction_cents integer,
  advance_cents integer,
  gross_pay_cents integer,
  locked boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not app.has_branch_role(p_branch_id, array['owner', 'manager']::public.role_type[]) then
    raise exception 'Not authorized to view payroll for this branch';
  end if;

  return query
  with branch as (
    select payroll_min_hours, payroll_guarantee_cents, timezone from public.branches where id = p_branch_id
  ),
  sessions as (
    select tcs.id as session_id, tcs.staff_id, tcs.work_date, tcs.clock_in_at, tcs.clock_out_at
    from public.therapist_clock_sessions tcs
    where tcs.branch_id = p_branch_id
      and tcs.work_date between p_start and p_end
  ),
  completed_items as (
    select
      pti.staff_id,
      (pti.completed_at at time zone (select timezone from branch))::date as work_date,
      pti.duration_minutes,
      pti.payout_cents
    from public.pos_transaction_items pti
    join public.pos_transactions pt on pt.id = pti.transaction_id
    where pt.branch_id = p_branch_id
      and pti.completed_at is not null
  ),
  hours_agg as (
    select
      completed_items.staff_id,
      completed_items.work_date,
      coalesce(sum(completed_items.duration_minutes), 0) / 60.0 as service_hours,
      coalesce(sum(completed_items.payout_cents), 0)::integer as payout_cents,
      count(*)::integer as jobs_count
    from completed_items
    group by completed_items.staff_id, completed_items.work_date
  ),
  tips_agg as (
    select
      t.staff_id,
      (t.created_at at time zone (select timezone from branch))::date as work_date,
      coalesce(sum(t.amount_cents), 0)::integer as tips_cents
    from public.tips t
    join public.pos_transactions pt on pt.id = t.pos_transaction_id
    where pt.branch_id = p_branch_id
    group by t.staff_id, (t.created_at at time zone (select timezone from branch))::date
  ),
  adj_agg as (
    select
      pa.staff_id,
      pa.work_date,
      coalesce(sum(pa.amount_cents) filter (where pa.type = 'bonus'), 0)::integer as bonus_cents,
      coalesce(sum(pa.amount_cents) filter (where pa.type = 'deduction'), 0)::integer as deduction_cents,
      coalesce(sum(pa.amount_cents) filter (where pa.type = 'advance'), 0)::integer as advance_cents
    from public.payroll_adjustments pa
    where pa.branch_id = p_branch_id and pa.work_date between p_start and p_end
    group by pa.staff_id, pa.work_date
  ),
  locks as (
    select pdl.work_date from public.payroll_day_locks pdl where pdl.branch_id = p_branch_id
  )
  select
    s.work_date,
    s.session_id,
    s.staff_id,
    st.first_name || ' ' || st.last_name,
    s.clock_in_at,
    s.clock_out_at,
    extract(epoch from (coalesce(s.clock_out_at, now()) - s.clock_in_at)) / 3600.0,
    coalesce(h.service_hours, 0),
    coalesce(h.jobs_count, 0),
    coalesce(h.payout_cents, 0),
    case
      when coalesce(h.service_hours, 0) >= coalesce(tp.min_hours_override, (select payroll_min_hours from branch))
        then 0
      else greatest(coalesce(tp.guarantee_override_cents, (select payroll_guarantee_cents from branch)) - coalesce(h.payout_cents, 0), 0)
    end as guarantee_topup_cents,
    coalesce(ti.tips_cents, 0),
    coalesce(a.bonus_cents, 0),
    coalesce(a.deduction_cents, 0),
    coalesce(a.advance_cents, 0),
    (
      coalesce(h.payout_cents, 0)
      + case
          when coalesce(h.service_hours, 0) >= coalesce(tp.min_hours_override, (select payroll_min_hours from branch))
            then 0
          else greatest(coalesce(tp.guarantee_override_cents, (select payroll_guarantee_cents from branch)) - coalesce(h.payout_cents, 0), 0)
        end
      + coalesce(ti.tips_cents, 0)
      + coalesce(a.bonus_cents, 0)
      - coalesce(a.deduction_cents, 0)
      - coalesce(a.advance_cents, 0)
    ) as gross_pay_cents,
    exists(select 1 from locks l where l.work_date = s.work_date)
  from sessions s
  join public.staff st on st.id = s.staff_id
  left join public.therapist_profiles tp on tp.staff_id = s.staff_id
  left join hours_agg h on h.staff_id = s.staff_id and h.work_date = s.work_date
  left join tips_agg ti on ti.staff_id = s.staff_id and ti.work_date = s.work_date
  left join adj_agg a on a.staff_id = s.staff_id and a.work_date = s.work_date
  order by s.work_date, s.clock_in_at;
end;
$$;
