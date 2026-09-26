alter table public.service_categories
  add column if not exists name_zh text,
  add column if not exists name_ko text,
  add column if not exists name_ja text;
