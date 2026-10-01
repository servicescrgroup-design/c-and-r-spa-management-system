-- Security-definer functions skip row-level security, so each one that acts on
-- a row by id must check the row belongs to the caller's business. Plus the
-- business sign-up, the public business lookup, and storage fences.

-- 1. Role helpers: a role only counts at stores of your own business.
create or replace function app.staff_branch_ids(roles public.role_type[] default null)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select b.id from public.branches b
  where b.org_id = app.current_org_id()
    and exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = auth.uid()
        and (sbr.branch_id is null or sbr.branch_id = b.id)
        and (roles is null or sbr.role = any(roles))
    );
$$;

create or replace function app.has_branch_role(p_branch_id uuid, roles public.role_type[])
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from public.staff_branch_roles sbr
    join public.branches b on b.id = p_branch_id
    where sbr.staff_id = auth.uid()
      and sbr.role = any(roles)
      and (sbr.branch_id = p_branch_id or sbr.branch_id is null)
      and b.org_id = app.current_org_id()
  );
$$;

create or replace function app.can_run_front_desk(p_branch_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select app.has_branch_role(p_branch_id, array['owner','manager','front_desk']::public.role_type[]);
$$;

-- 2. "Owner anywhere, or manager here" becomes "owner or manager at this store".
do $$
declare
  r record;
  v_def text;
  v_new text;
  v_count int := 0;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app') and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%app.is_owner() or app.has_branch_role(%'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, 'app\.is_owner\(\) or app\.has_branch_role\(([^,]+), array\[''', 'app.has_branch_role(\1, array[''owner'',''', 'g');
    if v_new = v_def or v_new like '%app.is_owner() or app.has_branch_role(%' then
      raise exception 'Could not rewrite the owner check in %', r.oid::regprocedure;
    end if;
    execute v_new;
    v_count := v_count + 1;
  end loop;
  if v_count <> 5 then
    raise exception 'Expected 5 functions with an owner-anywhere check, found %', v_count;
  end if;
end $$;

-- 3. Small fixes to functions that picked "the" business or matched rows by id alone.
do $$
declare
  v_def text;
  v_new text;
  f text;
begin
  foreach f in array array['public.add_expense_category(text)', 'public.add_vendor(text)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    v_new := replace(v_def, 'select id into v_org from public.organizations limit 1;', 'v_org := app.current_org_id();');
    if v_new = v_def then raise exception 'Pattern not found in %', f; end if;
    execute v_new;
  end loop;

  v_def := pg_get_functiondef('public.set_sale_customer(uuid, text, uuid)'::regprocedure);
  v_new := replace(v_def,
    'not exists (select 1 from public.customers where id = p_customer_id)',
    'not exists (select 1 from public.customers where id = p_customer_id and org_id = (select t.org_id from public.pos_transactions t where t.id = p_transaction_id))');
  if v_new = v_def then raise exception 'Pattern not found in set_sale_customer'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.record_transportation_fee(uuid, uuid, integer, uuid)'::regprocedure);
  v_new := replace(v_def,
    'select org_id into v_org from public.branches where id = p_branch_id;',
    'select org_id into v_org from public.branches where id = p_branch_id;
  if not exists (select 1 from public.staff where id = p_staff_id and org_id = v_org) then
    raise exception ''That therapist doesn''''t work for this business'';
  end if;');
  if v_new = v_def then raise exception 'Pattern not found in record_transportation_fee'; end if;
  execute v_new;

  -- Online bookings: the services and therapist must belong to the store's business.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.proname = 'create_booking_request';
  v_new := replace(v_def,
    '  select id into v_customer_id from public.customers
  where org_id = v_org_id',
    '  if exists (select 1 from public.services where id = any(p_service_ids) and org_id <> v_org_id)
     or (p_staff_id is not null and not exists (select 1 from public.staff where id = p_staff_id and org_id = v_org_id)) then
    raise exception ''That massage or therapist isn''''t offered at this branch.'';
  end if;

  select id into v_customer_id from public.customers
  where org_id = v_org_id');
  if v_new = v_def then raise exception 'Pattern not found in create_booking_request'; end if;
  execute v_new;

  -- The deposit card shows the business's own name.
  v_def := pg_get_functiondef('public.get_deposit_card(text)'::regprocedure);
  v_new := replace(v_def, '''branch_name'', b.name,', '''business_name'', (select o.name from public.organizations o where o.id = b.org_id),
    ''branch_name'', b.name,');
  if v_new = v_def then raise exception 'Pattern not found in get_deposit_card'; end if;
  execute v_new;
end $$;

-- The shared therapist queue is per business.
create or replace function public.next_queue_position(p_work_date date)
returns integer language sql stable security definer set search_path to '' as $$
  select case
    when app.current_staff_id() is null then 0
    else coalesce(max(queue_position), -1) + 1
  end
  from public.therapist_clock_sessions
  where work_date = p_work_date and org_id = app.current_org_id();
$$;

create or replace function public.staff_booking_conflicts(p_staff_ids uuid[], p_start timestamptz, p_end timestamptz, p_exclude_appointment uuid default null)
returns table(staff_id uuid, start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path to '' as $function$
  select aps.staff_id, w.line_start, w.line_end
  from public.appointment_services aps
  join public.appointments a on a.id = aps.appointment_id
  cross join lateral app.appointment_line_window(a.start_at, a.end_at, aps.start_offset_minutes, aps.duration_minutes) w
  where app.current_staff_id() is not null
    and aps.org_id = app.current_org_id()
    and aps.staff_id = any (p_staff_ids)
    and a.status not in ('cancelled', 'no_show', 'completed')
    and w.line_start < p_end
    and w.line_end > p_start
    and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
  order by w.line_start;
$function$;

-- Store codes (used on receipts and deposit cards) get the business's own
-- prefix: its first store's letters, else the first two letters of its name.
create or replace function app.assign_branch_code()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare
  v_prefix text;
begin
  if new.code is null or btrim(new.code) = '' then
    select regexp_replace(code, '\d', '', 'g') into v_prefix
    from public.branches where org_id = new.org_id order by created_at limit 1;
    if v_prefix is null or v_prefix = '' then
      select upper(left(regexp_replace(name, '[^A-Za-z]', '', 'g'), 2)) into v_prefix
      from public.organizations where id = new.org_id;
    end if;
    if v_prefix is null or length(v_prefix) < 2 then
      v_prefix := 'HB';
    end if;
    select v_prefix || (coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::integer), 0) + 1)
      into new.code from public.branches where regexp_replace(code, '\d', '', 'g') = v_prefix;
  end if;
  new.code := upper(btrim(new.code));
  return new;
end;
$function$;

-- 4. Customer sign-ups join the business whose page they signed up on.
-- Business owners signing up get no customer record.
create or replace function app.handle_new_customer_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_org_id uuid;
  v_existing_customer_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'signup_kind', '') = 'business' then
    return new;
  end if;

  if new.email is not null and exists (
    select 1 from public.staff_invites
    where email = new.email and accepted_at is null and expires_at > now()
  ) then
    return new;
  end if;

  select id into v_org_id from public.organizations where slug = new.raw_user_meta_data->>'business';
  if v_org_id is null then
    select id into v_org_id from public.organizations order by created_at limit 1;
  end if;

  select id into v_existing_customer_id
  from public.customers
  where org_id = v_org_id
    and auth_user_id is null
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
$function$;

-- 5. Public lookup of a business for its booking page (name only).
create or replace function public.public_business(p_slug text)
returns table(id uuid, name text, slug text)
language sql stable security definer set search_path to '' as $$
  select o.id, o.name, o.slug from public.organizations o where o.slug = lower(p_slug);
$$;
grant execute on function public.public_business(text) to anon, authenticated;

-- 6. Sign-up: a new owner creates their own business. Nothing is copied from
-- any other business; the chart of accounts and categories are a standard set.
create or replace function public.create_business(
  p_business_name text,
  p_store_name text,
  p_first_name text,
  p_last_name text default null,
  p_phone text default null,
  p_sample_menu boolean default true
)
returns text language plpgsql security definer set search_path to '' as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_org uuid;
  v_branch uuid;
  v_slug text;
  v_base text;
  v_n int := 1;
  v_cat uuid;
  v_svc uuid;
  m record;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from public.staff where id = v_uid) then
    raise exception 'This login already belongs to a business. Sign in instead.';
  end if;
  if exists (select 1 from public.customers where auth_user_id = v_uid) then
    raise exception 'This email is used for a customer account. Sign up with another email.';
  end if;
  if coalesce(btrim(p_business_name), '') = '' then raise exception 'Enter your business name.'; end if;
  if coalesce(btrim(p_store_name), '') = '' then raise exception 'Enter a name for your first store.'; end if;
  if coalesce(btrim(p_first_name), '') = '' then raise exception 'Enter your first name.'; end if;
  if length(p_business_name) > 80 or length(p_store_name) > 80 then raise exception 'Keep names under 80 characters.'; end if;

  select email into v_email from auth.users where id = v_uid;

  -- A short web address for the booking page, e.g. /b/lotus-spa.
  v_base := trim(both '-' from regexp_replace(lower(p_business_name), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'spa'; end if;
  v_base := left(v_base, 40);
  v_slug := v_base;
  while exists (select 1 from public.organizations where slug = v_slug) or v_slug in ('admin', 'pos', 'book', 'auth', 'api', 'signup', 'start') loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.organizations (name, slug, timezone, currency)
  values (btrim(p_business_name), v_slug, 'Asia/Bangkok', 'THB')
  returning id into v_org;

  insert into public.staff (id, org_id, first_name, last_name, email, phone)
  values (v_uid, v_org, btrim(p_first_name), coalesce(btrim(p_last_name), ''), v_email, nullif(btrim(coalesce(p_phone, '')), ''));

  insert into public.staff_branch_roles (staff_id, branch_id, role, is_primary)
  values (v_uid, null, 'owner', true);

  v_n := 1;
  v_base := v_slug || '-' || left(trim(both '-' from regexp_replace(lower(p_store_name), '[^a-z0-9]+', '-', 'g')), 30);
  v_base := trim(both '-' from v_base);
  while exists (select 1 from public.branches where slug = v_base || case when v_n = 1 then '' else '-' || v_n end) loop
    v_n := v_n + 1;
  end loop;
  insert into public.branches (org_id, name, slug, brand_color)
  values (v_org, btrim(p_store_name), v_base || case when v_n = 1 then '' else '-' || v_n end, '#1f7a35')
  returning id into v_branch;

  insert into public.pos_registers (org_id, branch_id, name) values (v_org, v_branch, 'Front desk');
  insert into public.site_content (org_id) values (v_org);

  insert into public.accounts (org_id, code, name, type)
  select v_org, a.code, a.name, a.type::public.account_type
  from (values
    ('1000','Cash','asset'), ('1010','Card Clearing','asset'), ('1300','Inventory Asset','asset'),
    ('2000','Accounts Payable','liability'), ('2100','Gift Card Liability','liability'),
    ('2110','Store Credit Liability','liability'), ('2150','Customer Deposits','liability'),
    ('2200','Deferred Revenue - Packages','liability'), ('2300','Sales Tax Payable','liability'),
    ('2400','Commission Payable','liability'), ('2410','Tips Payable','liability'),
    ('3000','Owner''s Equity','equity'),
    ('4000','Service Revenue','revenue'), ('4100','Retail Product Revenue','revenue'),
    ('4200','Package & Membership Revenue','revenue'), ('4300','Card Surcharge Income','revenue'),
    ('4900','Discounts & Refunds','revenue'),
    ('5000','Cost of Goods Sold','expense'), ('6000','Commission Expense','expense'),
    ('6100','Payroll Wages Expense','expense'), ('6200','Payroll Tax Expense','expense'),
    ('6300','Operating Expenses','expense'), ('6900','Card Processing Fees','expense')
  ) as a(code, name, type);

  insert into public.expense_categories (org_id, name)
  select v_org, n from unnest(array[
    'Electricity & water', 'General', 'Internet & phone', 'Laundry', 'Marketing', 'Oils & supplies',
    'Other', 'Rent', 'Repairs & maintenance', 'Staff meals', 'Towels & linen', 'Transport', 'Transportation fee'
  ]) as n;

  if p_sample_menu then
    insert into public.service_categories (org_id, name, sort_order) values (v_org, 'Massage', 0) returning id into v_cat;
    for m in
      select * from (values
        ('Thai Massage', 60, 30000, 12000, 0), ('Thai Massage', 90, 45000, 18000, 0), ('Thai Massage', 120, 60000, 24000, 0),
        ('Foot Massage', 60, 30000, 12000, 1),
        ('Oil Massage', 60, 45000, 15000, 2), ('Oil Massage', 90, 65000, 22000, 2)
      ) as x(name, minutes, price, payout, sort)
    loop
      select id into v_svc from public.services where org_id = v_org and name = m.name;
      if v_svc is null then
        insert into public.services (org_id, category_id, name, description, duration_minutes, default_price_cents)
        values (v_org, v_cat, m.name, 'Sample price. Change it on the Services page.', m.minutes, m.price)
        returning id into v_svc;
      end if;
      insert into public.service_price_options (org_id, service_id, duration_minutes, price_cents, payout_cents, sort_order)
      values (v_org, v_svc, m.minutes, m.price, m.payout, m.minutes);
      v_svc := null;
    end loop;
  end if;

  return v_slug;
end;
$function$;
revoke all on function public.create_business(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_business(text, text, text, text, text, boolean) to authenticated;

-- 7. Storage: uploads and private documents stay inside your business. The
-- first folder of each path is the staff, service, category or product id,
-- or the business id for site images.
create or replace function app.storage_path_in_my_org(p_bucket text, p_name text)
returns boolean language plpgsql stable security definer set search_path to '' as $$
declare
  v_folder text := split_part(p_name, '/', 1);
  v_orgs uuid[] := app.my_org_ids();
begin
  if v_folder !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  return case p_bucket
    when 'staff-documents' then exists (select 1 from public.staff where id = v_folder::uuid and org_id = any(v_orgs))
    when 'staff-photos' then exists (select 1 from public.staff where id = v_folder::uuid and org_id = any(v_orgs))
    when 'service-images' then exists (select 1 from public.services where id = v_folder::uuid and org_id = any(v_orgs))
    when 'category-images' then exists (select 1 from public.service_categories where id = v_folder::uuid and org_id = any(v_orgs))
    when 'product-images' then exists (select 1 from public.products where id = v_folder::uuid and org_id = any(v_orgs))
    when 'site-images' then v_folder::uuid = any(v_orgs)
    else true
  end;
end;
$$;

drop policy if exists "Business fence write" on storage.objects;
drop policy if exists "Business fence update" on storage.objects;
drop policy if exists "Business fence delete" on storage.objects;
drop policy if exists "Business fence documents" on storage.objects;
create policy "Business fence write" on storage.objects as restrictive for insert to authenticated
  with check (app.storage_path_in_my_org(bucket_id, name));
create policy "Business fence update" on storage.objects as restrictive for update to authenticated
  using (app.storage_path_in_my_org(bucket_id, name)) with check (app.storage_path_in_my_org(bucket_id, name));
create policy "Business fence delete" on storage.objects as restrictive for delete to authenticated
  using (app.storage_path_in_my_org(bucket_id, name));
create policy "Business fence documents" on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'staff-documents' or app.storage_path_in_my_org(bucket_id, name));
