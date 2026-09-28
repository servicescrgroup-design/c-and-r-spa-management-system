-- Front desk "Complete job" marks the therapist's massage finished. Staff have
-- no UPDATE rights on pos_transaction_items, so the direct update changed
-- nothing and the scheduler put the therapist back "In service" a minute later.
create or replace function public.finish_session_jobs(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  s record;
  day_start timestamptz;
  n integer;
begin
  select id, branch_id, staff_id, active_item_id into s
  from therapist_clock_sessions where id = p_session_id;
  if s.id is null then
    raise exception 'Session not found';
  end if;
  if not (app.is_owner() or app.has_branch_role(s.branch_id, array['manager','front_desk']::role_type[])) then
    raise exception 'Not authorized to manage the queue here';
  end if;

  day_start := (date_trunc('day', now() at time zone 'Asia/Bangkok')) at time zone 'Asia/Bangkok';

  update pos_transaction_items i
     set completed_at = now()
    from pos_transactions t
   where t.id = i.transaction_id
     and i.staff_id = s.staff_id
     and i.item_type = 'service'
     and i.completed_at is null
     and t.status = 'completed'
     and (
       -- the linked massage and its add-ons on the same bill
       i.id = s.active_item_id
       or i.transaction_id = (select transaction_id from pos_transaction_items where id = s.active_item_id)
       -- anything else of theirs that has already started today, at either store
       or (t.created_at >= day_start and coalesce(i.start_at, t.created_at) <= now())
     );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.finish_session_jobs(uuid) from public, anon;
grant execute on function public.finish_session_jobs(uuid) to authenticated;
