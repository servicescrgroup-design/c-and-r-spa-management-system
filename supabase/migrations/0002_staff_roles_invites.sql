-- Staff, role assignments, and invite flow.
create type public.role_type as enum ('owner', 'manager', 'front_desk', 'therapist');

create table public.staff (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  employment_status text not null default 'active' check (employment_status in ('active', 'inactive')),
  hire_date date,
  pay_type text not null default 'hourly' check (pay_type in ('hourly', 'commission', 'salary', 'hybrid')),
  base_hourly_rate_cents integer,
  created_at timestamptz not null default now()
);

create table public.staff_branch_roles (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  role public.role_type not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (staff_id, branch_id, role)
);

create index staff_branch_roles_staff_id_idx on public.staff_branch_roles(staff_id);
create index staff_branch_roles_branch_id_idx on public.staff_branch_roles(branch_id);

create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  email text not null,
  role public.role_type not null,
  token uuid not null unique default gen_random_uuid(),
  invited_by_staff_id uuid references public.staff(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index staff_invites_email_idx on public.staff_invites(email) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- app.* helper functions: the single source of truth for RLS checks.
-- SECURITY DEFINER + a fixed search_path so they can read staff/role tables
-- regardless of the calling role's own RLS visibility.
-- ---------------------------------------------------------------------------

create function app.current_staff_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.staff where id = auth.uid();
$$;

create function app.is_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.staff_branch_roles
    where staff_id = auth.uid() and role = 'owner'
  );
$$;

create function app.staff_branch_ids(roles public.role_type[] default null)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  -- org-wide roles (branch_id is null, e.g. owner) match every branch
  select id from public.branches
  where exists (
    select 1 from public.staff_branch_roles sbr
    where sbr.staff_id = auth.uid() and sbr.branch_id is null
      and (roles is null or sbr.role = any(roles))
  )
  union
  select distinct branch_id from public.staff_branch_roles
  where staff_id = auth.uid() and branch_id is not null
    and (roles is null or role = any(roles));
$$;

create function app.has_branch_role(p_branch_id uuid, roles public.role_type[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.staff_branch_roles
    where staff_id = auth.uid()
      and role = any(roles)
      and (branch_id = p_branch_id or branch_id is null)
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

alter table public.staff enable row level security;
alter table public.staff_branch_roles enable row level security;
alter table public.staff_invites enable row level security;

create policy "Staff can view colleagues in their branches"
  on public.staff for select
  to authenticated
  using (
    id = auth.uid()
    or app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles mine
      join public.staff_branch_roles theirs on theirs.staff_id = staff.id
      where mine.staff_id = auth.uid()
        and mine.role in ('owner', 'manager')
        and (mine.branch_id = theirs.branch_id or mine.branch_id is null)
    )
  );

create policy "Owners and managers manage staff"
  on public.staff for update
  to authenticated
  using (
    app.is_owner()
    or id = auth.uid()
    or exists (
      select 1 from public.staff_branch_roles mine
      join public.staff_branch_roles theirs on theirs.staff_id = staff.id
      where mine.staff_id = auth.uid() and mine.role = 'manager'
        and (mine.branch_id = theirs.branch_id or mine.branch_id is null)
    )
  )
  with check (app.is_owner() or id = auth.uid());

create policy "Staff can view role assignments in scope"
  on public.staff_branch_roles for select
  to authenticated
  using (
    staff_id = auth.uid()
    or app.is_owner()
    or (branch_id in (select app.staff_branch_ids(array['owner','manager']::public.role_type[])))
  );

create policy "Owners and managers manage role assignments"
  on public.staff_branch_roles for all
  to authenticated
  using (app.is_owner() or (branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))))
  with check (app.is_owner() or (branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))));

create policy "Owners and managers manage invites"
  on public.staff_invites for all
  to authenticated
  using (app.is_owner() or (branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))))
  with check (app.is_owner() or (branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))));

-- Now that staff_branch_roles exists, tighten branches access: owners/managers
-- get full read/write, front_desk/therapist get read-only on their branches.
create policy "Staff can view their branches"
  on public.branches for select
  to authenticated
  using (id in (select app.staff_branch_ids()));

create policy "Owners and managers manage branches"
  on public.branches for all
  to authenticated
  using (app.is_owner() or id in (select app.staff_branch_ids(array['manager']::public.role_type[])))
  with check (app.is_owner() or id in (select app.staff_branch_ids(array['manager']::public.role_type[])));

create policy "Owners and managers manage organizations"
  on public.organizations for all
  to authenticated
  using (app.is_owner())
  with check (app.is_owner());

-- ---------------------------------------------------------------------------
-- Invite acceptance trigger: when a new auth user is created, if a pending
-- staff_invites row matches their email, create the staff row + role
-- assignment and mark the invite accepted.
-- ---------------------------------------------------------------------------

create function app.handle_new_staff_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.staff_invites%rowtype;
begin
  select * into v_invite
  from public.staff_invites
  where email = new.email and accepted_at is null and expires_at > now()
  order by created_at desc
  limit 1;

  if v_invite.id is not null then
    insert into public.staff (id, org_id, first_name, last_name, email)
    values (new.id, v_invite.org_id, '', '', new.email)
    on conflict (id) do nothing;

    insert into public.staff_branch_roles (staff_id, branch_id, role, is_primary)
    values (new.id, v_invite.branch_id, v_invite.role, true)
    on conflict (staff_id, branch_id, role) do nothing;

    update public.staff_invites set accepted_at = now() where id = v_invite.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created_staff
  after insert on auth.users
  for each row execute function app.handle_new_staff_user();
