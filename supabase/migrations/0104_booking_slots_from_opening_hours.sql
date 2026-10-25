-- The booking page showed "no openings" every day: slots came only from
-- staff_schedules, which this business doesn't use (therapists work a
-- walk-in queue). When nobody has a schedule for that day, offer every
-- 15-minute start inside the branch's opening hours instead, in the
-- branch's own time zone, and never a start that is already in the past.
create or replace function app.get_available_slots(
  p_branch_id uuid,
  p_date date,
  p_duration_minutes integer,
  p_staff_id uuid default null
)
returns table (staff_id uuid, slot_start timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dow integer := extract(dow from p_date);
  v_slot_interval interval := '15 minutes';
  v_tz text;
  v_day jsonb;
  v_open time;
  v_close time;
  v_has_schedule boolean;
  v_not_before timestamptz := now() + interval '30 minutes';
begin
  select b.timezone, b.hours -> (array['sun','mon','tue','wed','thu','fri','sat'])[v_dow + 1]
    into v_tz, v_day
  from public.branches b where b.id = p_branch_id;

  select exists (
    select 1 from public.staff_schedules ss
    where ss.branch_id = p_branch_id and ss.day_of_week = v_dow
      and ss.effective_from <= p_date and (ss.effective_to is null or ss.effective_to >= p_date)
  ) into v_has_schedule;

  if not v_has_schedule then
    if v_day is null or coalesce((v_day ->> 'closed')::boolean, false) then
      return;
    end if;
    v_open := (v_day ->> 'open')::time;
    v_close := (v_day ->> 'close')::time;
    if v_open is null or v_close is null then
      return;
    end if;
    return query
    select null::uuid as staff_id, gs as slot_start
    from generate_series(
      (p_date::text || ' ' || v_open::text)::timestamp at time zone coalesce(v_tz, 'Asia/Bangkok'),
      ((p_date::text || ' ' || v_close::text)::timestamp at time zone coalesce(v_tz, 'Asia/Bangkok')) - (p_duration_minutes || ' minutes')::interval,
      v_slot_interval
    ) as gs
    where gs >= v_not_before
    order by gs;
    return;
  end if;

  return query
  with candidate_staff as (
    select distinct sbr.staff_id
    from public.staff_branch_roles sbr
    where sbr.branch_id = p_branch_id
      and (p_staff_id is null or sbr.staff_id = p_staff_id)
  ),
  schedule_blocks as (
    select ss.staff_id, ss.branch_id,
           (p_date::text || ' ' || ss.start_time::text)::timestamp at time zone coalesce(v_tz, 'Asia/Bangkok') as block_start,
           (p_date::text || ' ' || ss.end_time::text)::timestamp at time zone coalesce(v_tz, 'Asia/Bangkok') as block_end
    from public.staff_schedules ss
    join candidate_staff cs on cs.staff_id = ss.staff_id
    where ss.branch_id = p_branch_id
      and ss.day_of_week = v_dow
      and ss.effective_from <= p_date
      and (ss.effective_to is null or ss.effective_to >= p_date)
  ),
  candidate_slots as (
    select sb.staff_id,
           gs as slot_start
    from schedule_blocks sb
    cross join lateral generate_series(
      sb.block_start,
      sb.block_end - (p_duration_minutes || ' minutes')::interval,
      v_slot_interval
    ) as gs
  )
  select cs.staff_id, cs.slot_start
  from candidate_slots cs
  where cs.slot_start >= v_not_before
  and not exists (
    select 1 from public.staff_time_off sto
    where sto.staff_id = cs.staff_id
      and (sto.branch_id is null or sto.branch_id = p_branch_id)
      and tstzrange(sto.start_at, sto.end_at) && tstzrange(cs.slot_start, cs.slot_start + (p_duration_minutes || ' minutes')::interval)
  )
  and not exists (
    select 1
    from public.appointment_services aps
    join public.appointments a on a.id = aps.appointment_id
    where aps.staff_id = cs.staff_id
      and a.status not in ('cancelled', 'no_show')
      and tstzrange(a.start_at, a.end_at) && tstzrange(cs.slot_start, cs.slot_start + (p_duration_minutes || ' minutes')::interval)
  )
  order by cs.slot_start, cs.staff_id;
end;
$$;
