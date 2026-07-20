-- Già applicato manualmente in produzione il 2026-07-19 (SQL Editor).
-- Rimossa policy con cmd=ALL che permetteva a un affiliato di aggiornare
-- la propria riga (incluso status → 'approved', bypassando approve-affiliate).
-- La lettura resta garantita dalla policy "affiliates: select own".
DROP POLICY IF EXISTS "Affiliato vede solo i suoi dati" ON public.affiliates;
