-- A booking can cover several guests (Guest 1, Guest 2, ...), and one guest can
-- have several massages back to back. Each appointment_services row says which
-- guest it is for and how many minutes after the booking start it begins.
alter table public.appointment_services
  add column if not exists guest_number integer not null default 1 check (guest_number >= 1),
  add column if not exists guest_name text,
  add column if not exists start_offset_minutes integer not null default 0 check (start_offset_minutes >= 0);
