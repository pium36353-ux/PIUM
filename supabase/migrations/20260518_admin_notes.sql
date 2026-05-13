-- ============================================================
-- Aggiunge admin_notes a businesses + documenta le colonne
-- "fantasma" (esistono in prod ma assenti dallo schema locale).
-- ADD COLUMN IF NOT EXISTS è idempotente: sicuro da rieseguire.
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS admin_notes      text,
  ADD COLUMN IF NOT EXISTS status           text         not null default 'trial',
  ADD COLUMN IF NOT EXISTS plan_price       numeric      not null default 99,
  ADD COLUMN IF NOT EXISTS trial_ends_at    timestamptz,
  ADD COLUMN IF NOT EXISTS ai_calls_month   int          not null default 0,
  ADD COLUMN IF NOT EXISTS ai_calls_total   int          not null default 0;
