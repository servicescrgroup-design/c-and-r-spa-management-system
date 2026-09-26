-- Edit history for the services catalog: a plain audit trail of what
-- changed, when, and by whom, driven by triggers so it can never drift
-- from what actually happened (rather than the UI remembering to log it).
create table public.service_edit_log (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete set null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index service_edit_log_service_idx on public.service_edit_log(service_id, created_at desc);

alter table public.service_edit_log enable row level security;

create policy "Owners and managers view service edit history" on public.service_edit_log
  for select to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

-- ---------------------------------------------------------------------------
-- Logs field-level changes on the service row itself (name, description,
-- category, active status). Only fires an entry when something tracked
-- actually differs, so unrelated updates stay silent.
-- ---------------------------------------------------------------------------
create function app.log_service_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes text[] := array[]::text[];
begin
  if new.name is distinct from old.name then
    v_changes := v_changes || format('name changed from "%s" to "%s"', old.name, new.name);
  end if;
  if new.name_th is distinct from old.name_th then
    v_changes := v_changes || 'Thai name updated'::text;
  end if;
  if new.description is distinct from old.description then
    v_changes := v_changes || 'description updated'::text;
  end if;
  if new.description_th is distinct from old.description_th then
    v_changes := v_changes || 'Thai description updated'::text;
  end if;
  if new.category_id is distinct from old.category_id then
    v_changes := v_changes || 'category changed'::text;
  end if;
  if new.is_active is distinct from old.is_active then
    v_changes := v_changes || (case when new.is_active then 'reactivated' else 'deactivated' end)::text;
  end if;

  if array_length(v_changes, 1) > 0 then
    insert into public.service_edit_log (service_id, staff_id, summary)
    values (new.id, auth.uid(), initcap(array_to_string(v_changes, '; ')));
  end if;

  return new;
end;
$$;

create trigger on_service_updated_log
  after update on public.services
  for each row execute function app.log_service_edit();

-- ---------------------------------------------------------------------------
-- Logs duration/price variant changes, matched to the same log so a
-- service's full history (name, price, durations) reads as one timeline.
-- ---------------------------------------------------------------------------
create function app.log_service_price_option_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.service_edit_log (service_id, staff_id, summary)
    values (
      new.service_id, auth.uid(),
      format('Added %s min option at %s', new.duration_minutes, to_char(new.price_cents / 100.0, 'FM999999990.00'))
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if new.price_cents is distinct from old.price_cents then
      insert into public.service_edit_log (service_id, staff_id, summary)
      values (
        new.service_id, auth.uid(),
        format(
          '%s min price changed from %s to %s',
          new.duration_minutes,
          to_char(old.price_cents / 100.0, 'FM999999990.00'),
          to_char(new.price_cents / 100.0, 'FM999999990.00')
        )
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.service_edit_log (service_id, staff_id, summary)
    values (
      old.service_id, auth.uid(),
      format('Removed %s min option (was %s)', old.duration_minutes, to_char(old.price_cents / 100.0, 'FM999999990.00'))
    );
    return old;
  end if;
  return null;
end;
$$;

create trigger on_service_price_option_change_log
  after insert or update or delete on public.service_price_options
  for each row execute function app.log_service_price_option_change();
