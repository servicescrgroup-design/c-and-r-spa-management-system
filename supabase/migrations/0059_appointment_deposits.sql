-- Deposits taken by staff when booking: when it was paid, how, and who took
-- it. Each appointment gets an unguessable token so a deposit card can be
-- shared with the customer as a link without signing in.
alter table public.appointments
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists deposit_method public.pos_payment_method,
  add column if not exists deposit_received_by_staff_id uuid references public.staff(id) on delete set null,
  add column if not exists deposit_note text,
  add column if not exists deposit_card_token text not null default replace(gen_random_uuid()::text, '-', '');

create unique index if not exists appointments_deposit_card_token_key on public.appointments (deposit_card_token);
create index if not exists appointments_deposit_received_by_idx on public.appointments (deposit_received_by_staff_id);

-- Everything printed on a deposit card, looked up by its token only.
create or replace function public.get_deposit_card(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'card_no', 'DEP-' || b.code || '-' || to_char(a.start_at at time zone b.timezone, 'DDMMYY') || '-' || upper(left(a.deposit_card_token, 4)),
    'status', a.status,
    'start_at', a.start_at,
    'end_at', a.end_at,
    'timezone', b.timezone,
    'customer_name', trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
    'customer_phone', c.phone,
    'branch_name', b.name,
    'branch_address', b.address,
    'branch_phone', b.phone,
    'branch_map_url', b.map_url,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'duration_minutes', aps.duration_minutes) order by aps.sort_order)
      from public.appointment_services aps
      join public.services s on s.id = aps.service_id
      where aps.appointment_id = a.id
    ), '[]'::jsonb),
    'therapist', (
      select st.first_name
      from public.appointment_services aps
      join public.staff st on st.id = aps.staff_id
      where aps.appointment_id = a.id
      order by aps.sort_order
      limit 1
    ),
    'total_cents', coalesce((select sum(aps.price_cents) from public.appointment_services aps where aps.appointment_id = a.id), 0),
    'discount_cents', a.discount_cents,
    'deposit_status', a.deposit_status,
    'deposit_cents', coalesce(a.deposit_amount_cents, 0),
    'deposit_method', a.deposit_method,
    'deposit_paid_at', a.deposit_paid_at,
    'deposit_received_by', r.first_name,
    'deposit_note', a.deposit_note
  )
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  left join public.customers c on c.id = a.customer_id
  left join public.staff r on r.id = a.deposit_received_by_staff_id
  where a.deposit_card_token = p_token
    and length(p_token) >= 32;
$$;

revoke all on function public.get_deposit_card(text) from public;
grant execute on function public.get_deposit_card(text) to anon, authenticated;
