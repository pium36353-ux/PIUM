-- ============================================================
-- Rifacimento sistema turni/stato tavoli.
--
-- 1. business_turns: slot di turno configurabili per business (liberi,
--    non un enum di sistema — "pranzo"/"cena"/quello che il titolare
--    vuole). 4 slot creati automaticamente quando un business passa a
--    vertical='ristorante_bar' da Admin.jsx (nessuna logica qui in
--    migration: il seeding è lato applicazione, vedi Admin.jsx).
--
-- 2. table_reservations.turn (testo libero) diventa turn_id, FK
--    obbligatoria verso business_turns — non più testo scrivibile a
--    mano. I dati di table_reservations/table_reservation_tables creati
--    in sessioni di test precedenti sono dati di prova, non reali:
--    ripuliti qui invece di migrati (nessun turn_id storico da inventare).
--
-- 3. tables.status e il relativo toggle manuale libero/occupato vengono
--    eliminati: quello stato non è MAI un valore salvato a parte, è
--    sempre calcolato al volo controllando se esiste una
--    table_reservations confermata per l'esatta combinazione
--    (tavolo, data, turno) richiesta — lo stesso tavolo può essere
--    libero a pranzo e occupato a cena, sono stati indipendenti che non
--    ha senso comprimere in un singolo campo.
-- ============================================================

CREATE TABLE IF NOT EXISTS business_turns (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slot_number int     NOT NULL,
  name        text,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_business_turns_business_id ON business_turns(business_id);

-- Un solo turno per numero di slot per business — evita che il seeding (o
-- un bug futuro) crei due volte lo stesso slot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_turns_business_slot ON business_turns(business_id, slot_number);

ALTER TABLE business_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_turns: owner all" ON business_turns
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_turns.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_turns.business_id AND b.user_id = auth.uid())
  );

-- Dati di prova delle sessioni precedenti, non reali (vedi nota sopra) —
-- ripuliti prima di cambiare la forma di table_reservations.turn, così
-- turn_id può essere NOT NULL fin da subito senza dover inventare un
-- valore per righe storiche.
TRUNCATE TABLE table_reservation_tables, table_reservations;

ALTER TABLE table_reservations DROP COLUMN IF EXISTS turn;
ALTER TABLE table_reservations
  ADD COLUMN turn_id uuid NOT NULL REFERENCES business_turns(id);

CREATE INDEX IF NOT EXISTS idx_table_reservations_turn_id ON table_reservations(turn_id);

-- Stato libero/occupato mai persistito, vedi nota sopra.
ALTER TABLE tables DROP COLUMN IF EXISTS status;
