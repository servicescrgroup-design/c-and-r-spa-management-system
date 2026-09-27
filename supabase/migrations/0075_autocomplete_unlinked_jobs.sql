-- Massages were left unfinished when they never got linked to the therapist's
-- queue entry: sold at the other store from where the therapist checked in,
-- sold before they checked in, or sold while their status had been set to
-- "In service" by hand. Unfinished massages don't count for pay.
--
-- The scheduler now:
--  0. finishes any started massage whose time is up, linked or not;
--  1. finishes linked massages and frees the therapist (as before);
--  1b. links a therapist marked "In service" with no massage to their current one;
--  2. starts booked massages, at either store and for sales made before check-in.
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
  -- 0. Any massage whose time is up counts as done, even if nobody linked it.
  update public.pos_transaction_items i
  set completed_at = x.ends_at
  from (
    select i2.id,
           coalesce(i2.start_at, t.created_at) + make_interval(mins => coalesce(i2.duration_minutes, 60)) as ends_at
    from public.pos_transaction_items i2
    join public.pos_transactions t on t.id = i2.transaction_id
    where i2.item_type = 'service' and i2.staff_id is not null and i2.completed_at is null
      and t.status = 'completed' and t.created_at > now() - interval '24 hours'
      and not exists (select 1 from public.therapist_clock_sessions s where s.active_item_id = i2.id)
  ) x
  where i.id = x.id and x.ends_at <= now()
    -- Leave a linked massage's add-ons to finish with it in step 1.
    and not exists (
      select 1 from public.therapist_clock_sessions s
      join public.pos_transaction_items m on m.id = s.active_item_id
      where m.transaction_id = i.transaction_id and m.staff_id = i.staff_id
        and m.start_at is not distinct from i.start_at
    );

  -- 1. Linked massages that are over: finish them and free the therapist.
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

  -- 1b. "In service" with no massage linked: link the one they're doing now.
  for r in
    select distinct on (s.id) s.id as session_id, i.id as item_id, i.room_id, i.bed_id
    from public.therapist_clock_sessions s
    join public.pos_transaction_items i on i.staff_id = s.staff_id
    join public.pos_transactions t on t.id = i.transaction_id and t.status = 'completed'
    where s.clock_out_at is null and s.status = 'in_service' and s.active_item_id is null
      and i.item_type = 'service' and not i.is_add_on and i.completed_at is null
      and coalesce(i.start_at, t.created_at) <= now()
      and coalesce(i.start_at, t.created_at) > now() - interval '12 hours'
    order by s.id, coalesce(i.start_at, t.created_at) desc
  loop
    update public.therapist_clock_sessions
    set active_item_id = r.item_id,
        current_room_id = coalesce(r.room_id, current_room_id),
        current_bed_id = coalesce(r.bed_id, current_bed_id)
    where id = r.session_id and active_item_id is null;
  end loop;

  -- 2. Start massages that are due, whichever store sold them.
  for r in
    select distinct on (s.id) s.id as session_id, i.id as item_id, i.room_id, i.bed_id
    from public.therapist_clock_sessions s
    join public.pos_transaction_items i on i.staff_id = s.staff_id
    join public.pos_transactions t on t.id = i.transaction_id and t.status = 'completed'
    where s.clock_out_at is null and s.status = 'available' and s.active_item_id is null
      and i.item_type = 'service' and not i.is_add_on and i.completed_at is null
      and coalesce(i.start_at, t.created_at) <= now()
      and coalesce(i.start_at, t.created_at) > now() - interval '12 hours'
    order by s.id, coalesce(i.start_at, t.created_at)
  loop
    update public.therapist_clock_sessions
    set status = 'in_service', active_item_id = r.item_id, current_room_id = r.room_id, current_bed_id = r.bed_id
    where id = r.session_id and status = 'available' and active_item_id is null;
  end loop;

  return v_done;
end;
$$;
