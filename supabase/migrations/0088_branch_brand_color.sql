-- Each store's brand colour, used for its tabs, badges and charts. Combined views blend them.
alter table public.branches add column if not exists brand_color text not null default '#6e6e73'
  check (brand_color ~ '^#[0-9a-fA-F]{6}$');
update public.branches set brand_color = '#1f7a35' where code = 'CR2';
update public.branches set brand_color = '#0071e3' where code = 'CR1';
