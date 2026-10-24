-- ============================================================
-- Notifiche sala (verticale ristorante_bar).
--
-- Due famiglie di notifiche, trattate in modo deliberatamente diverso:
--
-- 1. Notifiche di STATO ("portata pronta") — NESSUNA tabella, nessuna
--    colonna nuova. Sono una lettura degli ordini: una portata è pronta
--    quando tutte le sue voci inviate, con il via dato e non annullate
--    sono 'pronto'. Lo stesso principio già in vigore per lo stato dei
--    tavoli (OCCUPATO calcolato al volo da tavolo+data+turno) e per le
--    giacenze (somma dei movimenti): uno stato che dipende da una
--    combinazione di altri dati non si persiste, si ricalcola. Se lo
--    persistessimo avremmo due verità da tenere allineate — e la
--    notifica dovrebbe essere cancellata a mano da ogni punto che
--    consegna una portata (Ordine, Cucina, questa pagina).
--
-- 2. Notifiche EVENTO ("chiama sala", in futuro "prodotto esaurito") —
--    qui una riga serve, perché NON sono ricavabili da nessun altro
--    dato: oggi "chiama sala" è solo un broadcast Realtime, quindi un
--    dispositivo di sala spento o riavviato nell'istante della chiamata
--    la perde per sempre. La riga è il ricordo dell'evento.
--
-- 3. created_at è scritto SOLO dal database (DEFAULT now()). Il client
--    non lo scrive mai: l'elenco è ordinato dalla più vecchia alla più
--    recente e, con gli orologi dei tablet, due dispositivi diversi
--    produrrebbero un ordine diverso. Stesso motivo per cui il Blocco E
--    ha introdotto sent_received_at scritto dal trigger.
--
-- 4. type ha un CHECK esteso già oggi a 'prodotto_esaurito', che il
--    codice di questo blocco NON usa: così il giorno in cui servirà non
--    occorrerà una migration per allargare il vincolo. Un enum Postgres
--    avrebbe lo stesso effetto ma si estende peggio (ALTER TYPE non è
--    reversibile in transazione come un CHECK).
--
-- 5. kitchen_stations.served_by_hall — postazione servita direttamente
--    dal cameriere (le bibite che prende lui al bancone). Le sue voci,
--    al momento dell'invio, nascono già consegnate: restano
--    nell'ordine, nel conto, nei margini e nel conteggio delle scorte,
--    ma non entrano in nessuna vista cucina né nei totali per piatto.
--
--    Questa regola NON è un trigger, è una scrittura del client nel
--    punto unico che invia in cucina (sendToKitchen in Ordine.jsx). Un
--    trigger dovrebbe risolvere la postazione della voce
--    (menu_items -> menu_categories -> station_id, più i tre casi di
--    ripiego), cioè riscrivere in PL/pgSQL la logica che vive in
--    src/lib/kitchenRouting.js: due copie della stessa regola che
--    possono divergere. Il progetto ha già scelto il contrario ("una
--    sola funzione condivisa"), e l'invio passa comunque da un solo
--    punto, che deve calcolare la cosa anche per la coda offline.
--
-- 6. alert_level non cambia MAI quali notifiche esistono: 'nessuno'
--    toglie banner, suono e vibrazione, non la riga nell'elenco. Per
--    questo è una colonna della postazione e non un filtro sulle
--    notifiche.
--
-- 7. Realtime su hall_notifications, stesso meccanismo di bookings e
--    table_order_items. La riga "alter publication ... add table"
--    fallisce se rilanciata (non è IF NOT EXISTS): questo file NON è
--    idempotente, non eseguirlo due volte.
--
-- Additiva: nessuna riga esistente cambia, i default rendono il
-- comportamento attuale identico a prima (alert_level 'forte' = gli
-- avvisi che ci sono già, served_by_hall false = nessuna voce
-- consegnata all'invio).
-- ============================================================

-- --- 1. Notifiche evento ------------------------------------------------

CREATE TABLE IF NOT EXISTS hall_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type        text        NOT NULL
    CHECK (type IN ('chiama_sala', 'prodotto_esaurito')),
  -- Entrambi nullable: 'chiama_sala' nasce dalla cucina e non riguarda un
  -- tavolo preciso. ON DELETE SET NULL perché la notifica resta leggibile
  -- anche se il tavolo viene eliminato dalla piantina nel frattempo.
  table_id    uuid        REFERENCES tables(id) ON DELETE SET NULL,
  station_id  uuid        REFERENCES kitchen_stations(id) ON DELETE SET NULL,
  -- Dati specifici del tipo (per 'prodotto_esaurito': quale piatto).
  -- Vuoto, non NULL: il codice che lo legge non deve distinguere i due casi.
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Valorizzato = letta dalla sala, sparisce dall'elenco. Nessun DELETE:
  -- stessa convenzione del resto del progetto.
  read_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hall_notifications_business_id ON hall_notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_hall_notifications_table_id    ON hall_notifications(table_id);
CREATE INDEX IF NOT EXISTS idx_hall_notifications_station_id  ON hall_notifications(station_id);

-- L'unica query della pagina: non lette di questo business, dalla più
-- vecchia alla più recente. Indice parziale: le righe già lette non
-- servono a nessuna lettura e non devono pesare sull'indice.
CREATE INDEX IF NOT EXISTS idx_hall_notifications_unread
  ON hall_notifications(business_id, created_at)
  WHERE read_at IS NULL;

ALTER TABLE hall_notifications ENABLE ROW LEVEL SECURITY;

-- Owner-only via business_id diretto (la tabella ce l'ha), stesso pattern
-- di kitchen_stations/business_courses — non il join attraverso
-- table_orders usato da table_order_items, che qui non servirebbe.
CREATE POLICY "hall_notifications: owner all" ON hall_notifications
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = hall_notifications.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = hall_notifications.business_id AND b.user_id = auth.uid())
  );

-- --- 2. Impostazioni per postazione -------------------------------------

ALTER TABLE kitchen_stations
  -- 'forte'   = banner + suono + vibrazione (il comportamento di oggi)
  -- 'leggero' = elenco Notifiche sala + segno sulla card del tavolo
  -- 'nessuno' = solo elenco Notifiche sala
  ADD COLUMN IF NOT EXISTS alert_level text NOT NULL DEFAULT 'forte'
    CHECK (alert_level IN ('forte', 'leggero', 'nessuno')),
  -- Nome usato nelle notifiche delle voci SENZA portata, raggruppate per
  -- postazione (es. postazione "Bar" -> etichetta "Bibite"). Vuoto o NULL
  -- = si usa il nome della postazione. Non NOT NULL con default: "non
  -- impostata" e "impostata uguale al nome" sono due cose diverse per il
  -- titolare che la rinomina.
  ADD COLUMN IF NOT EXISTS notification_label text,
  -- Postazione servita dalla sala: vedi nota 5 in testa al file.
  ADD COLUMN IF NOT EXISTS served_by_hall boolean NOT NULL DEFAULT false;

-- --- 3. Realtime --------------------------------------------------------

alter publication supabase_realtime add table hall_notifications;
