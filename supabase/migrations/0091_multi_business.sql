-- HB Spa Management System: many businesses in one database.
-- Every table carries org_id. A trigger fills it from the parent row, so a row
-- always belongs to the same business as what it hangs off. A restrictive
-- policy on every table keeps signed-in users inside their own business; the
-- existing permissive policies (owner / manager / front desk / therapist) are
-- unchanged and now apply within one business. Guests (anon) keep the same
-- narrow public reads as before.

alter table public.organizations add column if not exists slug text;
update public.organizations set slug = 'candr' where slug is null and id = (select id from public.organizations order by created_at limit 1);
update public.organizations set slug = 'b-' || left(id::text, 8) where slug is null;
alter table public.organizations alter column slug set not null;
create unique index if not exists organizations_slug_key on public.organizations (slug);

-- The business of the signed-in staff member (null for customers and guests).
create or replace function app.current_org_id()
returns uuid language sql stable security definer set search_path to '' as $$
  select org_id from public.staff where id = auth.uid();
$$;

-- Businesses the signed-in user may see. Staff: only their own business, even
-- if they also booked somewhere else as a customer. Customers: the businesses
-- they have a customer record with.
create or replace function app.my_org_ids()
returns uuid[] language sql stable security definer set search_path to '' as $$
  select case
    when exists (select 1 from public.staff where id = auth.uid())
      then array(select org_id from public.staff where id = auth.uid())
    else array(select org_id from public.customers where auth_user_id = auth.uid())
  end;
$$;

-- Fill org_id from the parent row named in the trigger arguments (always
-- wins, so a row can't be pointed at another business's parent), else keep
-- what was given, else the signed-in staff member's business.
create or replace function app.fill_org_id()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid;
  v_parent_id text;
begin
  if tg_nargs = 2 then
    v_parent_id := to_jsonb(new) ->> tg_argv[1];
    if v_parent_id is not null then
      execute format('select org_id from public.%I where id = $1', tg_argv[0]) into v_org using v_parent_id::uuid;
      if v_org is not null then
        new.org_id := v_org;
      end if;
    end if;
  end if;
  if new.org_id is null then
    new.org_id := app.current_org_id();
  end if;
  if new.org_id is null then
    raise exception 'Could not tell which business this % row belongs to.', tg_table_name;
  end if;
  return new;
end;
$$;

-- site_content was one row for the whole site; now one row per business.
alter table public.site_content drop constraint if exists site_content_pkey;

-- Tables that had no org_id: (table, parent table, column pointing at the parent).
-- Tables that already had org_id: parent given where the row hangs off a store.
create temporary table _tenancy (t text, parent text, fk text, had_org boolean, public_read boolean) on commit drop;
insert into _tenancy values
  ('appointment_services','appointments','appointment_id',false,false),
  ('bed_type_allowed_services','services','service_id',false,true),
  ('branch_inventory','branches','branch_id',false,false),
  ('branch_product_overrides','branches','branch_id',false,false),
  ('branch_rooms','branches','branch_id',false,false),
  ('branch_service_overrides','branches','branch_id',false,true),
  ('cash_drawer_members','cash_drawer_sessions','drawer_session_id',false,false),
  ('cash_drawer_sessions','pos_registers','register_id',false,false),
  ('checklist_days','branches','branch_id',false,false),
  ('checklist_entries','branches','branch_id',false,false),
  ('checklist_items','branches','branch_id',false,false),
  ('customer_package_redemptions','customer_packages','customer_package_id',false,false),
  ('customer_package_units','customer_packages','customer_package_id',false,false),
  ('customer_packages','customers','customer_id',false,false),
  ('freelance_sessions','branches','branch_id',false,false),
  ('gift_card_transactions','gift_cards','gift_card_id',false,false),
  ('inventory_adjustments','branches','branch_id',false,false),
  ('journal_entry_lines','journal_entries','journal_entry_id',false,false),
  ('package_items','packages','package_id',false,true),
  ('payroll_adjustments','branches','branch_id',false,false),
  ('payroll_day_locks','branches','branch_id',false,false),
  ('payroll_entries','payroll_periods','payroll_period_id',false,false),
  ('payroll_guarantee_waivers','branches','branch_id',false,false),
  ('pos_discounts','staff','applied_by_staff_id',false,false),
  ('pos_payments','pos_transactions','transaction_id',false,false),
  ('pos_registers','branches','branch_id',false,false),
  ('pos_sale_edits','pos_transactions','transaction_id',false,false),
  ('pos_transaction_items','pos_transactions','transaction_id',false,false),
  ('room_beds','branch_rooms','room_id',false,false),
  ('sale_daily_counters','branches','branch_id',false,false),
  ('service_combo_members','service_combos','combo_id',false,true),
  ('service_combo_prices','service_combos','combo_id',false,true),
  ('service_edit_log','services','service_id',false,false),
  ('service_price_options','services','service_id',false,true),
  ('site_content',null,null,false,true),
  ('staff_branch_roles','staff','staff_id',false,false),
  ('staff_certifications','staff','staff_id',false,false),
  ('staff_commissions','staff','staff_id',false,false),
  ('staff_documents','staff','staff_id',false,false),
  ('staff_register_access','staff','staff_id',false,false),
  ('staff_schedules','staff','staff_id',false,false),
  ('staff_services','staff','staff_id',false,false),
  ('staff_time_off','staff','staff_id',false,false),
  ('store_credit_transactions','store_credits','store_credit_id',false,false),
  ('store_credits','customers','customer_id',false,false),
  ('therapist_clock_sessions','branches','branch_id',false,false),
  ('therapist_deposit_ledger','staff','staff_id',false,false),
  ('therapist_profiles','staff','staff_id',false,false),
  ('tips','pos_transactions','transaction_id',false,false),
  ('accounting_periods',null,null,true,false),
  ('accounts',null,null,true,false),
  ('branches',null,null,true,true),
  ('certifications',null,null,true,false),
  ('customers',null,null,true,false),
  ('expense_categories',null,null,true,false),
  ('gift_cards',null,null,true,false),
  ('packages',null,null,true,true),
  ('payroll_periods',null,null,true,false),
  ('product_categories',null,null,true,false),
  ('products',null,null,true,false),
  ('service_categories',null,null,true,false),
  ('service_combos',null,null,true,true),
  ('services',null,null,true,true),
  ('staff',null,null,true,false),
  ('vendors',null,null,true,false),
  ('appointments','branches','branch_id',true,false),
  ('audit_log',null,null,true,false),
  ('commission_rules',null,null,true,false),
  ('expenses','branches','branch_id',true,false),
  ('journal_entries',null,null,true,false),
  ('pos_transactions','branches','branch_id',true,false),
  ('staff_invites',null,null,true,false);

do $$
declare
  r record;
  v_first uuid := (select id from public.organizations order by created_at limit 1);
  v_mine text := '(select app.my_org_ids()) @> array[org_id]';
begin
  -- 1. The column, filled with the one business that exists today.
  for r in select * from _tenancy where not had_org loop
    execute format('alter table public.%I add column if not exists org_id uuid references public.organizations(id) on delete cascade', r.t);
    -- Table triggers (e.g. inventory roll-ups) must not fire for this backfill.
    execute format('alter table public.%I disable trigger user', r.t);
    execute format('update public.%I set org_id = $1 where org_id is null', r.t) using v_first;
    execute format('alter table public.%I enable trigger user', r.t);
    execute format('alter table public.%I alter column org_id set not null', r.t);
    execute format('create index if not exists %I on public.%I (org_id)', r.t || '_org_id_idx', r.t);
  end loop;

  -- 2. New rows take their parent's business.
  for r in select * from _tenancy loop
    execute format('drop trigger if exists aa_fill_org_id on public.%I', r.t);
    if r.parent is null then
      execute format('create trigger aa_fill_org_id before insert on public.%I for each row execute function app.fill_org_id()', r.t);
    else
      execute format('create trigger aa_fill_org_id before insert on public.%I for each row execute function app.fill_org_id(%L, %L)', r.t, r.parent, r.fk);
    end if;
  end loop;

  -- 3. The fence. Public catalog tables stay readable by customers browsing
  -- any shop's booking page; staff only ever read their own business.
  for r in select * from _tenancy loop
    if r.public_read then
      execute format('create policy "Business fence read" on public.%I as restrictive for select to authenticated using (%s or (select app.current_staff_id()) is null)', r.t, v_mine);
      execute format('create policy "Business fence insert" on public.%I as restrictive for insert to authenticated with check (%s)', r.t, v_mine);
      execute format('create policy "Business fence update" on public.%I as restrictive for update to authenticated using (%s) with check (%s)', r.t, v_mine, v_mine);
      execute format('create policy "Business fence delete" on public.%I as restrictive for delete to authenticated using (%s)', r.t, v_mine);
    else
      execute format('create policy "Business fence" on public.%I as restrictive for all to authenticated using (%s) with check (%s)', r.t, v_mine, v_mine);
    end if;
  end loop;
end $$;

alter table public.site_content add primary key (org_id);

create policy "Business fence" on public.organizations as restrictive for all to authenticated
  using ((select app.my_org_ids()) @> array[id]) with check ((select app.my_org_ids()) @> array[id]);

-- Every public table must now be in the list above.
do $$
declare v_missing text;
begin
  select string_agg(c.relname, ', ') into v_missing
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'organizations'
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname like 'Business fence%');
  if v_missing is not null then
    raise exception 'Tables without a business fence: %', v_missing;
  end if;
end $$;
