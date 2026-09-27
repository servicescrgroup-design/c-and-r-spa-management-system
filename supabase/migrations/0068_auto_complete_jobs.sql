-- When a therapist's massage time (plus add-ons) has passed, finish the job
-- automatically: mark the service lines done at their end time, free the
-- room/bed, set the therapist Available and (by branch policy) send them to
-- the back of the shared queue. Runs every minute via pg_cron, and the queue
-- page also calls it on load. "Complete job" still works to finish early.
create extension if not exists pg_cron;

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
  for r in
    select s.id as session_id, s.staff_id, s.work_date, s.jobs_today, b.queue_send_to_back,
           t.id as transaction_id,
           t.created_at + make_interval(mins => coalesce((
             select sum(coalesce(i.duration_minutes, 0))
             from public.pos_transaction_items i
             where i.transaction_id = t.id and i.staff_id = s.staff_id and i.item_type = 'service'
           ), 60)::int) as ends_at
    from public.therapist_clock_sessions s
    join public.pos_transaction_items main on main.id = s.active_item_id
    join public.pos_transactions t on t.id = main.transaction_id
    join public.branches b on b.id = s.branch_id
    where s.status = 'in_service' and s.clock_out_at is null and s.active_item_id is not null
  loop
    continue when r.ends_at > now();

    update public.pos_transaction_items
    set completed_at = r.ends_at
    where transaction_id = r.transaction_id and staff_id = r.staff_id and item_type = 'service' and completed_at is null;

    v_next := null;
    if coalesce(r.queue_send_to_back, true) then
      select coalesce(max(queue_position), -1) + 1 into v_next
      from public.therapist_clock_sessions where work_date = r.work_date;
    end if;

    update public.therapist_clock_sessions
    set status = 'available',
        current_room_id = null,
        current_bed_id = null,
        active_item_id = null,
        jobs_today = r.jobs_today + 1,
        queue_position = coalesce(v_next, queue_position)
    where id = r.session_id and status = 'in_service';

    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;

revoke all on function app.auto_complete_finished_jobs() from public, anon, authenticated;

-- Staff pages can trigger it too, so the queue is current the moment it opens.
create or replace function public.auto_complete_finished_jobs()
returns integer
language sql
security definer
set search_path = ''
as $$
  select case when app.current_staff_id() is null then 0 else app.auto_complete_finished_jobs() end;
$$;

revoke all on function public.auto_complete_finished_jobs() from public, anon;
grant execute on function public.auto_complete_finished_jobs() to authenticated;

select cron.schedule('auto-complete-finished-jobs', '* * * * *', 'select app.auto_complete_finished_jobs()');
