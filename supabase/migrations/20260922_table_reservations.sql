-- ============================================================
-- Correzione al Blocco A: il modello orario+durata di appointments non si
-- applica alle prenotazioni ristorante (data + turno, non un orario fisso
-- con durata calcolabile — nessuno sa quando un cliente se ne andrà).
-- appointments.table_id (20260922_appointments_table_id.sql) resta nello
-- schema inutilizzato: il codice applicativo smette di leggerlo/scriverlo,
-- nessun rollback necessario.
--
-- Due funzioni separate per il verticale 'ristorante_bar':
--   1. Stato del tavolo OGGI (tables.status) — manuale, gestito da chi è
--      in sala, nessun automatismo. Invariato da questa migration.
--   2. Prenotazioni per date (anche future) — nuovo modello, staccato da
--      appointments.
--
-- Additiva, nessun impatto sulle righe esistenti: due CREATE TABLE nuove.
-- ============================================================

-- Una prenotazione: data + turno libero (non un enum di sistema — ogni
-- locale usa i propri turni, es. "pranzo"/"cena"/"aperitivo", decisione
-- esplicita di non presumerli) + numero persone + contatto cliente.
CREATE TABLE IF NOT EXISTS table_reservations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reservation_date date        NOT NULL,
  turn             text,
  party_size       int,
  customer_name    text        NOT NULL,
  customer_phone   text,
  notes            text,
  status           text        NOT NULL DEFAULT 'confermata' CHECK (status IN ('confermata', 'cancellata')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_reservations_business_id   ON table_reservations(business_id);
CREATE INDEX IF NOT EXISTS idx_table_reservations_business_date ON table_reservations(business_id, reservation_date);

ALTER TABLE table_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "table_reservations: owner all" ON table_reservations
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = table_reservations.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = table_reservations.business_id AND b.user_id = auth.uid())
  );

-- Tabella ponte N↔N: una prenotazione può occupare più tavoli (gruppi
-- grandi, tavoli uniti). Stesso principio di appointment_services, ma PK
-- composita invece di un id surrogato: qui la riga non porta dati propri
-- oltre alle due FK, quindi la coppia è già una chiave naturale e impedisce
-- da sola il duplicato "stesso tavolo aggiunto due volte alla stessa
-- prenotazione".
CREATE TABLE IF NOT EXISTS table_reservation_tables (
  reservation_id uuid NOT NULL REFERENCES table_reservations(id) ON DELETE CASCADE,
  table_id       uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  PRIMARY KEY (reservation_id, table_id)
);

CREATE INDEX IF NOT EXISTS idx_table_reservation_tables_table_id ON table_reservation_tables(table_id);

ALTER TABLE table_reservation_tables ENABLE ROW LEVEL SECURITY;

-- Stesso pattern di appointment_services: RLS via join sulla tabella
-- principale (qui table_reservations) → businesses, non c'è business_id
-- diretto su questa tabella ponte.
CREATE POLICY "table_reservation_tables: owner all" ON table_reservation_tables
  USING (
    EXISTS (
      SELECT 1 FROM table_reservations r
      JOIN businesses b ON b.id = r.business_id
      WHERE r.id = table_reservation_tables.reservation_id AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM table_reservations r
      JOIN businesses b ON b.id = r.business_id
      WHERE r.id = table_reservation_tables.reservation_id AND b.user_id = auth.uid()
    )
  );
