-- ============================================================
-- Codice di blocco postazione (kiosk) — verticale 'ristorante_bar'.
--
-- Serve al "lucchetto area di lavoro": un tablet bloccato su Sala o su
-- Cucina si sblocca con una pressione lunga, e se il titolare ha
-- impostato un codice di 4 cifre viene chiesto quello.
--
-- NON È UNA PROTEZIONE DI SICUREZZA, ed è importante che resti scritto:
-- il codice è in chiaro, viaggia nella stessa sessione del titolare con
-- cui il tablet è loggato e chiunque apra gli strumenti per sviluppatori
-- del browser può leggerlo. Serve solo a evitare che un tocco
-- involontario faccia uscire dall'area di lavoro durante il servizio.
-- Per una protezione vera servirebbero account separati per il personale,
-- che oggi non esistono (vedi AUDIT_KIOSK.md, punto 2).
--
-- Sta su businesses come le altre preferenze di servizio del verticale
-- (vertical, kitchen_fire_immediately): è una scelta del locale, non del
-- singolo dispositivo. Quale area è bloccata, invece, è una scelta del
-- dispositivo e vive in localStorage, non qui.
--
-- Additiva, nessun impatto sulle righe esistenti: NULL = nessun codice
-- impostato, lo sblocco avviene con la sola pressione lunga.
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS kiosk_pin text;

-- Esattamente 4 cifre quando presente: il formato è un'invariante del
-- dato, non solo una validazione dell'interfaccia (un codice di 3 o 5
-- cifre renderebbe impossibile sbloccare dal tastierino a 4 caselle).
ALTER TABLE businesses
  ADD CONSTRAINT businesses_kiosk_pin_format
  CHECK (kiosk_pin IS NULL OR kiosk_pin ~ '^[0-9]{4}$');
