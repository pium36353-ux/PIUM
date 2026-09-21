-- ============================================================
-- Task 4: piantina tavoli (versione minima) per il verticale
-- 'ristorante_bar' (copre sia ristoranti sia bar, nessuna distinzione
-- di categoria a livello di schema o UI).
--
-- Additiva, nessun impatto sulle righe esistenti: CREATE TABLE nuova.
--
-- Stesso pattern già usato per pets (20260920_grooming_universal_fields.sql):
-- RLS owner-only, il titolare gestisce tutto tramite il proprio business,
-- nessun accesso pubblico/anonimo. Nessuna colonna di stato
-- libero/occupato qui di proposito: nel Task 4 quel toggle è esplicitamente
-- "manuale per ora, non ancora collegato a prenotazioni reali" — resta
-- quindi solo lato UI (stato React, non persistito) finché non verrà
-- davvero agganciato alle prenotazioni, per non introdurre nello schema
-- una colonna che oggi non rappresenterebbe alcun dato reale.
--
-- is_active con DEFAULT true: mai un DELETE reale sui tavoli, la
-- disattivazione è un semplice update di questo flag (stesso pattern già
-- richiesto per il resto del CRUD "disattiva con conferma").
-- ============================================================

CREATE TABLE IF NOT EXISTS tables (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  capacity    int,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tables_business_id ON tables(business_id);

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

-- Stesso pattern di pets/contacts: il titolare gestisce tutto tramite il
-- proprio business, nessun accesso pubblico/anonimo.
CREATE POLICY "tables: owner all" ON tables
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = tables.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = tables.business_id AND b.user_id = auth.uid())
  );
