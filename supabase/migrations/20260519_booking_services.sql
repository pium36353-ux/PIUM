-- Add service_names to bookings for multi-service display
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_names text;

-- Drop old signature (parametri in ordine diverso) prima di ricreare
DROP FUNCTION IF EXISTS create_booking(uuid, uuid, text, text, text, date, time);

-- Update create_booking: parametri senza default prima, con default dopo
CREATE OR REPLACE FUNCTION create_booking(
  p_business_id    uuid,
  p_service_id     uuid,
  p_customer_name  text,
  p_customer_email text,
  p_date           date,
  p_time           time,
  p_customer_phone text DEFAULT NULL,
  p_service_names  text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM services
    WHERE id = p_service_id
      AND business_id = p_business_id
      AND is_available = true
  ) THEN
    RAISE EXCEPTION 'Servizio non disponibile';
  END IF;

  -- Antiabuse: 1 pending per email per business
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE business_id = p_business_id
      AND lower(customer_email) = lower(p_customer_email)
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Hai già una prenotazione in attesa per questa attività';
  END IF;

  INSERT INTO bookings (
    business_id, service_id, service_names,
    customer_name, customer_email, customer_phone,
    appointment_date, appointment_time, status
  ) VALUES (
    p_business_id, p_service_id, p_service_names,
    p_customer_name, lower(p_customer_email), p_customer_phone,
    p_date, p_time, 'pending'
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking(uuid, uuid, text, text, date, time, text, text) TO anon, authenticated;
