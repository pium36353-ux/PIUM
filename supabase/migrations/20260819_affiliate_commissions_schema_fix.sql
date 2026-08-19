-- ============================================================
-- 20260819_affiliate_commissions_schema_fix.sql
--
-- COSA FA: allinea la struttura reale di affiliate_commissions a quella che
-- il codice (stripe-webhook, Admin.jsx) presume da sempre. DROP + CREATE
-- pulito — tabella verificata VUOTA in produzione (0 righe), nessun dato da
-- convertire.
--
-- PERCHÉ: la tabella fu creata A MANO in produzione (SQL Editor), mai
-- tracciata in una migration — stesso pattern della FK -on risolta in
-- 20260816_affiliate_code_on_suffix_validation.sql. La migration
-- 20260610_affiliate_commissions.sql non è mai stata davvero eseguita
-- (CREATE TABLE IF NOT EXISTS su una tabella già esistente è un no-op
-- silenzioso), quindi dichiarava colonne mai arrivate in produzione:
-- month_number, stripe_invoice_id, paid_at. La tabella reale ha invece
-- month (date), niente stripe_invoice_id, niente paid_at. Risultato:
--   - stripe-webhook/index.ts:269-278 inserisce month_number/stripe_invoice_id
--     → INSERT fallisce con 42703 undefined_column, loggato "non-blocking":
--     nessuna commissione viene mai registrata dal canale ON/OFF attuale.
--   - Admin.jsx:388 legge month_number/paid_at → SELECT fallisce con lo
--     stesso errore → drawer "Errore nel caricamento commissioni."
--
-- DIFFERENZA rispetto a 20260610_affiliate_commissions.sql (voluta):
-- month_number qui NON ha un CHECK superiore a 12. stripe-webhook/index.ts:264
-- è esplicito: "Nessun cap: la commissione continua finché il cliente paga
-- (mesi >12 → tariffa ridotta)". Un CHECK 1-12 ricreerebbe lo stesso bug
-- (insert silenziosamente fallito) dal tredicesimo mese in poi.
-- Anche affiliate_id/business_id diventano NOT NULL (il webhook li valorizza
-- sempre), e status torna ad accettare 'cancelled' — già previsto dalla UI
-- (Admin.jsx: CommStatusBadge) anche se nessun percorso lo scrive oggi.
-- ============================================================

drop table if exists public.affiliate_commissions;

create table public.affiliate_commissions (
  id                 uuid primary key default gen_random_uuid(),
  affiliate_id       uuid not null references public.affiliates(id) on delete cascade,
  business_id        uuid not null references public.businesses(id) on delete cascade,
  stripe_invoice_id  text not null unique,
  amount             numeric(10,2) not null,
  month_number       int not null check (month_number >= 1),
  status             text not null default 'pending' check (status in ('pending','paid','cancelled')),
  paid_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index idx_aff_comm_affiliate on public.affiliate_commissions(affiliate_id, status);
create index idx_aff_comm_business  on public.affiliate_commissions(business_id);

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

-- Nessuna policy di insert: scrive solo il webhook con service role (bypassa RLS).
