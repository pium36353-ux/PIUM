-- Già applicato manualmente in produzione il 2026-07-06 (SQL Editor).
-- Documenta lo stato reale: il trigger include l'header X-Webhook-Secret
-- richiesto da notify-new-booking (verificato live il 2026-07-19).
-- NOTA: il valore del secret è volutamente un placeholder — in produzione
-- è configurato con il valore reale corrispondente al Supabase Secret NOTIFY_WEBHOOK_SECRET.
DROP TRIGGER IF EXISTS on_new_booking ON public.bookings;
CREATE TRIGGER on_new_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://onkyhknchhlsmcknpinr.supabase.co/functions/v1/notify-new-booking',
    'POST',
    '{"Content-Type":"application/json","X-Webhook-Secret":"<NOTIFY_WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );
