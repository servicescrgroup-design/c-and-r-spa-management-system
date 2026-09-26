-- Lets the sale flow know which room a therapist currently occupies (for
-- room-conflict checks) and which ticket item their in-progress job is, so
-- completing a job can mark that exact item's minutes as counted for payroll
-- (Phase 4 sums *completed* service minutes only, never just-sold ones).
alter table public.pos_transaction_items
  add column if not exists completed_at timestamptz;

alter table public.therapist_clock_sessions
  add column if not exists current_room_id uuid references public.branch_rooms(id) on delete set null,
  add column if not exists active_item_id uuid references public.pos_transaction_items(id) on delete set null;
