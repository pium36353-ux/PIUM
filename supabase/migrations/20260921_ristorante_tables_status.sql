-- ============================================================
-- Estende la tabella tables (20260921_ristorante_tables.sql) con lo stato
-- libero/occupato persistito. Additiva, nessun impatto sulle righe
-- esistenti: le righe già presenti prendono il DEFAULT 'libero'.
--
-- Testo invece di boolean, di proposito: un terzo stato (es. 'prenotato',
-- quando la piantina verrà davvero agganciata alle prenotazioni) potrà
-- essere aggiunto ampliando il CHECK, senza dover cambiare tipo di
-- colonna né migrare i dati esistenti.
-- ============================================================

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'libero'
    CHECK (status IN ('libero', 'occupato'));
