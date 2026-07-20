-- Già applicato manualmente in produzione il 2026-07-19 (SQL Editor).
-- Questa migration documenta lo stato reale del DB per ambienti nuovi.

-- ========================================================
-- FASE 1 — Multi-servizio nel booking pubblico (retrocompatibile)
-- ========================================================

-- 1. Colonna array servizi (nullable: i booking vecchi e mono-servizio restano validi)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_ids uuid[];

-- 2. create_booking: nuovo parametro opzionale p_service_ids
CREATE OR REPLACE FUNCTION public.create_booking(p_business_id uuid, p_service_id uuid, p_customer_name text, p_customer_email text, p_date date, p_time time without time zone, p_customer_phone text DEFAULT NULL::text, p_service_names text DEFAULT NULL::text, p_service_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking_id uuid;
  v_total_duration int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_date::text, 0));

  -- Validazione: con array, TUTTI i servizi devono essere disponibili e del business
  if p_service_ids is not null and array_length(p_service_ids, 1) > 0 then
    if exists (
      select 1 from unnest(p_service_ids) as sid
      where not exists (
        select 1 from services
        where id = sid and business_id = p_business_id and is_available = true
      )
    ) then
      raise exception 'Servizio non disponibile';
    end if;
    select coalesce(sum(coalesce(duration_min, 60)), 60) into v_total_duration
    from services where id = any(p_service_ids);
  else
    if not exists (
      select 1 from services
      where id = p_service_id and business_id = p_business_id and is_available = true
    ) then
      raise exception 'Servizio non disponibile';
    end if;
    select coalesce(duration_min, 60) into v_total_duration
    from services where id = p_service_id;
  end if;

  if exists (
    select 1 from bookings
    where business_id = p_business_id
      and lower(customer_email) = lower(p_customer_email)
      and status = 'pending'
  ) then
    raise exception 'Hai già una prenotazione in attesa per questa attività';
  end if;

  -- Check capacità con durata TOTALE
  if (
    select count(*)
    from get_taken_slots(p_business_id, p_date) t
    where p_time < (t.start_time + make_interval(mins => t.duration_minutes))
      and (p_time + make_interval(mins => v_total_duration)) > t.start_time
  ) >= (select booking_capacity from businesses where id = p_business_id)
  then raise exception 'Orario non più disponibile';
  end if;

  insert into bookings (
    business_id, service_id, service_ids, service_names,
    customer_name, customer_email, customer_phone,
    appointment_date, appointment_time, status
  ) values (
    p_business_id, p_service_id, p_service_ids, p_service_names,
    p_customer_name, lower(p_customer_email), p_customer_phone,
    p_date, p_time, 'pending'
  )
  returning id into v_booking_id;
  return v_booking_id;
end;
$function$;

-- 3. get_taken_slots: durata reale anche per pending multi-servizio
CREATE OR REPLACE FUNCTION public.get_taken_slots(p_business_id uuid, p_date date)
 RETURNS TABLE(start_time time without time zone, duration_minutes integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.start_time, a.duration_minutes
  from appointments a
  where a.business_id = p_business_id and a.date = p_date
  union all
  select b.appointment_time as start_time,
         case
           when b.service_ids is not null and array_length(b.service_ids, 1) > 0
           then (select coalesce(sum(coalesce(s2.duration_min, 60)), 60)::int
                 from services s2 where s2.id = any(b.service_ids))
           else coalesce(s.duration_min, 60)
         end as duration_minutes
  from bookings b
  left join services s on s.id = b.service_id
  where b.business_id = p_business_id
    and b.appointment_date = p_date
    and b.status = 'pending';
$function$;

-- 4. owner_confirm_booking: somma durate/prezzi + popola appointment_services
CREATE OR REPLACE FUNCTION public.owner_confirm_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking bookings%rowtype;
  v_dur     int;
  v_price   numeric;
  v_apt_id  uuid;
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

  IF v_booking.service_ids IS NOT NULL AND array_length(v_booking.service_ids, 1) > 0 THEN
    SELECT COALESCE(SUM(COALESCE(duration_min, 60)), 60),
           CASE WHEN bool_or(price IS NOT NULL) THEN SUM(COALESCE(price, 0)) ELSE NULL END
      INTO v_dur, v_price
    FROM services WHERE id = ANY(v_booking.service_ids);
  ELSE
    SELECT duration_min, price INTO v_dur, v_price
    FROM services WHERE id = v_booking.service_id;
  END IF;

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
  )
  RETURNING id INTO v_apt_id;

  -- Popola appointment_services con snapshot (stesso pattern di Agenda.jsx)
  IF v_booking.service_ids IS NOT NULL AND array_length(v_booking.service_ids, 1) > 0 THEN
    INSERT INTO appointment_services (appointment_id, service_id, price_snapshot, duration_snapshot)
    SELECT v_apt_id, s.id, s.price, s.duration_min
    FROM services s WHERE s.id = ANY(v_booking.service_ids);
  ELSIF v_booking.service_id IS NOT NULL THEN
    INSERT INTO appointment_services (appointment_id, service_id, price_snapshot, duration_snapshot)
    SELECT v_apt_id, s.id, s.price, s.duration_min
    FROM services s WHERE s.id = v_booking.service_id;
  END IF;
END;
$function$;
