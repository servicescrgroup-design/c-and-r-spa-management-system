-- Extends the price-option edit log to also cover payout (ค่ามือ) changes,
-- now that migration 0025 gives every duration option its own payout.
create or replace function app.log_service_price_option_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.service_edit_log (service_id, staff_id, summary)
    values (
      new.service_id, auth.uid(),
      format('Added %s min option at %s (payout %s)', new.duration_minutes,
        to_char(new.price_cents / 100.0, 'FM999999990.00'), to_char(new.payout_cents / 100.0, 'FM999999990.00'))
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if new.price_cents is distinct from old.price_cents then
      insert into public.service_edit_log (service_id, staff_id, summary)
      values (
        new.service_id, auth.uid(),
        format('%s min price changed from %s to %s', new.duration_minutes,
          to_char(old.price_cents / 100.0, 'FM999999990.00'), to_char(new.price_cents / 100.0, 'FM999999990.00'))
      );
    end if;
    if new.payout_cents is distinct from old.payout_cents then
      insert into public.service_edit_log (service_id, staff_id, summary)
      values (
        new.service_id, auth.uid(),
        format('%s min payout changed from %s to %s', new.duration_minutes,
          to_char(old.payout_cents / 100.0, 'FM999999990.00'), to_char(new.payout_cents / 100.0, 'FM999999990.00'))
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.service_edit_log (service_id, staff_id, summary)
    values (
      old.service_id, auth.uid(),
      format('Removed %s min option (was %s)', old.duration_minutes, to_char(old.price_cents / 100.0, 'FM999999990.00'))
    );
    return old;
  end if;
  return null;
end;
$$;
