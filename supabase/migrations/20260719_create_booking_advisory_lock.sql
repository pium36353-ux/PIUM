-- Fix già applicato manualmente in produzione il 2026-07-19 (SQL Editor).
-- Questa migration documenta lo stato reale del DB per ambienti nuovi.

-- create_booking v4: aggiunge advisory lock anti race-condition sul check di capacità
-- (stessa firma di 20260610_booking_capacity.sql)
create or replace function create_booking(
  p_business_id    uuid,
  p_service_id     uuid,
  p_customer_name  text,
  p_customer_email text,
  p_date           date,
  p_time           time,
  p_customer_phone text default null,
  p_service_names  text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_booking_id uuid;
begin
  -- Lock anti race-condition: serializza le prenotazioni per stesso business+giorno.
  -- Rilasciato automaticamente a fine transazione.
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_date::text, 0));

  if not exists (
    select 1 from services
    where id = p_service_id
      and business_id = p_business_id
      and is_available = true
  ) then
    raise exception 'Servizio non disponibile';
  end if;

  if exists (
    select 1 from bookings
    where business_id = p_business_id
      and lower(customer_email) = lower(p_customer_email)
      and status = 'pending'
  ) then
    raise exception 'Hai già una prenotazione in attesa per questa attività';
  end if;

  -- Check 3: capacità — confermati + pending sovrapposti devono essere < booking_capacity
  if (
    select count(*)
    from get_taken_slots(p_business_id, p_date) t
    where p_time < (t.start_time + make_interval(mins => t.duration_minutes))
      and (p_time + make_interval(mins => coalesce(
            (select duration_min from services where id = p_service_id), 60))) > t.start_time
  ) >= (select booking_capacity from businesses where id = p_business_id)
  then raise exception 'Orario non più disponibile';
  end if;

  insert into bookings (
    business_id, service_id, service_names,
    customer_name, customer_email, customer_phone,
    appointment_date, appointment_time, status
  ) values (
    p_business_id, p_service_id, p_service_names,
    p_customer_name, lower(p_customer_email), p_customer_phone,
    p_date, p_time, 'pending'
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

grant execute on function create_booking(uuid, uuid, text, text, date, time, text, text) to anon, authenticated;
