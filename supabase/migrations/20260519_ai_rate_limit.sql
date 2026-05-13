-- ============================================================
-- AI rate limiting: token-based monthly cap + display counter
-- ADD COLUMN IF NOT EXISTS è idempotente: sicuro da rieseguire.
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS ai_tokens_month        int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_calls_month_display int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_unlimited           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_reset_date          date;
