-- Who checked a therapist in or out, and when the button was actually
-- pressed. clock_in_at stays the check-in time that counts (it can be typed
-- in, e.g. the therapist arrived at 09:00 but was entered at 09:12).
alter table public.therapist_clock_sessions
  add column if not exists clock_in_recorded_at timestamptz,
  add column if not exists clocked_in_by_staff_id uuid references public.staff(id) on delete set null,
  add column if not exists clocked_out_by_staff_id uuid references public.staff(id) on delete set null;
