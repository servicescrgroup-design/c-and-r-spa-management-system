-- Core organization and branch tables.
create schema if not exists app;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/New_York',
  currency text not null default 'USD',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null unique,
  address text,
  phone text,
  timezone text not null default 'America/New_York',
  is_active boolean not null default true,
  booking_enabled boolean not null default true,
  deposit_required boolean not null default false,
  deposit_amount_cents integer,
  deposit_percent numeric,
  allowed_embed_origins text[] not null default '{}',
  stripe_location_id text,
  created_at timestamptz not null default now()
);

create index branches_org_id_idx on public.branches(org_id);

alter table public.organizations enable row level security;
alter table public.branches enable row level security;

-- Public/anon needs to read active, booking-enabled branches to render the
-- booking pages; everything else on these tables is staff-only (policies
-- tightened once staff_branch_roles exists in migration 0002).
create policy "Anyone can view active bookable branches"
  on public.branches for select
  to anon, authenticated
  using (is_active and booking_enabled);
