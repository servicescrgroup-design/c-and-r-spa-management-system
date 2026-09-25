-- Track Stripe deposit payments against online bookings.
create type public.deposit_status as enum ('not_required', 'pending', 'paid', 'failed', 'refunded');

alter table public.appointments
  add column deposit_status public.deposit_status not null default 'not_required',
  add column deposit_amount_cents integer,
  add column deposit_payment_ref text;

create index appointments_deposit_payment_ref_idx on public.appointments(deposit_payment_ref)
  where deposit_payment_ref is not null;

-- ---------------------------------------------------------------------------
-- Called right after create_booking_request when the branch requires a
-- deposit and the Next.js server has created a Stripe PaymentIntent for it.
-- Security definer since the booking customer is anonymous at this point;
-- narrow update surface (only deposit_* columns, only pending appointments).
-- ---------------------------------------------------------------------------
create function app.record_deposit_intent(
  p_appointment_id uuid,
  p_amount_cents integer,
  p_provider_ref text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.appointments
  set deposit_status = 'pending',
      deposit_amount_cents = p_amount_cents,
      deposit_payment_ref = p_provider_ref
  where id = p_appointment_id
    and status = 'pending';

  if not found then
    raise exception 'Appointment not found or not eligible for a deposit.';
  end if;
end;
$$;

grant execute on function app.record_deposit_intent(uuid, integer, text) to anon, authenticated;

create or replace function public.record_deposit_intent(
  p_appointment_id uuid,
  p_amount_cents integer,
  p_provider_ref text
)
returns void
language sql
security invoker
set search_path = public
as $$
  select app.record_deposit_intent(p_appointment_id, p_amount_cents, p_provider_ref);
$$;

grant execute on function public.record_deposit_intent(uuid, integer, text) to anon, authenticated;
