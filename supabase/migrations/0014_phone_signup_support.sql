-- Extends the customer auto-provisioning trigger to also match/backfill by
-- phone number, so phone-OTP signups (which have no email) still merge into
-- an existing walk-in customer row instead of creating a duplicate.
create or replace function app.handle_new_customer_user()
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
  if new.email is not null then
    select exists (
      select 1 from public.staff_invites
      where email = new.email and accepted_at is null and expires_at > now()
    ) into v_has_pending_invite;

    if v_has_pending_invite then
      return new;
    end if;
  end if;

  select id into v_org_id from public.organizations order by created_at limit 1;

  select id into v_existing_customer_id
  from public.customers
  where auth_user_id is null
    and (
      (new.email is not null and email = new.email)
      or (new.phone is not null and phone = new.phone)
    )
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
      coalesce(new.phone, new.raw_user_meta_data->>'phone')
    );
  end if;

  return new;
end;
$$;
