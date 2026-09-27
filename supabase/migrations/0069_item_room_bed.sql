-- A sale for a group puts each guest in their own room/bed, so each massage
-- line records where it happens.
alter table public.pos_transaction_items
  add column if not exists room_id uuid references public.branch_rooms(id) on delete set null,
  add column if not exists bed_id uuid references public.room_beds(id) on delete set null;
create index if not exists pos_transaction_items_room_idx on public.pos_transaction_items (room_id);
create index if not exists pos_transaction_items_bed_idx on public.pos_transaction_items (bed_id);
