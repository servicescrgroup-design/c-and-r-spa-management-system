-- One sale can cover several guests (a couple, a group), so each massage line
-- can carry its own guest name.
alter table public.pos_transaction_items add column if not exists customer_name text;
