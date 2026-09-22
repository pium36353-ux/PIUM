-- ============================================================
-- Blocco B: catalogo menu (solo inserimento manuale — nessuna lettura
-- foto/AI in questa migration, arriverà separata).
--
-- Tre tabelle additive, nessun impatto sulle righe esistenti.
-- ============================================================

-- Categorie menu — nessuna riga pre-creata di default (a differenza di
-- business_turns): qui non esiste un set universale sensato per
-- qualunque locale, il titolare le crea lui da zero.
CREATE TABLE IF NOT EXISTS menu_categories (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        text    NOT NULL,
  sort_order  int     NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_business_id ON menu_categories(business_id);

ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_categories: owner all" ON menu_categories
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = menu_categories.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = menu_categories.business_id AND b.user_id = auth.uid())
  );

-- Piatti/voci di menu. category_id nullable: un piatto può non avere
-- ancora una categoria assegnata. Mai un DELETE reale: is_available=false
-- nasconde il piatto dalle ordinazioni future senza cancellarlo.
CREATE TABLE IF NOT EXISTS menu_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id   uuid        REFERENCES menu_categories(id) ON DELETE SET NULL,
  name          text        NOT NULL,
  price         numeric(10,2),
  is_available  boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_business_id ON menu_items(business_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_items: owner all" ON menu_items
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = menu_items.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = menu_items.business_id AND b.user_id = auth.uid())
  );

-- Segnalazioni "potrebbe essere esaurito" — una riga per segnalazione,
-- nessun contatore mantenuto a parte (si conta con COUNT). Righe
-- transitorie: quando il titolare conferma o ignora una segnalazione,
-- l'applicazione le CANCELLA per davvero (non c'è un resolved_at) — non
-- hanno valore storico da conservare, a differenza delle altre tabelle di
-- questo progetto dove invece non si cancella mai nulla.
CREATE TABLE IF NOT EXISTS menu_item_flags (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid        NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  flagged_at   timestamptz NOT NULL DEFAULT now(),
  flagged_by   text
);

CREATE INDEX IF NOT EXISTS idx_menu_item_flags_menu_item_id ON menu_item_flags(menu_item_id);

ALTER TABLE menu_item_flags ENABLE ROW LEVEL SECURITY;

-- RLS via join sulla tabella principale (qui menu_items) → businesses,
-- stesso pattern di appointment_services/table_reservation_tables: non
-- c'è business_id diretto su questa tabella.
CREATE POLICY "menu_item_flags: owner all" ON menu_item_flags
  USING (
    EXISTS (
      SELECT 1 FROM menu_items mi
      JOIN businesses b ON b.id = mi.business_id
      WHERE mi.id = menu_item_flags.menu_item_id AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM menu_items mi
      JOIN businesses b ON b.id = mi.business_id
      WHERE mi.id = menu_item_flags.menu_item_id AND b.user_id = auth.uid()
    )
  );
