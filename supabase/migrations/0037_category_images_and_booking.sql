-- Lets the public booking page show a category-picker step first: an image,
-- a short description, and (like services already have) a Thai name.
alter table public.service_categories
  add column if not exists name_th text,
  add column if not exists description text,
  add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('category-images', 'category-images', true)
on conflict (id) do nothing;

create policy "Owners and managers manage category images" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'category-images'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  )
  with check (
    bucket_id = 'category-images'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  );

create policy "Anyone can view category images" on storage.objects
  for select
  using (bucket_id = 'category-images');
