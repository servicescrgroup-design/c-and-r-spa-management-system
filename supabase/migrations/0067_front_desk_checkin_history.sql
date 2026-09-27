-- Front desk can read the history of check-ins at their branches (who
-- entered them, time edits, removals). The rest of the audit log stays
-- owner/manager only.
create policy "Front desk view check-in history" on public.audit_log
  for select to authenticated
  using (
    entity_type = 'therapist_clock_session'
    and branch_id in (select app.staff_branch_ids(array['owner', 'manager', 'front_desk']::public.role_type[]))
  );
