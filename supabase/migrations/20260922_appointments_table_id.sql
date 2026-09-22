-- ============================================================
-- Task 4 Blocco A: collega un appuntamento a un tavolo specifico.
-- Additiva, nessun impatto sulle righe esistenti.
--
-- Stesso pattern già usato per appointments.pet_id
-- (20260921_pets_size_and_appointment_link.sql): FK nullable, ON DELETE
-- SET NULL — un tavolo disattivato o eliminato in futuro non deve mai
-- bloccare o cancellare un appuntamento esistente, solo scollegarlo.
-- ============================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_table_id ON appointments(table_id);
