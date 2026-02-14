-- Migration: expenditures table
-- Date: 2026-02-12

begin;

create table if not exists public.expenditures (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  title text not null,
  amount bigint not null check (amount > 0),
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_expenditures_expense_date on public.expenditures(expense_date);
create index if not exists idx_expenditures_created_at on public.expenditures(created_at desc);
create index if not exists idx_expenditures_title on public.expenditures(title);

drop trigger if exists trg_expenditures_set_updated_at on public.expenditures;
create trigger trg_expenditures_set_updated_at
before update on public.expenditures
for each row execute function public.set_updated_at();

alter table public.expenditures enable row level security;

drop policy if exists "expenditures_auth_select" on public.expenditures;
create policy "expenditures_auth_select"
on public.expenditures
for select
to anon, authenticated
using (true);

drop policy if exists "expenditures_auth_insert" on public.expenditures;
create policy "expenditures_auth_insert"
on public.expenditures
for insert
to anon, authenticated
with check (true);

drop policy if exists "expenditures_auth_update" on public.expenditures;
create policy "expenditures_auth_update"
on public.expenditures
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "expenditures_auth_delete" on public.expenditures;
create policy "expenditures_auth_delete"
on public.expenditures
for delete
to anon, authenticated
using (true);

commit;
