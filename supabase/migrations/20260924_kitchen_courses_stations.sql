-- ============================================================
-- Blocco D: invio in cucina, portate, postazioni, vista cucina.
--
-- 1. business_courses — stesso modello di business_turns (slot_number
--    ancoraggio stabile, name rinominabile, is_active). Il seeding delle
--    4 portate di default NON è qui: avviene lato applicazione alla prima
--    apertura della gestione menu per un business ristorante_bar (vedi
--    Menu.jsx), non a un evento di sistema come l'attivazione del
--    vertical — a differenza di business_turns, che invece nasce insieme
--    al vertical.
--
-- 2. menu_categories.course_id (nullable): una categoria senza portata
--    (es. bevande) è "subito" sempre, non un dato mancante — per questo
--    resta nullable invece di avere una portata "Subito" fittizia da
--    gestire come le altre.
--
-- 3. kitchen_stations — stesso modello, pre-seed di una postazione
--    "Cucina" (lato app) alla prima apertura di QUALUNQUE delle due
--    schermate che ne hanno bisogno — gestione menu o vista cucina,
--    qualunque arrivi prima: un business potrebbe aprire la vista cucina
--    prima ancora di aver mai aperto la gestione menu.
--
-- 4. menu_categories.station_id (nullable a livello DB): la regola "nessuna
--    categoria senza postazione" NON è un vincolo NOT NULL qui — è lo
--    stesso principio già in uso in tutto questo branch (stato derivabile
--    mai persistito). Il fallback alla prima postazione attiva è
--    calcolato al volo lato app in lettura (Cucina.jsx), mentre Menu.jsx
--    mostra un avviso persistente finché il titolare non assegna
--    esplicitamente le categorie orfane. Il blocco "non disattivare una
--    postazione con categorie assegnate" è un controllo applicativo
--    sull'azione, non un vincolo strutturale.
--
-- 5. table_order_items: sent_at (NULL = in composizione, modificabile e
--    cancellabile; valorizzato = inviata in cucina, sola azione "annulla"
--    possibile) + kitchen_status per il ciclo di vita post-invio +
--    fire_status/fired_at per attesa/via. Nessuna riga viene mai DELETE,
--    coerente con la convenzione del progetto.
--
--    kitchen_status usa 'da_preparare' (non 'attesa') deliberatamente:
--    fire_status usa 'in_attesa' per il suo stato di default, due nomi
--    quasi identici su due colonne diverse sarebbero stati un rischio
--    concreto di scambiarli nel codice applicativo.
--
-- 6. businesses.kitchen_fire_immediately: interruttore "invia sempre
--    tutto subito" per i locali che non usano l'attesa — sta su
--    businesses (come vertical stesso) perché è una preferenza di
--    business, non di singolo ordine.
--
-- 7. Realtime su table_order_items, stesso meccanismo già in uso per
--    bookings (20260514_realtime_bookings.sql) — la vista cucina e la
--    schermata ordine leggono gli stessi eventi INSERT/UPDATE. La riga
--    "alter publication ... add table" fallisce se rilanciata una
--    seconda volta (non è IF NOT EXISTS) — va bene per un'esecuzione
--    singola come tutte le migration di questo progetto, ma NON è
--    idempotente: non rilanciare questo file due volte.
--
-- 8. kitchen_stations ha un indice unico su (business_id, lower(name))
--    per permettere ai seeding automatici ("Cucina" alla prima apertura
--    gestione menu O vista cucina, qualunque arrivi prima) di usare
--    INSERT ... ON CONFLICT DO NOTHING senza creare doppioni quando due
--    dispositivi aprono la pagina nello stesso momento. business_courses
--    non ha bisogno di un indice equivalente: il seeding delle 4 portate
--    usa già slot_number con lo stesso meccanismo ON CONFLICT DO NOTHING
--    sul vincolo (business_id, slot_number) esistente.
--
-- Additiva, nessun impatto sulle righe esistenti.
-- ============================================================

-- --- 1. Portate -------------------------------------------------------

CREATE TABLE IF NOT EXISTS business_courses (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slot_number int     NOT NULL,
  name        text,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_business_courses_business_id ON business_courses(business_id);

-- Un solo slot per numero per business, stesso motivo di business_turns.
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_courses_business_slot
  ON business_courses(business_id, slot_number);

ALTER TABLE business_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_courses: owner all" ON business_courses
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_courses.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_courses.business_id AND b.user_id = auth.uid())
  );

-- --- 2. Postazioni ------------------------------------------------------

CREATE TABLE IF NOT EXISTS kitchen_stations (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        text    NOT NULL,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_kitchen_stations_business_id ON kitchen_stations(business_id);

-- Un solo nome per business (case-insensitive) — permette al seeding
-- automatico di usare ON CONFLICT DO NOTHING contro le corse di due
-- dispositivi che aprono la pagina insieme, vedi nota 8 in testa al file.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_stations_business_name
  ON kitchen_stations(business_id, lower(name));

ALTER TABLE kitchen_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kitchen_stations: owner all" ON kitchen_stations
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = kitchen_stations.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = kitchen_stations.business_id AND b.user_id = auth.uid())
  );

-- --- 3. Assegnazione categorie -> portata/postazione ---------------------

ALTER TABLE menu_categories
  ADD COLUMN IF NOT EXISTS course_id  uuid REFERENCES business_courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES kitchen_stations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_menu_categories_course_id  ON menu_categories(course_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_station_id ON menu_categories(station_id);

-- --- 4. Invio in cucina, attesa/via, ciclo di vita voce -----------------

ALTER TABLE table_order_items
  ADD COLUMN IF NOT EXISTS sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS kitchen_status text NOT NULL DEFAULT 'da_preparare'
    CHECK (kitchen_status IN ('da_preparare', 'pronto', 'consegnato', 'annullato')),
  ADD COLUMN IF NOT EXISTS ready_at      timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at  timestamptz,
  ADD COLUMN IF NOT EXISTS fire_status   text NOT NULL DEFAULT 'subito'
    CHECK (fire_status IN ('subito', 'in_attesa')),
  ADD COLUMN IF NOT EXISTS fired_at      timestamptz;

-- kitchen_status prima dell'invio non ha significato (si guarda solo
-- sent_at); questo indice serve solo le query della vista cucina, che
-- filtrano sempre per sent_at valorizzato.
CREATE INDEX IF NOT EXISTS idx_table_order_items_sent_at
  ON table_order_items(sent_at) WHERE sent_at IS NOT NULL;

-- --- 5. Interruttore business "invia sempre tutto subito" ---------------

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS kitchen_fire_immediately boolean NOT NULL DEFAULT false;

-- --- 6. Realtime ----------------------------------------------------------

alter publication supabase_realtime add table table_order_items;
