-- PostgREST (and supabase-js's .rpc()) only exposes functions from the
-- `public` schema by default. Everything so far lives in `app` on purpose
-- (kept separate from application tables), so the app-callable functions
-- need thin public wrappers to be reachable as RPC endpoints at all.
create function public.post_pos_transaction(p_transaction_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  select app.post_pos_transaction(p_transaction_id);
$$;

create function public.get_available_slots(
  p_branch_id uuid,
  p_date date,
  p_duration_minutes integer,
  p_staff_id uuid default null
)
returns table (staff_id uuid, slot_start timestamptz)
language sql
security invoker
stable
set search_path = public
as $$
  select * from app.get_available_slots(p_branch_id, p_date, p_duration_minutes, p_staff_id);
$$;

create function public.create_booking_request(
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
language sql
security invoker
set search_path = public
as $$
  select app.create_booking_request(p_branch_id, p_service_ids, p_start_at, p_staff_id, p_first_name, p_last_name, p_email, p_phone);
$$;

grant execute on function public.post_pos_transaction(uuid) to authenticated;
grant execute on function public.get_available_slots(uuid, date, integer, uuid) to anon, authenticated;
grant execute on function public.create_booking_request(uuid, uuid[], timestamptz, uuid, text, text, text, text) to anon, authenticated;
