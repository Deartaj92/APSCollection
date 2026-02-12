-- Migration: change amount fields to bigint (whole numbers)
-- Date: 2026-02-12

begin;

-- Ensure child item amount is whole-number type
alter table if exists public.fee_payment_items
  alter column amount type bigint using round(amount)::bigint;

-- Drop generated column first (it depends on total_amount / amount_received)
alter table if exists public.fee_payments
  drop column if exists remaining_amount;

-- Convert parent amount fields to whole-number type
alter table if exists public.fee_payments
  alter column total_amount type bigint using round(total_amount)::bigint,
  alter column amount_received type bigint using round(amount_received)::bigint;

-- Rebuild generated remaining_amount as bigint expression
alter table if exists public.fee_payments
  add column remaining_amount bigint generated always as (
    greatest(total_amount - amount_received, 0)
  ) stored;

commit;
