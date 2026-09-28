-- Several receptionists can work one register at the same time. The person
-- who opens the drawer is on it automatically; others join it. Every sale
-- keeps pos_transactions.staff_id and every expense keeps
-- created_by_staff_id, so each receptionist's work stays traceable.
create table public.cash_drawer_members (
  drawer_session_id uuid not null references public.cash_drawer_sessions(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (drawer_session_id, staff_id)
);
create index cash_drawer_members_staff_idx on public.cash_drawer_members (staff_id) where left_at is null;

alter table public.cash_drawer_members enable row level security;

create policy "POS staff see who is on drawers in their branches" on public.cash_drawer_members for select to authenticated
  using (drawer_session_id in (
    select ds.id from public.cash_drawer_sessions ds
    join public.pos_registers r on r.id = ds.register_id
    where r.branch_id in (select app.staff_branch_ids(array['owner', 'manager', 'front_desk']::public.role_type[]))
  ));
create policy "POS staff join and leave drawers themselves" on public.cash_drawer_members for all to authenticated
  using (staff_id = app.current_staff_id() or app.is_owner())
  with check (
    (staff_id = app.current_staff_id() or app.is_owner())
    and drawer_session_id in (
      select ds.id from public.cash_drawer_sessions ds
      join public.pos_registers r on r.id = ds.register_id
      where ds.status = 'open'
        and r.branch_id in (select app.staff_branch_ids(array['owner', 'manager', 'front_desk']::public.role_type[]))
    )
  );
