-- Customers: walk-ins (no auth user) and self-service accounts.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  dob date,
  notes text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create index customers_org_id_idx on public.customers(org_id);
create index customers_email_idx on public.customers(email);

alter table public.customers enable row level security;

create function app.current_customer_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.customers where auth_user_id = auth.uid();
$$;

create policy "Customers manage their own profile"
  on public.customers for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy "Customers update their own profile"
  on public.customers for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy "Staff view customers in their org"
  on public.customers for select
  to authenticated
  using (exists (select 1 from public.staff where id = auth.uid() and org_id = customers.org_id));

create policy "Staff manage customers in their org"
  on public.customers for all
  to authenticated
  using (exists (select 1 from public.staff where id = auth.uid() and org_id = customers.org_id))
  with check (exists (select 1 from public.staff where id = auth.uid() and org_id = customers.org_id));

-- ---------------------------------------------------------------------------
-- Customer signup trigger: backfill an existing walk-in customer row matched
-- by email, or create a new customer row, whenever a new auth user is
-- created that is NOT a staff invite acceptance.
-- ---------------------------------------------------------------------------

create function app.handle_new_customer_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_existing_customer_id uuid;
  v_has_pending_invite boolean;
begin
  select exists (
    select 1 from public.staff_invites
    where email = new.email and accepted_at is null and expires_at > now()
  ) into v_has_pending_invite;

  if v_has_pending_invite then
    return new;
  end if;

  select id into v_org_id from public.organizations order by created_at limit 1;

  select id into v_existing_customer_id
  from public.customers
  where email = new.email and auth_user_id is null
  limit 1;

  if v_existing_customer_id is not null then
    update public.customers set auth_user_id = new.id where id = v_existing_customer_id;
  else
    insert into public.customers (org_id, auth_user_id, first_name, last_name, email, phone)
    values (
      v_org_id,
      new.id,
      coalesce(new.raw_user_meta_data->>'first_name', ''),
      coalesce(new.raw_user_meta_data->>'last_name', ''),
      new.email,
      new.raw_user_meta_data->>'phone'
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created_customer
  after insert on auth.users
  for each row execute function app.handle_new_customer_user();
