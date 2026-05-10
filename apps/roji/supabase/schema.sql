-- Run this in Supabase → SQL Editor

create table if not exists subscribers (
  id         uuid        default gen_random_uuid() primary key,
  email      text        unique not null,
  created_at timestamptz default now()
);

-- Only the anon key can insert; nobody can read via the public API
alter table subscribers enable row level security;

create policy "anyone can subscribe"
  on subscribers for insert
  with check (true);

-- Allows the admin stats API (anon key) to read subscriber data
create policy "anon can read subscribers"
  on subscribers for select
  using (true);
