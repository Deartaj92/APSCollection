-- Supabase schema for Payments App
-- Apply in Supabase SQL editor or via supabase db push.

-- Extensions
create extension if not exists pgcrypto;

-- Keep updated_at current
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Parent: fee payment header
create table if not exists public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  payment_date date not null,
  student_name text not null,
  father_name text not null,
  class_name text not null,
  total_amount bigint not null check (total_amount >= 0),
  amount_received bigint not null check (amount_received >= 0),
  remaining_amount bigint generated always as (
    greatest(total_amount - amount_received, 0)
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (amount_received <= total_amount)
);

-- Child: line items per payment
create table if not exists public.fee_payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.fee_payments(id) on delete cascade,
  item_name text not null,
  amount bigint not null check (amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

-- If tables already existed with decimals, convert to whole numbers.
alter table if exists public.fee_payment_items
  alter column amount type bigint using round(amount)::bigint;

alter table if exists public.fee_payments
  alter column total_amount type bigint using round(total_amount)::bigint,
  alter column amount_received type bigint using round(amount_received)::bigint;

-- Indexes for app filters/search
create index if not exists idx_fee_payments_payment_date on public.fee_payments(payment_date);
create index if not exists idx_fee_payments_class_name on public.fee_payments(class_name);
create index if not exists idx_fee_payments_invoice_no on public.fee_payments(invoice_no);
create index if not exists idx_fee_payments_created_at on public.fee_payments(created_at desc);
create index if not exists idx_fee_payment_items_payment_id on public.fee_payment_items(payment_id);

-- Optional text search support (student/father/class search)
create extension if not exists pg_trgm;
create index if not exists idx_fee_payments_student_name_trgm on public.fee_payments using gin (student_name gin_trgm_ops);
create index if not exists idx_fee_payments_father_name_trgm on public.fee_payments using gin (father_name gin_trgm_ops);
create index if not exists idx_fee_payments_class_name_trgm on public.fee_payments using gin (class_name gin_trgm_ops);

-- Trigger for updated_at

drop trigger if exists trg_fee_payments_set_updated_at on public.fee_payments;
create trigger trg_fee_payments_set_updated_at
before update on public.fee_payments
for each row execute function public.set_updated_at();

-- RLS
alter table public.fee_payments enable row level security;
alter table public.fee_payment_items enable row level security;

-- Authenticated users can read/write.
-- Tighten later when you add user ownership columns.
drop policy if exists "fee_payments_auth_select" on public.fee_payments;
create policy "fee_payments_auth_select"
on public.fee_payments
for select
to anon, authenticated
using (true);

drop policy if exists "fee_payments_auth_insert" on public.fee_payments;
create policy "fee_payments_auth_insert"
on public.fee_payments
for insert
to anon, authenticated
with check (true);

drop policy if exists "fee_payments_auth_update" on public.fee_payments;
create policy "fee_payments_auth_update"
on public.fee_payments
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "fee_payments_auth_delete" on public.fee_payments;
create policy "fee_payments_auth_delete"
on public.fee_payments
for delete
to anon, authenticated
using (true);

drop policy if exists "fee_payment_items_auth_select" on public.fee_payment_items;
create policy "fee_payment_items_auth_select"
on public.fee_payment_items
for select
to anon, authenticated
using (true);

drop policy if exists "fee_payment_items_auth_insert" on public.fee_payment_items;
create policy "fee_payment_items_auth_insert"
on public.fee_payment_items
for insert
to anon, authenticated
with check (true);

drop policy if exists "fee_payment_items_auth_update" on public.fee_payment_items;
create policy "fee_payment_items_auth_update"
on public.fee_payment_items
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "fee_payment_items_auth_delete" on public.fee_payment_items;
create policy "fee_payment_items_auth_delete"
on public.fee_payment_items
for delete
to anon, authenticated
using (true);
