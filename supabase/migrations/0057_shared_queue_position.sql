-- Both stores share one queue. queue_position is now one sequence across all
-- branches for the day, so the next number must look at every store, not
-- just the ones the caller can see under row security.
create or replace function public.next_queue_position(p_work_date date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app.current_staff_id() is null then 0
    else coalesce(max(queue_position), -1) + 1
  end
  from public.therapist_clock_sessions
  where work_date = p_work_date;
$$;

revoke all on function public.next_queue_position(date) from public, anon;
grant execute on function public.next_queue_position(date) to authenticated;

-- Renumber today's open sessions into one combined order (by current store
-- check-in time, the order shown today) so the switch doesn't leave duplicate numbers.
with ranked as (
  select id, row_number() over (order by clock_in_at, queue_position) - 1 as pos
  from public.therapist_clock_sessions
  where work_date = (now() at time zone 'Asia/Bangkok')::date
)
update public.therapist_clock_sessions s
set queue_position = ranked.pos
from ranked
where s.id = ranked.id;
