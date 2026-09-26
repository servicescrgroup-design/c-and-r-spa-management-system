-- When there's no photo yet, a category or service card can use a flat
-- color instead of the default gradient placeholder.
alter table public.service_categories
  add column if not exists background_color text;

alter table public.services
  add column if not exists image_url text,
  add column if not exists background_color text;

insert into storage.buckets (id, name, public)
values ('service-images', 'service-images', true)
on conflict (id) do nothing;

create policy "Owners and managers manage service images" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'service-images'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  )
  with check (
    bucket_id = 'service-images'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  );

create policy "Anyone can view service images" on storage.objects
  for select
  using (bucket_id = 'service-images');
