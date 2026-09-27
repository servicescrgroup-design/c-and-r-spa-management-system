-- Walk-ins can be paid now for a later start (e.g. 18:00 when the therapist
-- finishes their current massage). Each service line records its start; the
-- scheduler starts it on time and finishes it when its minutes are up.
alter table public.pos_transaction_items
  add column if not exists start_at timestamptz,
  add column if not exists is_add_on boolean not null default false;

-- Existing add-on lines were written with an "Add-on ·" description.
update public.pos_transaction_items set is_add_on = true where description like 'Add-on ·%' or description like '%· Add-on ·%';

create index if not exists pos_transaction_items_pending_idx
  on public.pos_transaction_items (staff_id, start_at) where completed_at is null;

create or replace function app.auto_complete_finished_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_done integer := 0;
  v_next integer;
begin
  -- 1) Finish massages whose time is up.
  for r in
    select s.id as session_id, s.staff_id, s.work_date, s.jobs_today, b.queue_send_to_back,
           main.transaction_id, coalesce(main.start_at, t.created_at) as started_at,
           coalesce(main.start_at, t.created_at) + make_interval(mins => coalesce((
             select sum(coalesce(i.duration_minutes, 0))
             from public.pos_transaction_items i
             where i.transaction_id = main.transaction_id and i.staff_id = s.staff_id and i.item_type = 'service'
               and i.start_at is not distinct from main.start_at
           ), 60)::int) as ends_at
    from public.therapist_clock_sessions s
    join public.pos_transaction_items main on main.id = s.active_item_id
    join public.pos_transactions t on t.id = main.transaction_id
    join public.branches b on b.id = s.branch_id
    where s.status = 'in_service' and s.clock_out_at is null and s.active_item_id is not null
  loop
    continue when r.ends_at > now();

    update public.pos_transaction_items i
    set completed_at = r.ends_at
    where i.transaction_id = r.transaction_id and i.staff_id = r.staff_id and i.item_type = 'service'
      and i.completed_at is null and coalesce(i.start_at, r.started_at) = r.started_at;

    v_next := null;
    if coalesce(r.queue_send_to_back, true) then
      select coalesce(max(queue_position), -1) + 1 into v_next
      from public.therapist_clock_sessions where work_date = r.work_date;
    end if;

    update public.therapist_clock_sessions
    set status = 'available', current_room_id = null, current_bed_id = null, active_item_id = null,
        jobs_today = r.jobs_today + 1, queue_position = coalesce(v_next, queue_position)
    where id = r.session_id and status = 'in_service';

    v_done := v_done + 1;
  end loop;

  -- 2) Start booked walk-ins whose start time has come, for therapists who are free.
  for r in
    select distinct on (s.id) s.id as session_id, i.id as item_id, i.room_id, i.bed_id
    from public.therapist_clock_sessions s
    join public.pos_transaction_items i on i.staff_id = s.staff_id
    join public.pos_transactions t on t.id = i.transaction_id and t.branch_id = s.branch_id
    where s.clock_out_at is null and s.status = 'available' and s.active_item_id is null
      and i.item_type = 'service' and not i.is_add_on and i.completed_at is null
      and i.start_at is not null and i.start_at <= now()
      and i.start_at > now() - interval '12 hours'
    order by s.id, i.start_at
  loop
    update public.therapist_clock_sessions
    set status = 'in_service', active_item_id = r.item_id, current_room_id = r.room_id, current_bed_id = r.bed_id
    where id = r.session_id and status = 'available' and active_item_id is null;
  end loop;

  return v_done;
end;
$$;

revoke all on function app.auto_complete_finished_jobs() from public, anon, authenticated;
