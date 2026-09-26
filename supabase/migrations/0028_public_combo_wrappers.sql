-- Thin public wrappers so PostgREST/the client's .rpc() can reach the
-- app-schema combo lookups (they were only ever granted directly on `app`,
-- which PostgREST never exposes).
create function public.find_combo_options(p_service_ids uuid[], p_branch_id uuid)
returns table (duration_minutes integer, price_cents integer, payout_cents integer)
language sql
stable
security invoker
set search_path = public
as $$
  select * from app.find_combo_options(p_service_ids, p_branch_id);
$$;

grant execute on function public.find_combo_options(uuid[], uuid) to authenticated;

create function public.find_combo_price(p_service_ids uuid[], p_branch_id uuid, p_duration_minutes integer)
returns table (combo_id uuid, price_cents integer, payout_cents integer)
language sql
stable
security invoker
set search_path = public
as $$
  select * from app.find_combo_price(p_service_ids, p_branch_id, p_duration_minutes);
$$;

grant execute on function public.find_combo_price(uuid[], uuid, integer) to authenticated;
