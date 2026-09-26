-- therapist_documents_complete previously checked the per-document
-- is_required flag, which is unrelated to the org-wide required-document
-- list an owner now configures in Settings (organizations.settings ->
-- 'requiredDocumentTypes'). Branches with require_documents_for_clockin
-- enabled were blocking clock-in on the wrong signal. Recompute against the
-- same org-wide list the Completeness screen uses.
create or replace function app.therapist_documents_complete(p_staff_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_required text[];
begin
  select coalesce(array(select jsonb_array_elements_text(o.settings -> 'requiredDocumentTypes')), array[]::text[])
  into v_required
  from public.staff s
  join public.organizations o on o.id = s.org_id
  where s.id = p_staff_id;

  if v_required is null or array_length(v_required, 1) is null then
    return true;
  end if;

  return not exists (
    select 1 from unnest(v_required) as rt(doc_type)
    where not exists (
      select 1 from public.staff_documents sd
      where sd.staff_id = p_staff_id
        and sd.doc_type::text = rt.doc_type
        and sd.file_url is not null
        and (sd.expiry_date is null or sd.expiry_date >= current_date)
    )
  );
end;
$$;
