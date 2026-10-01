-- org_id is filled by the aa_fill_org_id trigger from the parent row. A column
-- default (the signed-in staff member's business) tells the generated types
-- the app doesn't have to send it; the trigger still has the final say.
do $$
declare r record;
begin
  for r in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'org_id' and c.column_default is null
  loop
    execute format('alter table public.%I alter column org_id set default app.current_org_id()', r.table_name);
  end loop;
end $$;
