-- Colonne Stripe per gestione abbonamenti ricorrenti.
-- stripe_subscription_id: ID abbonamento Stripe (es. sub_xxx) — scritto dal webhook
-- stripe_customer_id:     ID cliente Stripe (es. cus_xxx) — scritto dal webhook
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text;
