-- ============================================================
-- create_booking — chiusura accesso pubblico diretto
-- ============================================================
-- APPLICARE PER ULTIMA, solo dopo che:
--   1. la Edge Function `create-booking` è deployata e funzionante
--   2. il frontend aggiornato (BookingSection.jsx) è in produzione
--
-- Effetto: le prenotazioni pubbliche possono passare SOLO attraverso la
-- Edge Function (che verifica Cloudflare Turnstile e chiama la RPC via
-- service_role). Uno script che chiama create_booking direttamente con la
-- anon key riceve "permission denied" — l'anti-bot diventa non-aggirabile.
--
-- `get_taken_slots` resta pubblica: espone solo orari/durate occupate, serve
-- al calcolo degli slot lato client e NON va toccata.
--
-- Rollback: riconcedere l'esecuzione ad anon/authenticated con
--   grant execute on function public.create_booking(uuid, uuid, text, text, date, time, text, text, uuid[]) to anon, authenticated;
-- ============================================================

revoke execute on function public.create_booking(uuid, uuid, text, text, date, time, text, text, uuid[])
  from public, anon, authenticated;

-- Il service_role (usato dalla Edge Function) deve mantenere l'esecuzione:
-- la revoke da PUBLIC toglierebbe anche il privilegio ereditato dal service_role.
grant execute on function public.create_booking(uuid, uuid, text, text, date, time, text, text, uuid[])
  to service_role;
