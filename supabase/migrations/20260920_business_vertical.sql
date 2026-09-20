-- ============================================================
-- Colonna vertical: predispone il terreno per dashboard differenziate
-- per tipo di attività (es. 'ristorante', 'bnb') in futuro.
--
-- Additiva, nessun impatto sulle righe esistenti: DEFAULT 'generico' si
-- applica automaticamente anche ai business già presenti (il DEFAULT su una
-- ADD COLUMN si applica sempre ai dati esistenti, non solo alle nuove righe
-- — non serve un UPDATE separato).
--
-- Nessun CHECK sui valori ammessi, di proposito: la colonna deve restare
-- libera di accettare valori futuri (es. 'ristorante', 'bnb') senza bisogno
-- di una nuova migration solo per sbloccarne uno. Nessun NOT NULL, come
-- richiesto esplicitamente.
--
-- Lato applicazione, qualunque valore diverso da 'generico' (incluso NULL)
-- va trattato ESATTAMENTE come 'generico' finché i verticali specifici non
-- vengono implementati esplicitamente — fail-safe: mai un errore o una
-- pagina bianca per un valore non ancora gestito. Verificato: nessun punto
-- del codice frontend legge ancora businesses.vertical per decidere cosa
-- renderizzare (solo Admin.jsx la scrive), quindi il fail-safe è garantito
-- per costruzione, non da un controllo esplicito da bypassare.
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS vertical text DEFAULT 'generico';
