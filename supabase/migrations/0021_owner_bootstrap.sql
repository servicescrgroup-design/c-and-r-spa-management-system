-- Bootstrapping problem: staff accounts are normally created by an existing
-- owner sending an invite (migration 0002), but the very first owner has no
-- one to invite them. This gives a brand-new deployment exactly one way to
-- create that first admin account, and only while none exists yet.
create function app.owner_exists()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.staff_branch_roles where role = 'owner');
$$;

grant execute on function app.owner_exists() to anon, authenticated;

create function public.owner_exists()
returns boolean
language sql
security invoker
stable
set search_path = public
as $$
  select app.owner_exists();
$$;

grant execute on function public.owner_exists() to anon, authenticated;

-- Turns the currently-authenticated user into the org-wide owner. Refuses
-- once any owner already exists, so this is a one-time bootstrap step, not
-- an open door — after the first owner is claimed, every other account is
-- created through the normal invite flow.
create function app.claim_owner_account(
  p_first_name text,
  p_last_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to claim the admin account.';
  end if;

  if app.owner_exists() then
    raise exception 'An admin account has already been set up for this system.';
  end if;

  select email into v_email from auth.users where id = v_uid;
  select id into v_org_id from public.organizations order by created_at limit 1;

  insert into public.staff (id, org_id, first_name, last_name, email)
  values (v_uid, v_org_id, p_first_name, p_last_name, v_email)
  on conflict (id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name;

  insert into public.staff_branch_roles (staff_id, branch_id, role, is_primary)
  values (v_uid, null, 'owner', true)
  on conflict (staff_id, branch_id, role) do nothing;
end;
$$;

grant execute on function app.claim_owner_account(text, text) to authenticated;

create function public.claim_owner_account(
  p_first_name text,
  p_last_name text
)
returns void
language sql
security invoker
set search_path = public
as $$
  select app.claim_owner_account(p_first_name, p_last_name);
$$;

grant execute on function public.claim_owner_account(text, text) to authenticated;
