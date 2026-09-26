-- Phase 5: document storage + the optional clock-in gate on missing/expired
-- required documents ("Optional block clock-in if required doc missing or
-- expired" in the spec — off by default, a branch opts in).
alter table public.branches
  add column if not exists require_documents_for_clockin boolean not null default false;

insert into storage.buckets (id, name, public)
values ('staff-photos', 'staff-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('staff-documents', 'staff-documents', false)
on conflict (id) do nothing;

create policy "Owners and managers manage staff photos" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'staff-photos'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  )
  with check (
    bucket_id = 'staff-photos'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  );

create policy "Anyone can view staff photos" on storage.objects
  for select
  using (bucket_id = 'staff-photos');

create policy "Owners and managers manage staff documents" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'staff-documents'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  )
  with check (
    bucket_id = 'staff-documents'
    and (app.is_owner() or exists (select 1 from public.staff_branch_roles where staff_id = auth.uid() and role = 'manager'))
  );

-- Checks a therapist's required documents at their home/assigned branches:
-- returns true only when every is_required doc row exists and isn't expired.
-- Used to (optionally) block clock-in, and to drive the completeness
-- checklist in the UI.
create function app.therapist_documents_complete(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.staff_documents
    where staff_id = p_staff_id
      and is_required
      and (file_url is null or (expiry_date is not null and expiry_date < current_date))
  );
$$;

grant execute on function app.therapist_documents_complete(uuid) to authenticated;

create function public.therapist_documents_complete(p_staff_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select app.therapist_documents_complete(p_staff_id);
$$;

grant execute on function public.therapist_documents_complete(uuid) to authenticated;
