-- Lets an owner drag-and-drop reorder branches (e.g. put Sunday Walking
-- Street first) instead of always seeing them alphabetically.
alter table public.branches add column if not exists sort_order integer not null default 0;

with ordered as (
  select id, row_number() over (order by name) as rn
  from public.branches
)
update public.branches b
set sort_order = ordered.rn
from ordered
where ordered.id = b.id;
