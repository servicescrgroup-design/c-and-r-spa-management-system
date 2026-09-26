-- Lets any signed-in staff member ask "is this therapist booked in this
-- window?" across both branches, even when row security hides the other
-- branch's appointments. Returns only the overlapping times, nothing about
-- the customer.
create or replace function public.staff_booking_conflicts(
  p_staff_ids uuid[],
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_appointment uuid default null
)
returns table (staff_id uuid, start_at timestamptz, end_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select aps.staff_id, a.start_at, a.end_at
  from public.appointment_services aps
  join public.appointments a on a.id = aps.appointment_id
  where app.current_staff_id() is not null
    and aps.staff_id = any (p_staff_ids)
    and a.status not in ('cancelled', 'no_show', 'completed')
    and a.start_at < p_end
    and a.end_at > p_start
    and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
  order by a.start_at;
$$;

revoke all on function public.staff_booking_conflicts(uuid[], timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.staff_booking_conflicts(uuid[], timestamptz, timestamptz, uuid) to authenticated;
