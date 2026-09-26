-- A therapist works at one store per day. Once they check in at a store,
-- checking in at the other store that day is refused (checking back in at
-- the same store after clocking out is still fine). Existing rows are left
-- untouched.
create or replace function app.enforce_one_store_per_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other text;
begin
  select b.name into v_other
  from public.therapist_clock_sessions s
  join public.branches b on b.id = s.branch_id
  where s.staff_id = new.staff_id
    and s.work_date = new.work_date
    and s.branch_id <> new.branch_id
    and s.id <> new.id
  limit 1;

  if v_other is not null then
    raise exception using
      errcode = 'P0001',
      message = format('Already checked in at %s today. A therapist can only work at one store per day.', v_other);
  end if;
  return new;
end;
$$;

drop trigger if exists clock_sessions_one_store_per_day on public.therapist_clock_sessions;
create trigger clock_sessions_one_store_per_day
  before insert or update of branch_id, work_date, staff_id on public.therapist_clock_sessions
  for each row execute function app.enforce_one_store_per_day();

revoke all on function app.enforce_one_store_per_day() from public, anon, authenticated;
