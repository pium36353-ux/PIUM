-- ============================================================
-- Flag account gratuiti legittimi (amici, demo affiliati, omaggi).
-- Un business con is_free=true non viene MAI bloccato (isBusinessBlocked,
-- businessGate.js) e non conta mai come "cliente pagante" nelle statistiche
-- (getBusinessRealStatus lo classifica 'gift', non 'active') — a prescindere
-- da status/trial_ends_at/stripe_subscription_id. Non passa mai da Stripe.
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;
