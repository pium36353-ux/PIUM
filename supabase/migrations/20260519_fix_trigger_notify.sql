-- Fix trigger on_new_booking: rimosso Authorization header
-- La Edge Function notify-new-booking ha verify_jwt = false
-- Il JWT nel header causava 401 UNAUTHORIZED
DROP TRIGGER IF EXISTS on_new_booking ON public.bookings;

CREATE TRIGGER on_new_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://onkyhknchhlsmcknpinr.supabase.co/functions/v1/notify-new-booking',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
