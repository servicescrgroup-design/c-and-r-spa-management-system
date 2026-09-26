-- Phase: receptionist scheduling workflow. A branch's rooms each hold one or
-- more beds; a bed has a type that limits which services can be performed on
-- it (foot chairs only do foot massage; oil/Thai beds do much more).
create type public.bed_type as enum ('foot_chair', 'oil_bed', 'thai_bed', 'other');

create table public.room_beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.branch_rooms(id) on delete cascade,
  name text not null,
  bed_type public.bed_type not null default 'thai_bed',
  is_active boolean not null default true
);

create index room_beds_room_idx on public.room_beds(room_id);

-- Which services each bed TYPE supports. Owners/managers edit this; the
-- scheduling UI uses it to grey out beds that can't perform the selected
-- services rather than hardcoding the rule in application code.
create table public.bed_type_allowed_services (
  bed_type public.bed_type not null,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (bed_type, service_id)
);

alter table public.customers add column if not exists nationality text;

alter table public.appointments
  add column if not exists bed_id uuid references public.room_beds(id) on delete set null;

alter table public.room_beds enable row level security;
alter table public.bed_type_allowed_services enable row level security;

create policy "Staff view beds in their branches" on public.room_beds
  for select to authenticated
  using (
    app.is_owner()
    or room_id in (
      select id from public.branch_rooms where branch_id in (select app.staff_branch_ids())
    )
  );

create policy "Owners and managers manage beds" on public.room_beds
  for all to authenticated
  using (
    app.is_owner()
    or room_id in (
      select id from public.branch_rooms
      where branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  )
  with check (
    app.is_owner()
    or room_id in (
      select id from public.branch_rooms
      where branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );

create policy "Anyone can view bed type compatibility" on public.bed_type_allowed_services
  for select to anon, authenticated using (true);

create policy "Owners and managers manage bed type compatibility" on public.bed_type_allowed_services
  for all to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

-- Sensible starting defaults so the feature is usable immediately: Thai beds
-- do virtually everything, oil beds do oil/aromatherapy/facial/scrub work,
-- foot chairs do foot massage only. Owners can adjust from Services later.
insert into public.bed_type_allowed_services (bed_type, service_id)
select 'thai_bed', id from public.services;

insert into public.bed_type_allowed_services (bed_type, service_id)
select 'oil_bed', id from public.services
where name ilike '%oil%' or name ilike '%facial%' or name ilike '%scrub%'
   or name ilike '%aromatherapy%' or name ilike '%cbd%' or name ilike '%coconut%'
   or name ilike '%hot stone%' or name ilike '%herbal%';

insert into public.bed_type_allowed_services (bed_type, service_id)
select 'foot_chair', id from public.services where name ilike '%foot%';
