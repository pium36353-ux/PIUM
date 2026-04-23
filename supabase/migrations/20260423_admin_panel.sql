-- ============================================================
-- Admin panel: plan column + admin RLS policy
-- ============================================================

-- Add plan column to businesses
alter table businesses
  add column if not exists plan text not null default 'trial'
    check (plan in ('trial', 'free', 'starter', 'pro'));

-- Admin can read ALL businesses (app_metadata.role = 'admin')
create policy "businesses: admin read all"
  on businesses for select
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- Admin can update any business (plan, is_active, etc.)
create policy "businesses: admin update all"
  on businesses for update
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  )
  with check (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );
