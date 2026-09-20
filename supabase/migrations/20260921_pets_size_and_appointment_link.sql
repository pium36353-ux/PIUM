-- ============================================================
-- Estensione Task 3 (toelettatura): collega un pet a un appuntamento
-- specifico e aggiunge la taglia. Additiva, nessun impatto sulle righe
-- esistenti.
-- ============================================================

-- 1. appointments.pet_id — quale animale è questo appuntamento (facoltativo:
--    un appuntamento può non avere ancora un pet censito, o essere per un
--    business non-toelettatura, dove resta sempre NULL).
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS pet_id uuid REFERENCES pets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_pet_id ON appointments(pet_id);

-- 2. pets.size — taglia libera su 5 valori, nullable (CHECK su colonna
--    nullable ammette comunque NULL: il vincolo si applica solo ai valori
--    effettivamente impostati, stesso pattern già usato per pets.coat).
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS size text CHECK (size IN ('xs','s','m','l','xl'));

-- 3. Ricerca fuzzy su pets.name — stesso pattern già in uso su contacts.name
--    (idx_contacts_name_trgm) e appointments.client_name
--    (idx_appointments_client_name_trgm), richiede pg_trgm già installata da
--    20260520_performance_indexes.sql.
CREATE INDEX IF NOT EXISTS idx_pets_name_trgm ON pets USING gin (name gin_trgm_ops);
