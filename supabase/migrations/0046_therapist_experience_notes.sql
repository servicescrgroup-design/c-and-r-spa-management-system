-- Free-text field for a therapist's prior massage experience, shown on
-- their HR profile and the staff list.
alter table public.therapist_profiles add column if not exists experience_notes text;
