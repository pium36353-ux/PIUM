-- Registro commissioni affiliati: una riga per ogni mensilità pagata da un cliente referenziato
create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  stripe_invoice_id text not null unique,
  amount numeric(10,2) not null default 25.00,
  month_number int not null check (month_number between 1 and 12),
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_aff_comm_affiliate on public.affiliate_commissions(affiliate_id, status);
create index if not exists idx_aff_comm_business on public.affiliate_commissions(business_id);

alter table public.affiliate_commissions enable row level security;

-- L'affiliato legge solo le proprie commissioni
create policy "aff_comm: affiliate read own" on public.affiliate_commissions
  for select using (
    affiliate_id in (select id from public.affiliates where user_id = auth.uid())
  );

-- L'admin legge e aggiorna tutto
create policy "aff_comm: admin read all" on public.affiliate_commissions
  for select using (auth.jwt()->'app_metadata'->>'role' = 'admin');

create policy "aff_comm: admin update all" on public.affiliate_commissions
  for update using (auth.jwt()->'app_metadata'->>'role' = 'admin')
  with check (auth.jwt()->'app_metadata'->>'role' = 'admin');

-- Nessuna policy di insert: scrive solo il webhook con service role (bypassa RLS)
