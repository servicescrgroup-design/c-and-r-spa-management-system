-- Lets staff count starting/ending cash by denomination (coins and notes)
-- instead of typing one lump total — the breakdown is stored for audit
-- alongside the total that was already there.
alter table public.cash_drawer_sessions
  add column if not exists opening_breakdown jsonb,
  add column if not exists counted_breakdown jsonb;
