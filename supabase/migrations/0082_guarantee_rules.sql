-- Guarantee rules:
--  * A therapist who clocks out before closing (less a grace window) gets no top-up that day.
--  * Each therapist can have the guarantee turned off (trainees).
--  * Payroll says why a day has no top-up (guarantee_status).

alter table public.therapist_profiles
  add column if not exists guarantee_enabled boolean not null default true;

alter table public.branches
  add column if not exists guarantee_leave_grace_minutes integer not null default 30
  check (guarantee_leave_grace_minutes between 0 and 240);

-- Check-ins the scheduler closes for a forgotten clock-out aren't "left early".
alter table public.therapist_clock_sessions
  add column if not exists auto_closed boolean not null default false;

-- Earlier ones: the queue's Clock out button always records who pressed it, so a
-- clock-out with nobody recorded was the scheduler's.
update public.therapist_clock_sessions
   set auto_closed = true
 where clock_out_at is not null and clocked_out_by_staff_id is null;

do $patch$
declare
  def text := pg_get_functiondef('app.auto_complete_finished_jobs'::regproc);
  patched text;
begin
  patched := replace(def,
    E'status = ''off_duty'', active_item_id = null, current_room_id = null, current_bed_id = null\n  where s.clock_out_at is null and s.work_date <',
    E'status = ''off_duty'', active_item_id = null, current_room_id = null, current_bed_id = null, auto_closed = true\n  where s.clock_out_at is null and s.work_date <');
  if length(patched) = length(def) then
    raise exception 'auto_complete_finished_jobs: stale-close statement not found';
  end if;
  execute patched;
end
$patch$;

drop function if exists public.compute_payroll_days(uuid, date, date);
drop function if exists app.compute_payroll_days(uuid, date, date);

create function app.compute_payroll_days(p_branch_id uuid, p_start date, p_end date)
returns table(
  work_date date, session_id uuid, staff_id uuid, name text, clock_in_at timestamptz, clock_out_at timestamptz,
  clocked_hours numeric, service_hours numeric, jobs_count integer, payout_cents integer, guarantee_topup_cents integer,
  tips_cents integer, bonus_cents integer, deduction_cents integer, advance_cents integer, gross_pay_cents integer,
  locked boolean, transport_cents integer, ot_cents integer, guarantee_status text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not app.has_branch_role(p_branch_id, array['owner', 'manager']::public.role_type[]) then
    raise exception 'Not authorized to view payroll for this branch';
  end if;

  return query
  with branch as (
    select payroll_min_hours, payroll_guarantee_cents, timezone, hours, guarantee_leave_grace_minutes
    from public.branches where id = p_branch_id
  ),
  sessions as (
    select tcs.id as session_id, tcs.staff_id, tcs.work_date, tcs.clock_in_at, tcs.clock_out_at, tcs.auto_closed
    from public.therapist_clock_sessions tcs
    where tcs.branch_id = p_branch_id
      and tcs.work_date between p_start and p_end
  ),
  completed_items as (
    select
      pti.staff_id,
      (pti.completed_at at time zone (select timezone from branch))::date as work_date,
      pti.duration_minutes,
      pti.payout_cents,
      pti.transport_cents,
      pti.ot_cents,
      pti.is_add_on
    from public.pos_transaction_items pti
    join public.pos_transactions pt on pt.id = pti.transaction_id
    where pti.completed_at is not null
      and pti.staff_id is not null
      and pti.completed_at >= (p_start - 1)::timestamptz
      and pti.completed_at < (p_end + 2)::timestamptz
      and app.payroll_job_branch(pti.staff_id, (pti.completed_at at time zone (select timezone from branch))::date, pt.branch_id) = p_branch_id
  ),
  hours_agg as (
    select
      ci.staff_id,
      ci.work_date,
      coalesce(sum(ci.duration_minutes), 0) / 60.0 as service_hours,
      coalesce(sum(ci.payout_cents), 0)::integer as payout_cents,
      coalesce(sum(ci.transport_cents), 0)::integer as transport_cents,
      coalesce(sum(ci.ot_cents), 0)::integer as ot_cents,
      (count(*) filter (where not ci.is_add_on))::integer as jobs_count
    from completed_items ci
    group by ci.staff_id, ci.work_date
  ),
  tips_agg as (
    select
      t.staff_id,
      (t.created_at at time zone (select timezone from branch))::date as work_date,
      coalesce(sum(t.amount_cents), 0)::integer as tips_cents
    from public.tips t
    join public.pos_transactions pt on pt.id = t.pos_transaction_id
    where app.payroll_job_branch(t.staff_id, (t.created_at at time zone (select timezone from branch))::date, pt.branch_id) = p_branch_id
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
  ),
  closing as (
    -- The store's closing time on each session's day; a close at or before opening runs past midnight.
    select
      s.session_id,
      case
        when coalesce((b.hours -> lower(to_char(s.work_date, 'dy')) ->> 'closed')::boolean, false) then null
        when (b.hours -> lower(to_char(s.work_date, 'dy')) ->> 'close') is null then null
        else (
          (s.work_date
            + (b.hours -> lower(to_char(s.work_date, 'dy')) ->> 'close')::time
            + case
                when (b.hours -> lower(to_char(s.work_date, 'dy')) ->> 'close')::time
                     <= coalesce((b.hours -> lower(to_char(s.work_date, 'dy')) ->> 'open')::time, '00:00'::time)
                then interval '1 day' else interval '0' end
          ) at time zone b.timezone
        )
      end as close_at
    from sessions s cross join branch b
  ),
  topups as (
    select
      s.session_id,
      g.status,
      case when g.status = 'topped_up' then g.shortfall else 0 end::integer as topup_cents
    from sessions s
    left join public.therapist_profiles tp on tp.staff_id = s.staff_id
    left join hours_agg h on h.staff_id = s.staff_id and h.work_date = s.work_date
    join closing c on c.session_id = s.session_id
    cross join lateral (
      select
        greatest(coalesce(tp.guarantee_override_cents, (select payroll_guarantee_cents from branch)) - coalesce(h.payout_cents, 0), 0) as shortfall
    ) x
    cross join lateral (
      select
        x.shortfall,
        case
          when not coalesce(tp.guarantee_enabled, true) then 'off'
          when exists (
            select 1 from public.payroll_guarantee_waivers w
            where w.branch_id = p_branch_id and w.staff_id = s.staff_id and w.work_date = s.work_date
          ) then 'waived'
          when coalesce(h.service_hours, 0) >= coalesce(tp.min_hours_override, (select payroll_min_hours from branch)) then 'met_hours'
          when x.shortfall = 0 then 'earned'
          when s.clock_out_at is not null and not s.auto_closed and c.close_at is not null
            and s.clock_out_at < c.close_at - make_interval(mins => (select guarantee_leave_grace_minutes from branch))
            then 'left_early'
          else 'topped_up'
        end as status
    ) g
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
    u.topup_cents,
    coalesce(ti.tips_cents, 0),
    coalesce(a.bonus_cents, 0),
    coalesce(a.deduction_cents, 0),
    coalesce(a.advance_cents, 0),
    (
      coalesce(h.payout_cents, 0)
      + u.topup_cents
      + coalesce(h.transport_cents, 0)
      + coalesce(h.ot_cents, 0)
      + coalesce(ti.tips_cents, 0)
      + coalesce(a.bonus_cents, 0)
      - coalesce(a.deduction_cents, 0)
      - coalesce(a.advance_cents, 0)
    )::integer as gross_pay_cents,
    exists(select 1 from locks l where l.work_date = s.work_date),
    coalesce(h.transport_cents, 0),
    coalesce(h.ot_cents, 0),
    u.status
  from sessions s
  join public.staff st on st.id = s.staff_id
  join topups u on u.session_id = s.session_id
  left join hours_agg h on h.staff_id = s.staff_id and h.work_date = s.work_date
  left join tips_agg ti on ti.staff_id = s.staff_id and ti.work_date = s.work_date
  left join adj_agg a on a.staff_id = s.staff_id and a.work_date = s.work_date
  order by s.work_date, s.clock_in_at;
end;
$function$;

create function public.compute_payroll_days(p_branch_id uuid, p_start date, p_end date)
returns table(
  work_date date, session_id uuid, staff_id uuid, name text, clock_in_at timestamptz, clock_out_at timestamptz,
  clocked_hours numeric, service_hours numeric, jobs_count integer, payout_cents integer, guarantee_topup_cents integer,
  tips_cents integer, bonus_cents integer, deduction_cents integer, advance_cents integer, gross_pay_cents integer,
  locked boolean, transport_cents integer, ot_cents integer, guarantee_status text
)
language sql
stable
set search_path = 'public'
as $$
  select * from app.compute_payroll_days(p_branch_id, p_start, p_end);
$$;
revoke all on function public.compute_payroll_days(uuid, date, date) from public, anon;
grant execute on function public.compute_payroll_days(uuid, date, date) to authenticated;
