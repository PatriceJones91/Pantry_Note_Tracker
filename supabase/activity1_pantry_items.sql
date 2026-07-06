-- Pantry Note Tracker / Activity 1 table
-- This keeps manual baseline tracking data separate from Smart Pantry recommendation data.

create extension if not exists pgcrypto;

create table if not exists public.activity1_pantry_items (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null,
  username text,
  row_order integer not null default 0,
  item_name text,
  quantity text,
  unit text,
  category text,
  expiration_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_activity1_pantry_items_participant_id
on public.activity1_pantry_items(participant_id);

create or replace function public.set_activity1_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_activity1_pantry_items_updated_at on public.activity1_pantry_items;

create trigger trg_activity1_pantry_items_updated_at
before update on public.activity1_pantry_items
for each row
execute function public.set_activity1_updated_at();

-- If your Smart Pantry app already uses a frontend-only custom login table,
-- these permissive policies allow the anon key to read/write Activity 1 rows.
-- For stronger production security, move login and saving behind a backend API
-- or switch the study login to Supabase Auth.

alter table public.activity1_pantry_items enable row level security;

drop policy if exists "activity1 anon select" on public.activity1_pantry_items;
drop policy if exists "activity1 anon insert" on public.activity1_pantry_items;
drop policy if exists "activity1 anon update" on public.activity1_pantry_items;
drop policy if exists "activity1 anon delete" on public.activity1_pantry_items;

create policy "activity1 anon select"
on public.activity1_pantry_items
for select
to anon
using (true);

create policy "activity1 anon insert"
on public.activity1_pantry_items
for insert
to anon
with check (true);

create policy "activity1 anon update"
on public.activity1_pantry_items
for update
to anon
using (true)
with check (true);

create policy "activity1 anon delete"
on public.activity1_pantry_items
for delete
to anon
using (true);
