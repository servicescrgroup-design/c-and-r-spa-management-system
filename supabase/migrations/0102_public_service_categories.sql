-- NOT YET APPLIED to the database: waiting for the owner to approve (2026-10-25).
-- Guests on the booking page couldn't read service categories (only signed-in
-- staff could), so they never saw the category tiles, photos or translated
-- names. Categories are public menu data like services: anyone may read them.
-- Staff still only see and change their own business's categories.

create policy "Anyone can view service categories" on public.service_categories
  for select to anon, authenticated using (true);

drop policy "Business fence" on public.service_categories;
create policy "Business fence read" on public.service_categories as restrictive
  for select to authenticated
  using (((select app.my_org_ids()) @> array[org_id]) or ((select app.current_staff_id()) is null));
create policy "Business fence insert" on public.service_categories as restrictive
  for insert to authenticated with check ((select app.my_org_ids()) @> array[org_id]);
create policy "Business fence update" on public.service_categories as restrictive
  for update to authenticated using ((select app.my_org_ids()) @> array[org_id]) with check ((select app.my_org_ids()) @> array[org_id]);
create policy "Business fence delete" on public.service_categories as restrictive
  for delete to authenticated using ((select app.my_org_ids()) @> array[org_id]);
