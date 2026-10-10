-- Checking out a booking (with or without a deposit) links the sale to the
-- booking and marks the booking completed, so it can't be checked out twice.
create or replace function public.complete_booking_checkout(p_appointment_id uuid, p_transaction_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  a public.appointments;
  t public.pos_transactions;
begin
  select * into a from public.appointments where id = p_appointment_id for update;
  if a.id is null then raise exception 'Booking not found.'; end if;
  if not app.can_run_front_desk(a.branch_id) then raise exception 'Not allowed at this store.'; end if;
  select * into t from public.pos_transactions where id = p_transaction_id;
  if t.id is null or t.branch_id <> a.branch_id then raise exception 'That sale isn''t at this booking''s store.'; end if;

  update public.pos_transactions set appointment_id = a.id where id = t.id and appointment_id is null;
  update public.appointments
     set status = case when status in ('cancelled', 'no_show') then status else 'completed' end
   where id = a.id;
end $$;
revoke all on function public.complete_booking_checkout(uuid, uuid) from public, anon;
grant execute on function public.complete_booking_checkout(uuid, uuid) to authenticated;
