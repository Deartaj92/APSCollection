-- Migration: minimal users table + login RPC
-- Date: 2026-02-12

begin;

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  full_name text not null default '',
  role text not null default 'user',
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- keep updated_at in sync (function already exists in schema, kept safe here)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_users_set_updated_at on public.users;
create trigger trg_users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

alter table public.users enable row level security;

drop policy if exists "users_auth_select" on public.users;
create policy "users_auth_select"
on public.users
for select
to authenticated
using (true);

drop policy if exists "users_auth_insert" on public.users;
create policy "users_auth_insert"
on public.users
for insert
to authenticated
with check (true);

drop policy if exists "users_auth_update" on public.users;
create policy "users_auth_update"
on public.users
for update
to authenticated
using (true)
with check (true);

-- Login RPC for anon/authenticated clients.
-- Uses bcrypt-compatible hash check via crypt().
create or replace function public.verify_user_login(p_username text, p_password text)
returns table (
  user_id uuid,
  username text,
  full_name text,
  role text
)
language sql
security definer
set search_path = public, extensions
as $$
  select u.id, u.username, u.full_name, u.role
  from public.users u
  where lower(u.username) = lower(trim(p_username))
    and u.is_active = true
    and u.password_hash = extensions.crypt(p_password, u.password_hash)
  limit 1;
$$;

revoke all on function public.verify_user_login(text, text) from public;
grant execute on function public.verify_user_login(text, text) to anon, authenticated;

-- Seed default user (change password after first login).
insert into public.users (username, full_name, role, password_hash, is_active)
values (
  'ali',
  'Ali',
  'admin',
  extensions.crypt('6677', extensions.gen_salt('bf')),
  true
)
on conflict (username) do nothing;

commit;
