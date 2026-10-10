-- A register with shift or sales history can't be deleted. Archiving hides it
-- from the drawer picker at the POS and from staff register access, while its
-- shifts, sales and reports stay exactly as they were. Restore brings it back.
alter table public.pos_registers
  add column if not exists archived_at timestamptz;

create index if not exists pos_registers_branch_active_idx
  on public.pos_registers (branch_id) where archived_at is null;
