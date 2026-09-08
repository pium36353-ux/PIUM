-- ============================================================
-- Flag separato per nascondere un servizio dal sito pubblico (lista servizi
-- + form di prenotazione) mantenendolo comunque selezionabile in agenda.
-- Distinto da is_available: is_available spegne il servizio ovunque (sito
-- pubblico E agenda interna); visible_on_public_site controlla SOLO la
-- visibilità pubblica. Default true: nessun cambio di comportamento per i
-- servizi esistenti, restano visibili come oggi.
-- ============================================================

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS visible_on_public_site boolean NOT NULL DEFAULT true;
