-- Guests on the booking page couldn't read service categories (only signed-in
-- staff could), so they never saw the category tiles, photos or translated
-- names. Categories are public menu data like services: anyone may read them.
-- Staff still only see and change their own business's categories.
--
-- Applied 2026-10-25. The business fence is widened in place rather than
-- dropped and recreated: a signed-in guest (no staff record) passes the read
-- side, and the only permissive policy such a guest matches is the read-only
-- one below, so writes stay with owners and managers of the same business.

create policy "Anyone can view service categories" on public.service_categories
  for select to anon, authenticated using (true);

alter policy "Business fence" on public.service_categories
  using (((select app.my_org_ids()) @> array[org_id]) or ((select app.current_staff_id()) is null))
  with check ((select app.my_org_ids()) @> array[org_id]);
