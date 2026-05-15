-- Aggiunge 'active' ai valori ammessi per la colonna plan.
-- Il vincolo originale ammetteva solo: trial, free, starter, pro.
-- Stripe imposta plan='active' al pagamento confermato.
ALTER TABLE businesses
  DROP CONSTRAINT IF EXISTS businesses_plan_check;

ALTER TABLE businesses
  ADD CONSTRAINT businesses_plan_check
  CHECK (plan IN ('trial', 'free', 'starter', 'pro', 'active'));
