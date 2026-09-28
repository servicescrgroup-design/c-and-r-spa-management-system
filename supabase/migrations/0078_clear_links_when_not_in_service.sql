-- Setting a therapist to Available with the Queue's status dropdown left their
-- finished massage linked, which stopped the scheduler from starting their
-- next one. Only a therapist in service holds a massage now.
do $patch$
declare
  v_def text;
  v_old text;
begin
  v_def := pg_get_functiondef('app.auto_complete_finished_jobs'::regproc);
  v_old := v_def;
  v_def := replace(v_def,
    E'  where s.clock_out_at is null and s.work_date < (now() at time zone ''Asia/Bangkok'')::date;\n',
    E'  where s.clock_out_at is null and s.work_date < (now() at time zone ''Asia/Bangkok'')::date;\n\n  -- Only a therapist in service holds a massage (the status dropdown can leave one behind).\n  update public.therapist_clock_sessions\n  set active_item_id = null\n  where active_item_id is not null and status <> ''in_service'';\n');
  if length(v_def) - length(v_old) < 150 then
    raise exception 'patch did not apply';
  end if;
  execute v_def;
end
$patch$;
