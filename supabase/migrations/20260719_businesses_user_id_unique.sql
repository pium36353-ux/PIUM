-- Constraint già applicato manualmente in produzione il 2026-07-19 (SQL Editor).
-- Questa migration documenta lo stato reale del DB per ambienti nuovi.
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_user_id_unique UNIQUE (user_id);
