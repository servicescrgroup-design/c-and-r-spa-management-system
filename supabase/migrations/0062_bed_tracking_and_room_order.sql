-- Walk-ins can be placed on a specific bed/chair (not only a room), and rooms
-- and beds get a manual sort order for drag-and-drop in branch setup.
alter table public.branch_rooms add column if not exists sort_order integer not null default 0;
alter table public.room_beds add column if not exists sort_order integer not null default 0;

update public.branch_rooms r set sort_order = s.rn
from (select id, row_number() over (partition by branch_id order by name) as rn from public.branch_rooms) s
where s.id = r.id;

update public.room_beds b set sort_order = s.rn
from (select id, row_number() over (partition by room_id order by name) as rn from public.room_beds) s
where s.id = b.id;

alter table public.therapist_clock_sessions
  add column if not exists current_bed_id uuid references public.room_beds(id) on delete set null;
alter table public.pos_transactions
  add column if not exists bed_id uuid references public.room_beds(id) on delete set null;

create index if not exists therapist_clock_sessions_current_bed_idx on public.therapist_clock_sessions (current_bed_id);
create index if not exists pos_transactions_bed_idx on public.pos_transactions (bed_id);
