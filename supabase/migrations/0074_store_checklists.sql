-- Store checklists: each store has its own opening, 2pm mid-day and closing
-- items (owners and managers edit them). Staff tick items on the POS, naming
-- who did each one. At the 2pm check a second person reviews every opening
-- item and signs the check off. On days with one worker the store is marked
-- "one person today" and that person re-checks their own work.

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  shift text not null check (shift in ('opening', 'midday', 'closing')),
  section text,
  label text not null check (length(trim(label)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index checklist_items_branch_shift_idx on public.checklist_items (branch_id, shift, sort_order);

create table public.checklist_days (
  branch_id uuid not null references public.branches(id) on delete cascade,
  work_date date not null,
  solo boolean not null default false,
  solo_set_by_staff_id uuid references public.staff(id),
  midday_signed_off_by_staff_id uuid references public.staff(id),
  midday_signed_off_at timestamptz,
  midday_note text,
  primary key (branch_id, work_date)
);

create table public.checklist_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  work_date date not null,
  shift text not null check (shift in ('opening', 'midday', 'closing')),
  item_id uuid references public.checklist_items(id) on delete set null,
  label text not null,
  section text,
  done_by_staff_id uuid references public.staff(id),
  done_at timestamptz,
  note text,
  recorded_by_staff_id uuid references public.staff(id),
  verified_by_staff_id uuid references public.staff(id),
  verified_at timestamptz,
  verify_result text check (verify_result in ('ok', 'fixed', 'issue')),
  verify_note text,
  verified_solo boolean not null default false,
  unique (branch_id, work_date, shift, item_id)
);
create index checklist_entries_day_idx on public.checklist_entries (branch_id, work_date);

alter table public.checklist_items enable row level security;
alter table public.checklist_days enable row level security;
alter table public.checklist_entries enable row level security;

create policy "Branch staff view checklist items" on public.checklist_items for select to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids()));
create policy "Owners and managers edit checklist items" on public.checklist_items for all to authenticated
  using (app.has_branch_role(branch_id, array['owner', 'manager']::public.role_type[]))
  with check (app.has_branch_role(branch_id, array['owner', 'manager']::public.role_type[]));

create policy "Branch staff view checklist days" on public.checklist_days for select to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids()));
create policy "Branch staff view checklist entries" on public.checklist_entries for select to authenticated
  using (app.is_owner() or branch_id in (select app.staff_branch_ids()));
-- Days and entries are written only through the functions below.

create or replace function app.can_run_checklist(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_branch_role(p_branch_id, array['owner', 'manager', 'front_desk', 'therapist']::public.role_type[]);
$$;

create or replace function app.checklist_staff_ok(p_branch_id uuid, p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_branch_roles r
    where r.staff_id = p_staff_id and (r.branch_id = p_branch_id or r.branch_id is null)
  );
$$;

/** Tick (or untick) an item, naming who did it. */
create or replace function public.checklist_tick(
  p_branch_id uuid,
  p_work_date date,
  p_item_id uuid,
  p_done_by uuid,
  p_done boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.checklist_items%rowtype;
begin
  if not app.can_run_checklist(p_branch_id) then
    raise exception 'You don''t work at this store.';
  end if;
  select * into v_item from public.checklist_items where id = p_item_id and branch_id = p_branch_id;
  if v_item.id is null then
    raise exception 'That item isn''t on this store''s checklist.';
  end if;
  if p_done and (p_done_by is null or not app.checklist_staff_ok(p_branch_id, p_done_by)) then
    raise exception 'Choose who did it.';
  end if;
  if exists (
    select 1 from public.checklist_days d
    where d.branch_id = p_branch_id and d.work_date = p_work_date and d.midday_signed_off_at is not null
  ) and v_item.shift in ('opening', 'midday') then
    raise exception 'The 2pm check is already signed off. Ask a manager to reopen it.';
  end if;

  if not p_done then
    delete from public.checklist_entries
    where branch_id = p_branch_id and work_date = p_work_date and item_id = p_item_id;
    return;
  end if;

  insert into public.checklist_entries (branch_id, work_date, shift, item_id, label, section, done_by_staff_id, done_at, note, recorded_by_staff_id)
  values (p_branch_id, p_work_date, v_item.shift, v_item.id, v_item.label, v_item.section, p_done_by, now(),
          nullif(trim(coalesce(p_note, '')), ''), app.current_staff_id())
  on conflict (branch_id, work_date, shift, item_id) do update
    set done_by_staff_id = excluded.done_by_staff_id, done_at = excluded.done_at,
        note = excluded.note, recorded_by_staff_id = excluded.recorded_by_staff_id,
        verified_by_staff_id = null, verified_at = null, verify_result = null, verify_note = null, verified_solo = false;
end;
$$;

/**
 * The 2pm review of an opening item. The reviewer must be a different person
 * from whoever did it, unless the store is marked as one person today.
 * 'fixed' also covers an item nobody did: the reviewer did it now.
 */
create or replace function public.checklist_verify(
  p_branch_id uuid,
  p_work_date date,
  p_item_id uuid,
  p_verified_by uuid,
  p_result text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.checklist_items%rowtype;
  v_entry public.checklist_entries%rowtype;
  v_solo boolean;
begin
  if not app.can_run_checklist(p_branch_id) then
    raise exception 'You don''t work at this store.';
  end if;
  if p_result is not null and p_result not in ('ok', 'fixed', 'issue') then
    raise exception 'Unknown result.';
  end if;
  if p_result is not null and (p_verified_by is null or not app.checklist_staff_ok(p_branch_id, p_verified_by)) then
    raise exception 'Choose who is checking.';
  end if;
  if p_result = 'issue' and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Write what the problem is.';
  end if;
  select * into v_item from public.checklist_items where id = p_item_id and branch_id = p_branch_id and shift = 'opening';
  if v_item.id is null then
    raise exception 'Only opening items are reviewed at 2pm.';
  end if;
  if exists (
    select 1 from public.checklist_days d
    where d.branch_id = p_branch_id and d.work_date = p_work_date and d.midday_signed_off_at is not null
  ) then
    raise exception 'The 2pm check is already signed off. Ask a manager to reopen it.';
  end if;
  select coalesce((select solo from public.checklist_days where branch_id = p_branch_id and work_date = p_work_date), false)
    into v_solo;
  select * into v_entry from public.checklist_entries
  where branch_id = p_branch_id and work_date = p_work_date and item_id = p_item_id;

  if p_result is null then
    update public.checklist_entries
    set verified_by_staff_id = null, verified_at = null, verify_result = null, verify_note = null, verified_solo = false
    where id = v_entry.id;
    return;
  end if;

  if v_entry.id is null then
    if p_result <> 'fixed' and p_result <> 'issue' then
      raise exception 'Nobody ticked this yet. Choose "Did it now" or report a problem.';
    end if;
    insert into public.checklist_entries (branch_id, work_date, shift, item_id, label, section, recorded_by_staff_id,
                                          done_by_staff_id, done_at,
                                          verified_by_staff_id, verified_at, verify_result, verify_note, verified_solo)
    values (p_branch_id, p_work_date, 'opening', v_item.id, v_item.label, v_item.section, app.current_staff_id(),
            case when p_result = 'fixed' then p_verified_by end, case when p_result = 'fixed' then now() end,
            p_verified_by, now(), p_result, nullif(trim(coalesce(p_note, '')), ''), v_solo);
    return;
  end if;

  if not v_solo and v_entry.done_by_staff_id = p_verified_by then
    raise exception 'The 2pm check must be done by a second person. If only one person is working today, turn on "One person today".';
  end if;
  update public.checklist_entries
  set verified_by_staff_id = p_verified_by, verified_at = now(), verify_result = p_result,
      verify_note = nullif(trim(coalesce(p_note, '')), ''), verified_solo = v_solo
  where id = v_entry.id;
end;
$$;

/** Mark a day as one worker (or not). */
create or replace function public.checklist_set_solo(p_branch_id uuid, p_work_date date, p_solo boolean, p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can_run_checklist(p_branch_id) then
    raise exception 'You don''t work at this store.';
  end if;
  if exists (select 1 from public.checklist_days where branch_id = p_branch_id and work_date = p_work_date and midday_signed_off_at is not null) then
    raise exception 'The 2pm check is already signed off.';
  end if;
  insert into public.checklist_days (branch_id, work_date, solo, solo_set_by_staff_id)
  values (p_branch_id, p_work_date, p_solo, p_staff_id)
  on conflict (branch_id, work_date) do update set solo = excluded.solo, solo_set_by_staff_id = excluded.solo_set_by_staff_id;
end;
$$;

/** Sign off the 2pm check once every opening item has been reviewed and every mid-day item ticked. */
create or replace function public.checklist_signoff_midday(p_branch_id uuid, p_work_date date, p_staff_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing integer;
begin
  if not app.can_run_checklist(p_branch_id) then
    raise exception 'You don''t work at this store.';
  end if;
  if p_staff_id is null or not app.checklist_staff_ok(p_branch_id, p_staff_id) then
    raise exception 'Choose who is signing off.';
  end if;
  select count(*) into v_missing
  from public.checklist_items i
  left join public.checklist_entries e
    on e.item_id = i.id and e.branch_id = p_branch_id and e.work_date = p_work_date
  where i.branch_id = p_branch_id and i.is_active
    and ((i.shift = 'opening' and e.verify_result is null) or (i.shift = 'midday' and e.id is null));
  if v_missing > 0 then
    raise exception '% item(s) still need checking before you can sign off.', v_missing;
  end if;
  insert into public.checklist_days (branch_id, work_date, midday_signed_off_by_staff_id, midday_signed_off_at, midday_note)
  values (p_branch_id, p_work_date, p_staff_id, now(), nullif(trim(coalesce(p_note, '')), ''))
  on conflict (branch_id, work_date) do update
    set midday_signed_off_by_staff_id = excluded.midday_signed_off_by_staff_id,
        midday_signed_off_at = excluded.midday_signed_off_at, midday_note = excluded.midday_note;
end;
$$;

/** Owners and managers can reopen a signed-off 2pm check. */
create or replace function public.checklist_reopen_midday(p_branch_id uuid, p_work_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_branch_role(p_branch_id, array['owner', 'manager']::public.role_type[]) then
    raise exception 'Only an owner or manager can reopen the 2pm check.';
  end if;
  update public.checklist_days
  set midday_signed_off_by_staff_id = null, midday_signed_off_at = null
  where branch_id = p_branch_id and work_date = p_work_date;
end;
$$;

revoke all on function app.can_run_checklist(uuid) from public, anon;
revoke all on function app.checklist_staff_ok(uuid, uuid) from public, anon;
revoke all on function public.checklist_tick(uuid, date, uuid, uuid, boolean, text) from public, anon;
revoke all on function public.checklist_verify(uuid, date, uuid, uuid, text, text) from public, anon;
revoke all on function public.checklist_set_solo(uuid, date, boolean, uuid) from public, anon;
revoke all on function public.checklist_signoff_midday(uuid, date, uuid, text) from public, anon;
revoke all on function public.checklist_reopen_midday(uuid, date) from public, anon;
grant execute on function public.checklist_tick(uuid, date, uuid, uuid, boolean, text) to authenticated;
grant execute on function public.checklist_verify(uuid, date, uuid, uuid, text, text) to authenticated;
grant execute on function public.checklist_set_solo(uuid, date, boolean, uuid) to authenticated;
grant execute on function public.checklist_signoff_midday(uuid, date, uuid, text) to authenticated;
grant execute on function public.checklist_reopen_midday(uuid, date) to authenticated;

-- A starter list for every store. Owners replace these with the store's own checklist.
insert into public.checklist_items (branch_id, shift, section, label, sort_order)
select b.id, x.shift, x.section, x.label, x.ord
from public.branches b
cross join (values
  ('opening', 'Front', 'Unlock, lights and air-con on', 10),
  ('opening', 'Front', 'Music on, sign board and price menu outside', 20),
  ('opening', 'Front', 'Sweep and mop the entrance and reception', 30),
  ('opening', 'Front', 'Count the cash float and open the register', 40),
  ('opening', 'Rooms', 'Beds and chairs made with clean sheets', 50),
  ('opening', 'Rooms', 'Towels folded and stocked in every room', 60),
  ('opening', 'Rooms', 'Oils, balm and lotion bottles filled', 70),
  ('opening', 'Rooms', 'Hot towel cabinet on', 80),
  ('opening', 'Foot area', 'Foot basins clean and ready', 90),
  ('opening', 'Toilet', 'Toilet clean, soap and tissue stocked', 100),
  ('midday', null, 'Toilet cleaned and restocked', 10),
  ('midday', null, 'Used towels and sheets to laundry, clean ones restocked', 20),
  ('midday', null, 'Bins emptied', 30),
  ('midday', null, 'Reception and floor tidied', 40),
  ('midday', null, 'Oils and balm topped up', 50),
  ('closing', null, 'Count cash and close the register', 10),
  ('closing', null, 'Laundry started or bagged', 20),
  ('closing', null, 'Foot basins washed and dried', 30),
  ('closing', null, 'Bins emptied', 40),
  ('closing', null, 'Hot towel cabinet, air-con, music and lights off', 50),
  ('closing', null, 'Sign board inside, doors locked', 60)
) as x(shift, section, label, ord);
