-- A booking deposit used as part of payment at checkout, and its journal source.
alter type public.pos_payment_method add value if not exists 'deposit';
alter type public.journal_source_type add value if not exists 'deposit';
