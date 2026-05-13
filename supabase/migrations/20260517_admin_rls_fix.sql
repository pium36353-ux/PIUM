-- ============================================================
-- Fix policy RLS admin: lettura e aggiornamento di tutti i
-- businesses indipendentemente da is_active o user_id.
--
-- Motivo: la policy originale in 20260423_admin_panel.sql
-- potrebbe non essere stata applicata al DB. Questo script è
-- idempotente: DROP IF EXISTS prima di CREATE.
-- ============================================================

-- Rimuove le policy precedenti se esistono (no errore se assenti)
drop policy if exists "businesses: admin read all"   on businesses;
drop policy if exists "businesses: admin update all" on businesses;

-- L'admin può leggere QUALSIASI business (is_active qualsiasi)
create policy "businesses: admin read all"
  on businesses for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- L'admin può aggiornare QUALSIASI business (plan, status, ecc.)
create policy "businesses: admin update all"
  on businesses for update
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
