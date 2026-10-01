-- Security advisor: pin the search_path of app.payment_account_code.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'payment_account_code' loop
    execute format('alter function %s set search_path to %L', r.f, '');
  end loop;
end $$;
