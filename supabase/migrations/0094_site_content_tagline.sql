-- Each business's booking page has its own tagline and intro line.
alter table public.site_content add column if not exists tagline text, add column if not exists intro text;
update public.site_content set tagline = 'Relax further.', intro = 'Traditional Thai massage in the heart of Chiang Mai.'
where org_id = (select id from public.organizations where slug = 'candr') and tagline is null;
