-- A therapist can't be booked into two appointments that overlap in time,
-- at either branch. Enforced in the database so every path (back office,
-- online booking, future tools) gets the same rule. Walk-in jobs sold at the
-- POS are checked in the sale action against these appointments.

create or replace function app.assert_staff_free(
  p_staff_id uuid,
  p_appointment_id uuid,
  p_start timestamptz,
  p_end timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict record;
begin
  if p_staff_id is null or p_start is null or p_end is null then
    return;
  end if;

  select a.start_at, a.end_at, s.first_name
  into v_conflict
  from public.appointment_services aps
  join public.appointments a on a.id = aps.appointment_id
  join public.staff s on s.id = aps.staff_id
  where aps.staff_id = p_staff_id
    and a.id <> p_appointment_id
    and a.status not in ('cancelled', 'no_show', 'completed')
    and a.start_at < p_end
    and a.end_at > p_start
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
$$;

create or replace function app.check_appointment_service_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt record;
begin
  if new.staff_id is null then
    return new;
  end if;
  select id, start_at, end_at, status into v_appt from public.appointments where id = new.appointment_id;
  if v_appt.status in ('cancelled', 'no_show', 'completed') then
    return new;
  end if;
  perform app.assert_staff_free(new.staff_id, v_appt.id, v_appt.start_at, v_appt.end_at);
  return new;
end;
$$;

create or replace function app.check_appointment_time_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid;
begin
  if new.status in ('cancelled', 'no_show', 'completed') then
    return new;
  end if;
  for v_staff in
    select distinct staff_id from public.appointment_services where appointment_id = new.id and staff_id is not null
  loop
    perform app.assert_staff_free(v_staff, new.id, new.start_at, new.end_at);
  end loop;
  return new;
end;
$$;

drop trigger if exists appointment_services_no_double_booking on public.appointment_services;
create trigger appointment_services_no_double_booking
  before insert or update of staff_id, appointment_id on public.appointment_services
  for each row execute function app.check_appointment_service_staff();

drop trigger if exists appointments_no_double_booking on public.appointments;
create trigger appointments_no_double_booking
  before update of start_at, end_at, status on public.appointments
  for each row execute function app.check_appointment_time_change();

revoke all on function app.assert_staff_free(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function app.check_appointment_service_staff() from public, anon, authenticated;
revoke all on function app.check_appointment_time_change() from public, anon, authenticated;
