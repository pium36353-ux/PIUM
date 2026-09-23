-- ============================================================
-- Chiusura automatica degli ordini dimenticati + allineamento del
-- vincolo DB alla stessa combinazione tavolo+data+turno già usata dalla
-- visualizzazione (correzione precedente in Tavoli.jsx).
--
-- Regola di business: un ordine dimenticato aperto si chiude da solo
-- quando arriva la successiva occorrenza dello STESSO turno (es. un
-- Pranzo di ieri lasciato aperto si chiude quando si apre il Pranzo di
-- oggi) — un turno non tocca mai un turno diverso. Logica applicativa,
-- non qui in migration: vedi Tavoli.jsx.
-- ============================================================

-- 1. Colonna per distinguere una chiusura automatica da una manuale.
ALTER TABLE table_orders
  ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;

-- 2. Il vecchio vincolo (un solo ordine aperto per tavolo, senza guardare
--    data/turno) è incompatibile con la regola sopra: un Pranzo
--    dimenticato aperto bloccherebbe l'apertura di un ordine allo stesso
--    tavolo a Cena dello stesso giorno, mentre la visualizzazione mostra
--    già quel tavolo come libero per quella combinazione. Il vincolo deve
--    seguire la stessa identità (tavolo, order_date, turn_id) della
--    visualizzazione, non il solo tavolo.
DROP INDEX IF EXISTS idx_table_orders_one_open_per_table;

CREATE UNIQUE INDEX IF NOT EXISTS idx_table_orders_one_open_per_slot
  ON table_orders(table_id, order_date, turn_id) WHERE status = 'aperto';
