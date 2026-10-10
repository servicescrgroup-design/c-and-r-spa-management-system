-- A deposit ledger entry for giving the เงินประกัน back (ประกันคืน).
alter type public.deposit_entry_type add value if not exists 'refund';
