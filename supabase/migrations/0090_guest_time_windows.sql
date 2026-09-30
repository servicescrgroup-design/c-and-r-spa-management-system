-- Each booked massage blocks its therapist only for its own time:
-- booking start + start_offset_minutes, for duration_minutes (capped at the booking end).

create or replace function app.appointment_line_window(
  p_start timestamptz, p_end timestamptz, p_offset integer, p_minutes integer,
  out line_start timestamptz, out line_end timestamptz
)
language sql
immutable
set search_path to ''
as $$
  select p_start + make_interval(mins => coalesce(p_offset, 0)),
         least(p_start + make_interval(mins => coalesce(p_offset, 0) + p_minutes), p_end);
$$;

create or replace function app.assert_staff_free(p_staff_id uuid, p_appointment_id uuid, p_start timestamptz, p_end timestamptz)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_conflict record;
begin
  if p_staff_id is null or p_start is null or p_end is null then
    return;
  end if;

  select w.line_start as start_at, w.line_end as end_at, s.first_name
  into v_conflict
  from public.appointment_services aps
  join public.appointments a on a.id = aps.appointment_id
  join public.staff s on s.id = aps.staff_id
  cross join lateral app.appointment_line_window(a.start_at, a.end_at, aps.start_offset_minutes, aps.duration_minutes) w
  where aps.staff_id = p_staff_id
    and a.id <> p_appointment_id
    and a.status not in ('cancelled', 'no_show', 'completed')
    and w.line_start < p_end
    and w.line_end > p_start
  limit 1;

  if found then
    raise exception using
      errcode = 'P0001',
      message = format(
        '%s is already booked from %s to %s. Pick another therapist or time.',
        v_conflict.first_name,
        to_char(v_conflict.start_at at time zone 'Asia/Bangkok', 'HH24:MI'),
        to_char(v_conflict.end_at at time zone 'Asia/Bangkok', 'HH24:MI')
      );
  end if;
end;
$function$;

create or replace function app.check_appointment_service_staff()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_appt record;
  v_win record;
begin
  if new.staff_id is null then
    return new;
  end if;
  select id, start_at, end_at, status into v_appt from public.appointments where id = new.appointment_id;
  if v_appt.status in ('cancelled', 'no_show', 'completed') then
    return new;
  end if;
  select * into v_win from app.appointment_line_window(v_appt.start_at, v_appt.end_at, new.start_offset_minutes, new.duration_minutes);
  perform app.assert_staff_free(new.staff_id, v_appt.id, v_win.line_start, v_win.line_end);
  return new;
end;
$function$;

create or replace function app.check_appointment_time_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_line record;
begin
  if new.status in ('cancelled', 'no_show', 'completed') then
    return new;
  end if;
  for v_line in
    select aps.staff_id, w.line_start, w.line_end
    from public.appointment_services aps
    cross join lateral app.appointment_line_window(new.start_at, new.end_at, aps.start_offset_minutes, aps.duration_minutes) w
    where aps.appointment_id = new.id and aps.staff_id is not null
  loop
    perform app.assert_staff_free(v_line.staff_id, new.id, v_line.line_start, v_line.line_end);
  end loop;
  return new;
end;
$function$;

-- The trigger on appointment_services also needs to fire when a line moves in time.
drop trigger if exists appointment_services_no_double_booking on public.appointment_services;
create trigger appointment_services_no_double_booking
  before insert or update of staff_id, appointment_id, start_offset_minutes, duration_minutes on public.appointment_services
  for each row execute function app.check_appointment_service_staff();

create or replace function public.staff_booking_conflicts(p_staff_ids uuid[], p_start timestamptz, p_end timestamptz, p_exclude_appointment uuid default null)
returns table(staff_id uuid, start_at timestamptz, end_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select aps.staff_id, w.line_start, w.line_end
  from public.appointment_services aps
  join public.appointments a on a.id = aps.appointment_id
  cross join lateral app.appointment_line_window(a.start_at, a.end_at, aps.start_offset_minutes, aps.duration_minutes) w
  where app.current_staff_id() is not null
    and aps.staff_id = any (p_staff_ids)
    and a.status not in ('cancelled', 'no_show', 'completed')
    and w.line_start < p_end
    and w.line_end > p_start
    and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
  order by w.line_start;
$function$;
