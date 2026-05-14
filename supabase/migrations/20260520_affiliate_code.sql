-- ============================================================
-- businesses: affiliate_code column
-- Tracks which affiliate referred this business owner at signup.
-- Linked to affiliates.code (no FK — code is a text identifier).
-- ============================================================
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS affiliate_code text;

CREATE INDEX IF NOT EXISTS idx_businesses_affiliate_code
  ON businesses(affiliate_code)
  WHERE affiliate_code IS NOT NULL;
