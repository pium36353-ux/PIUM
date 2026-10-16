-- ============================================================
-- Blocco E: scorte, costi e margini — verticale 'ristorante_bar'.
--
-- 1. menu_items guadagna i campi prodotto (track_stock, min_stock,
--    estimated_cost, vat_rate). Solo prodotti venduti A PEZZO: nessuna
--    unità di misura, nessuna confezione, nessun ingrediente/ricetta
--    (fuori scopo dichiarato).
--
-- 2. stock_movements è un REGISTRO append-only, non un contatore: la
--    giacenza di un prodotto è SEMPRE somma(quantity) sui suoi movimenti,
--    mai una colonna salvata da tenere sincronizzata — stesso principio
--    già in uso per lo stato dei tavoli e per la risoluzione
--    postazione/portata (vedi MAPPA_TECNICA_PIUM.md, sezione "Verticali").
--    quantity è int CON SEGNO così la somma funziona aritmeticamente
--    senza casi speciali per tipo. Anche il "costo attuale" di un
--    prodotto tracciato è calcolato (unit_cost del carico più recente),
--    mai persistito.
--    Un movimento non si modifica e non si cancella mai: un errore si
--    corregge aggiungendo una 'rettifica' che lo compensa.
--
-- 3. DUE OROLOGI, DUE RUOLI DIVERSI — è il punto più importante di questo
--    blocco, non confonderli:
--
--    table_order_items.sent_at          orologio del DISPOSITIVO che invia
--                                       (tablet di sala). Serve ai
--                                       resoconti per giorno/turno/mese:
--                                       è l'ora "vissuta" del servizio.
--    table_order_items.sent_received_at orologio del DATABASE, scritto da
--                                       un trigger quando sent_at passa
--                                       da NULL a un valore. Il client non
--                                       la scrive MAI (il trigger
--                                       sovrascrive qualunque valore
--                                       inviato). È l'unico confine usato
--                                       per la contabilità delle scorte.
--
--    Perché: sent_at viene da orologi che non controlliamo. Un tablet
--    indietro di qualche minuto scriverebbe un sent_at anteriore a un
--    period_end già chiuso, e quella voce non verrebbe contata da nessuna
--    chiusura — persa per sempre. Stesso effetto per una voce composta
--    offline e salvata mezz'ora dopo (coda di Ordine.jsx, Blocco D).
--    Con sent_received_at il confine è monotono e deciso da un solo
--    orologio: qualunque voce arrivi dopo l'ultima chiusura finisce
--    sempre in quella successiva, qualunque cosa dica il dispositivo.
--
-- 4. stock_closures: il titolare chiude il conteggio quando vuole, quante
--    volte vuole — nessun turno fisso, nessun legame con business_turns
--    (i turni servono a tavoli/ordini, non alle scorte: assi indipendenti).
--
--    Anche qui due timestamp con ruoli diversi:
--      period_end — confine CONTABILE, preso dall'orologio del database
--                   nell'istante in cui si calcola la proposta (funzione
--                   stock_closure_proposal), NON alla conferma e NON dal
--                   dispositivo del titolare.
--      closed_at  — timestamp di AUDIT, quando il titolare ha confermato.
--    La proposta conta le voci con
--      sent_received_at > (period_end della chiusura precedente)
--      AND sent_received_at <= (period_end di questa chiusura)
--    e la chiusura successiva riparte SEMPRE dal period_end precedente,
--    mai da closed_at: le voci arrivate mentre la schermata di chiusura
--    è aperta cadono nella finestra successiva invece di essere perse.
--    period_end è anche il confine della "stima attuale" delle giacenze
--    (venduto non ancora scalato).
--
--    Conferma ATOMICA in una sola funzione (stock_closure_confirm):
--    supabase-js non ha transazioni multi-statement, e una chiusura
--    inserita senza i suoi movimenti di vendita sarebbe la stessa perdita
--    di venduto che tutto questo impianto evita. La funzione richiede
--    anche il confine precedente su cui la proposta era stata calcolata e
--    rifiuta se nel frattempo è cambiato (due chiusure aperte insieme
--    avrebbero finestre sovrapposte, e confermarle entrambe conterebbe
--    due volte la parte comune).
--
-- 5. table_order_items guadagna gli snapshot di costo/IVA, valorizzati
--    nello STESSO write che valorizza sent_at (all'invio in cucina, non
--    all'aggiunta della voce): tra i due momenti un carico può cambiare
--    il costo reale, e il momento con significato economico è l'invio.
--    I margini si calcolano SOLO da questi snapshot, mai con un join
--    live su menu_items — così cambiare una stima o registrare un carico
--    a prezzo diverso non altera mai i margini del passato.
--    Ordine di risoluzione del costo all'invio: ultimo carico se il
--    prodotto è tracciato ('reale'); altrimenti, O se è tracciato ma non
--    ha ancora nessun carico, estimated_cost ('stimato'); altrimenti
--    NULL (costo sconosciuto).
--
-- FUSO ORARIO: tutti i timestamp restano timestamptz (istanti assoluti,
-- nessuna ambiguità di fuso nel dato). Il fuso serve solo in due punti,
-- entrambi applicativi: la formattazione di qualunque orario MOSTRATO
-- all'utente, e il raggruppamento dei resoconti per giorno/mese, che deve
-- seguire il calendario ITALIANO (una voce inviata alle 00:30 del 28 in
-- Italia appartiene al giorno 28 anche se in UTC è ancora il 27, sia con
-- ora legale sia con ora solare). Il fuso vive in UNA costante condivisa
-- lato applicazione; le eventuali funzioni di resoconto che raggrupperanno
-- nel database lo riceveranno come PARAMETRO (con default 'Europe/Rome')
-- invece di cablarlo, così quando PIUM andrà in altri paesi diventerà il
-- fuso del singolo business senza toccare lo schema.
--
-- PRECISIONE: unit_cost e cost_snapshot sono numeric(12,4), non (10,2)
-- come il resto degli importi del progetto — un costo unitario derivato
-- da una confezione (es. 14,50 / 24 = 0,6042) perderebbe decimali
-- arrotondato al centesimo, e l'errore si moltiplicherebbe per ogni
-- pezzo venduto. estimated_cost resta (10,2): è una stima inserita a
-- mano, non un valore derivato da una divisione. I resoconti mostrano
-- comunque gli importi a due decimali (formattazione applicativa).
--
-- Additiva, nessun impatto sulle righe esistenti. Le voci d'ordine già
-- inviate prima di questa migration restano senza snapshot di costo e
-- senza sent_received_at (NULL): rientrano nell'incasso ma non nel
-- margine, mostrate come "costo non inserito", e non entrano in nessuna
-- chiusura — nessun valore inventato retroattivamente.
--
-- Ordine interno: stock_closures PRIMA di stock_movements (FK), le
-- funzioni DOPO le tabelle che interrogano.
-- ============================================================

-- --- 1. Campi prodotto su menu_items ------------------------------------

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS track_stock    boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_stock      int,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS vat_rate       numeric(5,2) NOT NULL DEFAULT 10;

-- min_stock ha senso solo come soglia positiva; NULL = nessuna soglia
-- (il prodotto non compare mai in "Da riordinare").
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_min_stock_positive
  CHECK (min_stock IS NULL OR min_stock > 0);

-- Costi e aliquote non possono essere negativi. estimated_cost NULL =
-- "costo non inserito", stato legittimo e di default.
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_estimated_cost_non_negative
  CHECK (estimated_cost IS NULL OR estimated_cost >= 0);

ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_vat_rate_non_negative
  CHECK (vat_rate >= 0);

-- Serve l'elenco "Da riordinare" e la sezione Scorte, che partono sempre
-- dai soli prodotti tracciati di un business.
CREATE INDEX IF NOT EXISTS idx_menu_items_business_track_stock
  ON menu_items(business_id) WHERE track_stock;

-- --- 2. Chiusure del conteggio -------------------------------------------

CREATE TABLE IF NOT EXISTS stock_closures (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Confine contabile, dall'orologio del DATABASE (vedi nota 4 in testa
  -- al file). NOT NULL senza default di proposito: è il dato che rende la
  -- chiusura interpretabile, se l'applicazione dimenticasse di
  -- valorizzarlo è giusto che l'insert fallisca subito.
  period_end  timestamptz NOT NULL,
  -- Timestamp di audit della conferma. NON usarlo come confine contabile.
  closed_at   timestamptz NOT NULL DEFAULT now(),
  -- Due chiusure identiche per lo stesso confine non hanno senso e
  -- raddoppierebbero lo scarico: rete lenta e doppio tap sul pulsante
  -- "Conferma" sono la causa tipica.
  CONSTRAINT stock_closures_business_period_unique UNIQUE (business_id, period_end)
);

CREATE INDEX IF NOT EXISTS idx_stock_closures_business_id ON stock_closures(business_id);

-- "Il period_end dell'ultima chiusura di questo business" è la query più
-- frequente di tutto il blocco: delimita la proposta del venduto e la
-- stima attuale delle giacenze. Indicizzato su period_end (il confine
-- contabile), non su closed_at.
CREATE INDEX IF NOT EXISTS idx_stock_closures_business_period_desc
  ON stock_closures(business_id, period_end DESC);

ALTER TABLE stock_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_closures: owner all" ON stock_closures
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = stock_closures.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = stock_closures.business_id AND b.user_id = auth.uid())
  );

-- --- 3. Registro dei movimenti -------------------------------------------

CREATE TABLE IF NOT EXISTS stock_movements (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- NOT NULL + CASCADE, deliberatamente diverso da
  -- table_order_items.menu_item_id (nullable + SET NULL): là la riga
  -- sopravvive alla cancellazione del piatto perché conserva un senso
  -- proprio (item_name_snapshot/price_snapshot, quindi incasso storico);
  -- qui un movimento senza prodotto non è storia, è rumore — non
  -- servirebbe a calcolare la giacenza di nessuno. In pratica non scatta
  -- mai: i piatti non vengono cancellati davvero (is_available).
  menu_item_id uuid        NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('carico', 'vendita', 'rettifica')),
  quantity     int         NOT NULL,
  unit_cost    numeric(12,4),
  closure_id   uuid        REFERENCES stock_closures(id) ON DELETE SET NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Un movimento a quantità zero non rappresenta niente.
  CONSTRAINT stock_movements_quantity_not_zero CHECK (quantity <> 0),
  -- Segni garantiti dal DB, non solo dall'interfaccia: un bug non deve
  -- poter scrivere una 'vendita' positiva che gonfierebbe la giacenza.
  -- 'rettifica' resta libera di segno (è il suo scopo).
  CONSTRAINT stock_movements_carico_positive  CHECK (type <> 'carico'  OR quantity > 0),
  CONSTRAINT stock_movements_vendita_negative CHECK (type <> 'vendita' OR quantity < 0),
  -- Un carico senza costo romperebbe "costo attuale = ultimo carico", e
  -- qui non esiste un ripiego sensato (a differenza di station_id nel
  -- Blocco D, dove il ripiego alla prima postazione attiva è definito).
  CONSTRAINT stock_movements_carico_needs_cost CHECK (type <> 'carico' OR unit_cost IS NOT NULL),
  CONSTRAINT stock_movements_unit_cost_non_negative CHECK (unit_cost IS NULL OR unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_business_id  ON stock_movements(business_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_menu_item_id ON stock_movements(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_closure_id   ON stock_movements(closure_id);

-- Resoconti per periodo (per giorno/per mese).
CREATE INDEX IF NOT EXISTS idx_stock_movements_business_created
  ON stock_movements(business_id, created_at);

-- "Costo attuale del prodotto" = unit_cost del carico più recente: query
-- calda (serve a ogni invio in cucina per lo snapshot di costo, a ogni
-- apertura della sezione Scorte e a ogni conferma di chiusura), quindi
-- indice parziale dedicato.
CREATE INDEX IF NOT EXISTS idx_stock_movements_last_carico
  ON stock_movements(menu_item_id, created_at DESC) WHERE type = 'carico';

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements: owner all" ON stock_movements
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = stock_movements.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = stock_movements.business_id AND b.user_id = auth.uid())
  );

-- --- 4. Snapshot di costo/IVA + confine contabile sulle voci d'ordine ---

ALTER TABLE table_order_items
  ADD COLUMN IF NOT EXISTS cost_snapshot     numeric(12,4),
  ADD COLUMN IF NOT EXISTS cost_source       text,
  ADD COLUMN IF NOT EXISTS vat_rate_snapshot numeric(5,2),
  -- Orologio del DATABASE, scritta solo dal trigger qui sotto: unico
  -- confine usato per le chiusure e per la stima delle giacenze.
  ADD COLUMN IF NOT EXISTS sent_received_at  timestamptz;

-- NULL ammesso di proposito su cost_snapshot/cost_source/vat_rate_snapshot:
-- significa "costo sconosciuto" (prodotto non tracciato e senza stima, o
-- voce inviata prima di questa migration). Un CHECK con IN(...) lascia
-- passare NULL da solo, perché NULL IN (...) vale NULL e un CHECK
-- fallisce solo su FALSE.
ALTER TABLE table_order_items
  ADD CONSTRAINT table_order_items_cost_source_valid
  CHECK (cost_source IN ('reale', 'stimato'));

ALTER TABLE table_order_items
  ADD CONSTRAINT table_order_items_cost_snapshot_non_negative
  CHECK (cost_snapshot IS NULL OR cost_snapshot >= 0);

-- Il client non scrive mai sent_received_at: qualunque valore inviato
-- viene sovrascritto qui. Valorizzata SOLO nella transizione
-- "non inviata -> inviata" (sent_at da NULL a un valore), con l'orologio
-- del database; su un update successivo della stessa riga (annulla, via,
-- consegnata, retry della coda offline) il valore originale resta
-- invariato, così il confine contabile di una voce non si sposta mai.
CREATE OR REPLACE FUNCTION set_sent_received_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sent_at IS NOT NULL THEN
      NEW.sent_received_at := now();
    ELSE
      NEW.sent_received_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.sent_at IS NULL THEN
    -- Torna in composizione: caso non previsto dall'interfaccia, ma se
    -- accadesse il confine contabile va via insieme all'invio.
    NEW.sent_received_at := NULL;
  ELSIF OLD.sent_at IS NULL THEN
    NEW.sent_received_at := now();
  ELSE
    NEW.sent_received_at := OLD.sent_received_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_table_order_items_sent_received_at ON table_order_items;
CREATE TRIGGER trg_table_order_items_sent_received_at
  BEFORE INSERT OR UPDATE ON table_order_items
  FOR EACH ROW EXECUTE FUNCTION set_sent_received_at();

-- Venduto per prodotto in una finestra contabile: serve alla proposta di
-- chiusura e alla stima attuale delle giacenze. Su sent_received_at (non
-- su sent_at): è l'unico confine di cui la contabilità si fida. I
-- resoconti per giorno/turno/mese usano sent_at e si appoggiano
-- all'indice parziale già creato dal Blocco D.
CREATE INDEX IF NOT EXISTS idx_table_order_items_menu_item_received
  ON table_order_items(menu_item_id, sent_received_at) WHERE sent_received_at IS NOT NULL;

-- --- 5. Confine della chiusura: invariante a livello DB ------------------

-- Vale per qualunque percorso di insert, non solo per la funzione di
-- conferma: un confine nel futuro inghiottirebbe vendite non ancora
-- arrivate, un confine non crescente riconterebbe una finestra già chiusa.
CREATE OR REPLACE FUNCTION check_stock_closure_boundary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev timestamptz;
BEGIN
  IF NEW.period_end > now() THEN
    RAISE EXCEPTION 'period_end (%) nel futuro: il confine contabile deve venire dall orologio del database, non da quello del dispositivo', NEW.period_end;
  END IF;

  SELECT max(period_end) INTO v_prev
  FROM stock_closures
  WHERE business_id = NEW.business_id AND id <> NEW.id;

  IF v_prev IS NOT NULL AND NEW.period_end <= v_prev THEN
    RAISE EXCEPTION 'period_end (%) non successivo a quello dell ultima chiusura (%)', NEW.period_end, v_prev;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_closures_boundary ON stock_closures;
CREATE TRIGGER trg_stock_closures_boundary
  BEFORE INSERT ON stock_closures
  FOR EACH ROW EXECUTE FUNCTION check_stock_closure_boundary();

-- --- 6. Proposta di chiusura (confine dall'orologio del database) --------

-- Restituisce in un colpo solo il confine contabile (now() del database,
-- mai del dispositivo), il confine precedente e, per OGNI prodotto
-- tracciato del business, i pezzi venduti nella finestra — anche zero,
-- così il titolare può correggere in su un venduto che il sistema non ha
-- visto. Esclude le voci annullate e quelle senza prodotto collegato
-- (piatto cancellato dal catalogo: non attribuibile a nessuna giacenza).
--
-- SECURITY INVOKER (default): le RLS esistenti fanno tutto il lavoro di
-- isolamento — passare l'id di un altro business restituisce zero righe
-- invece di dati altrui.
CREATE OR REPLACE FUNCTION stock_closure_proposal(p_business_id uuid)
RETURNS TABLE (
  period_end        timestamptz,
  previous_end      timestamptz,
  menu_item_id      uuid,
  item_name         text,
  proposed_quantity int,
  current_unit_cost numeric(12,4)
)
LANGUAGE sql
STABLE
AS $$
  WITH boundary AS (
    SELECT
      now() AS period_end,
      COALESCE(
        (SELECT max(sc.period_end) FROM stock_closures sc WHERE sc.business_id = p_business_id),
        '-infinity'::timestamptz
      ) AS previous_end
  ),
  sold AS (
    SELECT toi.menu_item_id AS mi_id, sum(toi.quantity)::int AS qty
    FROM table_order_items toi
    JOIN table_orders o ON o.id = toi.order_id
    CROSS JOIN boundary b
    WHERE o.business_id = p_business_id
      AND toi.menu_item_id IS NOT NULL
      AND toi.kitchen_status <> 'annullato'
      AND toi.sent_received_at IS NOT NULL
      AND toi.sent_received_at >  b.previous_end
      AND toi.sent_received_at <= b.period_end
    GROUP BY toi.menu_item_id
  )
  SELECT
    b.period_end,
    b.previous_end,
    mi.id,
    mi.name,
    COALESCE(s.qty, 0),
    (
      SELECT sm.unit_cost FROM stock_movements sm
      WHERE sm.menu_item_id = mi.id AND sm.type = 'carico'
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT 1
    )
  FROM menu_items mi
  CROSS JOIN boundary b
  LEFT JOIN sold s ON s.mi_id = mi.id
  WHERE mi.business_id = p_business_id
    AND mi.track_stock
  ORDER BY mi.name;
$$;

-- --- 7. Conferma della chiusura (atomica) -------------------------------

-- Una sola chiamata = una sola transazione: la chiusura e tutti i suoi
-- movimenti di vendita esistono insieme o non esistono affatto.
-- p_previous_end è il confine su cui la proposta era stata calcolata: se
-- nel frattempo un altro dispositivo ha confermato una chiusura, le due
-- finestre si sovrapporrebbero e confermare questa conterebbe due volte
-- la parte comune — meglio rifiutare e far ricalcolare la proposta.
-- p_items: [{"menu_item_id": "...", "quantity": 3}, ...] con quantity
-- POSITIVA (pezzi venduti); il movimento viene scritto negativo.
-- Le quantità a zero non producono movimenti.
CREATE OR REPLACE FUNCTION stock_closure_confirm(
  p_business_id  uuid,
  p_previous_end timestamptz,
  p_period_end   timestamptz,
  p_items        jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_closure_id  uuid;
  v_current_prev timestamptz;
  v_item        jsonb;
  v_menu_item   uuid;
  v_qty         int;
  v_cost        numeric(12,4);
BEGIN
  -- Serializza le conferme dello STESSO business per tutta la transazione,
  -- PRIMA di leggere il confine precedente. Senza questo lock il controllo
  -- di concorrenza qui sotto non serve a niente: due conferme simultanee
  -- da due dispositivi leggerebbero entrambe lo stesso max(period_end)
  -- (nessuna vede l'insert non ancora committato dell'altra), passerebbero
  -- entrambe il controllo e il trigger, e scalerebbero due volte la parte
  -- di finestra in comune — la UNIQUE su (business_id, period_end) non le
  -- intercetta, perché due proposte calcolate a istanti diversi hanno
  -- period_end diversi. Stesso pattern di create_booking
  -- (hashtextextended a 64 bit, vedi 20260719_create_booking_advisory_lock.sql),
  -- con un prefisso proprio per non condividere lo spazio delle chiavi.
  PERFORM pg_advisory_xact_lock(hashtextextended('stock_closure:' || p_business_id::text, 0));

  v_current_prev := COALESCE(
    (SELECT max(period_end) FROM stock_closures WHERE business_id = p_business_id),
    '-infinity'::timestamptz
  );

  IF v_current_prev <> COALESCE(p_previous_end, '-infinity'::timestamptz) THEN
    RAISE EXCEPTION 'Il conteggio non e piu aggiornato: un altra chiusura e stata confermata nel frattempo. Ricalcola la proposta.';
  END IF;

  INSERT INTO stock_closures (business_id, period_end)
  VALUES (p_business_id, p_period_end)
  RETURNING id INTO v_closure_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_menu_item := (v_item->>'menu_item_id')::uuid;
    v_qty       := COALESCE((v_item->>'quantity')::int, 0);

    IF v_qty = 0 THEN
      CONTINUE;
    END IF;

    IF v_qty < 0 THEN
      RAISE EXCEPTION 'Quantita venduta negativa (%) per il prodotto %', v_qty, v_menu_item;
    END IF;

    -- Il prodotto deve appartenere a questo business: le due FK sono
    -- indipendenti, nessun vincolo DB lo garantirebbe da solo (stessa
    -- lacuna documentata per table_reservation_tables, qui chiusa).
    IF NOT EXISTS (
      SELECT 1 FROM menu_items mi
      WHERE mi.id = v_menu_item AND mi.business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'Il prodotto % non appartiene a questo business', v_menu_item;
    END IF;

    -- Costo in uso in questo momento: ultimo carico. NULL se il prodotto
    -- non ha mai avuto un carico (movimento comunque scritto: il pezzo è
    -- uscito davvero, il suo costo è solo sconosciuto).
    SELECT sm.unit_cost INTO v_cost
    FROM stock_movements sm
    WHERE sm.menu_item_id = v_menu_item AND sm.type = 'carico'
    ORDER BY sm.created_at DESC, sm.id DESC
    LIMIT 1;

    INSERT INTO stock_movements (business_id, menu_item_id, type, quantity, unit_cost, closure_id)
    VALUES (p_business_id, v_menu_item, 'vendita', -v_qty, v_cost, v_closure_id);
  END LOOP;

  RETURN v_closure_id;
END;
$$;

-- Permessi espliciti. Una funzione appena creata ha EXECUTE concesso a
-- PUBLIC per default, e 'anon' lo EREDITA: revocare solo da 'anon' non
-- toglierebbe niente, perché anon non ha una concessione diretta da
-- revocare. Quindi si revoca da PUBLIC (e da anon per chiarezza) e si
-- concede esplicitamente solo a 'authenticated'. Le RLS restano la difesa
-- sui dati; questo è il livello di accesso alla funzione.
-- 'service_role' NON è incluso di proposito: nessuna Edge Function o
-- processo server chiama queste funzioni, sono percorsi di dashboard —
-- se un domani servisse, si aggiunge una GRANT dedicata.
REVOKE EXECUTE ON FUNCTION stock_closure_proposal(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION stock_closure_confirm(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION stock_closure_proposal(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION stock_closure_confirm(uuid, timestamptz, timestamptz, jsonb) TO authenticated;
