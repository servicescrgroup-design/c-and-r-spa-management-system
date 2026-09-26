-- The only prior policy on public.organizations was owner-only for every
-- operation (select included), which silently broke any non-owner staff
-- action that reads the org row (e.g. service/branch/POS actions calling
-- `.from("organizations").select("id")`). Add a read-only policy so any
-- signed-in staff member can view the org; writes remain owner-only via
-- the existing "Owners and managers manage organizations" policy.
create policy "Any staff member can view their organization"
  on public.organizations for select
  to authenticated
  using (app.current_staff_id() is not null);
