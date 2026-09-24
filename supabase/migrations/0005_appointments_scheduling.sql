-- Staff schedules, time off, and appointments.
create table public.staff_schedules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  effective_from date not null default current_date,
  effective_to date,
  check (end_time > start_time)
);

create index staff_schedules_staff_branch_idx on public.staff_schedules(staff_id, branch_id);

create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  check (end_at > start_at)
);

create index staff_time_off_staff_idx on public.staff_time_off(staff_id);

create type public.appointment_status as enum (
  'pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'
);
create type public.appointment_source as enum ('online', 'walk_in', 'phone', 'staff');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_by_staff_id uuid references public.staff(id) on delete set null,
  status public.appointment_status not null default 'pending',
  start_at timestamptz not null,
  end_at timestamptz not null,
  notes text,
  source public.appointment_source not null default 'staff',
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index appointments_branch_time_idx on public.appointments(branch_id, start_at);
create index appointments_customer_idx on public.appointments(customer_id);

create table public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  price_cents integer not null,
  duration_minutes integer not null,
  sort_order integer not null default 0
);

create index appointment_services_appointment_idx on public.appointment_services(appointment_id);
create index appointment_services_staff_idx on public.appointment_services(staff_id);

-- ---------------------------------------------------------------------------
-- Availability: naive but correct slot generator. Given a branch, a staff
-- member (optional), a date, and a total duration, returns candidate start
-- times at 15-minute granularity that fit inside a working schedule block
-- and don't overlap existing appointments or time off.
-- ---------------------------------------------------------------------------

create function app.get_available_slots(
  p_branch_id uuid,
  p_date date,
  p_duration_minutes integer,
  p_staff_id uuid default null
)
returns table (staff_id uuid, slot_start timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_dow integer := extract(dow from p_date);
  v_slot_interval interval := '15 minutes';
begin
  return query
  with candidate_staff as (
    select distinct sbr.staff_id
    from public.staff_branch_roles sbr
    where sbr.branch_id = p_branch_id
      and (p_staff_id is null or sbr.staff_id = p_staff_id)
  ),
  schedule_blocks as (
    select ss.staff_id, ss.branch_id,
           (p_date + ss.start_time)::timestamptz as block_start,
           (p_date + ss.end_time)::timestamptz as block_end
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
  where not exists (
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

-- ---------------------------------------------------------------------------
-- Public booking entry point: validates the branch offers online booking,
-- upserts the customer by email, and creates the appointment + its service
-- lines in one transaction. Runs as SECURITY DEFINER so anon never needs
-- direct table INSERT on customers/appointments.
-- ---------------------------------------------------------------------------

create function app.create_booking_request(
  p_branch_id uuid,
  p_service_ids uuid[],
  p_start_at timestamptz,
  p_staff_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text
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
  v_cursor timestamptz := p_start_at;
  v_service record;
  v_sort integer := 0;
begin
  select org_id, booking_enabled into v_org_id, v_booking_enabled
  from public.branches where id = p_branch_id and is_active;

  if v_org_id is null or not v_booking_enabled then
    raise exception 'This branch is not accepting online bookings.';
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
  values (v_org_id, p_branch_id, v_customer_id, 'pending', p_start_at, p_start_at, 'online')
  returning id into v_appointment_id;

  for v_service in
    select id, duration_minutes, default_price_cents
    from public.services
    where id = any(p_service_ids)
  loop
    insert into public.appointment_services (appointment_id, service_id, staff_id, price_cents, duration_minutes, sort_order)
    values (v_appointment_id, v_service.id, p_staff_id, v_service.default_price_cents, v_service.duration_minutes, v_sort);
    v_cursor := v_cursor + (v_service.duration_minutes || ' minutes')::interval;
    v_sort := v_sort + 1;
  end loop;

  update public.appointments set end_at = v_cursor where id = v_appointment_id;

  return v_appointment_id;
end;
$$;

grant execute on function app.create_booking_request(uuid, uuid[], timestamptz, uuid, text, text, text, text) to anon, authenticated;
grant execute on function app.get_available_slots(uuid, date, integer, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.staff_schedules enable row level security;
alter table public.staff_time_off enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_services enable row level security;

create policy "Staff view schedules in their branches" on public.staff_schedules
  for select to authenticated
  using (branch_id in (select app.staff_branch_ids()));

create policy "Owners and managers manage schedules" on public.staff_schedules
  for all to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Staff view time off in their branches" on public.staff_time_off
  for select to authenticated
  using (staff_id = auth.uid() or app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Staff manage their own time off" on public.staff_time_off
  for all to authenticated
  using (staff_id = auth.uid() or app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (staff_id = auth.uid() or app.is_owner() or branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Staff view appointments in their branches" on public.appointments
  for select to authenticated
  using (branch_id in (select app.staff_branch_ids()));

create policy "Staff manage appointments in their branches" on public.appointments
  for all to authenticated
  using (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])))
  with check (branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[])));

create policy "Customers view their own appointments" on public.appointments
  for select to authenticated
  using (customer_id = app.current_customer_id());

create policy "Staff view appointment services in their branches" on public.appointment_services
  for select to authenticated
  using (exists (
    select 1 from public.appointments a
    where a.id = appointment_services.appointment_id
      and a.branch_id in (select app.staff_branch_ids())
  ));

create policy "Staff manage appointment services in their branches" on public.appointment_services
  for all to authenticated
  using (exists (
    select 1 from public.appointments a
    where a.id = appointment_services.appointment_id
      and a.branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ))
  with check (exists (
    select 1 from public.appointments a
    where a.id = appointment_services.appointment_id
      and a.branch_id in (select app.staff_branch_ids(array['owner','manager','front_desk']::public.role_type[]))
  ));

create policy "Customers view their own appointment services" on public.appointment_services
  for select to authenticated
  using (exists (
    select 1 from public.appointments a
    where a.id = appointment_services.appointment_id
      and a.customer_id = app.current_customer_id()
  ));
