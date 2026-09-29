-- Optional arguments on the deposit functions default to null.
do $patch$
declare def text; patched text;
begin
  def := pg_get_functiondef('public.take_appointment_deposit'::regproc);
  patched := replace(replace(replace(def,
    'p_paid_at timestamp with time zone,', 'p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone,'),
    'p_note text,', 'p_note text DEFAULT NULL::text,'),
    'p_drawer_session_id uuid)', 'p_drawer_session_id uuid DEFAULT NULL::uuid)');
  if patched = def then raise exception 'take_appointment_deposit signature not found'; end if;
  execute patched;

  def := pg_get_functiondef('public.settle_appointment_deposit'::regproc);
  patched := replace(def, 'p_drawer_session_id uuid)', 'p_drawer_session_id uuid DEFAULT NULL::uuid)');
  if patched = def then raise exception 'settle_appointment_deposit signature not found'; end if;
  execute patched;
end
$patch$;
