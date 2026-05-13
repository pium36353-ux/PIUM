create table if not exists push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  business_id   uuid not null references businesses(id) on delete cascade,
  endpoint      text not null,
  subscription  jsonb not null,
  created_at    timestamptz default now(),
  unique(user_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions: owner"
  on push_subscriptions
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
