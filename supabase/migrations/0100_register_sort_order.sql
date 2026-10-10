-- Owners and managers drag registers into the order they want them listed,
-- on the Registers page and in the drawer picker at the POS.
alter table public.pos_registers add column if not exists sort_order integer not null default 0;

with ordered as (
  select id, row_number() over (partition by branch_id order by name) as rn
  from public.pos_registers
)
update public.pos_registers r
set sort_order = ordered.rn
from ordered
where ordered.id = r.id and r.sort_order = 0;
