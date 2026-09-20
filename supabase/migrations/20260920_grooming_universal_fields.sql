-- ============================================================
-- Task 3: funzioni "toelettatura" universali — NON legate a businesses.vertical,
-- disponibili per qualunque attività indipendentemente dal verticale.
-- Tre modifiche additive indipendenti:
--   1. services.color       — stesso concetto di employees.color, sul servizio
--   2. contacts.display_name — nome alternativo per le comunicazioni verso il
--      cliente (promemoria/WhatsApp); se vuoto, comportamento identico a oggi
--   3. tabella pets         — animali del cliente, agganciati per client_phone
--      (stesso identificativo già usato da contacts/appointments — normalizzato
--      con la stessa src/lib/phone.js — nessun nuovo sistema di riconoscimento
--      cliente)
-- Nessun impatto sulle righe esistenti: due ALTER TABLE ADD COLUMN nullable,
-- una CREATE TABLE nuova.
-- ============================================================

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS display_name text;

CREATE TABLE IF NOT EXISTS pets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_phone text        NOT NULL,
  name         text        NOT NULL,
  breed        text,
  coat         text        CHECK (coat IN ('corto','medio','lungo')),
  gender       text        NOT NULL DEFAULT 'non_specificato' CHECK (gender IN ('maschio','femmina','non_specificato')),
  weight_note  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pets_business_id    ON pets(business_id);
CREATE INDEX IF NOT EXISTS idx_pets_business_phone ON pets(business_id, client_phone);

ALTER TABLE pets ENABLE ROW LEVEL SECURITY;

-- Stesso pattern di contacts/appointment_services: il titolare gestisce tutto
-- tramite il proprio business, nessun accesso pubblico/anonimo.
CREATE POLICY "pets: owner all" ON pets
  USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = pets.business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = pets.business_id AND b.user_id = auth.uid())
  );
