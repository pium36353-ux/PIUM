-- ============================================================
-- Blocco C: comande/ordinazioni — verticale 'ristorante_bar'.
--
-- Affinamento importante al modello esistente: una table_reservations
-- confermata significa solo "il cliente è atteso" (stato "Prenotato"),
-- non che sia seduto. Il tavolo diventa davvero OCCUPATO solo quando
-- esiste un ordine aperto (table_orders.status='aperto') su di esso —
-- che nasca da una prenotazione o da un walk-in è indifferente per lo
-- stato, cambia solo se reservation_id è valorizzato. Tre stati ora,
-- calcolati sempre al volo (stesso principio già in uso per
-- libero/occupato, vedi MAPPA_TECNICA_PIUM.md sezione "Verticali"):
--   LIBERO    — nessuna prenotazione confermata, nessun ordine aperto per
--               l'esatta combinazione (tavolo, order_date, turn_id) in vista.
--   PRENOTATO — prenotazione confermata, nessun ordine aperto ancora per
--               quella stessa combinazione.
--   OCCUPATO  — un ordine aperto esiste per QUELLA STESSA combinazione
--               (tavolo, order_date, turn_id) — non il tavolo in assoluto:
--               cambiando data o turno in vista, lo stesso tavolo torna a
--               mostrare il proprio stato reale per la combinazione scelta.
--
-- NOTA — vincolo unico e chiusura automatica (letti qui possono fuorviare):
-- l'indice unico più sotto (idx_table_orders_one_open_per_table, un solo
-- ordine aperto per tavolo senza guardare data/turno) è stato SOSTITUITO
-- dalla migration successiva 20260923_table_orders_auto_close.sql con un
-- indice scoped a (table_id, order_date, turn_id), coerente con gli stati
-- sopra. Quella migration introduce anche la chiusura automatica: un
-- ordine dimenticato aperto si chiude da solo alla successiva occorrenza
-- dello STESSO turno (mai di un turno diverso). Vedi quel file per il
-- vincolo e la logica realmente in vigore.
--
-- Additiva, nessun impatto sulle righe esistenti: due CREATE TABLE nuove
-- + un indice trigram su menu_items.name (ricerca fuzzy nella schermata
-- ordine, richiesta esplicitamente).
-- ============================================================

-- Un ordine aperto rappresenta un tavolo fisicamente occupato in questo
-- momento. reservation_id nullable: valorizzato se l'ordine nasce da una
-- prenotazione esistente ("Prendi ordine"), NULL per un walk-in.
CREATE TABLE IF NOT EXISTS table_orders (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  table_id       uuid        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  order_date     date        NOT NULL,
  turn_id        uuid        NOT NULL REFERENCES business_turns(id),
  reservation_id uuid        REFERENCES table_reservations(id) ON DELETE SET NULL,
  status         text        NOT NULL DEFAULT 'aperto' CHECK (status IN ('aperto', 'chiuso')),
  opened_at      timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_table_orders_business_id   ON table_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_table_orders_business_date ON table_orders(business_id, order_date);
CREATE INDEX IF NOT EXISTS idx_table_orders_table_id      ON table_orders(table_id);
CREATE INDEX IF NOT EXISTS idx_table_orders_reservation_id ON table_orders(reservation_id);

-- SUPERSEDED — vincolo storico, lasciato qui solo perché questa migration è
-- già applicata: garantiva un solo ordine aperto per tavolo, senza guardare
-- data/turno. Sostituito da 20260923_table_orders_auto_close.sql con un
-- indice scoped a (table_id, order_date, turn_id), per coerenza con la
-- chiusura automatica introdotta in quella migration (un ordine dimenticato
-- su un turno non deve bloccare un nuovo ordine sullo stesso tavolo in un
-- turno diverso). Non fare riferimento a questo indice per il vincolo
-- realmente in vigore.
CREATE UNIQUE INDEX IF NOT EXISTS idx_table_orders_one_open_per_table
  ON table_orders(table_id) WHERE status = 'aperto';

ALTER TABLE table_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "table_orders: owner all" ON table_orders
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = table_orders.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = table_orders.business_id AND b.user_id = auth.uid())
  );

-- Righe d'ordine, indipendenti l'una dall'altra di proposito (nessun
-- realtime in questo blocco): due camerieri che aggiungono voci allo
-- stesso ordine nello stesso momento ottengono ciascuno un insert
-- separato, mai una race su una singola riga condivisa.
CREATE TABLE IF NOT EXISTS table_order_items (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid        NOT NULL REFERENCES table_orders(id) ON DELETE CASCADE,
  menu_item_id        uuid        REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name_snapshot  text        NOT NULL,
  price_snapshot      numeric(10,2),
  quantity            int         NOT NULL DEFAULT 1,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_order_items_order_id     ON table_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_table_order_items_menu_item_id ON table_order_items(menu_item_id);

ALTER TABLE table_order_items ENABLE ROW LEVEL SECURITY;

-- RLS via join sulla tabella principale (qui table_orders) → businesses,
-- stesso pattern di appointment_services/table_reservation_tables/
-- menu_item_flags: nessun business_id diretto su questa tabella.
CREATE POLICY "table_order_items: owner all" ON table_order_items
  USING (
    EXISTS (
      SELECT 1 FROM table_orders o
      JOIN businesses b ON b.id = o.business_id
      WHERE o.id = table_order_items.order_id AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM table_orders o
      JOIN businesses b ON b.id = o.business_id
      WHERE o.id = table_order_items.order_id AND b.user_id = auth.uid()
    )
  );

-- Ricerca fuzzy sul nome piatto nella schermata ordine (richiesta
-- esplicitamente) — stesso pattern trigram già in uso su
-- contacts.name/appointments.client_name/pets.name.
CREATE INDEX IF NOT EXISTS idx_menu_items_name_trgm ON menu_items USING gin (name gin_trgm_ops);
