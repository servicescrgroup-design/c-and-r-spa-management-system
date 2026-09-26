-- Directions link per branch (shown on the public homepage and booking
-- landing), plus owner-editable background images for the homepage.

alter table public.branches
  add column if not exists map_url text;

update public.branches
set map_url = 'https://www.google.com/maps/place/C+and+R+Thai+Massage+Sunday+Walking+Street/data=!4m2!3m1!1s0x0:0xa7fce43f4fdd26d6'
where slug = 'c-and-r-sunday-walking-street' and map_url is null;

update public.branches
set map_url = 'https://www.google.com/maps/place/C+and+R+Thai+Massage+Chiang+Mai+Gate/@18.7809796,98.988834,16z/data=!4m6!3m5!1s0x30da31fe8e314951:0x921a100b4bb53e!8m2!3d18.7809796!4d98.988834'
where slug = 'c-and-r-chiang-mai-gate' and map_url is null;

-- Single-row table of public site content. Organizations is staff-only, so
-- anything the anonymous homepage reads lives here instead.
create table if not exists public.site_content (
  id boolean primary key default true check (id),
  hero_image_url text,
  branches_image_url text,
  updated_at timestamptz not null default now()
);

insert into public.site_content (id) values (true) on conflict (id) do nothing;

alter table public.site_content enable row level security;

create policy "Anyone can read site content" on public.site_content
  for select to anon, authenticated
  using (true);

create policy "Owners and managers edit site content" on public.site_content
  for update to authenticated
  using (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  with check (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'));

insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do nothing;

create policy "Owners and managers manage site images" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'site-images'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  )
  with check (
    bucket_id = 'site-images'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  );

-- Public bucket: files are served by public URL, so no anonymous select
-- policy is needed (that would also let anyone list the bucket).
