-- Lets a therapist see their own completed job history (for "how much have
-- I made today/this week" on their self-service portal) without opening up
-- branch-wide sales data to them.
create policy "Therapists view their own transaction items" on public.pos_transaction_items
  for select to authenticated
  using (staff_id = auth.uid());

create policy "Therapists view transactions behind their own items" on public.pos_transactions
  for select to authenticated
  using (
    exists (
      select 1 from public.pos_transaction_items pti
      where pti.transaction_id = pos_transactions.id and pti.staff_id = auth.uid()
    )
  );

-- Working deposit (เงินประกัน) and uniform fee (ค่าชุด): a simple ledger
-- rather than two fixed fields, since the spec is "sometimes paid in one
-- go, sometimes deducted monthly at a variable amount" — a running balance
-- from charges minus payments/deductions handles both without special-casing.
create type public.deposit_entry_type as enum ('deposit_charge', 'uniform_charge', 'payment', 'deduction');

create table public.therapist_deposit_ledger (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  entry_type public.deposit_entry_type not null,
  amount_cents integer not null,
  note text,
  created_by_staff_id uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index therapist_deposit_ledger_staff_idx on public.therapist_deposit_ledger(staff_id, created_at);

alter table public.therapist_deposit_ledger enable row level security;

create policy "Staff view their own deposit ledger" on public.therapist_deposit_ledger
  for select to authenticated
  using (
    staff_id = auth.uid()
    or app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = therapist_deposit_ledger.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );

create policy "Owners and managers manage deposit ledger" on public.therapist_deposit_ledger
  for insert to authenticated
  with check (
    app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = therapist_deposit_ledger.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );

create policy "Owners and managers delete deposit ledger entries" on public.therapist_deposit_ledger
  for delete to authenticated
  using (
    app.is_owner()
    or exists (
      select 1 from public.staff_branch_roles sbr
      where sbr.staff_id = therapist_deposit_ledger.staff_id
        and sbr.branch_id in (select app.staff_branch_ids(array['manager']::public.role_type[]))
    )
  );
