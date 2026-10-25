-- Online bookings never saved: the booking was inserted with end_at equal to
-- start_at (the end was only filled in after the services loop), and the
-- appointments table requires end_at > start_at. Work out the end time first.
create or replace function app.create_booking_request(
  p_branch_id uuid,
  p_service_ids uuid[],
  p_start_at timestamptz,
  p_staff_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_durations integer[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_booking_enabled boolean;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_service_id uuid;
  v_duration integer;
  v_price integer;
  v_default_duration integer;
  v_default_price integer;
  v_idx integer := 1;
  v_sort integer := 0;
  v_total_minutes integer := 0;
begin
  select org_id, booking_enabled into v_org_id, v_booking_enabled
  from public.branches where id = p_branch_id and is_active;

  if v_org_id is null or not v_booking_enabled then
    raise exception 'This branch is not accepting online bookings.';
  end if;

  if coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Choose at least one massage.';
  end if;

  if exists (select 1 from public.services where id = any(p_service_ids) and org_id <> v_org_id)
     or (p_staff_id is not null and not exists (select 1 from public.staff where id = p_staff_id and org_id = v_org_id)) then
    raise exception 'That massage or therapist isn''t offered at this branch.';
  end if;

  -- The booking ends when the last massage ends.
  foreach v_service_id in array p_service_ids loop
    select duration_minutes into v_default_duration from public.services where id = v_service_id;
    v_total_minutes := v_total_minutes + coalesce(p_durations[v_idx], v_default_duration, 0);
    v_idx := v_idx + 1;
  end loop;
  if v_total_minutes <= 0 then
    raise exception 'Choose how long the massage is.';
  end if;

  select id into v_customer_id from public.customers
  where org_id = v_org_id and email = p_email
  order by created_at limit 1;

  if v_customer_id is null then
    insert into public.customers (org_id, first_name, last_name, email, phone)
    values (v_org_id, p_first_name, p_last_name, p_email, p_phone)
    returning id into v_customer_id;
  end if;

  insert into public.appointments (org_id, branch_id, customer_id, status, start_at, end_at, source)
  values (v_org_id, p_branch_id, v_customer_id, 'pending', p_start_at, p_start_at + (v_total_minutes || ' minutes')::interval, 'online')
  returning id into v_appointment_id;

  v_idx := 1;
  foreach v_service_id in array p_service_ids loop
    select duration_minutes, default_price_cents into v_default_duration, v_default_price
    from public.services where id = v_service_id;

    v_duration := coalesce(p_durations[v_idx], v_default_duration);

    select price_cents into v_price
    from public.service_price_options
    where service_id = v_service_id and duration_minutes = v_duration;

    if v_price is null then
      v_price := v_default_price;
    end if;

    insert into public.appointment_services (appointment_id, service_id, staff_id, price_cents, duration_minutes, sort_order)
    values (v_appointment_id, v_service_id, p_staff_id, v_price, v_duration, v_sort);

    v_sort := v_sort + 1;
    v_idx := v_idx + 1;
  end loop;

  return v_appointment_id;
end;
$$;
