-- Run this in Supabase SQL Editor

create table if not exists public.activity_log (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  business_id uuid        references public.businesses(id) on delete cascade not null,
  type        text        not null,
  description text        not null,
  created_at  timestamptz default now() not null
);

create index if not exists activity_log_business_created
  on public.activity_log (business_id, created_at desc);

alter table public.activity_log enable row level security;

create policy "select_own" on public.activity_log
  for select using (auth.uid() = user_id);

create policy "insert_own" on public.activity_log
  for insert with check (auth.uid() = user_id);
