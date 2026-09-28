-- Check-ins left open from a previous day (nobody pressed Clock out) were
-- being picked up by the scheduler and checkout, so today's massages were
-- linked to yesterday's hidden check-in and today's row stayed "Available".
--  * The scheduler now closes any check-in from before today, at the end of
--    that therapist's last finished massage that day (or their check-in time).
--  * It only links and starts massages on today's check-ins.
do $patch$
declare
  v_def text;
  v_old text;
begin
  v_def := pg_get_functiondef('app.auto_complete_finished_jobs'::regproc);
  v_old := v_def;
  v_def := replace(v_def,
    E'begin\n  update public.pos_transaction_items i\n  set completed_at = x.ends_at',
    E'begin\n  -- Close check-ins left open from an earlier day.\n  update public.therapist_clock_sessions s\n  set clock_out_at = greatest(s.clock_in_at, coalesce((\n        select max(i.completed_at) from public.pos_transaction_items i\n        where i.staff_id = s.staff_id and i.completed_at::date between s.work_date - 1 and s.work_date + 1\n          and (i.completed_at at time zone ''Asia/Bangkok'')::date = s.work_date\n      ), s.clock_in_at)),\n      status = ''off_duty'', active_item_id = null, current_room_id = null, current_bed_id = null\n  where s.clock_out_at is null and s.work_date < (now() at time zone ''Asia/Bangkok'')::date;\n\n  update public.pos_transaction_items i\n  set completed_at = x.ends_at');
  v_def := replace(v_def,
    E'where s.clock_out_at is null and s.status = ''in_service'' and s.active_item_id is null',
    E'where s.clock_out_at is null and s.status = ''in_service'' and s.active_item_id is null\n      and s.work_date = (now() at time zone ''Asia/Bangkok'')::date');
  v_def := replace(v_def,
    E'where s.clock_out_at is null and s.status = ''available'' and s.active_item_id is null',
    E'where s.clock_out_at is null and s.status = ''available'' and s.active_item_id is null\n      and s.work_date = (now() at time zone ''Asia/Bangkok'')::date');
  if length(v_def) - length(v_old) < 600 then
    raise exception 'auto_complete patch did not apply (% chars added)', length(v_def) - length(v_old);
  end if;
  execute v_def;
end
$patch$;
