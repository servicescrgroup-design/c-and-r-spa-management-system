-- Phase 3: the actual service-sale data needed on top of Phase 1's combo
-- pricing tables. Single-service sales reuse the existing, already-seeded
-- service_price_options (just gaining a payout column); multi-service
-- sales go through the combo tables from migration 0023.
alter table public.service_price_options
  add column if not exists payout_cents integer not null default 0;

alter table public.pos_transaction_items
  add column if not exists duration_minutes integer;

alter type public.pos_payment_method add value if not exists 'promptpay';

-- Lists every priced duration for an exact combo of services (branch
-- override wins per duration), so the sale screen can populate a duration
-- dropdown instead of asking the user to guess a valid one.
create function app.find_combo_options(
  p_service_ids uuid[],
  p_branch_id uuid
)
returns table (duration_minutes integer, price_cents integer, payout_cents integer)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select array_agg(distinct x order by x) as ids from unnest(p_service_ids) as x
  ),
  matching_combo as (
    select scm.combo_id
    from public.service_combo_members scm
    group by scm.combo_id
    having array_agg(scm.service_id order by scm.service_id) = (select ids from target)
  ),
  ranked as (
    select
      scp.duration_minutes,
      scp.price_cents,
      scp.payout_cents,
      row_number() over (
        partition by scp.duration_minutes
        order by (scp.branch_id = p_branch_id) desc, scp.branch_id nulls last
      ) as rnk
    from matching_combo mc
    join public.service_combo_prices scp on scp.combo_id = mc.combo_id
    where scp.branch_id = p_branch_id or scp.branch_id is null
  )
  select duration_minutes, price_cents, payout_cents from ranked where rnk = 1
  order by duration_minutes;
$$;

grant execute on function app.find_combo_options(uuid[], uuid) to authenticated;
