-- Aggiorna owner_confirm_booking per salvare customer_phone → client_phone
-- e rimuove il telefono concatenato alle note (ora ha la sua colonna dedicata).
CREATE OR REPLACE FUNCTION owner_confirm_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking bookings%rowtype;
  v_dur     int;
  v_price   numeric;
BEGIN
  SELECT b.* INTO v_booking
  FROM bookings b
  JOIN businesses biz ON biz.id = b.business_id
  WHERE b.id = p_booking_id
    AND biz.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prenotazione non trovata';
  END IF;

  IF v_booking.status <> 'pending' THEN
    RAISE EXCEPTION 'La prenotazione non è in attesa';
  END IF;

  SELECT duration_min, price INTO v_dur, v_price
  FROM services WHERE id = v_booking.service_id;

  UPDATE bookings SET status = 'confirmed' WHERE id = p_booking_id;

  INSERT INTO appointments (
    business_id, client_name, client_phone, date, start_time,
    duration_minutes, price, notes, booking_id
  ) VALUES (
    v_booking.business_id,
    v_booking.customer_name,
    v_booking.customer_phone,
    v_booking.appointment_date,
    v_booking.appointment_time,
    COALESCE(v_dur, 60),
    v_price,
    'Prenotazione confermata – ' || v_booking.customer_email,
    p_booking_id
  );
END;
$$;
